CREATE TABLE IF NOT EXISTS data_quality_results (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id      UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  execution_id     TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_id          TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('passed','warning','failed')),
  passed_count     BIGINT NOT NULL DEFAULT 0,
  failed_count     BIGINT NOT NULL DEFAULT 0,
  error_samples    JSONB NOT NULL DEFAULT '[]',
  quarantine_ref   JSONB,
  evaluated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (execution_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_data_quality_pipeline_time
  ON data_quality_results (tenant_id, pipeline_id, evaluated_at DESC);

ALTER TABLE data_quality_results ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='data_quality_results' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON data_quality_results
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON data_quality_results TO dataflow_app;
GRANT USAGE, SELECT ON SEQUENCE data_quality_results_id_seq TO dataflow_app;
