-- ── 006_dashboards.sql ──────────────────────────────────────────────────────
-- Dashboard definitions stored as JSONB; shareable via signed tokens.

CREATE TABLE dashboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  definition  JSONB NOT NULL DEFAULT '{}',
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_dashboards_tenant ON dashboards(tenant_id);
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dashboards
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Public share tokens (stored as hash; never store raw token)
CREATE TABLE dashboard_shares (
  share_token_hash  TEXT PRIMARY KEY,
  dashboard_id      UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  expires_at        TIMESTAMPTZ NOT NULL,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);
