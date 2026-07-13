-- storeOpenLineage writes the full event as `payload`, but 015 never created the
-- column, and it omits `producer` (NOT NULL). Add the column and default producer
-- so both current and older deployed binaries can ingest events.
ALTER TABLE external_lineage_events ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}';
ALTER TABLE external_lineage_events ALTER COLUMN producer SET DEFAULT '';
