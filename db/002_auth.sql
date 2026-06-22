-- Phase 1 auth tables.

CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                    TEXT NOT NULL UNIQUE,
  password_hash            TEXT,
  google_sub               TEXT UNIQUE,
  role                     TEXT NOT NULL DEFAULT 'member',
  email_verified           BOOLEAN NOT NULL DEFAULT false,
  -- Phase 6 key material columns — null in Phase 1.
  pbkdf2_salt              TEXT,
  encrypted_dek_password   TEXT,
  password_dek_iv          TEXT,
  encrypted_dek_recovery   TEXT,
  recovery_dek_iv          TEXT,
  recovery_phrase_used_at  TIMESTAMPTZ,
  public_key               TEXT,
  encrypted_private_key    TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  revoked_at  TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE email_verifications (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_invitations (
  token_hash  TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES users(id),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_invitations_tenant ON user_invitations(tenant_id);

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  resource    TEXT,
  metadata    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);

-- Pipelines reference tenants now that the table exists.
ALTER TABLE pipelines       ADD CONSTRAINT pipelines_tenant_fk       FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE executions      ADD CONSTRAINT executions_tenant_fk      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE connector_state ADD CONSTRAINT connector_state_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE node_payloads   ADD CONSTRAINT node_payloads_tenant_fk   FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE node_runs       ADD CONSTRAINT node_runs_tenant_fk       FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
