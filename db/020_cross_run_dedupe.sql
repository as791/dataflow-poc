ALTER TABLE tenant_feature_entitlements DROP CONSTRAINT IF EXISTS tenant_feature_entitlements_feature_check;
ALTER TABLE tenant_feature_entitlements ADD CONSTRAINT tenant_feature_entitlements_feature_check
  CHECK (feature IN ('advancedConnectors', 'realtime', 'statefulProcessing', 'deepObservability', 'governance'));

CREATE TABLE IF NOT EXISTS dedupe_keys (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  node_id     TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, pipeline_id, node_id, key_hash)
);
CREATE INDEX IF NOT EXISTS dedupe_keys_seen_idx ON dedupe_keys (tenant_id, seen_at);
ALTER TABLE dedupe_keys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='dedupe_keys' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON dedupe_keys
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON dedupe_keys TO dataflow_app;
