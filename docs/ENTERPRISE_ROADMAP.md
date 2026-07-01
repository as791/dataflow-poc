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
- PostgreSQL, MySQL, MongoDB, Kafka/Redpanda, S3, SFTP, Snowflake, Iceberg, ClickHouse, Google, Zendesk, REST, and webhook connectors.
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

1. Upgrade Temporal Server `1.28.1` → `1.31.1`, including required core and visibility schema upgrades;
   align Temporal UI and CLI/admin tooling, then run workflow replay and cross-SDK codec tests.
2. Replace deprecated Build-ID compatibility calls with GA Worker Deployment and Worker Deployment
   Version APIs. Remove `updateBuildIdCompatibility` before Server `1.32`, where the old APIs disappear.
3. Pin all TypeScript Temporal packages to `1.18.1`; keep Go SDK `1.45.0`. All TypeScript Temporal
   packages in the monorepo must use the same exact version.
4. Make object storage mandatory in production and add retention/orphan cleanup controls.
5. Add backup/restore drills, retention controls, HA deployment manifests, and upgrade tests.
6. Add pipeline-scoped RBAC and API/service accounts; owner/member is insufficient.
7. Add centralized process-log ingestion and retention policy; durable node activity search and redaction are shipped.

Temporal upgrade acceptance:

- Existing histories replay without nondeterminism under Go SDK `1.45.0`.
- Go Workflow and TypeScript Activity payload encryption remains cross-SDK compatible.
- Test and production Worker Deployment versions can ramp and roll back independently.
- Graceful shutdown drains already-polled tasks; no duplicate sink writes appear during rollout.
- Existing cron schedules, signals, queries, retries, and backfills pass integration tests.

### P1 — fair multi-tenant execution

1. Enable [Task Queue Priority and Fairness](https://docs.temporal.io/develop/task-queue-priority-fairness)
   after the Server upgrade. Set `fairnessKey=tenantId`; start with equal weight `1.0`.
2. Use priority `2` for interactive/test runs, `3` for scheduled production runs, and `4` for backfills.
   Keep priority out of the UI until a customer needs an override.
3. Add one load test proving a large tenant cannot starve a small tenant and backfills still progress
   under sustained scheduled load. If strict priority starves backfills, use a separate backfill Task Queue.
4. Use GA Worker Controller only if Kubernetes becomes the production worker platform; do not add it to
   the current Docker deployment.

### P2 — trusted data products

1. Add backfill byte/row estimates, failed-partition retry, cancellation, and sink idempotency checks.

### P3 — connector ecosystem

1. Make connector SDK package the single catalog source for API, worker, and web.
2. Add connector conformance tests: auth, pagination, rate limits, retries, CDC replay, schema drift.
3. Ship Snowflake, BigQuery, Databricks/Delta, SFTP, and Azure/GCS connectors based on demand; Kafka/Redpanda is shipped.
4. Add signed third-party connector packages and isolated execution before accepting marketplace code.

### P4 — enterprise governance

1. SAML/OIDC SSO, SCIM, domain/project roles, approval policies.
2. Persisted workspace lineage snapshots, saved impact queries, policy tags, and PII classification; immutable version change history is shipped.
3. Git-backed pipeline definitions, CI validation, environment promotion approvals, rollback UI.
4. Usage/cost attribution by tenant, pipeline, connector, and asset.

## Temporal feature intake

| Capability | Maturity (July 2026) | Decision |
| --- | --- | --- |
| Task Queue Priority and Fairness | GA | Adopt after Server 1.31 upgrade; internal policy only. |
| Worker Deployment Version APIs | GA | P0 migration; replaces deprecated Build-ID APIs. |
| Worker Controller | GA | Conditional on Kubernetes adoption. |
| Serverless Workers | Pre-release; AWS Lambda only | Defer. Revisit for short stateless/spillover tasks, not connectors or backfills. |
| Standalone Activities | Public preview | Defer; direct connector test calls are smaller and sufficient. |
| Workflow Streams | Experimental SDK package | Defer until a durable in-workflow stream use case exists. |
| External Payload Storage | Public preview | Evaluate only as a full replacement for encrypted `DataRef`, never a second path. |
| Principal Attribution | Pre-release | Defer until authenticated actor history is required for compliance. |

References: [Server 1.31](https://github.com/temporalio/temporal/releases/tag/v1.31.0),
[Go SDK 1.45](https://github.com/temporalio/sdk-go/releases/tag/v1.45.0), and
[TypeScript SDK 1.18.1](https://github.com/temporalio/sdk-typescript/releases/tag/v1.18.1).

## Definition of enterprise-ready

Do not claim completion until restore, tenant isolation, connector replay, contract
compatibility, alert delivery, and lineage import/export have automated integration
tests against real services. UI builds and unit tests alone do not prove these gates.
