import { ApplicationFailure, Context } from '@temporalio/activity';
import type { DataRef, IngestionConfig, NodeResult } from '@dataflow/shared';
import { evaluatePredicate } from '@dataflow/shared';
import { sources, handlers } from './catalog';
import { writePayload, readPayload, loadCursor, saveCursor, recordNodeRun, pool } from './db';
import { writeExecutionMetric } from './clickhouse';
import { decryptDekFromWorkflowInput } from './crypto';
import { M } from '../otel';
import pino from 'pino';

const log = pino({ name: 'activities' });

function resolveDek(encryptedDek?: string): Buffer | undefined {
  return encryptedDek ? decryptDekFromWorkflowInput(encryptedDek) : undefined;
}

export async function prepareScheduledExecution(params: {
  executionId: string;
  pipelineRowId: string;
  tenantId: string;
  environment: string;
  workflowId: string;
  runId: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO billing_plans (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [params.tenantId],
    );
    await client.query(
      `INSERT INTO usage_counters (tenant_id, month, execution_count)
       VALUES ($1, date_trunc('month', now() at time zone 'utc')::date, 0)
       ON CONFLICT (tenant_id, month) DO NOTHING`,
      [params.tenantId],
    );
    const { rows } = await client.query(
      `SELECT bp.free_tier_limit + bp.extra_quota AS quota_limit,
              uc.execution_count
         FROM billing_plans bp
         JOIN usage_counters uc
           ON uc.tenant_id = bp.tenant_id
          AND uc.month = date_trunc('month', now() at time zone 'utc')::date
        WHERE bp.tenant_id = $1
        FOR UPDATE OF bp, uc`,
      [params.tenantId],
    );
    if (!rows.length || rows[0].execution_count >= rows[0].quota_limit) {
      throw ApplicationFailure.nonRetryable(
        'scheduled execution quota exceeded',
        'QuotaExceededError',
      );
    }
    await client.query(
      `UPDATE usage_counters
          SET execution_count = execution_count + 1
        WHERE tenant_id = $1
          AND month = date_trunc('month', now() at time zone 'utc')::date`,
      [params.tenantId],
    );
    await client.query(
      `INSERT INTO executions
         (id, pipeline_id, tenant_id, trigger_type, phase, environment, workflow_id, run_id)
       VALUES ($1,$2,$3,'cron','running',$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        params.executionId, params.pipelineRowId, params.tenantId,
        params.environment, params.workflowId, params.runId,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Worker resolves the owning pipeline once per execution; the value is
// immutable for the life of the execution row so the cache is safe across
// activity invocations within the worker process.
const pipelineIdCache = new Map<string, string>();
async function pipelineIdFor(executionId: string): Promise<string> {
  const cached = pipelineIdCache.get(executionId);
  if (cached) return cached;
  const { rows } = await pool.query(
    `SELECT pipeline_id FROM executions WHERE id = $1`, [executionId]);
  const pid = rows[0]?.pipeline_id;
  if (pid) pipelineIdCache.set(executionId, pid);
  return pid ?? '00000000-0000-0000-0000-000000000000';
}

// Best-effort dual write: Postgres node_runs is the operational audit log
// (tenant-scoped via RLS-style queries elsewhere) and ClickHouse
// execution_metrics feeds analytics aggregation. The Postgres write is
// authoritative for execution control; the ClickHouse write is allowed
// to fail loudly without poisoning the activity result (Temporal already
// retried at the writeRecords layer).
async function emitMetric(
  tenantId: string, executionId: string, nodeId: string,
  activityType: string, status: string, durationMs: number, recordCount?: number,
) {
  try {
    const pipelineId = await pipelineIdFor(executionId);
    await writeExecutionMetric({
      tenantId, executionId, pipelineId, nodeId, activityType,
      status, durationMs, recordCount,
    });
  } catch (err: any) {
    log.warn({ err: err.message, executionId, nodeId }, 'execution_metrics write failed');
  }
}

// ─── Source activity: one page per call; the workflow loops while hasMore ───
export async function fetchSourcePage(params: {
  activityType: string; config: Record<string, unknown>;
  ingestion?: IngestionConfig; tenantId: string;
  connectionId: string; executionId: string; nodeId: string;
  encryptedDek?: string;
}): Promise<{ outputRef: DataRef; hasMore: boolean; recordCount: number }> {
  const {
    activityType, config, ingestion, tenantId, connectionId,
    executionId, nodeId, encryptedDek,
  } = params;
  const fetcher = sources[activityType];
  if (!fetcher) throw new Error(`Unknown source: ${activityType}`);

  Context.current().heartbeat();
  const cursor = await loadCursor(tenantId, connectionId);    // durable state
  const start = Date.now();
  const result = await fetcher({ config, cursor, ingestion, tenantId });
  await saveCursor(tenantId, connectionId, result.nextCursor); // checkpoint AFTER success

  M.recordsIngested.add(result.records.length, { connector: activityType, tenant: tenantId });
  log.info({ activityType, nodeId, records: result.records.length, hasMore: result.hasMore }, 'page fetched');

  const outputRef = await writePayload(
    result.records, tenantId, executionId, nodeId, resolveDek(encryptedDek),
  );
  const durationMs = Date.now() - start;
  await recordNodeRun(executionId, nodeId, tenantId, 'success', durationMs, result.records.length);
  await emitMetric(tenantId, executionId, nodeId, activityType, 'success', durationMs, result.records.length);
  return { outputRef, hasMore: result.hasMore, recordCount: result.records.length };
}

// ─── Generic dispatch for transforms & sinks ───
export async function dispatchNode(params: {
  activityType: string; config: Record<string, unknown>;
  inputRef?: DataRef; tenantId: string; executionId: string; nodeId: string;
  encryptedDek?: string;
}): Promise<NodeResult> {
  const {
    activityType, config, inputRef, tenantId, executionId, nodeId, encryptedDek,
  } = params;
  const handler = handlers[activityType];
  if (!handler) throw new Error(`Unknown activity: ${activityType}`);

  const start = Date.now();
  const hb = setInterval(() => Context.current().heartbeat(), 10_000);
  try {
    const dek = resolveDek(encryptedDek);
    const input = inputRef ? await readPayload(inputRef, dek) : undefined;
    const output = await handler(input, config, { tenantId, executionId, nodeId });
    const durationMs = Date.now() - start;
    M.nodeDuration.record(durationMs, { activity: activityType });
    const outputRef = output != null
      ? await writePayload(output, tenantId, executionId, nodeId, dek) : undefined;
    await recordNodeRun(executionId, nodeId, tenantId, 'success', durationMs, outputRef?.recordCount);
    await emitMetric(tenantId, executionId, nodeId, activityType, 'success', durationMs, outputRef?.recordCount);
    return { nodeId, status: 'success', outputRef,
             meta: { durationMs, recordCount: outputRef?.recordCount } };
  } catch (err: any) {
    M.nodeFailures.add(1, { activity: activityType });
    const durationMs = Date.now() - start;
    await recordNodeRun(executionId, nodeId, tenantId, 'failed', durationMs, undefined, err.message);
    await emitMetric(tenantId, executionId, nodeId, activityType, 'failed', durationMs, undefined);
    throw err;
  } finally { clearInterval(hb); }
}

// ─── Merge & condition helpers ───
export async function mergeRefs(params: {
  inputRefs: DataRef[]; strategy: string; joinKey?: string;
  tenantId: string; executionId: string; nodeId: string;
  encryptedDek?: string;
}): Promise<NodeResult> {
  const {
    inputRefs, strategy, joinKey, tenantId, executionId, nodeId, encryptedDek,
  } = params;
  const start = Date.now();
  const dek = resolveDek(encryptedDek);
  const arrays = await Promise.all(inputRefs.map(r => readPayload(r, dek))) as any[][];
  let merged: any[];
  if (strategy === 'innerJoin' && joinKey) {
    const [a, b] = arrays;
    const index = new Map(b.map(r => [String(r[joinKey]), r]));
    merged = a.filter(r => index.has(String(r[joinKey])))
              .map(r => ({ ...r, ...index.get(String(r[joinKey])) }));
  } else {
    merged = arrays.flat();
  }
  const outputRef = await writePayload(merged, tenantId, executionId, nodeId, dek);
  await recordNodeRun(executionId, nodeId, tenantId, 'success', Date.now() - start, merged.length);
  return { nodeId, status: 'success', outputRef,
           meta: { durationMs: Date.now() - start, recordCount: merged.length } };
}

export async function evalEdgeCondition(params: {
  condition: string; inputRef?: DataRef; encryptedDek?: string;
}): Promise<boolean> {
  if (!params.inputRef) return true;
  const data = await readPayload(params.inputRef, resolveDek(params.encryptedDek));
  const sample = Array.isArray(data) ? data : [data];
  return evaluatePredicate(params.condition, { records: sample, r: sample[0] });
}

export async function markExecution(params: { executionId: string; phase: string }) {
  await pool.query(
    `UPDATE executions SET phase=$2, completed_at = CASE WHEN $2 IN ('completed','failed','cancelled') THEN now() ELSE completed_at END WHERE id=$1`,
    [params.executionId, params.phase]);
}
