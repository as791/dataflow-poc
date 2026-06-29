# Enterprise data platform roadmap

## Product model

Keep pipelines small and assets global. A pipeline materializes one or a few
versioned assets; stable asset URNs merge pipelines into the workspace graph.
Bronze preserves replayable source truth, silver validates and standardizes,
and gold publishes business-ready models. This matches the multi-hop pattern
recommended by [Microsoft Fabric](https://learn.microsoft.com/en-us/fabric/onelake/onelake-medallion-lakehouse-architecture).

Asset URNs are also orchestration contracts. A successful producer can trigger
consumers, matching [Airflow data-aware scheduling](https://airflow.apache.org/docs/apache-airflow/2.6.3/concepts/datasets.html),
while the global asset graph follows the asset-first model documented by
[Dagster](https://docs.dagster.io/). Export should use the standard run/job/dataset
model from [OpenLineage](https://github.com/OpenLineage/OpenLineage), not a new
proprietary event format.

## Shipped foundation

- Versioned test/production pipelines, promotion gate, cron/webhook/pipeline-event/asset-materialization triggers.
- Cursor and Debezium CDC ingestion; idempotent CDC-aware database sinks.
- PostgreSQL, MySQL, MongoDB, Kafka/Redpanda, S3, ClickHouse, Google, Zendesk, REST, and webhook connectors.
- Durable multi-pipeline events, retries, run history, per-node diagnostics.
- Workspace asset/column lineage, impact analysis, bronze/silver/gold lanes.
- Ownership, contracts, SLO health, durable incidents, webhook escalation.
- Live health overlay on the merged lineage graph.
- Optional client-side encrypted S3-compatible storage for large DataRefs.
- Tenant-scoped output-asset materialization history linked to producing runs.
- Production compatibility gate for versioned output contracts with audited owner override.
- Contract quality history with encrypted quarantine payloads and asset/run drill-down.
- OpenLineage RunEvent import/export with external jobs merged into workspace lineage.
- Date-partitioned database backfills with dry-run plans, isolated cursors, and bounded concurrency.
- Workspace execution activity search with API-boundary and write-time secret redaction.
- Immutable pipeline-version lineage history with breaking/warning/info architecture diffs.

## Next priorities

### P0 — safe production operation

1. Make object storage mandatory in production and add retention/orphan cleanup controls.
2. Add backup/restore drills, retention controls, HA deployment manifests, and upgrade tests.
3. Add pipeline-scoped RBAC and API/service accounts; owner/member is insufficient.
4. Add centralized process-log ingestion and retention policy; durable node activity search and redaction are shipped.

### P1 — trusted data products

1. Add backfill byte/row estimates, failed-partition retry, cancellation, and sink idempotency checks.

### P2 — connector ecosystem

1. Make connector SDK package the single catalog source for API, worker, and web.
2. Add connector conformance tests: auth, pagination, rate limits, retries, CDC replay, schema drift.
3. Ship Snowflake, BigQuery, Databricks/Delta, SFTP, and Azure/GCS connectors based on demand; Kafka/Redpanda is shipped.
4. Add signed third-party connector packages and isolated execution before accepting marketplace code.

### P3 — enterprise governance

1. SAML/OIDC SSO, SCIM, domain/project roles, approval policies.
2. Persisted workspace lineage snapshots, saved impact queries, policy tags, and PII classification; immutable version change history is shipped.
3. Git-backed pipeline definitions, CI validation, environment promotion approvals, rollback UI.
4. Usage/cost attribution by tenant, pipeline, connector, and asset.

## Definition of enterprise-ready

Do not claim completion until restore, tenant isolation, connector replay, contract
compatibility, alert delivery, and lineage import/export have automated integration
tests against real services. UI builds and unit tests alone do not prove these gates.
