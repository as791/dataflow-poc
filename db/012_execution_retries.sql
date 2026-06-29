ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS retry_of TEXT REFERENCES executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_executions_retry_of ON executions (retry_of);

CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_one_active_retry
  ON executions (retry_of)
  WHERE retry_of IS NOT NULL AND phase='running';
