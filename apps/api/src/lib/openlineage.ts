import { createHash } from 'crypto';
import { parseOpenLineageRunEvent } from '@dataflow/shared';
import { withTenant } from '../db';

export const hashOpenLineageKey = (token: string) => createHash('sha256').update(token).digest('hex');

export async function ingestOpenLineageEvent(tenantId: string, environment: string, body: unknown) {
  const event = parseOpenLineageRunEvent(body);
  await withTenant(tenantId, client => client.query(
    `INSERT INTO external_lineage_events
       (tenant_id,environment,run_id,event_type,event_time,job_namespace,job_name,inputs,outputs,producer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (tenant_id,job_namespace,job_name,run_id,event_type) DO UPDATE SET
       environment=EXCLUDED.environment,event_time=EXCLUDED.event_time,inputs=EXCLUDED.inputs,
       outputs=EXCLUDED.outputs,producer=EXCLUDED.producer,received_at=now()`,
    [tenantId, environment, event.run.runId, event.eventType, event.eventTime,
     event.job.namespace, event.job.name, JSON.stringify(event.inputs ?? []),
     JSON.stringify(event.outputs ?? []), event.producer],
  ));
  return event;
}
