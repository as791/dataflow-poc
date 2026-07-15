-- Retention runs from the API's RLS-constrained dataflow_app connection. Keep
-- the privilege boundary to one function owned by the migration role rather
-- than granting the application a general RLS bypass or direct audit deletes.
CREATE OR REPLACE FUNCTION public.purge_aged_data(
  p_audit_retention_days     INTEGER,
  p_execution_retention_days INTEGER,
  p_node_run_retention_days  INTEGER,
  p_payload_retention_days   INTEGER,
  p_outbox_retention_days    INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_audit_retention_days IS NULL OR p_audit_retention_days <= 0
     OR p_execution_retention_days IS NULL OR p_execution_retention_days <= 0
     OR p_node_run_retention_days IS NULL OR p_node_run_retention_days <= 0
     OR p_payload_retention_days IS NULL OR p_payload_retention_days <= 0
     OR p_outbox_retention_days IS NULL OR p_outbox_retention_days <= 0 THEN
    RAISE EXCEPTION 'retention days must be positive integers'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.audit_log
   WHERE created_at < CURRENT_TIMESTAMP - make_interval(days => p_audit_retention_days);

  DELETE FROM public.executions
   WHERE completed_at IS NOT NULL
     AND completed_at < CURRENT_TIMESTAMP - make_interval(days => p_execution_retention_days);

  DELETE FROM public.node_runs
   WHERE finished_at < CURRENT_TIMESTAMP - make_interval(days => p_node_run_retention_days);

  -- node_payloads stores only the PostgreSQL DataRef payload. S3 payloads are
  -- expired separately by the bucket lifecycle policy.
  DELETE FROM public.node_payloads
   WHERE created_at < CURRENT_TIMESTAMP - make_interval(days => p_payload_retention_days);

  DELETE FROM public.openlineage_outbox
   WHERE sent_at IS NOT NULL
     AND sent_at < CURRENT_TIMESTAMP - make_interval(days => p_outbox_retention_days);

  DELETE FROM public.pipeline_event_outbox
   WHERE published_at IS NOT NULL
     AND published_at < CURRENT_TIMESTAMP - make_interval(days => p_outbox_retention_days);

  DELETE FROM public.pipeline_alert_notification_outbox
   WHERE sent_at IS NOT NULL
     AND sent_at < CURRENT_TIMESTAMP - make_interval(days => p_outbox_retention_days);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_aged_data(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_aged_data(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO dataflow_app;
