CREATE TABLE IF NOT EXISTS asset_materializations (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  execution_id    TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_id         TEXT NOT NULL,
  asset_urn       TEXT NOT NULL,
  asset           JSONB NOT NULL,
  record_count    BIGINT,
  materialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (execution_id, node_id, asset_urn)
);

CREATE INDEX IF NOT EXISTS idx_asset_materializations_latest
  ON asset_materializations (tenant_id, asset_urn, materialized_at DESC);

ALTER TABLE asset_materializations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='asset_materializations' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON asset_materializations
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON asset_materializations TO dataflow_app;
GRANT USAGE, SELECT ON SEQUENCE asset_materializations_id_seq TO dataflow_app;
