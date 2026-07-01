import { Router, type RequestHandler } from 'express';
import { v4 as uuid, validate as uuidValidate } from 'uuid';
import { randomBytes } from 'crypto';
import { withTenantTx } from '../db';
import { syncSchedule, fireExecution } from '../temporal';
import { executionsStarted } from '../metrics';
import { auditLog } from '../middleware/audit';
import { requireQuota } from '../middleware/quota';
import { requireOwner, requirePipelineAccess } from '../middleware/auth';
import { validatePipeline } from '../lib/validatePipeline';
import { hashOpenLineageKey, ingestOpenLineageEvent } from '../lib/openlineage';
import { planBackfill, validateBackfillSources } from '../backfills';
import { paidFeatures, pipelineUsesAdvancedConnectors, pipelineUsesRealtime, pipelineUsesStatefulProcessing } from '../lib/edition';
import { attachLatestMaterializations, attachLatestQuality, buildWorkspaceLineage, comparePublishedContracts, diffPipelineLineage, downstreamOutputBindings, mergeExternalLineage, type ContractCompatibilityIssue, type PipelineDefinition, type Environment } from '@dataflow/shared';

export const pipelines = Router();

const requirePipelineFeatures: RequestHandler = async (req, res, next) => {
  try {
    const row = await withTenantTx(req, client => client.query(
      `SELECT definition FROM pipelines WHERE id=$1`, [req.params.rowId]));
    if (row.rows[0]) {
      const enabled = await paidFeatures(req.tenant.tenantId);
      if (pipelineUsesRealtime(row.rows[0].definition) && !enabled.realtime) {
        return res.status(402).json({ error: 'realtime is not enabled for this workspace', feature: 'realtime' });
      }
      if (pipelineUsesStatefulProcessing(row.rows[0].definition) && !enabled.statefulProcessing) {
        return res.status(402).json({ error: 'statefulProcessing is not enabled for this workspace', feature: 'statefulProcessing' });
      }
      if (pipelineUsesAdvancedConnectors(row.rows[0].definition) && !enabled.advancedConnectors) {
        return res.status(402).json({ error: 'advancedConnectors is not enabled for this workspace', feature: 'advancedConnectors' });
      }
    }
    next();
  } catch (error) { next(error); }
};

type VersionHistoryRow = {
  id: string; pipeline_key: string; version: number; name: string; status: string;
  environment: string; definition: PipelineDefinition; created_at: string | Date;
};

export function buildLineageChangeHistory(rows: VersionHistoryRow[], limit = 30) {
  const previousByPipeline = new Map<string, VersionHistoryRow>();
  const items = rows.map(row => {
    const key = `${row.pipeline_key}:${row.environment}`;
    const previous = previousByPipeline.get(key);
    previousByPipeline.set(key, row);
    const changes = diffPipelineLineage(previous?.definition, row.definition);
    const summary = { breaking: 0, warning: 0, info: 0 };
    for (const change of changes) summary[change.severity]++;
    return {
      rowId: row.id, pipelineKey: row.pipeline_key, name: row.name, status: row.status,
      environment: row.environment, fromVersion: previous?.version ?? null, toVersion: row.version,
      createdAt: new Date(row.created_at).toISOString(), summary, changes,
    };
  }).filter(item => item.changes.length);
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

export function promotionGate(
  hasGreenRun: boolean,
  issues: ContractCompatibilityIssue[],
  allowBreakingContract: boolean,
): { ok: true } | { code: 409; error: string; contractIssues?: ContractCompatibilityIssue[] } {
  if (!hasGreenRun) return { code: 409, error: 'promotion gate: this version has no successful Integration run' };
  if (issues.length && !allowBreakingContract) return {
    code: 409,
    error: `breaking data contract: ${issues.map(issue => issue.message).join('; ')}`,
    contractIssues: issues,
  };
  return { ok: true };
}

async function createProductionVersion(client: any, src: any, allowBreakingContract: boolean) {
  if ((src.environment ?? 'test') !== 'test') return { code: 409, error: 'only Integration versions can be promoted' } as const;
  const green = await client.query(
    `SELECT 1 FROM executions WHERE pipeline_id=$1 AND environment='test' AND phase='completed' LIMIT 1`, [src.id]);
  const runGate = promotionGate(green.rows.length > 0, [], allowBreakingContract);
  if ('code' in runGate) return runGate;

  const current = await client.query(
    `SELECT definition FROM pipelines
      WHERE pipeline_key=$1 AND environment='prod' AND status='active' LIMIT 1`, [src.pipeline_key]);
  const issues = current.rows[0]
    ? comparePublishedContracts(current.rows[0].definition as PipelineDefinition, src.definition as PipelineDefinition)
    : [];
  const contractGate = promotionGate(true, issues, allowBreakingContract);
  if ('code' in contractGate) return contractGate;

  const mx = await client.query(`SELECT MAX(version) v FROM pipelines WHERE pipeline_key=$1`, [src.pipeline_key]);
  const version = (mx.rows[0]?.v ?? 0) + 1;
  const def = structuredClone(src.definition) as PipelineDefinition; def.version = version;
  await client.query(`UPDATE pipelines SET status='archived'
    WHERE pipeline_key=$1 AND environment='prod' AND status='active'`, [src.pipeline_key]);
  const ins = await client.query(
    `INSERT INTO pipelines (pipeline_key, version, tenant_id, name, definition, status, environment, promoted_from_version)
     VALUES ($1,$2,$3,$4,$5,'active','prod',$6) RETURNING id`,
    [src.pipeline_key, version, src.tenant_id, src.name, JSON.stringify(def), src.version]);
  return {
    def, rowId: ins.rows[0].id as string, fromVersion: src.version as number, version,
    contractOverride: issues.length > 0, contractIssues: issues,
  };
}

pipelines.post('/', async (req, res) => {
  const def = req.body as PipelineDefinition;
  if (def.id && !uuidValidate(def.id)) return res.status(400).json({ error: 'pipeline id must be a UUID' });
  const pipelineKey = def.id || uuid();
  def.id = pipelineKey; def.tenantId = req.tenant.tenantId;

  try { validatePipeline(def); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  const enabled = await paidFeatures(req.tenant.tenantId);
  if (pipelineUsesRealtime(def) && !enabled.realtime)
    return res.status(402).json({ error: 'realtime is not enabled for this workspace', feature: 'realtime' });
  if (pipelineUsesStatefulProcessing(def) && !enabled.statefulProcessing)
    return res.status(402).json({ error: 'statefulProcessing is not enabled for this workspace', feature: 'statefulProcessing' });
  if (pipelineUsesAdvancedConnectors(def) && !enabled.advancedConnectors)
    return res.status(402).json({ error: 'advancedConnectors is not enabled for this workspace', feature: 'advancedConnectors' });
  if (def.notifications?.connectionId) {
    const valid = await withTenantTx(req, async client => {
      const { rowCount } = await client.query(
        `SELECT 1 FROM connector_instances WHERE id=$1 AND kind='credential' AND provider='http'`,
        [def.notifications!.connectionId]);
      return !!rowCount;
    });
    if (!valid) return res.status(400).json({ error: 'notification connector must be a tenant-owned HTTP credential' });
  }

  const rowId = await withTenantTx(req, async client => {
    const { rows: prev } = await client.query(
      `SELECT MAX(version) v FROM pipelines WHERE pipeline_key=$1`, [pipelineKey]);
    const version = (prev[0]?.v ?? 0) + 1;
    def.version = version;

    const { rows } = await client.query(
      `INSERT INTO pipelines (pipeline_key, version, tenant_id, name, definition, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING id`,
      [pipelineKey, version, req.tenant.tenantId, def.name, JSON.stringify(def), req.tenant.userId]);
    return { rowId: rows[0].id, version };
  });

  auditLog(req, 'pipeline.saved', rowId.rowId, { name: def.name, version: rowId.version });
  res.json({ rowId: rowId.rowId, pipelineKey, version: rowId.version });
});

pipelines.post('/:rowId/activate', requirePipelineAccess('editor'), requirePipelineFeatures, async (req, res) => {
  const out = await withTenantTx(req, async client => {
    const { rows } = await client.query(`SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]);
    if (!rows.length) return null;
    const def = rows[0].definition as PipelineDefinition;
    const env = (rows[0].environment ?? 'test') as Environment;
    // Only one active version per (pipeline_key, environment).
    await client.query(`UPDATE pipelines SET status='archived'
      WHERE pipeline_key=$1 AND environment=$2 AND status='active'`, [rows[0].pipeline_key, env]);
    await client.query(`UPDATE pipelines SET status='active' WHERE id=$1`, [req.params.rowId]);
    return { def, env };
  });
  if (!out) return res.status(404).json({ error: 'not found' });
  await syncSchedule(out.def, req.params.rowId, out.env);
  auditLog(req, 'pipeline.activated', req.params.rowId, { trigger: out.def.trigger?.type, environment: out.env });
  res.json({ ok: true, trigger: out.def.trigger, environment: out.env });
});

pipelines.post('/:rowId/run', requirePipelineAccess('editor'), requirePipelineFeatures, requireQuota, async (req, res) => {
  const row = await withTenantTx(req, async client => {
    const { rows } = await client.query(`SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]);
    return rows[0] as { definition: PipelineDefinition; environment?: string } | undefined;
  });
  if (!row) return res.status(404).json({ error: 'not found' });
  const env = (row.environment ?? 'test') as Environment;
  // fireExecution atomically checks and consumes quota. The middleware above
  // remains an early user-facing rejection for manual runs.
  const encryptedDek = typeof req.body?.encryptedDek === 'string' ? req.body.encryptedDek : undefined;
  const executionId = await fireExecution(
    row.definition, req.params.rowId, 'manual', env, undefined, encryptedDek,
  );
  executionsStarted.inc({ trigger: 'manual' });
  auditLog(req, 'execution.started', executionId, { trigger: 'manual', environment: env });
  res.json({ executionId, environment: env });
});

pipelines.post('/:rowId/backfills/plan', requirePipelineAccess('viewer'), async (req, res) => {
  try {
    const row = await withTenantTx(req, client => client.query(
      `SELECT definition FROM pipelines WHERE id=$1`, [req.params.rowId]));
    if (!row.rows[0]) return res.status(404).json({ error: 'not found' });
    validateBackfillSources(row.rows[0].definition);
    res.json(planBackfill(req.body));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

pipelines.post('/:rowId/backfills', requirePipelineAccess('admin'), async (req, res) => {
  try {
    const plan = planBackfill(req.body);
    const job = await withTenantTx(req, async client => {
      const { rows } = await client.query(
        `SELECT definition,environment FROM pipelines WHERE id=$1`, [req.params.rowId]);
      if (!rows[0]) return null;
      validateBackfillSources(rows[0].definition);
      const inserted = await client.query(
        `INSERT INTO backfill_jobs
           (tenant_id,pipeline_id,environment,range_start,range_end,partition_days,max_concurrency,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status`,
        [req.tenant.tenantId, req.params.rowId, rows[0].environment ?? 'test', plan.from, plan.to,
          plan.partitionDays, plan.maxConcurrency, req.tenant.userId],
      );
      for (let i = 0; i < plan.partitions.length; i++) {
        await client.query(
          `INSERT INTO backfill_partitions (job_id,tenant_id,ordinal,range_start,range_end)
           VALUES ($1,$2,$3,$4,$5)`,
          [inserted.rows[0].id, req.tenant.tenantId, i, plan.partitions[i].from, plan.partitions[i].to],
        );
      }
      return inserted.rows[0];
    });
    if (!job) return res.status(404).json({ error: 'not found' });
    auditLog(req, 'backfill.started', job.id, { pipelineId: req.params.rowId, partitionCount: plan.partitionCount });
    res.status(202).json({ jobId: job.id, status: job.status, partitionCount: plan.partitionCount });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

pipelines.get('/:rowId/backfills', requirePipelineAccess('viewer'), async (req, res) => {
  const result = await withTenantTx(req, client => client.query(
    `SELECT bj.id,bj.status,bj.range_start,bj.range_end,bj.partition_days,bj.max_concurrency,
            bj.created_at,bj.completed_at,
            count(bp.*)::int AS partition_count,
            count(*) FILTER (WHERE bp.status='pending')::int AS pending,
            count(*) FILTER (WHERE bp.status IN ('starting','running'))::int AS running,
            count(*) FILTER (WHERE bp.status='completed')::int AS completed,
            count(*) FILTER (WHERE bp.status='failed')::int AS failed
       FROM backfill_jobs bj JOIN backfill_partitions bp ON bp.job_id=bj.id
      WHERE bj.pipeline_id=$1 GROUP BY bj.id ORDER BY bj.created_at DESC LIMIT 50`,
    [req.params.rowId],
  ));
  res.json({ jobs: result.rows.map((row: any) => ({
    id: row.id, status: row.status, from: row.range_start, to: row.range_end,
    partitionDays: row.partition_days, maxConcurrency: row.max_concurrency,
    partitionCount: row.partition_count, pending: row.pending, running: row.running,
    completed: row.completed, failed: row.failed,
    createdAt: row.created_at, completedAt: row.completed_at,
  })) });
});

// Cancel a running backfill job (admin). Sets job + all pending/starting partitions to cancelled.
pipelines.delete('/:rowId/backfills/:jobId', requirePipelineAccess('admin'), async (req, res) => {
  const updated = await withTenantTx(req, async client => {
    const { rowCount } = await client.query(
      `UPDATE backfill_jobs SET status='cancelled',completed_at=now()
        WHERE id=$1 AND pipeline_id=$2 AND status IN ('queued','running') RETURNING id`,
      [req.params.jobId, req.params.rowId],
    );
    if (!rowCount) return 0;
    await client.query(
      `UPDATE backfill_partitions SET status='cancelled',completed_at=now()
        WHERE job_id=$1 AND status IN ('pending','starting')`,
      [req.params.jobId],
    );
    return rowCount;
  });
  if (!updated) return res.status(404).json({ error: 'not found or already terminal' });
  auditLog(req, 'backfill.cancelled', req.params.jobId, { pipelineId: req.params.rowId });
  res.json({ ok: true });
});

// Retry failed partitions in a backfill job (admin). Re-queues failed partitions; sets job back to running.
pipelines.post('/:rowId/backfills/:jobId/retry', requirePipelineAccess('admin'), async (req, res) => {
  const retried = await withTenantTx(req, async client => {
    const { rows: job } = await client.query(
      `SELECT id,status FROM backfill_jobs WHERE id=$1 AND pipeline_id=$2`,
      [req.params.jobId, req.params.rowId],
    );
    if (!job.length) return null;
    if (!['failed', 'running'].includes(job[0].status))
      return { error: `job is ${job[0].status}, only failed/running jobs can be retried` };
    const { rowCount } = await client.query(
      `UPDATE backfill_partitions SET status='pending',error=NULL,started_at=NULL,completed_at=NULL
        WHERE job_id=$1 AND status='failed' RETURNING id`,
      [req.params.jobId],
    );
    if (rowCount) {
      await client.query(
        `UPDATE backfill_jobs SET status='running',completed_at=NULL WHERE id=$1`,
        [req.params.jobId],
      );
    }
    return { retried: rowCount ?? 0 };
  });
  if (!retried) return res.status(404).json({ error: 'not found' });
  if ('error' in retried) return res.status(400).json({ error: retried.error });
  auditLog(req, 'backfill.retried', req.params.jobId, { pipelineId: req.params.rowId, retried: retried.retried });
  res.json({ ok: true, retried: retried.retried });
});

// Promote a tested version to production: copy its definition into a new
// active prod version, record where it came from, and register the prod
// schedule. Owner-gated.
pipelines.post('/:rowId/promote', requirePipelineAccess('admin'), requirePipelineFeatures, async (req, res) => {
  const out = await withTenantTx(req, async client => {
    const { rows } = await client.query(`SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]);
    if (!rows.length) return { code: 404, error: 'not found' } as const;
    return createProductionVersion(client, rows[0], req.body?.allowBreakingContract === true);
  });
  if ('code' in out) return res.status(out.code as number).json({ error: out.error, contractIssues: 'contractIssues' in out ? out.contractIssues : undefined });
  await syncSchedule(out.def, out.rowId, 'prod');
  auditLog(req, 'pipeline.promoted', out.rowId, {
    fromVersion: out.fromVersion, version: out.version,
    contractOverride: out.contractOverride, contractIssues: out.contractIssues,
  });
  res.json({ ok: true, rowId: out.rowId, environment: 'prod', version: out.version, contractOverride: out.contractOverride });
});

// ── A1: lifecycle stage (derived from status+environment, no new column) ──
export type Stage = 'draft' | 'testing' | 'production';
export function deriveStage(status: string, environment: string): Stage {
  if (status === 'active' && environment === 'prod') return 'production';
  if (status === 'active' && environment === 'test') return 'testing';
  return 'draft';
}
// Pure transition planner (exported for the self-check). The promotion gate lives
// here: testing→production is refused unless the version has a green test run.
export function planTransition(from: Stage, to: Stage, hasGreenTestRun: boolean):
  { action: 'activate-test' | 'promote-prod' } | { code: number; error: string } {
  if (from === 'draft' && to === 'testing') return { action: 'activate-test' };
  if (from === 'testing' && to === 'production') {
    return hasGreenTestRun
      ? { action: 'promote-prod' }
      : { code: 409, error: 'promotion gate: this version has no successful test run yet. Run it in test and let it complete, then promote.' };
  }
  // production→testing is NOT an auto-rollback — that was destructive and surprising.
  // Rolling back prod is a deliberate, separate action (add when needed).
  return { code: 409, error: `unsupported stage transition ${from} → ${to}` };
}

pipelines.post('/:rowId/stage', requirePipelineAccess('admin'), requirePipelineFeatures, async (req, res) => {
  const to = req.body?.to as Stage;
  if (!['testing', 'production'].includes(to))
    return res.status(400).json({ error: 'body.to must be "testing" or "production"' });

  const out = await withTenantTx(req, async client => {
    const { rows } = await client.query(`SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]);
    if (!rows.length) return { code: 404, error: 'not found' } as const;
    const src = rows[0];
    const from = deriveStage(src.status, src.environment ?? 'test');

    let hasGreenTestRun = false;
    if (from === 'testing' && to === 'production') {
      const { rows: g } = await client.query(
        `SELECT 1 FROM executions WHERE pipeline_id=$1 AND environment='test' AND phase='completed' LIMIT 1`,
        [req.params.rowId]);
      hasGreenTestRun = g.length > 0;
    }

    const plan = planTransition(from, to, hasGreenTestRun);
    if ('code' in plan) return plan;
    const def = src.definition as PipelineDefinition;

    if (plan.action === 'activate-test') {
      await client.query(`UPDATE pipelines SET status='archived'
        WHERE pipeline_key=$1 AND environment='test' AND status='active'`, [src.pipeline_key]);
      await client.query(`UPDATE pipelines SET status='active' WHERE id=$1`, [req.params.rowId]);
      return { def, rowId: req.params.rowId, env: 'test' as Environment, stage: 'testing' as Stage };
    }
    if (plan.action === 'promote-prod') {
      const promoted = await createProductionVersion(client, src, req.body?.allowBreakingContract === true);
      return 'code' in promoted ? promoted : {
        ...promoted, env: 'prod' as Environment, stage: 'production' as Stage,
      };
    }
    return { code: 409, error: `unsupported stage transition to ${to}` } as const;
  });

  if ('code' in out) return res.status(out.code as number).json({ error: out.error, contractIssues: 'contractIssues' in out ? out.contractIssues : undefined });
  const success = out as { def: PipelineDefinition; rowId: string; env: Environment; stage: Stage; version?: number; contractOverride?: boolean; contractIssues?: ContractCompatibilityIssue[] };
  await syncSchedule(success.def, success.rowId, success.env);
  auditLog(req, 'pipeline.stage', success.rowId, {
    to: success.stage, environment: success.env,
    contractOverride: success.contractOverride ?? false,
    contractIssues: success.contractIssues ?? [],
  });
  res.json({ ok: true, stage: success.stage, environment: success.env, rowId: success.rowId,
    version: success.version, contractOverride: success.contractOverride ?? false });
});

pipelines.get('/', async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT p.id, p.pipeline_key, p.version, p.name, p.status, p.environment,
            p.promoted_from_version, p.created_at, p.definition,
            lr.phase AS last_run_phase, lr.started_at AS last_run_at, lr.id AS last_run_id
       FROM pipelines p
       LEFT JOIN LATERAL (
         SELECT phase, started_at, id FROM executions
         WHERE pipeline_id = p.id ORDER BY started_at DESC LIMIT 1
       ) lr ON true
       ORDER BY p.created_at DESC`));
  res.json(rows.rows);
});

// Authenticated OpenLineage HTTP transport endpoint. Configure external tools
// with endpoint /api/pipelines/lineage/openlineage?environment=prod.
pipelines.post('/lineage/openlineage', async (req, res) => {
  const environment = typeof req.query.environment === 'string' ? req.query.environment : 'prod';
  if (!['test', 'prod'].includes(environment)) return res.status(400).json({ error: 'environment must be test or prod' });
  let event;
  try { event = await ingestOpenLineageEvent(req.tenant.tenantId, environment, req.body); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
  auditLog(req, 'openlineage.event_ingested', `${event.job.namespace}/${event.job.name}`, {
    runId: event.run.runId, eventType: event.eventType, environment,
  });
  res.status(201).json({ ok: true });
});

pipelines.post('/lineage/openlineage-key', requireOwner, async (req, res) => {
  const token = randomBytes(32).toString('base64url');
  await withTenantTx(req, client => client.query(
    `INSERT INTO openlineage_ingest_keys (tenant_id,key_hash,created_by,created_at,revoked_at)
     VALUES ($1,$2,$3,now(),NULL)
     ON CONFLICT (tenant_id) DO UPDATE SET key_hash=EXCLUDED.key_hash,created_by=EXCLUDED.created_by,
       created_at=now(),revoked_at=NULL`,
    [req.tenant.tenantId, hashOpenLineageKey(token), req.tenant.userId],
  ));
  auditLog(req, 'openlineage.key_rotated');
  res.status(201).json({ token });
});

pipelines.delete('/lineage/openlineage-key', requireOwner, async (req, res) => {
  await withTenantTx(req, client => client.query(
    `UPDATE openlineage_ingest_keys SET revoked_at=now() WHERE tenant_id=$1`, [req.tenant.tenantId]));
  auditLog(req, 'openlineage.key_revoked');
  res.json({ ok: true });
});

pipelines.get('/lineage/changes', async (req, res) => {
  const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined;
  if (environment && !['test', 'prod'].includes(environment)) {
    return res.status(400).json({ error: 'environment must be test or prod' });
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const rows = await withTenantTx(req, client => client.query(
    `SELECT id,pipeline_key,version,name,status,environment,definition,created_at
       FROM pipelines
      WHERE ($1::text IS NULL OR environment=$1)
      ORDER BY pipeline_key,environment,version`,
    [environment ?? null],
  ));
  res.json({ items: buildLineageChangeHistory(rows.rows, limit) });
});

// Current workspace architecture: one representative version per pipeline and
// environment, joined through stable asset URNs inferred from connector config.
pipelines.get('/lineage/workspace', async (req, res) => {
  const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined;
  if (environment && !['test', 'prod'].includes(environment)) {
    return res.status(400).json({ error: 'environment must be test or prod' });
  }
  const data = await withTenantTx(req, async client => {
    const rows = await client.query(`WITH ranked AS (
       SELECT id, pipeline_key, version, name, status, environment, definition,
              row_number() OVER (
                PARTITION BY pipeline_key, environment
                ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, version DESC
              ) AS rank
         FROM pipelines
        WHERE ($1::text IS NULL OR environment=$1)
     )
     SELECT id, pipeline_key, version, name, status, environment, definition
       FROM ranked WHERE rank=1 ORDER BY environment, name`,
      [environment ?? null]);
    const materializations = await client.query(
      `SELECT DISTINCT ON (m.asset_urn)
              m.asset_urn,m.execution_id,m.pipeline_id,m.node_id,m.record_count,m.materialized_at,p.environment
         FROM asset_materializations m JOIN pipelines p ON p.id=m.pipeline_id
        WHERE ($1::text IS NULL OR p.environment=$1)
        ORDER BY m.asset_urn,m.materialized_at DESC`,
      [environment ?? null],
    );
    const quality = await client.query(
      `SELECT DISTINCT ON (q.pipeline_id,q.node_id)
              q.execution_id,q.pipeline_id,q.node_id,q.status,q.passed_count,q.failed_count,
              q.quarantine_ref,q.evaluated_at,p.definition
         FROM data_quality_results q JOIN pipelines p ON p.id=q.pipeline_id
        WHERE ($1::text IS NULL OR p.environment=$1)
        ORDER BY q.pipeline_id,q.node_id,q.evaluated_at DESC`,
      [environment ?? null],
    );
    const external = await client.query(
      `SELECT DISTINCT ON (job_namespace,job_name)
              job_namespace,job_name,environment,event_time,inputs,outputs
         FROM external_lineage_events
        WHERE event_type='COMPLETE' AND ($1::text IS NULL OR environment=$1)
        ORDER BY job_namespace,job_name,event_time DESC`,
      [environment ?? null],
    );
    return { rows: rows.rows, materializations: materializations.rows, quality: quality.rows, external: external.rows };
  });
  const versions = data.rows.map((row: any) => ({
    rowId: row.id, pipelineKey: row.pipeline_key, name: row.name,
    version: row.version, status: row.status, environment: row.environment,
    metadata: row.definition?.metadata, slo: row.definition?.slo,
    definition: row.definition as PipelineDefinition,
  }));
  const graph = buildWorkspaceLineage(versions);
  const observed = attachLatestMaterializations(graph, data.materializations.map((row: any) => ({
    assetUrn: row.asset_urn, executionId: row.execution_id, pipelineRowId: row.pipeline_id,
    nodeId: row.node_id, environment: row.environment,
    recordCount: row.record_count == null ? undefined : Number(row.record_count),
    materializedAt: new Date(row.materialized_at).toISOString(),
  })));
  const quality = data.quality.flatMap((row: any) => downstreamOutputBindings(
    row.definition as PipelineDefinition, row.node_id,
  ).map(binding => ({
    assetUrn: binding.asset.urn, executionId: row.execution_id, pipelineRowId: row.pipeline_id,
    nodeId: row.node_id, status: row.status,
    passedCount: Number(row.passed_count), failedCount: Number(row.failed_count),
    evaluatedAt: new Date(row.evaluated_at).toISOString(), quarantineAvailable: !!row.quarantine_ref,
  })));
  const enriched = attachLatestQuality(observed, quality);
  res.json(mergeExternalLineage(enriched, data.external.map((row: any) => ({
    namespace: row.job_namespace, name: row.job_name, environment: row.environment,
    eventTime: new Date(row.event_time).toISOString(), inputs: row.inputs ?? [], outputs: row.outputs ?? [],
  }))));
});

pipelines.get('/:rowId', requirePipelineAccess('viewer'), async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]));
  rows.rows.length ? res.json(rows.rows[0]) : res.status(404).json({ error: 'not found' });
});

// ── Pipeline access management ────────────────────────────────────────────────

pipelines.get('/:rowId/access', requirePipelineAccess('viewer'), async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT pa.user_id, pa.role, pa.created_at, u.email
     FROM pipeline_access pa JOIN users u ON u.id = pa.user_id
     WHERE pa.pipeline_id = $1 ORDER BY pa.created_at`,
    [req.params.rowId],
  ));
  res.json({ grants: rows.rows });
});

pipelines.post('/:rowId/access', requirePipelineAccess('admin'), async (req, res) => {
  const { userId, role } = req.body ?? {};
  if (!userId || !['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'userId and role (viewer|editor|admin) required' });
  }
  try {
    await withTenantTx(req, async c => {
      // Verify grantee belongs to the same tenant — prevents cross-tenant access escalation.
      const { rowCount } = await c.query(
        `SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2`,
        [userId, req.tenant.tenantId],
      );
      if (!rowCount) throw Object.assign(new Error('user not found in tenant'), { status: 404 });
      await c.query(
        `INSERT INTO pipeline_access (pipeline_id, user_id, role, granted_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (pipeline_id, user_id) DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by`,
        [req.params.rowId, userId, role, req.tenant.userId],
      );
    });
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.message });
  }
  auditLog(req, 'pipeline.access_granted', req.params.rowId, { userId, role });
  res.status(201).json({ ok: true });
});

pipelines.delete('/:rowId/access/:userId', requirePipelineAccess('admin'), async (req, res) => {
  await withTenantTx(req, c => c.query(
    `DELETE FROM pipeline_access WHERE pipeline_id=$1 AND user_id=$2`,
    [req.params.rowId, req.params.userId],
  ));
  auditLog(req, 'pipeline.access_revoked', req.params.rowId, { userId: req.params.userId });
  res.json({ ok: true });
});
