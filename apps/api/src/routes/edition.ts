import { Router } from 'express';
import { withTenantTx } from '../db';
import { requireOwner } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { edition, isPaidFeatureKey, paidFeatureAvailability, paidFeatures, pipelineUsesAdvancedConnectors, pipelineUsesRealtime, pipelineUsesStatefulProcessing, requirePaidFeature } from '../lib/edition';

export const editionRouter = Router();

// What edition is this deployment, and which gated features are available?
// The web app uses this to show/hide enterprise UI.
editionRouter.get('/', async (req, res) => {
  res.json({
    edition: edition(),
    features: await paidFeatures(req.tenant.tenantId),
    availability: paidFeatureAvailability,
  });
});

editionRouter.put('/features/:feature', requireOwner, async (req, res) => {
  const feature = req.params.feature;
  const enabled = req.body?.enabled;
  if (!isPaidFeatureKey(feature) || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'valid feature and boolean enabled are required' });
  }
  if (enabled && !paidFeatureAvailability[feature]) {
    return res.status(409).json({ error: `${feature} is not installed in this deployment` });
  }
  if (feature === 'realtime' && !enabled) {
    const blockers = await withTenantTx(req, async client => {
      const cdc = await client.query(
        `SELECT 1 FROM connector_instances WHERE extra->'cdc'->>'enabled'='true' LIMIT 1`);
      const active = await client.query(`SELECT definition FROM pipelines WHERE status='active'`);
      return { cdc: !!cdc.rowCount, pipeline: active.rows.some(row => pipelineUsesRealtime(row.definition)) };
    });
    if (blockers.cdc || blockers.pipeline) {
      return res.status(409).json({ error: 'disable active CDC connectors and realtime pipelines first' });
    }
  }
  if (feature === 'statefulProcessing' && !enabled) {
    const active = await withTenantTx(req, client => client.query(`SELECT definition FROM pipelines WHERE status='active'`));
    if (active.rows.some(row => pipelineUsesStatefulProcessing(row.definition))) {
      return res.status(409).json({ error: 'deactivate pipelines using cross-run dedupe first' });
    }
  }
  if (feature === 'advancedConnectors' && !enabled) {
    const active = await withTenantTx(req, client => client.query(`SELECT definition FROM pipelines WHERE status='active'`));
    if (active.rows.some(row => pipelineUsesAdvancedConnectors(row.definition))) {
      return res.status(409).json({ error: 'deactivate pipelines using advanced connectors first' });
    }
  }
  await withTenantTx(req, client => client.query(
    `INSERT INTO tenant_feature_entitlements (tenant_id,feature,enabled)
     VALUES ($1,$2,$3) ON CONFLICT (tenant_id,feature)
     DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=now()`,
    [req.tenant.tenantId, feature, enabled],
  ));
  await auditLog(req, 'feature.updated', feature, { enabled });
  res.json({ features: await paidFeatures(req.tenant.tenantId) });
});

// Enterprise: export the tenant's audit log as CSV. Owner-gated.
editionRouter.get('/audit-export', requireOwner, requirePaidFeature('governance'), async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT created_at, action, resource, user_id, ip_address, metadata
       FROM audit_log ORDER BY created_at DESC LIMIT 10000`));
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['created_at', 'action', 'resource', 'user_id', 'ip_address', 'metadata'];
  const lines = [header.join(',')];
  for (const r of rows.rows) {
    lines.push(header.map(h => esc((r as any)[h])).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(lines.join('\n'));
});
