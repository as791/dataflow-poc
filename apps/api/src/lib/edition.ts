import type { RequestHandler } from 'express';
import { DEFAULT_PAID_FEATURES, PAID_FEATURE_KEYS, type PaidFeatureKey, type PaidFeatures, type PipelineDefinition } from '@dataflow/shared';
import { withTenant } from '../db';

// ─── Open-core edition seam ────────────────────────────────────────────────
// DataFlow is open core: the whole pipeline product — authoring (incl. the AI
// builder), connectors, environments, execution — is free in the community
// edition. A small set of operational/governance features unlock in the
// enterprise edition. Set EDITION=enterprise to enable them.

export type Edition = 'community' | 'enterprise';

export function edition(): Edition {
  return process.env.EDITION === 'enterprise' ? 'enterprise' : 'community';
}
export function isEnterprise(): boolean {
  return edition() === 'enterprise';
}

export const paidFeatureAvailability: PaidFeatures = {
  advancedConnectors: true,
  realtime: true,
  statefulProcessing: true,
  deepObservability: true,
  governance: true,
};

export function isPaidFeatureKey(value: string): value is PaidFeatureKey {
  return (PAID_FEATURE_KEYS as readonly string[]).includes(value);
}

export function effectivePaidFeatures(rows: Array<{ feature: string; enabled: boolean }>): PaidFeatures {
  const out = { ...DEFAULT_PAID_FEATURES, governance: isEnterprise() };
  for (const row of rows) {
    if (isPaidFeatureKey(row.feature) && paidFeatureAvailability[row.feature]) out[row.feature] = row.enabled;
  }
  return out;
}

export async function paidFeatures(tenantId: string): Promise<PaidFeatures> {
  const rows = await withTenant(tenantId, async client => (await client.query(
    `SELECT feature,enabled FROM tenant_feature_entitlements WHERE tenant_id=$1`, [tenantId])).rows);
  return effectivePaidFeatures(rows);
}

export async function hasPaidFeature(tenantId: string, feature: PaidFeatureKey): Promise<boolean> {
  return (await paidFeatures(tenantId))[feature];
}

export function pipelineUsesRealtime(def: PipelineDefinition): boolean {
  return def.nodes.some(node => node.activityType === 'kafka.fetch' || node.activityType === 'sink.kafka'
    || node.config?.syncMode === 'cdc' || node.config?.writeMode === 'apply-cdc');
}

export function pipelineUsesStatefulProcessing(def: PipelineDefinition): boolean {
  return def.nodes.some(node => node.activityType === 'transform.dedupe' && node.config?.scope === 'pipeline');
}

export function pipelineUsesAdvancedConnectors(def: PipelineDefinition): boolean {
  return def.nodes.some(node => ['sftp.fetch', 'sink.sftp', 'snowflake.fetch', 'sink.snowflake', 'iceberg.fetch'].includes(node.activityType));
}

export function requirePaidFeature(feature: PaidFeatureKey): RequestHandler {
  return async (req, res, next) => {
    try {
      if ((await paidFeatures(req.tenant.tenantId))[feature]) return next();
      res.status(402).json({ error: `${feature} is not enabled for this workspace`, feature });
    } catch (error) { next(error); }
  };
}
