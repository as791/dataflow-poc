-- Phase 2 — per-tenant OAuth connections. Tokens are stored encrypted at rest
-- using AES-256-GCM with OAUTH_TOKEN_ENCRYPTION_KEY (32 raw bytes). Phase 6
-- will rotate this to a per-tenant DEK wrapped by KMS.

CREATE TABLE IF NOT EXISTS oauth_connections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL,            -- 'google' | 'microsoft' | 'zendesk'
  provider_account_email TEXT,                     -- display label (or subdomain for Zendesk)
  scopes                 TEXT[] NOT NULL,
  access_token           TEXT NOT NULL,            -- encrypted (iv:tag:ct base64)
  refresh_token          TEXT NOT NULL,            -- encrypted (iv:tag:ct base64)
  expires_at             TIMESTAMPTZ NOT NULL,
  extra                  JSONB,                    -- e.g. { subdomain: 'acme' } for Zendesk
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, user_id, provider, provider_account_email)
);

CREATE INDEX IF NOT EXISTS oauth_connections_tenant_idx
  ON oauth_connections (tenant_id, provider);

ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'oauth_connections' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE 'CREATE POLICY tenant_isolation ON oauth_connections
             USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)';
  END IF;
END $$;

-- Grant the runtime app role access (003_rls.sql granted privileges on tables
-- existing at that point; this table was created later so we re-grant).
GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_connections TO dataflow_app;
