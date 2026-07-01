import { Router } from 'express';
import crypto from 'crypto';
import { withTenantTx, withTenant } from '../db';
import { requireAuth, requireVerified } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { chClient } from '../lib/clickhouse';
import { buildQuery, inferSchema, QuerySpec, SchemaColumn } from '../lib/queryBuilder';

export const analytics = Router();

// ─── Auth guard (applied to all routes except /shared/:token) ────────────────
// We define the guard inline per-route rather than as a global middleware on
// this router so that GET /api/analytics/shared/:token remains public.

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse every `record` column as JSON, returning only valid objects. */
function parseRecordRows(rawRows: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of rawRows) {
    const r = row as Record<string, unknown>;
    const raw = r['record'];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          out.push(parsed as Record<string, unknown>);
        }
      } catch {
        // skip malformed rows
      }
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      out.push(raw as Record<string, unknown>);
    }
  }
  return out;
}

// ─── GET /api/analytics/datasets ─────────────────────────────────────────────
analytics.get(
  '/datasets',
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      const result = await chClient().query({
        query: `
          SELECT collection, count() AS row_count
          FROM sink_records
          WHERE tenant_id = {tenant_id:UUID}
          GROUP BY collection
          ORDER BY collection
        `,
        query_params: { tenant_id: req.tenant.tenantId },
        format: 'JSONEachRow',
      });
      const rows = await result.json<{ collection: string; row_count: string }>();
      res.json(rows.map((r) => ({ collection: r.collection, row_count: Number(r.row_count) })));
    } catch (e) {
      console.error('analytics/datasets error', (e as Error).message);
      res.status(502).json({ error: 'clickhouse error' });
    }
  },
);

// ─── GET /api/analytics/datasets/:name/schema ────────────────────────────────
analytics.get(
  '/datasets/:name/schema',
  requireAuth,
  requireVerified,
  async (req, res) => {
    const collection = req.params.name;
    try {
      const result = await chClient().query({
        query: `
          SELECT record
          FROM sink_records
          WHERE tenant_id = {tenant_id:UUID}
            AND collection = {collection:String}
          LIMIT 100
        `,
        query_params: { tenant_id: req.tenant.tenantId, collection },
        format: 'JSONEachRow',
      });
      const rows = await result.json<Record<string, unknown>>();
      const parsed = parseRecordRows(rows);
      const schema: SchemaColumn[] = inferSchema(parsed);
      res.json({ collection, schema });
    } catch (e) {
      console.error('analytics/schema error', (e as Error).message);
      res.status(502).json({ error: 'clickhouse error' });
    }
  },
);

// ─── POST /api/analytics/query ───────────────────────────────────────────────
analytics.post(
  '/query',
  requireAuth,
  requireVerified,
  async (req, res) => {
    const spec: QuerySpec = req.body;

    if (!spec?.dataset || typeof spec.dataset !== 'string') {
      return res.status(400).json({ error: 'dataset is required' });
    }

    // First, get the schema for this dataset so we can validate field names.
    let schema: SchemaColumn[];
    try {
      const schemaResult = await chClient().query({
        query: `
          SELECT record
          FROM sink_records
          WHERE tenant_id = {tenant_id:UUID}
            AND collection = {collection:String}
          LIMIT 100
        `,
        query_params: { tenant_id: req.tenant.tenantId, collection: spec.dataset },
        format: 'JSONEachRow',
      });
      const schemaRows = await schemaResult.json<Record<string, unknown>>();
      schema = inferSchema(parseRecordRows(schemaRows));
    } catch (e) {
      console.error('analytics/query schema fetch error', (e as Error).message);
      return res.status(502).json({ error: 'clickhouse error fetching schema' });
    }

    // Build the parameterised query.
    let sql: string;
    let params: Record<string, unknown>;
    try {
      ({ sql, params } = buildQuery(req.tenant.tenantId, schema, spec));
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    // Execute.
    try {
      const result = await chClient().query({
        query: sql,
        query_params: params,
        format: 'JSONEachRow',
      });
      const rows = await result.json<Record<string, unknown>>();
      res.json({ rows, count: rows.length });
    } catch (e) {
      console.error('analytics/query execution error', (e as Error).message);
      res.status(502).json({ error: 'clickhouse query failed' });
    }
  },
);

// ─── GET /api/analytics/dashboards ───────────────────────────────────────────
analytics.get(
  '/dashboards',
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      const rows = await withTenantTx(req, (client) =>
        client.query(
          `SELECT id, name, definition, created_by, created_at, updated_at
             FROM dashboards
             ORDER BY updated_at DESC`,
        ),
      );
      res.json(rows.rows);
    } catch (e) {
      console.error('analytics/dashboards list error', (e as Error).message);
      res.status(500).json({ error: 'database error' });
    }
  },
);

// ─── POST /api/analytics/dashboards ──────────────────────────────────────────
analytics.post(
  '/dashboards',
  requireAuth,
  requireVerified,
  async (req, res) => {
    const { name, definition } = req.body ?? {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!definition || typeof definition !== 'object') {
      return res.status(400).json({ error: 'definition object is required' });
    }

    try {
      const row = await withTenantTx(req, (client) =>
        client.query(
          `INSERT INTO dashboards (tenant_id, name, definition, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, definition, created_by, created_at, updated_at`,
          [req.tenant.tenantId, name.trim(), JSON.stringify(definition), req.tenant.userId],
        ),
      );
      auditLog(req, 'dashboard.created', row.rows[0].id, { name });
      res.status(201).json(row.rows[0]);
    } catch (e) {
      console.error('analytics/dashboards create error', (e as Error).message);
      res.status(500).json({ error: 'database error' });
    }
  },
);

// ─── GET /api/analytics/dashboards/:id ───────────────────────────────────────
analytics.get(
  '/dashboards/:id',
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      const rows = await withTenantTx(req, (client) =>
        client.query(
          `SELECT id, name, definition, created_by, created_at, updated_at
             FROM dashboards
             WHERE id = $1`,
          [req.params.id],
        ),
      );
      if (!rows.rows.length) return res.status(404).json({ error: 'not found' });
      res.json(rows.rows[0]);
    } catch (e) {
      console.error('analytics/dashboards get error', (e as Error).message);
      res.status(500).json({ error: 'database error' });
    }
  },
);

// ─── PUT /api/analytics/dashboards/:id ───────────────────────────────────────
analytics.put(
  '/dashboards/:id',
  requireAuth,
  requireVerified,
  async (req, res) => {
    const { name, definition } = req.body ?? {};
    if (!name && !definition) {
      return res.status(400).json({ error: 'name or definition is required' });
    }

    try {
      const rows = await withTenantTx(req, (client) =>
        client.query(
          `UPDATE dashboards
              SET name       = COALESCE($2, name),
                  definition = COALESCE($3, definition),
                  updated_at = now()
            WHERE id = $1
            RETURNING id, name, definition, created_by, created_at, updated_at`,
          [
            req.params.id,
            name ? name.trim() : null,
            definition ? JSON.stringify(definition) : null,
          ],
        ),
      );
      if (!rows.rows.length) return res.status(404).json({ error: 'not found' });
      auditLog(req, 'dashboard.updated', req.params.id, { name });
      res.json(rows.rows[0]);
    } catch (e) {
      console.error('analytics/dashboards update error', (e as Error).message);
      res.status(500).json({ error: 'database error' });
    }
  },
);

// ─── DELETE /api/analytics/dashboards/:id ────────────────────────────────────
analytics.delete(
  '/dashboards/:id',
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      const rows = await withTenantTx(req, (client) =>
        client.query(
          `DELETE FROM dashboards WHERE id = $1 RETURNING id`,
          [req.params.id],
        ),
      );
      if (!rows.rows.length) return res.status(404).json({ error: 'not found' });
      auditLog(req, 'dashboard.deleted', req.params.id, {});
      res.json({ ok: true });
    } catch (e) {
      console.error('analytics/dashboards delete error', (e as Error).message);
      res.status(500).json({ error: 'database error' });
    }
  },
);

// ─── POST /api/analytics/dashboards/:id/share ────────────────────────────────
analytics.post(
  '/dashboards/:id/share',
  requireAuth,
  requireVerified,
  async (req, res) => {
    // 1. Verify the dashboard belongs to this tenant.
    const dashboardId = req.params.id;

    try {
      const check = await withTenantTx(req, (client) =>
        client.query(`SELECT id FROM dashboards WHERE id = $1`, [dashboardId]),
      );
      if (!check.rows.length) return res.status(404).json({ error: 'dashboard not found' });

      // 2. Generate share token — 32 cryptographically random bytes → hex string.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // 3. Persist the hashed token.
      await withTenantTx(req, (client) =>
        client.query(
          `INSERT INTO dashboard_shares
             (share_token_hash, dashboard_id, tenant_id, expires_at, created_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (share_token_hash) DO NOTHING`,
          [tokenHash, dashboardId, req.tenant.tenantId, expiresAt, req.tenant.userId],
        ),
      );

      auditLog(req, 'dashboard.shared', dashboardId, { expiresAt });

      res.json({
        shareToken: rawToken,
        expiresAt: expiresAt.toISOString(),
        shareUrl: `/api/analytics/shared/${rawToken}`,
      });
    } catch (e) {
      console.error('analytics/share error', (e as Error).message);
      res.status(500).json({ error: 'database error' });
    }
  },
);

// ─── GET /api/analytics/shared/:token (PUBLIC — no auth) ─────────────────────
analytics.get('/shared/:token', async (req, res) => {
  const rawToken = req.params.token;

  // Constant-time hash comparison — avoid timing oracle on token lookup.
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  try {
    // Use the pool directly (no tenant context — we look up by token hash).
    const { pool } = await import('../db');
    const shareResult = await pool.query(
      `SELECT ds.dashboard_id, ds.tenant_id, ds.expires_at
         FROM dashboard_shares ds
         WHERE ds.share_token_hash = $1`,
      [tokenHash],
    );

    if (!shareResult.rows.length) {
      return res.status(404).json({ error: 'share not found or expired' });
    }

    const share = shareResult.rows[0];
    if (new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'share has expired' });
    }

    // Load the dashboard inside the owning tenant's context.
    const dashboard = await withTenant(share.tenant_id, (client) =>
      client.query(
        `SELECT id, name, definition, created_at, updated_at
           FROM dashboards
           WHERE id = $1`,
        [share.dashboard_id],
      ),
    );

    if (!dashboard.rows.length) {
      return res.status(404).json({ error: 'dashboard not found' });
    }

    res.json({
      dashboard: dashboard.rows[0],
      expiresAt: share.expires_at,
      readOnly: true,
    });
  } catch (e) {
    console.error('analytics/shared get error', (e as Error).message);
    res.status(500).json({ error: 'server error' });
  }
});
