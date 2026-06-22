-- Phase 1 baseline schema. Runs on a fresh Postgres volume (docker
-- compose volumes mounted at /docker-entrypoint-initdb.d in numerical
-- order). Tenant IDs are UUIDs throughout; the `sink_records` table is
-- gone (Phase 4 moves it to ClickHouse).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Control plane ───────────────────────────────────────────────────────
CREATE TABLE pipelines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_key UUID NOT NULL,
  version      INT  NOT NULL DEFAULT 1,
  tenant_id    UUID NOT NULL,
  name         TEXT NOT NULL,
  definition   JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pipeline_key, version)
);
CREATE UNIQUE INDEX one_active_version
  ON pipelines (pipeline_key) WHERE status = 'active';
CREATE INDEX idx_pipelines_tenant ON pipelines (tenant_id);

CREATE TABLE executions (
  id           TEXT PRIMARY KEY,
  pipeline_id  UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL,
  trigger_type TEXT NOT NULL,
  phase        TEXT NOT NULL DEFAULT 'running',
  started_at   TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  build_id     TEXT
);
CREATE INDEX idx_executions_tenant ON executions (tenant_id);

CREATE TABLE connector_state (
  tenant_id     UUID NOT NULL,
  connection_id TEXT NOT NULL,
  cursor        JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, connection_id)
);

CREATE TABLE node_payloads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  execution_id TEXT NOT NULL,
  node_id      TEXT NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX np_exec ON node_payloads (execution_id);
CREATE INDEX idx_node_payloads_tenant ON node_payloads (tenant_id);

CREATE TABLE node_runs (
  execution_id TEXT NOT NULL,
  node_id      TEXT NOT NULL,
  tenant_id    UUID NOT NULL,
  status       TEXT NOT NULL,
  duration_ms  INT,
  record_count INT,
  error        TEXT,
  finished_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (execution_id, node_id)
);
CREATE INDEX idx_node_runs_tenant ON node_runs (tenant_id);
