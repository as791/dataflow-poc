import { Router } from 'express';
import crypto from 'crypto';
import Redis from 'ioredis';
import { pool, withTenant } from '../db';
import { fireExecution } from '../temporal';
import { QuotaExceededError } from '../services/usage';
import { executionsStarted } from '../metrics';
import { ASSET_MATERIALIZATION_TOPIC_PREFIX, type PipelineDefinition, type DataRef, type Environment } from '@dataflow/shared';
import { deletePayloadObject, payloadObjectKey, payloadStoreConfig, putPayloadObject } from '@dataflow/object-store';
import { hashOpenLineageKey, ingestOpenLineageEvent } from '../lib/openlineage';

export const triggers = Router();

export function assetUrnFromEventTopic(topic: string, allowAsset: boolean): string | null {
  if (!allowAsset || !topic.startsWith(ASSET_MATERIALIZATION_TOPIC_PREFIX)) return null;
  return topic.slice(ASSET_MATERIALIZATION_TOPIC_PREFIX.length) || null;
}

// Stable service-token endpoint for OpenLineage HTTP transports. Tenant is
// resolved by a SECURITY DEFINER hash lookup; plaintext tokens are never stored.
triggers.post('/openlineage', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'OpenLineage bearer token required' });
  const token = header.slice(7).trim();
  if (!token) return res.status(401).json({ error: 'OpenLineage bearer token required' });
  const { rows } = await pool.query(`SELECT resolve_openlineage_tenant($1) AS tenant_id`, [hashOpenLineageKey(token)]);
  const tenantId = rows[0]?.tenant_id as string | undefined;
  if (!tenantId) return res.status(401).json({ error: 'invalid or revoked OpenLineage token' });
  const environment = typeof req.query.environment === 'string' ? req.query.environment : 'prod';
  if (!['test', 'prod'].includes(environment)) return res.status(400).json({ error: 'environment must be test or prod' });
  try {
    await ingestOpenLineageEvent(tenantId, environment, req.body);
    res.status(201).json({ ok: true });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

function encryptTriggerPayload(json: string): { ciphertext: string; iv: string } {
  const raw = process.env.TEMPORAL_PAYLOAD_ENCRYPTION_KEY;
  if (!raw) throw new Error('TEMPORAL_PAYLOAD_ENCRYPTION_KEY is required for persisted trigger payloads');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('TEMPORAL_PAYLOAD_ENCRYPTION_KEY must decode to 32 bytes');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(json)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { ciphertext: ciphertext.toString('base64url'), iv: iv.toString('base64url') };
}

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
  const sizeBytes = Buffer.byteLength(json);
  let payloadRef: DataRef;
  if (sizeBytes <= 4096) {
    payloadRef = { type: 'inline', key: Buffer.from(json).toString('base64'),
                   tenantId, sizeBytes };
  } else {
    const encrypted = encryptTriggerPayload(json);
    const objectStore = payloadStoreConfig();
    if (objectStore) {
      const key = payloadObjectKey(tenantId, 'webhook', 'trigger');
      await putPayloadObject(objectStore, key, encrypted.ciphertext);
      payloadRef = { type: 's3', key, bucket: objectStore.bucket, tenantId, sizeBytes, encrypted: true, iv: encrypted.iv };
    } else {
      const insRow = await withTenant(tenantId, client => client.query(
        `INSERT INTO node_payloads
           (tenant_id, execution_id, node_id, payload, encrypted, encryption_iv)
         VALUES ($1,'webhook','trigger',$2,true,$3) RETURNING id`,
        [tenantId, JSON.stringify(encrypted.ciphertext), encrypted.iv]));
      payloadRef = {
        type: 'pg', key: insRow.rows[0].id, tenantId, sizeBytes,
        encrypted: true,
      };
    }
  }
  // Metering + quota enforcement happen inside fireExecution() — see temporal.ts.
  try {
    const executionId = await fireExecution(def, rows[0].id, 'webhook', env, payloadRef);
    executionsStarted.inc({ trigger: 'webhook' });
    res.json({ executionId });
  } catch (e) {
    if (payloadRef.type === 's3') {
      const config = payloadStoreConfig(process.env, payloadRef.bucket);
      if (config) await deletePayloadObject(config, payloadRef.key).catch(() => {});
    } else if (payloadRef.type === 'pg') {
      await withTenant(tenantId, client => client.query(`DELETE FROM node_payloads WHERE id=$1`, [payloadRef.key])).catch(() => {});
    }
    if (e instanceof QuotaExceededError) {
      return res.status(402).json({ error: 'Quota exceeded', used: e.used, limit: e.limit });
    }
    throw e;
  }
});

export async function startEventSubscriber() {
  const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const commands = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const stream = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await sub.psubscribe('dataflow:events:*:*:*');
  sub.on('pmessage', async (_p, channel, message) => {
    const [tenantId, environment, ...topicParts] = channel.replace('dataflow:events:', '').split(':');
    if (!tenantId || !['test', 'prod'].includes(environment) || !topicParts.length) return;
    await deliverTenantEvent(commands, tenantId, environment as Environment, topicParts.join(':'), message);
  });
  void consumePipelineEventStream(stream, commands)
    .catch(error => console.error('pipeline event stream stopped', error.message));
}

async function deliverTenantEvent(
  redis: Redis, tenantId: string, environment: Environment,
  topic: string, message: string, eventId?: string, allowAsset = false,
): Promise<boolean> {
  const assetUrn = assetUrnFromEventTopic(topic, allowAsset);
  const { rows } = await withTenant(tenantId, client => client.query(
      `SELECT * FROM pipelines WHERE status='active'
         AND environment=$1
         AND ((definition->'trigger'->>'type'='event' AND definition->'trigger'->>'topic'=$2)
           OR ($3::text IS NOT NULL AND definition->'trigger'->>'type'='asset'
             AND definition->'trigger'->>'assetUrn'=$3))`, [environment, topic, assetUrn]));
  let delivered = true;
  for (const row of rows) {
    const doneKey = eventId ? `dataflow:event-done:${eventId}:${row.id}` : '';
    const lockKey = eventId ? `dataflow:event-lock:${eventId}:${row.id}` : '';
    if (doneKey && await redis.exists(doneKey)) continue;
    if (lockKey && !(await redis.set(lockKey, '1', 'EX', 60, 'NX'))) { delivered = false; continue; }
    const def = row.definition as PipelineDefinition;
    const payloadRef: DataRef = {
      type: 'inline', key: Buffer.from(message).toString('base64'),
      tenantId: row.tenant_id, sizeBytes: message.length };
    try {
      const triggerType = def.trigger.type === 'asset' ? 'asset' : 'event';
      await fireExecution(def, row.id, triggerType, environment, payloadRef);
      executionsStarted.inc({ trigger: triggerType });
      if (doneKey) await redis.set(doneKey, '1', 'EX', 30 * 24 * 60 * 60);
    } catch (e) {
      console.error('event trigger fireExecution failed', { pipeline: row.id, error: (e as Error).message });
      if (!(e instanceof QuotaExceededError)) delivered = false;
      else if (doneKey) await redis.set(doneKey, 'quota-exceeded', 'EX', 30 * 24 * 60 * 60);
    } finally {
      if (lockKey) await redis.del(lockKey);
    }
  }
  return delivered;
}

async function consumePipelineEventStream(streamRedis: Redis, commands: Redis) {
  const stream = 'dataflow:pipeline-events', group = 'dataflow-api', consumer = 'control-plane';
  try { await streamRedis.xgroup('CREATE', stream, group, '0', 'MKSTREAM'); }
  catch (error: any) { if (!String(error.message).includes('BUSYGROUP')) throw error; }
  let pending = true;
  for (;;) {
    try {
      const args: Array<string | number> = [
        'GROUP', group, consumer, 'COUNT', 20,
        ...(pending ? [] : ['BLOCK', 5000]),
        'STREAMS', stream, pending ? '0' : '>',
      ];
      const result = await (streamRedis.xreadgroup as any)(...args) as any;
      const messages: any[] = result?.[0]?.[1] ?? [];
      if (!messages.length) { pending = false; continue; }
      let retry = false;
      for (const [id, raw] of messages) {
        const fields: Record<string, string> = {};
        for (let i = 0; i < raw.length; i += 2) fields[raw[i]] = raw[i + 1];
        const ok = await deliverTenantEvent(
          commands, fields.tenantId, fields.environment as Environment,
          fields.topic, fields.payload, fields.eventId, true,
        );
        if (ok) await streamRedis.xack(stream, group, id); else retry = true;
      }
      if (retry) { pending = true; await new Promise(resolve => setTimeout(resolve, 1000)); }
    } catch (error: any) {
      console.error('pipeline event stream failed', error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
