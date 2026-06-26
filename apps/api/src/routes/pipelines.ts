import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { withTenantTx } from '../db';
import { syncSchedule, fireExecution } from '../temporal';
import { executionsStarted } from '../metrics';
import { auditLog } from '../middleware/audit';
import { requireQuota } from '../middleware/quota';
import { requireOwner } from '../middleware/auth';
import { validatePipeline } from '../lib/validatePipeline';
import type { PipelineDefinition, Environment } from '@dataflow/shared';

export const pipelines = Router();

pipelines.post('/', async (req, res) => {
  const def = req.body as PipelineDefinition;
  const pipelineKey = def.id || uuid();
  def.tenantId = req.tenant.tenantId;

  validatePipeline(def);

  const rowId = await withTenantTx(req, async client => {
    const { rows: prev } = await client.query(
      `SELECT MAX(version) v FROM pipelines WHERE pipeline_key=$1`, [pipelineKey]);
    const version = (prev[0]?.v ?? 0) + 1;
    def.id = pipelineKey; def.version = version;

    const { rows } = await client.query(
      `INSERT INTO pipelines (pipeline_key, version, tenant_id, name, definition, status)
       VALUES ($1,$2,$3,$4,$5,'draft') RETURNING id`,
      [pipelineKey, version, req.tenant.tenantId, def.name, JSON.stringify(def)]);
    return { rowId: rows[0].id, version };
  });

  auditLog(req, 'pipeline.saved', rowId.rowId, { name: def.name, version: rowId.version });
  res.json({ rowId: rowId.rowId, pipelineKey, version: rowId.version });
});

pipelines.post('/:rowId/activate', async (req, res) => {
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

pipelines.post('/:rowId/run', requireQuota, async (req, res) => {
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

// Promote a tested version to production: copy its definition into a new
// active prod version, record where it came from, and register the prod
// schedule. Owner-gated.
pipelines.post('/:rowId/promote', requireOwner, async (req, res) => {
  const out = await withTenantTx(req, async client => {
    const { rows } = await client.query(`SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]);
    if (!rows.length) return null;
    const src = rows[0];
    const def = src.definition as PipelineDefinition;
    const { rows: mx } = await client.query(
      `SELECT MAX(version) v FROM pipelines WHERE pipeline_key=$1`, [src.pipeline_key]);
    const version = (mx[0]?.v ?? 0) + 1;
    def.version = version;
    // Archive the current active prod version, then insert the promoted one.
    await client.query(`UPDATE pipelines SET status='archived'
      WHERE pipeline_key=$1 AND environment='prod' AND status='active'`, [src.pipeline_key]);
    const ins = await client.query(
      `INSERT INTO pipelines (pipeline_key, version, tenant_id, name, definition, status, environment, promoted_from_version)
       VALUES ($1,$2,$3,$4,$5,'active','prod',$6) RETURNING id`,
      [src.pipeline_key, version, src.tenant_id, src.name, JSON.stringify(def), src.version]);
    return { def, rowId: ins.rows[0].id as string, fromVersion: src.version as number, version };
  });
  if (!out) return res.status(404).json({ error: 'not found' });
  await syncSchedule(out.def, out.rowId, 'prod');
  auditLog(req, 'pipeline.promoted', out.rowId, { fromVersion: out.fromVersion, version: out.version });
  res.json({ ok: true, rowId: out.rowId, environment: 'prod', version: out.version });
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
  { action: 'activate-test' | 'promote-prod' | 'rollback-prod' } | { code: number; error: string } {
  if (from === 'draft' && to === 'testing') return { action: 'activate-test' };
  if (from === 'testing' && to === 'production') {
    return hasGreenTestRun
      ? { action: 'promote-prod' }
      : { code: 409, error: 'promotion gate: this version has no successful test run yet. Run it in test and let it complete, then promote.' };
  }
  if (from === 'production' && to === 'testing') return { action: 'rollback-prod' };
  return { code: 409, error: `unsupported stage transition ${from} → ${to}` };
}

pipelines.post('/:rowId/stage', requireOwner, async (req, res) => {
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
      const { rows: mx } = await client.query(
        `SELECT MAX(version) v FROM pipelines WHERE pipeline_key=$1`, [src.pipeline_key]);
      const version = (mx[0]?.v ?? 0) + 1; def.version = version;
      await client.query(`UPDATE pipelines SET status='archived'
        WHERE pipeline_key=$1 AND environment='prod' AND status='active'`, [src.pipeline_key]);
      const ins = await client.query(
        `INSERT INTO pipelines (pipeline_key, version, tenant_id, name, definition, status, environment, promoted_from_version)
         VALUES ($1,$2,$3,$4,$5,'active','prod',$6) RETURNING id`,
        [src.pipeline_key, version, src.tenant_id, src.name, JSON.stringify(def), src.version]);
      return { def, rowId: ins.rows[0].id as string, env: 'prod' as Environment, stage: 'production' as Stage, version };
    }
    // rollback-prod: re-point active prod to the previous archived prod version.
    const { rows: prev } = await client.query(
      `SELECT * FROM pipelines WHERE pipeline_key=$1 AND environment='prod' AND id<>$2
         ORDER BY version DESC LIMIT 1`, [src.pipeline_key, req.params.rowId]);
    if (!prev.length) return { code: 409, error: 'no previous prod version to roll back to' } as const;
    await client.query(`UPDATE pipelines SET status='archived'
      WHERE pipeline_key=$1 AND environment='prod' AND status='active'`, [src.pipeline_key]);
    await client.query(`UPDATE pipelines SET status='active' WHERE id=$1`, [prev[0].id]);
    return { def: prev[0].definition as PipelineDefinition, rowId: prev[0].id as string, env: 'prod' as Environment, stage: 'production' as Stage };
  });

  if ('code' in out) return res.status(out.code as number).json({ error: out.error });
  await syncSchedule(out.def, out.rowId, out.env);
  auditLog(req, 'pipeline.stage', out.rowId, { to: out.stage, environment: out.env });
  res.json({ ok: true, stage: out.stage, environment: out.env, rowId: out.rowId, version: (out as any).version });
});

pipelines.get('/', async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT id, pipeline_key, version, name, status, environment, promoted_from_version, created_at
       FROM pipelines ORDER BY created_at DESC`));
  res.json(rows.rows);
});

pipelines.get('/:rowId', async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]));
  rows.rows.length ? res.json(rows.rows[0]) : res.status(404).json({ error: 'not found' });
});
