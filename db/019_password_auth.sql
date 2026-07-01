-- Add password_hash for email/password auth (nullable — Google/OIDC users never populate it)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
