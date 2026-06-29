CREATE TABLE IF NOT EXISTS pipeline_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id       UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  execution_id      TEXT REFERENCES executions(id) ON DELETE SET NULL,
  fingerprint       TEXT NOT NULL,
  kind              TEXT NOT NULL,
  severity          TEXT NOT NULL CHECK (severity IN ('warning','critical')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  message           TEXT NOT NULL,
  details           JSONB NOT NULL DEFAULT '{}',
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_alerts_active_fingerprint
  ON pipeline_alerts (tenant_id, pipeline_id, fingerprint)
  WHERE status IN ('open','acknowledged');
CREATE INDEX IF NOT EXISTS pipeline_alerts_tenant_status
  ON pipeline_alerts (tenant_id, status, last_seen_at DESC);

ALTER TABLE pipeline_alerts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pipeline_alerts' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON pipeline_alerts
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_alerts TO dataflow_app;

CREATE TABLE IF NOT EXISTS pipeline_event_outbox (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  environment    TEXT NOT NULL CHECK (environment IN ('test','prod')),
  event_id       TEXT NOT NULL,
  topic          TEXT NOT NULL,
  payload        JSONB NOT NULL,
  attempts       INT NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ,
  UNIQUE (tenant_id, event_id, topic)
);
CREATE INDEX IF NOT EXISTS pipeline_event_outbox_pending
  ON pipeline_event_outbox (created_at) WHERE published_at IS NULL;
ALTER TABLE pipeline_event_outbox ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pipeline_event_outbox' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON pipeline_event_outbox
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_event_outbox TO dataflow_app;

CREATE TABLE IF NOT EXISTS pipeline_alert_notification_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id        UUID NOT NULL REFERENCES pipeline_alerts(id) ON DELETE CASCADE,
  connection_id   UUID NOT NULL REFERENCES connector_instances(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL,
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alert_id, connection_id)
);
CREATE INDEX IF NOT EXISTS pipeline_alert_notifications_pending
  ON pipeline_alert_notification_outbox (next_attempt_at)
  WHERE sent_at IS NULL AND attempts < 10;
ALTER TABLE pipeline_alert_notification_outbox ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='pipeline_alert_notification_outbox' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON pipeline_alert_notification_outbox
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_alert_notification_outbox TO dataflow_app;
