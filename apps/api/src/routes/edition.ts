import { Router } from 'express';
import { withTenantTx } from '../db';
import { requireOwner } from '../middleware/auth';
import { edition, features, requireEnterprise } from '../lib/edition';

export const editionRouter = Router();

// What edition is this deployment, and which gated features are available?
// The web app uses this to show/hide enterprise UI.
editionRouter.get('/', (_req, res) => {
  res.json({ edition: edition(), features: features() });
});

// Enterprise: export the tenant's audit log as CSV. Owner-gated.
editionRouter.get('/audit-export', requireEnterprise('auditExport'), requireOwner, async (req, res) => {
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
