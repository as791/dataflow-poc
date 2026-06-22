-- ── 007_kms.sql ─────────────────────────────────────────────────────────────
-- Key material columns were added to users in 001_init.sql / 002_auth.sql.
-- This migration adds the supporting tables and payload-encryption columns.

CREATE TABLE user_key_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID NOT NULL REFERENCES users(id),
  to_user_id      UUID NOT NULL REFERENCES users(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  encrypted_dek   TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, to_user_id)
);
ALTER TABLE user_key_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_key_shares
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE key_rotation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  rotated_at  TIMESTAMPTZ DEFAULT now(),
  reason      TEXT
);

-- Payload encryption flags (node_payloads already exists from 001_init.sql)
ALTER TABLE node_payloads
  ADD COLUMN IF NOT EXISTS encrypted    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_iv TEXT;
