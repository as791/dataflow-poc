CREATE TABLE IF NOT EXISTS backfill_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  environment     TEXT NOT NULL CHECK (environment IN ('test','prod')),
  range_start     TIMESTAMPTZ NOT NULL,
  range_end       TIMESTAMPTZ NOT NULL,
  partition_days  INT NOT NULL CHECK (partition_days BETWEEN 1 AND 31),
  max_concurrency INT NOT NULL CHECK (max_concurrency BETWEEN 1 AND 5),
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  CHECK (range_start < range_end)
);

CREATE TABLE IF NOT EXISTS backfill_partitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES backfill_jobs(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ordinal      INT NOT NULL,
  range_start  TIMESTAMPTZ NOT NULL,
  range_end    TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','starting','running','completed','failed','cancelled')),
  execution_id TEXT UNIQUE,
  error        TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (job_id,ordinal),
  CHECK (range_start < range_end)
);

ALTER TABLE executions ADD COLUMN IF NOT EXISTS backfill_partition_id UUID
  REFERENCES backfill_partitions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_backfill_partition
  ON executions(backfill_partition_id) WHERE backfill_partition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_pipeline ON backfill_jobs(tenant_id,pipeline_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backfill_partitions_dispatch ON backfill_partitions(status,job_id,ordinal);

ALTER TABLE backfill_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backfill_partitions ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['backfill_jobs','backfill_partitions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='tenant_isolation') THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON backfill_jobs,backfill_partitions TO dataflow_app;

-- The API dispatcher has no request tenant. This function claims one safe slot
-- across all tenants while normal reads/writes remain protected by RLS.
CREATE OR REPLACE FUNCTION claim_next_backfill_partition()
RETURNS TABLE (
  partition_id UUID, tenant_id UUID, pipeline_id UUID, environment TEXT,
  range_start TIMESTAMPTZ, range_end TIMESTAMPTZ, definition JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE backfill_partitions SET status='pending', started_at=NULL
   WHERE status='starting' AND started_at < now() - interval '5 minutes';

  RETURN QUERY
  WITH candidate AS (
    SELECT bp.id
      FROM backfill_partitions bp
      JOIN backfill_jobs bj ON bj.id=bp.job_id
     WHERE bp.status='pending' AND bj.status IN ('queued','running')
       AND (SELECT count(*) FROM backfill_partitions active
             WHERE active.job_id=bj.id AND active.status IN ('starting','running')) < bj.max_concurrency
     ORDER BY bj.created_at,bp.ordinal
     FOR UPDATE OF bp,bj SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE backfill_partitions bp SET status='starting',started_at=now()
      FROM candidate c WHERE bp.id=c.id
      RETURNING bp.*
  ), started_job AS (
    UPDATE backfill_jobs bj SET status='running'
      FROM claimed c WHERE bj.id=c.job_id AND bj.status='queued' RETURNING bj.id
  )
  SELECT c.id,c.tenant_id,bj.pipeline_id,bj.environment,c.range_start,c.range_end,p.definition
    FROM claimed c JOIN backfill_jobs bj ON bj.id=c.job_id JOIN pipelines p ON p.id=bj.pipeline_id;
END $$;
REVOKE ALL ON FUNCTION claim_next_backfill_partition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_next_backfill_partition() TO dataflow_app;
