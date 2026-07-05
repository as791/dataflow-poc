ALTER TABLE executions ADD COLUMN IF NOT EXISTS cohestra_id TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS desired_state TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS engine_last_error TEXT;
