-- Phase 4 — ClickHouse hot+cold schema. Loaded once at container init.
-- Mounted into ClickHouse only (NOT the Postgres initdb dir). See
-- docker-compose.yml; the file lives under ./db but is bind-mounted to
-- /docker-entrypoint-initdb.d/init.sql on the ClickHouse container.

CREATE DATABASE IF NOT EXISTS dataflow;

-- Single source of truth for every record produced by `sink.records`.
-- ReplacingMergeTree dedups on (tenant_id, collection, dedup_key); newest
-- created_at wins. Partition by tenant+month so tenant deletes touch the
-- minimum number of parts.
-- NOTE: storage_policy 'hot_cold' is NOT set here because ClickHouse runs
-- initdb scripts before config.d files are fully applied. TTL-based volume
-- movement can be added later via:
--   ALTER TABLE dataflow.sink_records MODIFY SETTING storage_policy='hot_cold';
CREATE TABLE IF NOT EXISTS dataflow.sink_records (
  tenant_id     UUID,
  collection    String,
  record        String CODEC(ZSTD(3)),
  dedup_key     String,
  encrypted     UInt8 DEFAULT 0,
  encryption_iv String DEFAULT '',
  created_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
PARTITION BY (tenant_id, toYYYYMM(created_at))
ORDER BY (tenant_id, collection, dedup_key)
TTL created_at + INTERVAL 2 YEAR DELETE;

-- Aggregation source for the analytics UI (Phase 5). Mirrors what
-- recordNodeRun already writes to Postgres node_runs but enriched with
-- the columns analytics needs (pipeline_id, activity_type) and partitioned
-- for fast tenant-scoped time-range scans.
CREATE TABLE IF NOT EXISTS dataflow.execution_metrics (
  tenant_id     UUID,
  execution_id  String,
  pipeline_id   UUID,
  node_id       String,
  activity_type String,
  status        String,
  duration_ms   Int32,
  record_count  Int32,
  finished_at   DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(finished_at))
ORDER BY (tenant_id, finished_at, execution_id)
TTL finished_at + INTERVAL 1 YEAR DELETE;
