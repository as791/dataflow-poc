import { ApplicationFailure, Context } from '@temporalio/activity';
import type { DataAssetRef, DataRef, IngestionConfig, NodeResult, PipelineDefinition } from '@dataflow/shared';
import { assetMaterializationTopic, dataflowOpenLineageRunEvent, evaluatePipelineHealth, evaluatePredicate, successfulOutputBindings } from '@dataflow/shared';
import { evaluateDataContract, sources, handlers } from './catalog';
import { writePayload, readPayload, loadCursor, recordDataQualityResult, recordNodeRun, pool } from './db';
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
    if (process.env.OPENLINEAGE_URL) {
      const pipeline = await client.query(`SELECT pipeline_key,definition FROM pipelines WHERE id=$1`, [params.pipelineRowId]);
      if (pipeline.rows[0]) {
        const event = dataflowOpenLineageRunEvent({
          definition: pipeline.rows[0].definition, pipelineKey: pipeline.rows[0].pipeline_key,
          executionId: params.executionId, tenantId: params.tenantId, environment: params.environment,
          phase: 'started', eventTime: new Date().toISOString(), namespace: process.env.OPENLINEAGE_NAMESPACE,
        });
        await client.query(
          `INSERT INTO openlineage_outbox (tenant_id,execution_id,event_type,payload)
           VALUES ($1,$2,'START',$3) ON CONFLICT (execution_id,event_type) DO NOTHING`,
          [params.tenantId, params.executionId, JSON.stringify(event)],
        );
      }
    }
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
  cursor?: Record<string, any>;
  encryptedDek?: string;
}): Promise<{ outputRef: DataRef; hasMore: boolean; recordCount: number; checkpoint?: Record<string, any> }> {
  const {
    activityType, config, ingestion, tenantId, connectionId,
    executionId, nodeId, encryptedDek,
  } = params;
  const fetcher = sources[activityType];
  if (!fetcher) throw new Error(`Unknown source: ${activityType}`);

  Context.current().heartbeat();
  const cursor = params.cursor ?? await loadCursor(tenantId, connectionId);
  const start = Date.now();
  const result = await fetcher({ config, cursor, ingestion, tenantId });

  M.recordsIngested.add(result.records.length, { connector: activityType, tenant: tenantId });
  log.info({ activityType, nodeId, records: result.records.length, hasMore: result.hasMore }, 'page fetched');

  const outputRef = await writePayload(
    result.records, tenantId, executionId, nodeId, resolveDek(encryptedDek),
  );
  // Workflow carries cursor between pages and commits only after full DAG success.
  const durationMs = Date.now() - start;
  await recordNodeRun(executionId, nodeId, tenantId, 'success', durationMs, result.records.length);
  await emitMetric(tenantId, executionId, nodeId, activityType, 'success', durationMs, result.records.length);
  return {
    outputRef, hasMore: result.hasMore, recordCount: result.records.length,
    checkpoint: result.nextCursor,
  };
}

export async function commitSourceCursors(params: {
  tenantId: string;
  cursors: Array<{ connectionId: string; checkpoint: Record<string, any> }>;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { connectionId, checkpoint } of params.cursors) {
      const { rows } = await client.query(
        `SELECT cursor FROM connector_state WHERE tenant_id=$1 AND connection_id=$2 FOR UPDATE`,
        [params.tenantId, connectionId],
      );
      let next = checkpoint;
      if (checkpoint.offsets) {
        const current = rows[0]?.cursor ?? {};
        const offsets = { ...(current.topic === checkpoint.topic ? current.offsets : {}) };
        for (const [partition, offset] of Object.entries(checkpoint.offsets)) {
          if (offsets[partition] == null || BigInt(String(offset)) > BigInt(String(offsets[partition]))) {
            offsets[partition] = String(offset);
          }
        }
        next = { ...checkpoint, offsets };
      }
      await client.query(
        `INSERT INTO connector_state (tenant_id, connection_id, cursor, updated_at)
         VALUES ($1,$2,$3,now())
         ON CONFLICT (tenant_id, connection_id) DO UPDATE SET cursor=$3, updated_at=now()`,
        [params.tenantId, connectionId, next],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
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
    let output: unknown;
    if (activityType === 'transform.contract') {
      if (!Array.isArray(input)) throw new Error('transform.contract: input must be an array');
      const evaluated = evaluateDataContract(input, config.schemaJson, config.allowExtra !== false);
      const mode = ['drop', 'quarantine'].includes(String(config.onViolation))
        ? String(config.onViolation) as 'drop' | 'quarantine' : 'fail';
      const quarantineRef = mode === 'quarantine' && evaluated.rejected.length
        ? await writePayload(evaluated.rejected, tenantId, executionId, `${nodeId}:quarantine`, dek)
        : undefined;
      await recordDataQualityResult({
        executionId, nodeId,
        status: evaluated.rejected.length ? (mode === 'fail' ? 'failed' : 'warning') : 'passed',
        passedCount: evaluated.valid.length, failedCount: evaluated.rejected.length,
        errorSamples: evaluated.rejected.slice(0, 20).map(({ rowIndex, errors }) => ({ rowIndex, errors })),
        quarantineRef,
      });
      if (evaluated.rejected.length && mode === 'fail') {
        const first = evaluated.rejected[0];
        throw new Error(`transform.contract: row ${first.rowIndex + 1}: ${first.errors.join('; ')}`);
      }
      output = evaluated.valid;
    } else {
      output = await handler(input, config, { tenantId, executionId, nodeId });
    }
    const durationMs = Date.now() - start;
    M.nodeDuration.record(durationMs, { activity: activityType });
    const outputRef = output != null
      ? await writePayload(output, tenantId, executionId, nodeId, dek) : undefined;
    const recordCount = outputRef?.recordCount ?? inputRef?.recordCount;
    await recordNodeRun(executionId, nodeId, tenantId, 'success', durationMs, recordCount);
    await emitMetric(tenantId, executionId, nodeId, activityType, 'success', durationMs, recordCount);
    return { nodeId, status: 'success', outputRef,
             meta: { durationMs, recordCount } };
  } catch (err: any) {
    M.nodeFailures.add(1, { activity: activityType });
    const durationMs = Date.now() - start;
    await recordNodeRun(executionId, nodeId, tenantId, 'failed', durationMs, undefined, err.message);
    await emitMetric(tenantId, executionId, nodeId, activityType, 'failed', durationMs, undefined);
    throw err;
  } finally { clearInterval(hb); }
}

// ─── Merge & condition helpers ───
// Pure merge combinators — strategy chosen via merge-node config. Joins operate
// on the first two inputs (a,b); set strategies operate on all inputs.
export function mergeArrays(strategy: string, arrays: any[][], joinKey?: string): any[] {
  const [a = [], b = []] = arrays;
  const indexBy = (rows: any[]) => new Map(rows.map(r => [String(r[joinKey!]), r]));
  const needKey = () => { if (!joinKey) throw new Error(`merge strategy "${strategy}" requires a joinKey`); };
  switch (strategy) {
    case 'innerJoin': {
      needKey();
      const bi = indexBy(b);
      return a.filter(r => bi.has(String(r[joinKey!])))
              .map(r => ({ ...r, ...bi.get(String(r[joinKey!])) }));
    }
    case 'leftJoin': {
      needKey();
      const bi = indexBy(b);
      return a.map(r => ({ ...r, ...(bi.get(String(r[joinKey!])) ?? {}) }));
    }
    case 'outerJoin': {
      needKey();
      const ai = indexBy(a), bi = indexBy(b);
      return [...new Set([...ai.keys(), ...bi.keys()])]
        .map(k => ({ ...(ai.get(k) ?? {}), ...(bi.get(k) ?? {}) }));
    }
    case 'union': {
      const seen = new Set<string>();
      return arrays.flat().filter(r => {
        const k = JSON.stringify(r);
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    }
    case 'appendWithSourceTag':
      return arrays.flatMap((rows, i) => rows.map(r => ({ ...r, _source: i })));
    default: // concat
      return arrays.flat();
  }
}

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
  const merged = mergeArrays(strategy, arrays, joinKey);
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
  if (!['completed', 'failed', 'cancelled'].includes(params.phase)) return;
  await pool.query(
    `WITH changed AS (
       UPDATE backfill_partitions bp
          SET status=$2,completed_at=now()
         FROM executions e
        WHERE e.id=$1 AND e.backfill_partition_id=bp.id
        RETURNING bp.job_id
     )
     UPDATE backfill_jobs bj
        SET status=CASE
              WHEN EXISTS (SELECT 1 FROM backfill_partitions p WHERE p.job_id=bj.id AND p.status='failed') THEN 'failed'
              WHEN EXISTS (SELECT 1 FROM backfill_partitions p WHERE p.job_id=bj.id AND p.status='cancelled') THEN 'cancelled'
              ELSE 'completed' END,
            completed_at=now()
      FROM changed
     WHERE bj.id=changed.job_id
       AND NOT EXISTS (SELECT 1 FROM backfill_partitions p WHERE p.job_id=bj.id AND p.status IN ('pending','starting','running'))`,
    [params.executionId, params.phase],
  );
  if (params.phase === 'completed') {
    try { await materializeExecutionAssets(params.executionId); }
    catch (error: any) { log.warn({ executionId: params.executionId, err: error.message }, 'asset materialization persistence failed'); }
  }
  try { await enqueueOpenLineageEvent(params.executionId, params.phase); }
  catch (error: any) { log.warn({ executionId: params.executionId, err: error.message }, 'OpenLineage enqueue failed'); }
  try { await enqueuePipelineEvent(params.executionId, params.phase); }
  catch (error: any) { log.warn({ executionId: params.executionId, err: error.message }, 'pipeline event enqueue failed'); }
  try { await materializeExecutionAlerts(params.executionId); }
  catch (error: any) {
    // Alert persistence must not turn a completed data pipeline into a failed one.
    log.warn({ executionId: params.executionId, err: error.message }, 'pipeline alert materialization failed');
  }
}

export async function enqueueOpenLineageEvent(executionId: string, phase: string): Promise<void> {
  if (!process.env.OPENLINEAGE_URL || !['completed', 'failed', 'cancelled'].includes(phase)) return;
  const { rows } = await pool.query(
    `SELECT e.tenant_id,e.environment,e.completed_at,p.pipeline_key,p.definition
       FROM executions e JOIN pipelines p ON p.id=e.pipeline_id WHERE e.id=$1`, [executionId]);
  if (!rows[0]) return;
  const row = rows[0];
  const event = dataflowOpenLineageRunEvent({
    definition: row.definition, pipelineKey: row.pipeline_key, executionId,
    tenantId: row.tenant_id, environment: row.environment, phase: phase as 'completed' | 'failed' | 'cancelled',
    eventTime: new Date(row.completed_at ?? Date.now()).toISOString(), namespace: process.env.OPENLINEAGE_NAMESPACE,
  });
  await pool.query(
    `INSERT INTO openlineage_outbox (tenant_id,execution_id,event_type,payload)
     VALUES ($1,$2,$3,$4) ON CONFLICT (execution_id,event_type) DO NOTHING`,
    [row.tenant_id, executionId, event.eventType, JSON.stringify(event)],
  );
}

export async function materializeExecutionAssets(executionId: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT e.tenant_id,e.pipeline_id,e.environment,e.completed_at,p.definition
         FROM executions e JOIN pipelines p ON p.id=e.pipeline_id
        WHERE e.id=$1 AND e.phase='completed'`,
      [executionId],
    );
    if (!rows.length) { await client.query('ROLLBACK'); return 0; }
    const row = rows[0];
    const runs = await client.query(
      `SELECT node_id,status,record_count FROM node_runs WHERE execution_id=$1`, [executionId]);
    const outputs = successfulOutputBindings(row.definition as PipelineDefinition, runs.rows.map(run => ({
      nodeId: run.node_id, status: run.status,
      recordCount: run.record_count == null ? undefined : Number(run.record_count),
    })));
    let inserted = 0;
    for (const output of outputs) {
      const result = await client.query(
        `INSERT INTO asset_materializations
           (tenant_id,pipeline_id,execution_id,node_id,asset_urn,asset,record_count,materialized_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,coalesce($8,now()))
         ON CONFLICT (execution_id,node_id,asset_urn) DO NOTHING`,
        [row.tenant_id, row.pipeline_id, executionId, output.nodeId, output.asset.urn,
         JSON.stringify(output.asset), output.recordCount ?? null, row.completed_at],
      );
      if (result.rowCount) {
        const event = buildAssetMaterializationEvent({
          executionId, pipelineId: row.pipeline_id, nodeId: output.nodeId,
          asset: output.asset, recordCount: output.recordCount, materializedAt: row.completed_at,
        });
        await client.query(
          `INSERT INTO pipeline_event_outbox (tenant_id,environment,event_id,topic,payload)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,event_id,topic) DO NOTHING`,
          [row.tenant_id, row.environment, event.eventId, event.topic, JSON.stringify(event.payload)],
        );
      }
      inserted += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export function buildAssetMaterializationEvent(input: {
  executionId: string; pipelineId: string; nodeId: string; asset: DataAssetRef;
  recordCount?: number; materializedAt?: string | Date;
}) {
  const eventId = `${input.executionId}:asset:${input.nodeId}:${input.asset.urn}`;
  return {
    eventId, topic: assetMaterializationTopic(input.asset.urn),
    payload: {
      eventId, executionId: input.executionId, pipelineId: input.pipelineId, nodeId: input.nodeId,
      assetUrn: input.asset.urn, asset: input.asset,
      recordCount: input.recordCount ?? null, materializedAt: input.materializedAt ?? null,
    },
  };
}

export async function enqueuePipelineEvent(executionId: string, phase: string): Promise<void> {
  await pool.query(
    `INSERT INTO pipeline_event_outbox (tenant_id,environment,event_id,topic,payload)
     SELECT e.tenant_id,e.environment,$2,
            'pipeline.' || $3 || '.' || p.pipeline_key::text,
            jsonb_build_object('eventId',$2,'executionId',e.id,'pipelineId',p.id,
              'pipelineKey',p.pipeline_key,'pipelineName',p.name,'phase',$3,
              'environment',e.environment,'completedAt',e.completed_at)
       FROM executions e JOIN pipelines p ON p.id=e.pipeline_id WHERE e.id=$1
     ON CONFLICT (tenant_id,event_id,topic) DO NOTHING`,
    [executionId, `${executionId}:${phase}`, phase],
  );
}

export async function materializeExecutionAlerts(executionId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT e.tenant_id, e.pipeline_id, e.environment, e.phase AS last_phase, p.name AS pipeline_name, p.definition,
              (SELECT count(*) FROM executions x WHERE x.pipeline_id=e.pipeline_id AND x.started_at>=now()-interval '7 days')::int AS runs,
              (SELECT count(*) FROM executions x WHERE x.pipeline_id=e.pipeline_id AND x.phase='failed' AND x.started_at>=now()-interval '7 days')::int AS failed,
              coalesce((SELECT avg(extract(epoch FROM (x.completed_at-x.started_at))*1000)
                          FROM executions x WHERE x.pipeline_id=e.pipeline_id AND x.completed_at IS NOT NULL
                           AND x.started_at>=now()-interval '7 days'),0)::bigint AS avg_duration_ms,
              (SELECT completed_at FROM executions x WHERE x.pipeline_id=e.pipeline_id AND x.phase='completed'
                ORDER BY completed_at DESC LIMIT 1) AS last_success_at
         FROM executions e JOIN pipelines p ON p.id=e.pipeline_id WHERE e.id=$1`,
      [executionId],
    );
    if (!rows.length) { await client.query('ROLLBACK'); return; }
    const row = rows[0];
    const health = evaluatePipelineHealth(row);
    const fingerprints: string[] = [];
    for (const breach of health.breaches) {
      const fingerprint = `health:${breach.type}`;
      fingerprints.push(fingerprint);
      const alert = await client.query(
        `INSERT INTO pipeline_alerts
           (tenant_id,pipeline_id,execution_id,fingerprint,kind,severity,message,details)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id,pipeline_id,fingerprint) WHERE status IN ('open','acknowledged')
         DO UPDATE SET execution_id=EXCLUDED.execution_id, severity=EXCLUDED.severity,
                       message=EXCLUDED.message, details=EXCLUDED.details, last_seen_at=now()
         RETURNING id`,
        [row.tenant_id, row.pipeline_id, executionId, fingerprint, breach.type, breach.severity,
         breach.message, { health: health.health }],
      );
      const policy = row.definition?.notifications;
      const shouldNotify = policy?.connectionId
        && (policy.minimumSeverity !== 'critical' || breach.severity === 'critical');
      if (shouldNotify && alert.rows[0]) {
        await client.query(
          `INSERT INTO pipeline_alert_notification_outbox
             (tenant_id,alert_id,connection_id,payload)
           SELECT $1,$2,c.id,$4 FROM connector_instances c
            WHERE c.id=$3 AND c.tenant_id=$1 AND c.provider='http'
           ON CONFLICT (alert_id,connection_id) DO NOTHING`,
          [row.tenant_id, alert.rows[0].id, policy.connectionId, {
            type: 'pipeline.alert', alertId: alert.rows[0].id,
            pipelineId: row.pipeline_id, pipelineName: row.pipeline_name,
            executionId, environment: row.environment, kind: breach.type,
            severity: breach.severity, message: breach.message, health: health.health,
          }],
        );
      }
    }
    await client.query(
      `UPDATE pipeline_alerts SET status='resolved', resolved_at=now(), last_seen_at=now()
        WHERE tenant_id=$1 AND pipeline_id=$2 AND status IN ('open','acknowledged')
          AND NOT (fingerprint = ANY($3::text[]))`,
      [row.tenant_id, row.pipeline_id, fingerprints],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
