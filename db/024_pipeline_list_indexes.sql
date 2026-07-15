-- Speed up GET /api/pipelines: RLS-filtered scan of pipelines ordered by created_at,
-- plus per-row LATERAL join into executions for last-run status.
CREATE INDEX IF NOT EXISTS idx_pipelines_tenant_created_id ON pipelines (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_executions_pipeline_started ON executions (pipeline_id, started_at DESC);
