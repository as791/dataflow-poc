import { Router } from 'express';
import crypto from 'crypto';
import Redis from 'ioredis';
import { pool, withTenant } from '../db';
import { fireExecution } from '../temporal';
import { QuotaExceededError } from '../services/usage';
import { executionsStarted } from '../metrics';
import type { PipelineDefinition, DataRef, Environment } from '@dataflow/shared';

export const triggers = Router();

// Webhook triggers are unauthenticated by design — HMAC signature is the
// auth boundary. We can't use req.tenant, so look up tenantId from the
// pipeline row and pass it to withTenant manually.
triggers.post('/hooks/:path', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM pipelines WHERE status='active'
       AND definition->'trigger'->>'type'='webhook'
       AND definition->'trigger'->>'path'=$1
     ORDER BY (environment='prod') DESC`, [req.params.path]);
  if (!rows.length) return res.status(404).json({ error: 'no active pipeline on this hook' });

  // Prefer the prod version when both environments are active on this path.
  const def = rows[0].definition as PipelineDefinition;
  const env = (rows[0].environment ?? 'test') as Environment;
  const tenantId = rows[0].tenant_id as string;
  const secret = (def.trigger as any).secret as string;
  const sig = req.headers['x-signature-sha256'] as string | undefined;
  const expected = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(req.body)).digest('hex');
  if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return res.status(401).json({ error: 'bad signature' });

  const json = JSON.stringify(req.body);
  let payloadRef: DataRef;
  if (Buffer.byteLength(json) <= 4096) {
    payloadRef = { type: 'inline', key: Buffer.from(json).toString('base64'),
                   tenantId, sizeBytes: json.length };
  } else {
    const insRow = await withTenant(tenantId, client => client.query(
      `INSERT INTO node_payloads (tenant_id, execution_id, node_id, payload)
       VALUES ($1,'webhook','trigger',$2) RETURNING id`, [tenantId, json]));
    payloadRef = { type: 'pg', key: insRow.rows[0].id, tenantId, sizeBytes: json.length };
  }
  // Metering + quota enforcement happen inside fireExecution() — see temporal.ts.
  try {
    const executionId = await fireExecution(def, rows[0].id, 'webhook', env, payloadRef);
    executionsStarted.inc({ trigger: 'webhook' });
    res.json({ executionId });
  } catch (e) {
    if (e instanceof QuotaExceededError) {
      return res.status(402).json({ error: 'Quota exceeded', used: e.used, limit: e.limit });
    }
    throw e;
  }
});

export async function startEventSubscriber() {
  const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await sub.psubscribe('dataflow:events:*');
  sub.on('pmessage', async (_p, channel, message) => {
    const topic = channel.replace('dataflow:events:', '');
    const { rows } = await pool.query(
      `SELECT * FROM pipelines WHERE status='active'
         AND definition->'trigger'->>'type'='event'
         AND definition->'trigger'->>'topic'=$1`, [topic]);
    for (const row of rows) {
      const def = row.definition as PipelineDefinition;
      const env = (row.environment ?? 'test') as Environment;
      const payloadRef: DataRef = {
        type: 'inline', key: Buffer.from(message).toString('base64'),
        tenantId: row.tenant_id, sizeBytes: message.length };
      // Per-row guard: an over-quota (or otherwise failing) tenant must not
      // abort delivery to the others subscribed to this topic.
      try {
        await fireExecution(def, row.id, 'event', env, payloadRef);
        executionsStarted.inc({ trigger: 'event' });
      } catch (e) {
        console.error('event trigger fireExecution failed', { pipeline: row.id, error: (e as Error).message });
      }
    }
  });
}
