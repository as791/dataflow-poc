-- Phase 7 (M3): test / production environments.
--
-- Every pipeline version belongs to an environment. Users iterate in 'test'
-- and PROMOTE a tested version to 'prod' (a new active version copied with
-- promoted_from_version set). Each environment runs on its own Temporal
-- namespace + task queue, so test traffic never touches the prod worker pool.
--
-- Tenant isolation is unchanged: the tenant_isolation RLS policy keys on
-- tenant_id only, so the new column needs no policy change.

ALTER TABLE pipelines ADD COLUMN environment           TEXT NOT NULL DEFAULT 'test';
ALTER TABLE pipelines ADD COLUMN promoted_from_version  INT;

-- One active version per (pipeline_key, environment) — test and prod can each
-- have their own active version simultaneously.
DROP INDEX IF EXISTS one_active_version;
CREATE UNIQUE INDEX one_active_version
  ON pipelines (pipeline_key, environment) WHERE status = 'active';

ALTER TABLE executions ADD COLUMN environment TEXT NOT NULL DEFAULT 'test';
CREATE INDEX idx_executions_env ON executions (environment);
