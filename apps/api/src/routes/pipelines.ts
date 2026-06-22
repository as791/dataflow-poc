import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { withTenantTx } from '../db';
import { syncSchedule, fireExecution } from '../temporal';
import { executionsStarted } from '../metrics';
import { auditLog } from '../middleware/audit';
import { requireQuota } from '../middleware/quota';
import { validatePipeline } from '../lib/validatePipeline';
import type { PipelineDefinition } from '@dataflow/shared';

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
    await client.query(`UPDATE pipelines SET status='archived'
      WHERE pipeline_key=$1 AND status='active'`, [rows[0].pipeline_key]);
    await client.query(`UPDATE pipelines SET status='active' WHERE id=$1`, [req.params.rowId]);
    return def;
  });
  if (!out) return res.status(404).json({ error: 'not found' });
  await syncSchedule(out, req.params.rowId);
  auditLog(req, 'pipeline.activated', req.params.rowId, { trigger: out.trigger?.type });
  res.json({ ok: true, trigger: out.trigger });
});

pipelines.post('/:rowId/run', requireQuota, async (req, res) => {
  const def = await withTenantTx(req, async client => {
    const { rows } = await client.query(`SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]);
    return rows[0]?.definition as PipelineDefinition | undefined;
  });
  if (!def) return res.status(404).json({ error: 'not found' });
  // fireExecution() centrally calls incrementUsage() so cron + manual + webhook
  // + event triggers all meter consistently. Quota gate above checks BEFORE.
  const executionId = await fireExecution(def, req.params.rowId, 'manual');
  executionsStarted.inc({ trigger: 'manual' });
  auditLog(req, 'execution.started', executionId, { trigger: 'manual' });
  res.json({ executionId });
});

pipelines.get('/', async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT id, pipeline_key, version, name, status, created_at FROM pipelines ORDER BY created_at DESC`));
  res.json(rows.rows);
});

pipelines.get('/:rowId', async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT * FROM pipelines WHERE id=$1`, [req.params.rowId]));
  rows.rows.length ? res.json(rows.rows[0]) : res.status(404).json({ error: 'not found' });
});
