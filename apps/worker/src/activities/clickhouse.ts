// Phase 4 — single ingress to ClickHouse from the worker. Everything that
// previously went to the Postgres `sink_records` table now flows through
// `writeRecords` here, and every node completion also emits an
// `execution_metrics` row for the analytics UI.
//
// Resilience: each write retries with exponential backoff up to 3 attempts.
// If all three fail we throw; Temporal's activity retry policy takes over
// from there. The future durable buffer (Redis-backed) is intentionally
// out of scope per PLAN.md.

import { createClient, ClickHouseClient } from '@clickhouse/client';
import crypto from 'crypto';
import pino from 'pino';

const log = pino({ name: 'clickhouse' });

let client: ClickHouseClient | null = null;

export function clickhouseClient(): ClickHouseClient {
  if (client) return client;
  const url = process.env.CLICKHOUSE_URL ?? 'http://clickhouse:8123';
  client = createClient({
    url,
    username: process.env.CLICKHOUSE_USER ?? 'dataflow',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'dataflow',
    database: 'dataflow',
    // The HTTP client is connection-pooled internally; safe to share.
    request_timeout: 30_000,
    compression: { response: false, request: false },
  });
  return client;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === 3) break;
      const backoff = 250 * Math.pow(2, attempt - 1); // 250, 500, (skipped)
      log.warn({ label, attempt, err: (err as Error).message }, 'clickhouse write failed, retrying');
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

export interface ExecutionMetric {
  tenantId: string;
  executionId: string;
  pipelineId: string;
  nodeId: string;
  activityType: string;
  status: string;
  durationMs: number;
  recordCount?: number;
}

// Batched insert; ClickHouse's sweet spot is one big batch per page rather
// than per-row INSERTs (which it bills as separate parts).
export async function writeRecords(
  tenantId: string,
  collection: string,
  records: any[],
  dedupField?: string,
): Promise<void> {
  if (!records.length) return;
  const rows = records.map(record => {
    const dedup = dedupField
      ? String(record[dedupField])
      : crypto.createHash('sha1').update(JSON.stringify(record)).digest('hex');
    return {
      tenant_id: tenantId,
      collection,
      record: JSON.stringify(record),
      dedup_key: dedup,
    };
  });
  await withRetry('sink_records', () => clickhouseClient().insert({
    table: 'sink_records',
    values: rows,
    format: 'JSONEachRow',
  }));
}

export async function writeExecutionMetric(metric: ExecutionMetric): Promise<void> {
  await withRetry('execution_metrics', () => clickhouseClient().insert({
    table: 'execution_metrics',
    values: [{
      tenant_id: metric.tenantId,
      execution_id: metric.executionId,
      pipeline_id: metric.pipelineId,
      node_id: metric.nodeId,
      activity_type: metric.activityType,
      status: metric.status,
      duration_ms: metric.durationMs,
      record_count: metric.recordCount ?? 0,
    }],
    format: 'JSONEachRow',
  }));
}
