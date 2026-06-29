import { Connection, Client } from '@temporalio/client';
import { randomUUID } from 'crypto';
import { encryptedDataConverter } from './temporal-data-converter';
import type { PipelineDefinition, DynamicWorkflowInput, DataRef, Environment } from '@dataflow/shared';
import { dataflowOpenLineageRunEvent } from '@dataflow/shared';
import { pool, withTenant } from './db';
import { consumeExecutionQuota, releaseExecutionQuota } from './services/usage';

// ─── Per-environment Temporal wiring ───────────────────────────────────────
// M3: each environment ('test' | 'prod') is its own Temporal namespace and task
// queue, served by its own worker pool (compose: worker-test / worker-prod).
// Clients share one Connection but are cached per namespace.
export function namespaceFor(env: Environment): string { return env; }
export function taskQueueFor(env: Environment): string { return `dynamic-dag-${env}`; }

let connection: Connection;
const clients = new Map<string, Client>();

export async function temporal(namespace = process.env.TEMPORAL_NAMESPACE ?? 'default'): Promise<Client> {
  let client = clients.get(namespace);
  if (!client) {
    if (!connection) {
      connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
    }
    client = new Client({ connection, namespace, dataConverter: encryptedDataConverter });
    clients.set(namespace, client);
  }
  return client;
}

export async function fireExecution(
  def: PipelineDefinition, pipelineRowId: string,
  triggerType: string, env: Environment = 'test', payloadRef?: DataRef,
  encryptedDek?: string, retryOf?: string, backfillPartitionId?: string,
): Promise<string> {
  // Central enforcement so EVERY trigger path (manual, webhook, event) is
  // capped — not just manual runs gated by requireQuota. Throws before any
  // workflow starts, so an over-quota tenant never consumes a unit.
  await consumeExecutionQuota(def.tenantId);
  const executionId = `exec-${randomUUID()}`;
  const input: DynamicWorkflowInput = {
    definition: def,                                  // frozen — replay safe
    tenantId: def.tenantId,
    executionId,
    trigger: { type: triggerType, payloadRef, firedAt: new Date().toISOString() },
    encryptedDek,
  };
  const c = await temporal(namespaceFor(env));
  let handle: Awaited<ReturnType<typeof c.workflow.start>> | undefined;
  try {
    const started = await c.workflow.start('DynamicDAGWorkflow', {
      args: [input], taskQueue: taskQueueFor(env), workflowId: executionId,
    });
    handle = started;
    // Must run inside withTenant so the RLS policy on `executions` resolves correctly.
    await withTenant(def.tenantId, async client => {
      await client.query(`INSERT INTO executions
         (id, pipeline_id, tenant_id, trigger_type, build_id, environment, workflow_id, run_id, retry_of, backfill_partition_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        executionId, pipelineRowId, def.tenantId, triggerType,
        process.env.BUILD_ID ?? null, env, executionId, started.firstExecutionRunId, retryOf ?? null, backfillPartitionId ?? null,
      ]);
      if (backfillPartitionId) await client.query(
        `UPDATE backfill_partitions SET status='running',execution_id=$2 WHERE id=$1`,
        [backfillPartitionId, executionId],
      );
      if (process.env.OPENLINEAGE_URL) {
        const event = dataflowOpenLineageRunEvent({
          definition: def, pipelineKey: def.id, executionId, tenantId: def.tenantId,
          environment: env, phase: 'started', eventTime: new Date().toISOString(),
          namespace: process.env.OPENLINEAGE_NAMESPACE,
        });
        await client.query(
          `INSERT INTO openlineage_outbox (tenant_id,execution_id,event_type,payload)
           VALUES ($1,$2,'START',$3) ON CONFLICT (execution_id,event_type) DO NOTHING`,
          [def.tenantId, executionId, JSON.stringify(event)],
        );
      }
    });
    return executionId;
  } catch (error) {
    await handle?.terminate('execution metadata insert failed').catch(() => {});
    await releaseExecutionQuota(def.tenantId).catch(() => {});
    throw error;
  }
}

// ─── Cron trigger → Temporal Schedule (defined inside the pipeline itself) ───
// Schedules are env-scoped so a pipeline's test and prod crons run independently
// in their own namespaces.
export async function syncSchedule(def: PipelineDefinition, pipelineRowId: string, env: Environment = 'test') {
  // Only cron triggers need a Temporal Schedule; avoid connecting for manual/webhook/event.
  if (def.trigger.type !== 'cron') return;
  const c = await temporal(namespaceFor(env));
  const scheduleId = `sched-${def.id}-${env}`;
  // remove stale schedule, then recreate if the definition declares cron
  try { await (await c.schedule.getHandle(scheduleId)).delete(); } catch { /* none */ }
  await c.schedule.create({
    scheduleId,
    spec: { cronExpressions: [def.trigger.schedule] },
    action: {
      type: 'startWorkflow',
      workflowType: 'DynamicDAGWorkflow',
      taskQueue: taskQueueFor(env),
      args: [{
        definition: def, tenantId: def.tenantId,
        executionId: '',
        pipelineRowId,
        environment: env,
        trigger: { type: 'cron', firedAt: '' },
      }],
      workflowId: `schedule-${def.id}-${env}`,
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    },
    policies: { overlap: 'SKIP' },  // never double-run the same pipeline
  } as any);
}
