-- Generic OIDC SSO: store the OIDC subject identifier alongside google_sub.
ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_sub TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_oidc_sub ON users(oidc_sub) WHERE oidc_sub IS NOT NULL;
