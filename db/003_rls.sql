-- Phase 1 RLS. The API and worker connect as `dataflow_app` and run
-- every tenant-scoped query inside a transaction that sets
--   SET LOCAL app.tenant_id = '<uuid>'
-- so the policies below filter rows automatically. The `dataflow` user
-- (used by the postgres init scripts) stays superuser and bypasses RLS.

CREATE ROLE dataflow_app LOGIN PASSWORD 'dataflow_app';
GRANT USAGE ON SCHEMA public TO dataflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dataflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dataflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dataflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dataflow_app;

-- audit_log is append-only for the app role.
REVOKE UPDATE, DELETE ON audit_log FROM dataflow_app;

-- Tables that carry tenant_id get RLS. The `tenants` and `users` tables
-- are accessed during login (before app.tenant_id is set) so they stay
-- open — the auth route only reads them by email/id which is safe.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pipelines','executions','connector_state','node_payloads','node_runs',
    'user_invitations','audit_log'
  ]
  LOOP
    -- NB: no FORCE — the `dataflow` superuser (worker + migrations) bypasses
    -- RLS; only `dataflow_app` (API) is subject to it.
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END $$;
