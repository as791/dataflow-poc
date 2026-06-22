import { Connection, Client, ScheduleClient } from '@temporalio/client';
import { encryptedDataConverter } from './temporal-data-converter';
import type { PipelineDefinition, DynamicWorkflowInput, DataRef } from '@dataflow/shared';
import { pool, withTenant } from './db';
import { incrementUsage } from './services/usage';

let client: Client;
export async function temporal(): Promise<Client> {
  if (!client) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
    client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? 'default', dataConverter: encryptedDataConverter });
  }
  return client;
}

const TASK_QUEUE = process.env.TASK_QUEUE ?? 'dynamic-dag';

export async function fireExecution(
  def: PipelineDefinition, pipelineRowId: string,
  triggerType: string, payloadRef?: DataRef
): Promise<string> {
  const executionId = `exec-${def.id}-${Date.now()}`;
  const input: DynamicWorkflowInput = {
    definition: def,                                  // frozen — replay safe
    tenantId: def.tenantId,
    executionId,
    trigger: { type: triggerType, payloadRef, firedAt: new Date().toISOString() },
  };
  const c = await temporal();
  await c.workflow.start('DynamicDAGWorkflow', {
    args: [input], taskQueue: TASK_QUEUE, workflowId: executionId,
  });
  // Must run inside withTenant so the RLS policy on `executions` resolves correctly.
  await withTenant(def.tenantId, client => client.query(
    `INSERT INTO executions (id, pipeline_id, tenant_id, trigger_type, build_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [executionId, pipelineRowId, def.tenantId, triggerType, process.env.BUILD_ID ?? null]));
  // Phase 3 metering. Central call so cron-triggered executions
  // (which fire from inside Temporal, not via an Express route) also count.
  // requireQuota gates *before* this on the routes that have a request context.
  await incrementUsage(def.tenantId);
  return executionId;
}

// ─── Cron trigger → Temporal Schedule (defined inside the pipeline itself) ───
export async function syncSchedule(def: PipelineDefinition, pipelineRowId: string) {
  const c = await temporal();
  const scheduleId = `sched-${def.id}`;
  // remove stale schedule, then recreate if the definition declares cron
  try { await (await c.schedule.getHandle(scheduleId)).delete(); } catch { /* none */ }
  if (def.trigger.type !== 'cron') return;
  await c.schedule.create({
    scheduleId,
    spec: { cronExpressions: [def.trigger.schedule] },
    action: {
      type: 'startWorkflow',
      workflowType: 'DynamicDAGWorkflow',
      taskQueue: TASK_QUEUE,
      args: [{
        definition: def, tenantId: def.tenantId,
        executionId: `exec-${def.id}-{{.ScheduledTime.Unix}}`,
        trigger: { type: 'cron', firedAt: new Date().toISOString() },
      }],
      workflowId: `exec-${def.id}-cron`,
    },
    policies: { overlap: 'SKIP' },  // never double-run the same pipeline
  } as any);
}
