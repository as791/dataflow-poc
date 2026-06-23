import { Connection, Client } from '@temporalio/client';
import { encryptedDataConverter } from './temporal-data-converter';
import type { PipelineDefinition, DynamicWorkflowInput, DataRef, Environment } from '@dataflow/shared';
import { pool, withTenant } from './db';
import { incrementUsage, assertWithinQuota } from './services/usage';

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
): Promise<string> {
  // Central enforcement so EVERY trigger path (manual, webhook, event) is
  // capped — not just manual runs gated by requireQuota. Throws before any
  // workflow starts, so an over-quota tenant never consumes a unit.
  await assertWithinQuota(def.tenantId);
  const executionId = `exec-${def.id}-${Date.now()}`;
  const input: DynamicWorkflowInput = {
    definition: def,                                  // frozen — replay safe
    tenantId: def.tenantId,
    executionId,
    trigger: { type: triggerType, payloadRef, firedAt: new Date().toISOString() },
  };
  const c = await temporal(namespaceFor(env));
  await c.workflow.start('DynamicDAGWorkflow', {
    args: [input], taskQueue: taskQueueFor(env), workflowId: executionId,
  });
  // Must run inside withTenant so the RLS policy on `executions` resolves correctly.
  await withTenant(def.tenantId, client => client.query(
    `INSERT INTO executions (id, pipeline_id, tenant_id, trigger_type, build_id, environment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [executionId, pipelineRowId, def.tenantId, triggerType, process.env.BUILD_ID ?? null, env]));
  // Phase 3 metering. Central call so cron-triggered executions
  // (which fire from inside Temporal, not via an Express route) also count.
  // requireQuota gates *before* this on the routes that have a request context.
  await incrementUsage(def.tenantId);
  return executionId;
}

// ─── Cron trigger → Temporal Schedule (defined inside the pipeline itself) ───
// Schedules are env-scoped so a pipeline's test and prod crons run independently
// in their own namespaces.
export async function syncSchedule(def: PipelineDefinition, pipelineRowId: string, env: Environment = 'test') {
  const c = await temporal(namespaceFor(env));
  const scheduleId = `sched-${def.id}-${env}`;
  // remove stale schedule, then recreate if the definition declares cron
  try { await (await c.schedule.getHandle(scheduleId)).delete(); } catch { /* none */ }
  if (def.trigger.type !== 'cron') return;
  await c.schedule.create({
    scheduleId,
    spec: { cronExpressions: [def.trigger.schedule] },
    action: {
      type: 'startWorkflow',
      workflowType: 'DynamicDAGWorkflow',
      taskQueue: taskQueueFor(env),
      args: [{
        definition: def, tenantId: def.tenantId,
        executionId: `exec-${def.id}-${env}-{{.ScheduledTime.Unix}}`,
        trigger: { type: 'cron', firedAt: new Date().toISOString() },
      }],
      workflowId: `exec-${def.id}-${env}-cron`,
    },
    policies: { overlap: 'SKIP' },  // never double-run the same pipeline
  } as any);
}
