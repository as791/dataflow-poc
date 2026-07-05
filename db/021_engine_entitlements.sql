ALTER TABLE tenant_feature_entitlements DROP CONSTRAINT IF EXISTS tenant_feature_entitlements_feature_check;
ALTER TABLE tenant_feature_entitlements ADD CONSTRAINT tenant_feature_entitlements_feature_check
  CHECK (feature IN ('advancedConnectors','realtime','sparkSql','flinkSql','statefulProcessing','deepObservability','governance'));
