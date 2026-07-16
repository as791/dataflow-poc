-- Runtime lineage identity + timing.
--
-- trace_id: first-class W3C trace id (32 lowercase hex). Populated from the
-- inbound `traceparent` header when a caller supplies one, otherwise generated
-- at execution start. Never derived from the Temporal run_id.
--
-- node_runs.started_at: exact step start (finished_at/duration alone cannot
-- reconstruct a waterfall). attempt counts failure→retry transitions on the
-- same (execution_id,node_id) row.
-- ponytail: attempt is a counter, not full per-attempt history; add a
-- node_run_attempts table if per-attempt rows are ever needed.

ALTER TABLE executions ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE node_runs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 1;

-- Runtime windows are always tenant + time bounded; exact-id search hits
-- trace_id. (id and run_id lookups use the PK / idx_executions_temporal_identity.)
CREATE INDEX IF NOT EXISTS idx_executions_tenant_started
  ON executions (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_trace
  ON executions (trace_id) WHERE trace_id IS NOT NULL;
