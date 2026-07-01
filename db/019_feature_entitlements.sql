-- Tenant-scoped paid feature switches. Billing can grant the same rows later;
-- for now workspace owners manage them from Settings/Billing.
CREATE TABLE IF NOT EXISTS tenant_feature_entitlements (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature     TEXT NOT NULL CHECK (feature IN ('advancedConnectors', 'realtime', 'statefulProcessing', 'deepObservability', 'governance')),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature)
);

ALTER TABLE tenant_feature_entitlements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='tenant_feature_entitlements' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON tenant_feature_entitlements
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_feature_entitlements TO dataflow_app;
