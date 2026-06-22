import type { Request } from 'express';
import { withTenant } from '../db';

// Writes one row to audit_log. The dataflow_app role lacks UPDATE/DELETE
// on this table (see 003_rls.sql) so the log is effectively append-only.
export async function auditLog(
  req: Request,
  action: string,
  resource?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const tenant = req.tenant;
  if (!tenant) return;
  const ip = (req.ip ?? req.socket.remoteAddress ?? null) || null;
  const ua = req.get('user-agent') ?? null;
  try {
    await withTenant(tenant.tenantId, client =>
      client.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, resource, metadata, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenant.tenantId, tenant.userId, action, resource ?? null,
         metadata ? JSON.stringify(metadata) : null, ip, ua],
      ),
    );
  } catch (e) {
    // Audit failure must never break the request. Log to stdout instead.
    console.error('audit_log insert failed', { action, error: (e as Error).message });
  }
}

// Convenience for routes that don't have an authenticated tenant yet
// (login, accept-invite) — caller passes the resolved tenant/user explicitly.
export async function auditAs(
  tenantId: string,
  userId: string | null,
  action: string,
  ip: string | null,
  ua: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await withTenant(tenantId, client =>
      client.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, metadata, ip_address, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, userId, action, metadata ? JSON.stringify(metadata) : null, ip, ua],
      ),
    );
  } catch (e) {
    console.error('audit_log insert failed', { action, error: (e as Error).message });
  }
}
