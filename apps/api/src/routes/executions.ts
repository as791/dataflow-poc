import { Router } from 'express';
import { withTenantTx } from '../db';
import { fireExecution, temporal, namespaceFor } from '../temporal';
import type { Environment, PipelineDefinition } from '@dataflow/shared';
import { evaluatePipelineHealth, redactSensitiveText } from '@dataflow/shared';
import { auditLog } from '../middleware/audit';
import { executionsStarted } from '../metrics';
import { requirePaidFeature } from '../lib/edition';

export const executions = Router();

export function monitoringSummary(row: Record<string, unknown>) {
  const runs = Number(row.runs ?? 0);
  const succeeded = Number(row.succeeded ?? 0);
  return {
    runs, succeeded, failed: Number(row.failed ?? 0), running: Number(row.running ?? 0),
    successRate: runs ? Math.round((succeeded / runs) * 1000) / 10 : null,
    avgDurationMs: Number(row.avg_duration_ms ?? 0),
  };
}

type ExecutionCursor = { startedAt: string; id: string };

export function encodeExecutionCursor(cursor: ExecutionCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeExecutionCursor(value: string): ExecutionCursor {
  const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as ExecutionCursor;
  if (!cursor?.id || !cursor.startedAt || Number.isNaN(Date.parse(cursor.startedAt))) throw new Error('invalid cursor');
  return cursor;
}

export function canRetryExecution(phase: string): boolean { return phase === 'failed'; }

const TRACE_SECRET_KEY = /payload|input|result|header|memo|searchAttributes|identity|details/i;
export function safeTraceValue(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return redactSensitiveText(value).slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map(item => safeTraceValue(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !TRACE_SECRET_KEY.test(key))
    .slice(0, 30)
    .map(([key, item]) => [key, safeTraceValue(item, depth + 1)]));
  return String(value);
}

// Each execution lives in its environment's Temporal namespace, so status
// queries and signals must target that namespace.
async function temporalIdentityForExecution(req: any, id: string): Promise<{
  env: Environment; workflowId: string; runId?: string;
}> {
  return withTenantTx(req, async client => {
    const { rows } = await client.query(
      `SELECT environment, workflow_id, run_id FROM executions WHERE id=$1`,
      [id],
    );
    return {
      env: (rows[0]?.environment ?? 'test') as Environment,
      workflowId: rows[0]?.workflow_id ?? id,
      runId: rows[0]?.run_id ?? undefined,
    };
  });
}

// Legacy callers receive an array. `paged=1` enables stable cursor pagination.
executions.get('/', async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: string[] = []; const params: any[] = [];
  const add = (col: string, val?: string) => { if (val) { params.push(val); where.push(`${col} = $${params.length}`); } };
  add('e.pipeline_id', q.pipeline);
  add('e.environment', q.env);
  add('e.phase', q.phase ?? q.status);
  if (q.from) { params.push(q.from); where.push(`e.started_at >= $${params.length}`); }
  if (q.to)   { params.push(q.to);   where.push(`e.started_at <= $${params.length}`); }
  const limit = Math.min(Math.max(parseInt(q.limit ?? '100', 10) || 100, 1), 500);
  if (q.cursor) {
    let cursor: ExecutionCursor;
    try { cursor = decodeExecutionCursor(q.cursor); }
    catch { return res.status(400).json({ error: 'invalid execution cursor' }); }
    params.push(cursor.startedAt, cursor.id);
    where.push(`(e.started_at, e.id) < ($${params.length - 1}::timestamptz, $${params.length})`);
  }
  const rows = await withTenantTx(req, c => c.query(
    `SELECT e.*, p.name FROM executions e JOIN pipelines p ON p.id = e.pipeline_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY e.started_at DESC, e.id DESC LIMIT ${q.paged === '1' ? limit + 1 : limit}`, params));
  if (q.paged !== '1') return res.json(rows.rows);
  const items = rows.rows.slice(0, limit);
  const last = items.at(-1);
  res.json({
    items,
    nextCursor: rows.rows.length > limit && last
      ? encodeExecutionCursor({ startedAt: new Date(last.started_at).toISOString(), id: last.id })
      : null,
  });
});

executions.get('/monitoring/overview', async (req, res) => {
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? '7'), 10) || 7, 1), 90);
  const data = await withTenantTx(req, async client => {
    const [summary, trend, health, failures, qualitySummary, qualityIssues] = await Promise.all([
      client.query(
        `SELECT count(*)::int AS runs,
                count(*) FILTER (WHERE phase='completed')::int AS succeeded,
                count(*) FILTER (WHERE phase='failed')::int AS failed,
                count(*) FILTER (WHERE phase='running')::int AS running,
                coalesce(round(avg(extract(epoch FROM (completed_at-started_at))*1000)
                  FILTER (WHERE completed_at IS NOT NULL)),0)::bigint AS avg_duration_ms
           FROM executions WHERE started_at >= now()-make_interval(days=>$1)`, [days]),
      client.query(
        `WITH dates AS (
           SELECT generate_series(current_date-($1::int-1), current_date, interval '1 day')::date AS day
         )
         SELECT dates.day,
                count(e.id)::int AS runs,
                count(e.id) FILTER (WHERE e.phase='completed')::int AS succeeded,
                count(e.id) FILTER (WHERE e.phase='failed')::int AS failed
           FROM dates LEFT JOIN executions e ON e.started_at::date=dates.day
          GROUP BY dates.day ORDER BY dates.day`, [days]),
      client.query(
        `WITH ranked AS (
           SELECT p.*, row_number() OVER (
             PARTITION BY pipeline_key, environment
             ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, version DESC
           ) AS rank FROM pipelines p
         )
         SELECT p.id, p.pipeline_key, p.name, p.version, p.status, p.environment, p.definition,
                count(e.id)::int AS runs,
                count(e.id) FILTER (WHERE e.phase='failed')::int AS failed,
                coalesce(round(avg(extract(epoch FROM (e.completed_at-e.started_at))*1000)
                  FILTER (WHERE e.completed_at IS NOT NULL)),0)::bigint AS avg_duration_ms,
                latest.id AS last_execution_id, latest.phase AS last_phase,
                latest.started_at AS last_started_at, latest_success.completed_at AS last_success_at
           FROM ranked p
           LEFT JOIN executions e ON e.pipeline_id=p.id
             AND e.started_at >= now()-make_interval(days=>$1)
           LEFT JOIN LATERAL (
             SELECT id, phase, started_at FROM executions
              WHERE pipeline_id=p.id ORDER BY started_at DESC LIMIT 1
           ) latest ON true
           LEFT JOIN LATERAL (
             SELECT completed_at FROM executions
              WHERE pipeline_id=p.id AND phase='completed' ORDER BY completed_at DESC LIMIT 1
           ) latest_success ON true
          WHERE p.rank=1
          GROUP BY p.id,p.pipeline_key,p.name,p.version,p.status,p.environment,p.definition,
                   latest.id,latest.phase,latest.started_at,latest_success.completed_at
          ORDER BY p.environment,p.name`, [days]),
      client.query(
        `SELECT e.id, e.pipeline_id, p.name, e.environment, e.started_at, e.completed_at,
                failed_node.node_id, failed_node.error
           FROM executions e JOIN pipelines p ON p.id=e.pipeline_id
           LEFT JOIN LATERAL (
             SELECT node_id,error FROM node_runs
              WHERE execution_id=e.id AND status='failed' ORDER BY finished_at DESC LIMIT 1
           ) failed_node ON true
          WHERE e.phase='failed' AND e.started_at >= now()-make_interval(days=>$1)
          ORDER BY e.started_at DESC LIMIT 10`, [days]),
      client.query(
        `SELECT count(*)::int AS checks,
                coalesce(sum(passed_count),0)::bigint AS passed_rows,
                coalesce(sum(failed_count),0)::bigint AS failed_rows,
                count(*) FILTER (WHERE status IN ('warning','failed'))::int AS issues
           FROM data_quality_results WHERE evaluated_at >= now()-make_interval(days=>$1)`, [days]),
      client.query(
        `SELECT q.execution_id,q.node_id,q.status,q.passed_count,q.failed_count,q.error_samples,
                q.evaluated_at,p.name,p.environment
           FROM data_quality_results q JOIN pipelines p ON p.id=q.pipeline_id
          WHERE q.status IN ('warning','failed') AND q.evaluated_at >= now()-make_interval(days=>$1)
          ORDER BY q.evaluated_at DESC LIMIT 10`, [days]),
    ]);
    return {
      summary: summary.rows[0], trend: trend.rows, pipelines: health.rows, recentFailures: failures.rows,
      quality: qualitySummary.rows[0], recentQualityIssues: qualityIssues.rows,
    };
  });
  res.json({
    days,
    summary: monitoringSummary(data.summary),
    trend: data.trend, pipelines: data.pipelines.map(row => evaluatePipelineHealth(row)),
    recentFailures: data.recentFailures.map(row => ({
      ...row, error: row.error ? redactSensitiveText(row.error) : row.error,
    })),
    quality: {
      checks: Number(data.quality?.checks ?? 0), passedRows: Number(data.quality?.passed_rows ?? 0),
      failedRows: Number(data.quality?.failed_rows ?? 0), issues: Number(data.quality?.issues ?? 0),
    },
    recentQualityIssues: data.recentQualityIssues,
  });
});

// Searchable workspace activity, derived from durable node_runs. No second log
// store to operate; structured process logs remain in the normal log backend.
executions.get('/logs', async (req, res) => {
  const query = String(req.query.query ?? '').trim().slice(0, 200);
  const level = String(req.query.level ?? 'all');
  if (!['all', 'info', 'error'].includes(level)) return res.status(400).json({ error: 'level must be all, info, or error' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
  const params: any[] = [days];
  const where: string[] = [`nr.finished_at >= now()-make_interval(days=>$1)`];
  if (level !== 'all') {
    params.push(level === 'error' ? 'failed' : 'success');
    where.push(`nr.status=$${params.length}`);
  }
  if (query) {
    params.push(`%${query}%`);
    where.push(`(p.name ILIKE $${params.length} OR nr.execution_id ILIKE $${params.length}
      OR nr.node_id ILIKE $${params.length} OR coalesce(nr.error,'') ILIKE $${params.length})`);
  }
  params.push(limit);
  const result = await withTenantTx(req, client => client.query(
    `SELECT nr.execution_id,nr.node_id,nr.status,nr.duration_ms,nr.record_count,nr.error,nr.finished_at,
            p.id AS pipeline_id,p.name,e.environment
       FROM node_runs nr
       JOIN executions e ON e.id=nr.execution_id
       JOIN pipelines p ON p.id=e.pipeline_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY nr.finished_at DESC,nr.execution_id DESC,nr.node_id DESC LIMIT $${params.length}`,
    params,
  ));
  res.json({ items: result.rows.map(row => ({
    ...row, level: row.status === 'failed' ? 'error' : 'info',
    message: row.status === 'failed'
      ? redactSensitiveText(row.error ?? 'Node failed')
      : `${Number(row.record_count ?? 0).toLocaleString('en-US')} records in ${Number(row.duration_ms ?? 0)}ms`,
    error: undefined,
  })) });
});

executions.get('/:id/trace', requirePaidFeature('deepObservability'), async (req, res) => {
  const row = await withTenantTx(req, client => client.query(
    `SELECT environment,workflow_id,run_id FROM executions WHERE id=$1`, [req.params.id]));
  if (!row.rows[0]) return res.status(404).json({ error: 'not found' });
  const identity = row.rows[0];
  const history = await (await temporal(namespaceFor(identity.environment ?? 'test')))
    .workflow.getHandle(identity.workflow_id ?? req.params.id, identity.run_id ?? undefined).fetchHistory();
  const events = (history.events ?? []).map((event: any) => {
    const attributes = Object.entries(event).find(([key, value]) => key.endsWith('EventAttributes') && value)?.[1];
    return {
      eventId: String(event.eventId ?? ''), eventType: event.eventType,
      eventTime: safeTraceValue(event.eventTime), attributes: safeTraceValue(attributes),
    };
  });
  res.json({ events });
});

// Run detail: execution + node_runs + pipeline definition (nodes/edges).
executions.get('/:id', async (req, res) => {
  const data = await withTenantTx(req, async client => {
    const { rows: e } = await client.query(
      `SELECT e.*, p.name, p.definition FROM executions e
       JOIN pipelines p ON p.id = e.pipeline_id WHERE e.id = $1`, [req.params.id]);
    if (!e[0]) return null;
    const { rows: nodeRuns } = await client.query(
      `SELECT node_id, status, duration_ms, record_count, error, finished_at
         FROM node_runs WHERE execution_id = $1`, [req.params.id]);
    const { rows: qualityResults } = await client.query(
      `SELECT node_id,status,passed_count,failed_count,error_samples,evaluated_at,
              (quarantine_ref IS NOT NULL) AS quarantine_available
         FROM data_quality_results WHERE execution_id=$1 ORDER BY evaluated_at`, [req.params.id]);
    const { definition, ...execution } = e[0];
    return {
      execution, definition: { nodes: definition?.nodes ?? [], edges: definition?.edges ?? [] },
      nodeRuns: nodeRuns.map(run => ({ ...run, error: run.error ? redactSensitiveText(run.error) : null })), qualityResults,
    };
  });
  data ? res.json(data) : res.status(404).json({ error: 'not found' });
});

executions.get('/:id/status', async (req, res) => {
  const id = req.params.id;
  // Always read the DB phase — markExecution writes it when the workflow
  // finishes, and the Temporal query handler never returns 'completed'/'failed'.
  const dbRow = await withTenantTx(req, async client => {
    const { rows: e } = await client.query(
      `SELECT phase, environment, workflow_id, run_id FROM executions WHERE id=$1`,
      [id],
    );
    const { rows: nr } = await client.query(`SELECT * FROM node_runs WHERE execution_id=$1`, [id]);
    return {
      dbPhase: e[0]?.phase ?? null,
      env: (e[0]?.environment ?? 'test') as Environment,
      workflowId: e[0]?.workflow_id ?? id,
      runId: e[0]?.run_id ?? undefined,
      nodeRuns: nr,
    };
  });

  // If the DB already marks this execution terminal, return immediately.
  const TERMINAL = ['completed', 'failed', 'cancelled'];
  if (dbRow.dbPhase && TERMINAL.includes(dbRow.dbPhase)) {
    res.json({ executionId: id, phase: dbRow.dbPhase, nodeRuns: dbRow.nodeRuns.map(run => ({
      ...run, error: run.error ? redactSensitiveText(run.error) : run.error,
    })) });
    return;
  }

  // Workflow still running — query the live status from Temporal.
  try {
    const c = await temporal(namespaceFor(dbRow.env));
    const handle = c.workflow.getHandle(dbRow.workflowId, dbRow.runId);
    const status = await handle.query('status');
    res.json(status);
  } catch {
    // Workflow unreachable (e.g. worker restart before markExecution fired).
    res.json({ executionId: id, phase: dbRow.dbPhase ?? 'unknown', nodeRuns: dbRow.nodeRuns });
  }
});

executions.post('/:id/retry', async (req, res) => {
  const previous = await withTenantTx(req, async client => {
    const { rows } = await client.query(
      `SELECT e.id, e.phase, e.pipeline_id, e.environment, e.trigger_type, p.definition,
              (SELECT id FROM executions retry
                WHERE retry.retry_of=e.id AND retry.phase='running' LIMIT 1) AS active_retry_id
         FROM executions e JOIN pipelines p ON p.id=e.pipeline_id WHERE e.id=$1`,
      [req.params.id],
    );
    return rows[0] as { id: string; phase: string; pipeline_id: string; environment: Environment; trigger_type: string; definition: PipelineDefinition; active_retry_id?: string } | undefined;
  });
  if (!previous) return res.status(404).json({ error: 'not found' });
  if (previous.trigger_type === 'backfill') return res.status(409).json({ error: 'backfill partitions cannot be retried; start a new backfill for the failed range' });
  if (!canRetryExecution(previous.phase)) return res.status(409).json({ error: 'only failed executions can be retried' });
  if (previous.active_retry_id) return res.status(409).json({ error: 'a retry is already running', executionId: previous.active_retry_id });

  let executionId: string;
  try {
    executionId = await fireExecution(
      previous.definition, previous.pipeline_id, 'retry', previous.environment, undefined, undefined, previous.id,
    );
  } catch (error: any) {
    if (error?.constraint === 'idx_executions_one_active_retry') {
      return res.status(409).json({ error: 'a retry is already running' });
    }
    throw error;
  }
  executionsStarted.inc({ trigger: 'retry' });
  await auditLog(req, 'execution.retried', executionId, { retryOf: previous.id, environment: previous.environment });
  res.status(201).json({ executionId, retryOf: previous.id, environment: previous.environment });
});

for (const action of ['pause', 'resume', 'cancel'] as const) {
  executions.post(`/:id/${action}`, async (req, res) => {
    const identity = await temporalIdentityForExecution(req, req.params.id);
    const c = await temporal(namespaceFor(identity.env));
    await c.workflow.getHandle(identity.workflowId, identity.runId).signal(action);
    res.json({ ok: true });
  });
}
