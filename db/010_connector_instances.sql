-- A3 — unified connector instances. Generalizes the OAuth-only
-- `oauth_connections` (004) into instances of any `kind`: OAuth-backed
-- connections AND non-OAuth credential instances (DB/host/key creds).
-- Pre-production: no data to migrate, so we drop the old table and recreate.
-- Secrets (tokens, passwords, api keys) stay AES-256-GCM encrypted at rest.

DROP TABLE IF EXISTS oauth_connections CASCADE;

CREATE TABLE IF NOT EXISTS connector_instances (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                   TEXT NOT NULL DEFAULT 'oauth',  -- 'oauth' | 'credential'
  provider               TEXT NOT NULL,                  -- google|microsoft|zendesk|postgres|http|...
  provider_account_email TEXT,                           -- display label / name
  scopes                 TEXT[],                         -- oauth only
  access_token           TEXT,                           -- oauth, encrypted
  refresh_token          TEXT,                           -- oauth, encrypted
  expires_at             TIMESTAMPTZ,                    -- oauth only
  secret                 TEXT,                           -- credential blob, encrypted (JSON)
  extra                  JSONB,                          -- non-secret params (host/port/db/baseUrl/subdomain)
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, user_id, provider, provider_account_email)
);

CREATE INDEX IF NOT EXISTS connector_instances_tenant_idx
  ON connector_instances (tenant_id, kind, provider);

ALTER TABLE connector_instances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'connector_instances' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE 'CREATE POLICY tenant_isolation ON connector_instances
             USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON connector_instances TO dataflow_app;
