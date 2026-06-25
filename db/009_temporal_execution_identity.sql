-- Track the Temporal workflow/run identity independently from the public
-- execution id. Scheduled workflows reuse a stable workflow id but receive a
-- unique run id on every firing.

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS run_id TEXT;

UPDATE executions
SET workflow_id = id
WHERE workflow_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_executions_temporal_identity
  ON executions (workflow_id, run_id);
