import { Pool } from 'pg';
import { redactSensitiveText } from '@dataflow/shared';
import type { DataRef } from '@dataflow/shared';
import { getPayloadObject, payloadObjectKey, payloadStoreConfig, putPayloadObject } from '@dataflow/object-store';
import { decryptPayload, encryptPayload } from './crypto';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const INLINE_MAX = 4 * 1024;

function platformPayloadKey(): Buffer | undefined {
  const raw = process.env.TEMPORAL_PAYLOAD_ENCRYPTION_KEY;
  if (!raw) return undefined;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('TEMPORAL_PAYLOAD_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

// Control plane gets a pointer; data plane holds the payload.
export async function writePayload(
  data: unknown, tenantId: string, executionId: string, nodeId: string,
  dek?: Buffer,
): Promise<DataRef> {
  const json = JSON.stringify(data ?? null);
  const sizeBytes = Buffer.byteLength(json);
  const encryptionKey = dek ?? platformPayloadKey();
  if (sizeBytes <= INLINE_MAX) {
    if (encryptionKey) {
      const encrypted = encryptPayload(Buffer.from(json), encryptionKey);
      return {
        type: 'inline',
        key: encrypted.ciphertext,
        iv: encrypted.iv,
        encrypted: true,
        tenantId,
        sizeBytes,
        recordCount: Array.isArray(data) ? data.length : undefined,
      };
    }
    return { type: 'inline', key: Buffer.from(json).toString('base64'),
             tenantId, sizeBytes,
             recordCount: Array.isArray(data) ? data.length : undefined };
  }
  const objectStore = payloadStoreConfig();
  if (objectStore) {
    if (!encryptionKey) throw new Error('PAYLOAD_S3_BUCKET requires TEMPORAL_PAYLOAD_ENCRYPTION_KEY or an execution DEK');
    const encrypted = encryptPayload(Buffer.from(json), encryptionKey);
    const key = payloadObjectKey(tenantId, executionId, nodeId);
    await putPayloadObject(objectStore, key, encrypted.ciphertext);
    return {
      type: 's3', key, bucket: objectStore.bucket, iv: encrypted.iv, encrypted: true,
      tenantId, sizeBytes, recordCount: Array.isArray(data) ? data.length : undefined,
    };
  }
  if (encryptionKey) {
    const encrypted = encryptPayload(Buffer.from(json), encryptionKey);
    const { rows } = await pool.query(
      `INSERT INTO node_payloads
         (tenant_id, execution_id, node_id, payload, encrypted, encryption_iv)
       VALUES ($1,$2,$3,$4,true,$5) RETURNING id`,
      [tenantId, executionId, nodeId, JSON.stringify(encrypted.ciphertext), encrypted.iv],
    );
    return {
      type: 'pg',
      key: rows[0].id,
      tenantId,
      sizeBytes,
      recordCount: Array.isArray(data) ? data.length : undefined,
      encrypted: true,
    };
  }
  const { rows } = await pool.query(
    `INSERT INTO node_payloads (tenant_id, execution_id, node_id, payload)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [tenantId, executionId, nodeId, json]
  );
  return { type: 'pg', key: rows[0].id, tenantId, sizeBytes,
           recordCount: Array.isArray(data) ? data.length : undefined };
}

export async function readPayload(ref: DataRef, dek?: Buffer): Promise<unknown> {
  const encryptionKey = dek ?? platformPayloadKey();
  if (ref.type === 'inline') {
    if (ref.encrypted) {
      if (!encryptionKey || !ref.iv) {
        throw new Error('encrypted inline DataRef is missing its encryption key or IV');
      }
      return JSON.parse(decryptPayload(ref.key, ref.iv, encryptionKey).toString());
    }
    return JSON.parse(Buffer.from(ref.key, 'base64').toString());
  }
  if (ref.type === 's3') {
    if (!ref.encrypted || !encryptionKey || !ref.iv) {
      throw new Error(`encrypted DataRef ${ref.key} is missing its encryption key or IV`);
    }
    const objectStore = payloadStoreConfig(process.env, ref.bucket);
    if (!objectStore) throw new Error(`DataRef ${ref.key} is missing its object-store bucket`);
    const ciphertext = await getPayloadObject(objectStore, ref.key);
    return JSON.parse(decryptPayload(ciphertext, ref.iv, encryptionKey).toString());
  }
  const { rows } = await pool.query(
    `SELECT payload, encrypted, encryption_iv FROM node_payloads WHERE id = $1`,
    [ref.key],
  );
  if (!rows.length) throw new Error(`DataRef ${ref.key} not found`);
  if (rows[0].encrypted) {
    if (!encryptionKey || !rows[0].encryption_iv) {
      throw new Error(`encrypted DataRef ${ref.key} is missing its encryption key or IV`);
    }
    return JSON.parse(
      decryptPayload(String(rows[0].payload), rows[0].encryption_iv, encryptionKey).toString(),
    );
  }
  return rows[0].payload;
}

// ─── Durable cursor state: the backbone of incremental + backfill ingestion ───
export async function loadCursor(tenantId: string, connectionId: string): Promise<Record<string, any>> {
  const { rows } = await pool.query(
    `SELECT cursor FROM connector_state WHERE tenant_id=$1 AND connection_id=$2`,
    [tenantId, connectionId]);
  return rows[0]?.cursor ?? {};
}

export async function saveCursor(tenantId: string, connectionId: string, cursor: Record<string, any>) {
  await pool.query(
    `INSERT INTO connector_state (tenant_id, connection_id, cursor, updated_at)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (tenant_id, connection_id) DO UPDATE SET cursor=$3, updated_at=now()`,
    [tenantId, connectionId, cursor]);
}

export async function recordNodeRun(
  executionId: string, nodeId: string, tenantId: string, status: string,
  durationMs: number, recordCount?: number, error?: string
) {
  await pool.query(
    `INSERT INTO node_runs (execution_id,node_id,tenant_id,status,duration_ms,record_count,error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (execution_id,node_id) DO UPDATE
       SET status=$4, duration_ms=$5, record_count=$6, error=$7, finished_at=now()`,
    [executionId, nodeId, tenantId, status, durationMs, recordCount ?? null,
      error == null ? null : redactSensitiveText(error)]);
}

export async function recordDataQualityResult(params: {
  executionId: string;
  nodeId: string;
  status: 'passed' | 'warning' | 'failed';
  passedCount: number;
  failedCount: number;
  errorSamples: Array<{ rowIndex: number; errors: string[] }>;
  quarantineRef?: DataRef;
}): Promise<void> {
  await pool.query(
    `INSERT INTO data_quality_results
       (tenant_id,pipeline_id,execution_id,node_id,status,passed_count,failed_count,error_samples,quarantine_ref)
     SELECT e.tenant_id,e.pipeline_id,e.id,$2,$3,$4,$5,$6,$7
       FROM executions e WHERE e.id=$1
     ON CONFLICT (execution_id,node_id) DO UPDATE SET
       status=EXCLUDED.status,passed_count=EXCLUDED.passed_count,failed_count=EXCLUDED.failed_count,
       error_samples=EXCLUDED.error_samples,quarantine_ref=EXCLUDED.quarantine_ref,evaluated_at=now()`,
    [params.executionId, params.nodeId, params.status, params.passedCount, params.failedCount,
     JSON.stringify(params.errorSamples), params.quarantineRef ? JSON.stringify(params.quarantineRef) : null],
  );
}
