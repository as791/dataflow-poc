CREATE TABLE IF NOT EXISTS external_lineage_events (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  environment   TEXT NOT NULL CHECK (environment IN ('test','prod')),
  run_id        TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('START','RUNNING','COMPLETE','ABORT','FAIL','OTHER')),
  event_time    TIMESTAMPTZ NOT NULL,
  job_namespace TEXT NOT NULL,
  job_name      TEXT NOT NULL,
  inputs        JSONB NOT NULL DEFAULT '[]',
  outputs       JSONB NOT NULL DEFAULT '[]',
  producer      TEXT NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,job_namespace,job_name,run_id,event_type)
);
CREATE INDEX IF NOT EXISTS idx_external_lineage_latest
  ON external_lineage_events (tenant_id,environment,job_namespace,job_name,event_time DESC);

CREATE TABLE IF NOT EXISTS openlineage_outbox (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  execution_id    TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN ('START','COMPLETE','ABORT','FAIL')),
  payload         JSONB NOT NULL,
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (execution_id,event_type)
);
CREATE INDEX IF NOT EXISTS idx_openlineage_outbox_pending
  ON openlineage_outbox (next_attempt_at) WHERE sent_at IS NULL AND attempts < 10;

CREATE TABLE IF NOT EXISTS openlineage_ingest_keys (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

ALTER TABLE external_lineage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE openlineage_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE openlineage_ingest_keys ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['external_lineage_events','openlineage_outbox','openlineage_ingest_keys'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='tenant_isolation'
    ) THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON external_lineage_events,openlineage_outbox,openlineage_ingest_keys TO dataflow_app;
GRANT USAGE, SELECT ON SEQUENCE external_lineage_events_id_seq,openlineage_outbox_id_seq TO dataflow_app;

CREATE OR REPLACE FUNCTION resolve_openlineage_tenant(p_key_hash TEXT)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT tenant_id FROM openlineage_ingest_keys
   WHERE key_hash=p_key_hash AND revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION resolve_openlineage_tenant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_openlineage_tenant(TEXT) TO dataflow_app;
