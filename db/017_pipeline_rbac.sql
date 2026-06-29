-- Pipeline-scoped RBAC + service account API tokens
-- Adds: created_by on pipelines, pipeline_access grants table, api_tokens table

-- ── Pipeline creator tracking ─────────────────────────────────────────────────
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Backfill: assign existing pipelines to first owner in the tenant.
-- Pipelines in tenants with no users remain NULL (orphaned); they are still
-- accessible to workspace owners via the role bypass in requirePipelineAccess.
UPDATE pipelines p SET created_by = (
  SELECT u.id FROM users u
  WHERE u.tenant_id = p.tenant_id AND u.role = 'owner'
  ORDER BY u.created_at LIMIT 1
) WHERE p.created_by IS NULL;

-- ── Pipeline-level access grants ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_access (
  pipeline_id UUID        NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  -- viewer: read runs/logs  editor: save/activate/run  admin: promote/backfill/delete/share
  role        TEXT        NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  granted_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline_id, user_id)
);

-- ── Service account API tokens ────────────────────────────────────────────────
-- Tokens are random 32-byte base64url strings; only the SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS api_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  token_hash  TEXT        NOT NULL UNIQUE,
  role        TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_by  UUID        NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_tokens_hash_idx ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS api_tokens_tenant_idx ON api_tokens(tenant_id);
