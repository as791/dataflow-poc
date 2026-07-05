# DataFlow MVP Execution Plan

Status: **Proposed**  
Last updated: **2026-07-05**

This plan covers the next product slices: playground AI, UI quality, Iceberg
output, analytics verification, direct CDC streaming, and paid Spark/Flink SQL
engines. It complements [ADR-001](./ADR-001-TEMPORAL-RUNTIME.md),
[ADR-002](./ADR-002-GO-BACKEND.md), and the
[enterprise roadmap](./ENTERPRISE_ROADMAP.md). The older
[implementation plan](./PLAN.md) remains historical.

## 1. Product and execution model

DataFlow exposes one pipeline product with four execution engines:

| Engine | Workload | Entitlement |
| --- | --- | --- |
| `workflow` | APIs, files, cursor ingestion, small/medium batch | Core |
| `stream-direct` | Simple Kafka/CDC replication | `realtime` |
| `spark-sql` | Large batch and incremental lake processing | `sparkSql` |
| `flink-sql` | Stateful/event-time streaming | `realtime` + `flinkSql` |

Pipeline definitions gain an optional execution block. Missing configuration
continues to mean the existing workflow engine.

```json
{ "execution": { "engine": "workflow" } }
```

```json
{
  "execution": {
    "engine": "spark-sql",
    "transformSql": "SELECT ... FROM source"
  }
}
```

```json
{ "execution": { "engine": "stream-direct" } }
```

```json
{
  "execution": {
    "engine": "flink-sql",
    "transformSql": "SELECT ... FROM source"
  }
}
```

Engine selection rules:

- API, file, spreadsheet, and database cursor sources use `workflow`.
- Kafka/CDC passthrough and record-level mapping use `stream-direct`.
- Large bounded joins, aggregation, and backfills use `spark-sql`.
- Windows, watermarks, stream joins, and large keyed state use `flink-sql`.

Temporal is the control plane. Workers, Spark, and Flink process records.

## 2. Main MVP: AI inside the playground

### UI

- Remove AI Builder from desktop and mobile navigation.
- Redirect `/ai-builder` to the playground with the AI drawer open.
- Delete the standalone AI Builder page after redirect coverage exists.
- Replace the top AI command bar with a Cursor-style right drawer.
- Open the drawer from the Sparkles toolbar or empty-canvas CTA.
- Show current-session messages, generation state, Mermaid preview, engine
  recommendation, proposed graph/config changes, Apply, Discard, Retry, and
  Undo.
- Never save, activate, deploy, promote, or run automatically.

### Context and API

Each request includes the current Mermaid topology, full definition, trigger,
execution engine, node/edge configs, ingestion settings, metadata, SLOs,
connector catalog, recent chat turns, and user requirement. Mermaid remains
topology-only; JSON remains canonical for configuration.

Reuse `POST /api/ai/generate` and `POST /api/ai/refine`. Extend refine with
optional Mermaid and messages:

```json
{
  "prompt": "Add ClickHouse and choose the correct engine",
  "definition": {},
  "mermaid": "flowchart TD...",
  "messages": []
}
```

Keep the response minimal:

```json
{
  "definition": {},
  "mermaid": "flowchart TD...",
  "warnings": []
}
```

The browser computes the before/after diff. The server validates catalog types,
DAG shape, configs, engine compatibility, SQL, entitlements, and secret
references. Existing configs survive unless the user explicitly changes them.

## 3. UI quality

### Theme and calendar

- Keep `ThemeContext` and Tailwind `dark:` utilities.
- Fix white-only analytics, modal, picker, preview, tooltip, disabled, and empty
  states.
- Add CSS variables only where Recharts needs runtime colors.
- Keep native `datetime-local`; fix its `color-scheme`, text, icon, border, and
  focus states and show the active timezone.
- Verify light, dark, and system modes.

### Filters and Runs

- Add visible filter labels to Runs, Lineage, Monitoring, and Pipelines.
- Lay out Runs like Grafana: status/environment left; pipeline/time/search/
  refresh right.
- Support 15m, 1h, 6h, 24h, 7d, and Custom ranges.
- Put From/To controls in one custom-range popover.
- Persist filter state in URL parameters.
- Use one stable desktop row and one controlled mobile second row.

## 4. Iceberg destination

Add `sink.iceberg` under `advancedConnectors`:

```json
{
  "connectionId": "iceberg-connection",
  "namespace": "analytics",
  "table": "orders"
}
```

MVP behavior:

- Append to an existing REST-catalog table.
- Convert records to Arrow using the table schema.
- Reject incompatible or unknown fields; permit missing nullable fields.
- Write Parquet files and commit one snapshot.
- Add execution, node, and pipeline-version metadata to the snapshot.
- Detect an existing execution/node commit before retrying.
- Return snapshot ID and record count and emit an Iceberg lineage asset.

Table creation, schema/partition evolution, upsert, CDC, and delete files are
deferred. Test against an Iceberg REST catalog and MinIO.

## 5. Analytics proof

Before adding distributed engines:

1. Run a deterministic pipeline into `sink.records`.
2. Verify ClickHouse records and dataset/schema APIs.
3. Build bar, line, pie, and table widgets.
4. Save, reload, update, and delete a dashboard.
5. Verify tenant isolation and both themes.

Use deduplicated ClickHouse reads, add a dashboard time range, pass it into
widget queries, isolate widget errors, and preserve layout/query definitions.
This becomes the common acceptance layer for every engine.

## 6. Direct real-time slice

Initial inputs:

- PostgreSQL CDC through Debezium.
- MySQL CDC through Debezium.
- MongoDB CDC through Debezium.
- External Kafka/Redpanda.

Initial sinks only:

- PostgreSQL `apply-cdc`.
- MySQL `apply-cdc`.
- MongoDB `apply-cdc`.
- ClickHouse append.

Add one streaming consumer worker controlled by Temporal. The worker loads Kafka
offsets, consumes a bounded page, applies map/filter/rename/parse/contract
operations, writes the sink batch, and commits offsets only after sink success.
It reports heartbeat, lag, throughput, and errors and supports pause, resume,
and cancel. Temporal controls lifecycle and uses `ContinueAsNew`; records never
enter workflow history.

Use Flink instead when the pipeline needs windows, joins, aggregation, event
time, or large state.

## 7. Spark SQL paid slice

Start with one narrow path:

```text
S3 or Iceberg -> Spark SQL -> Iceberg or ClickHouse
```

The user or AI supplies a `SELECT`; DataFlow generates source/sink configuration
from connector references. Reject arbitrary JARs, PySpark, embedded credentials,
unsafe paths, and arbitrary runtime configuration.

Temporal `SparkJobWorkflow` submits and monitors a `SparkApplication`, captures
status/errors, cancels on command, verifies the output commit, and continues the
downstream DAG. Spark Kubernetes Operator owns Spark resources.

DataFlow stores only the SparkApplication ID, Temporal workflow ID, input
boundary, output snapshot/commit, status, and last error. Incremental Iceberg
jobs use previous/current snapshot boundaries and advance state only after a
successful output commit.

## 8. Flink SQL paid slice

Start with one narrow path:

```text
Kafka or Debezium CDC topic -> Flink SQL -> ClickHouse
```

No post-Flink Kafka topic. DataFlow generates Kafka/Debezium source DDL,
ClickHouse sink DDL, runtime/checkpoint settings, and credential properties. The
user or AI supplies a `SELECT`. Reject arbitrary DDL, `ADD JAR`, embedded
credentials, and unapproved connectors.

The local realtime profile adds Flink JobManager, TaskManager, SQL Gateway,
Kafka SQL connector, JDBC connector, and ClickHouse JDBC driver while reusing
existing Redpanda.

Delivery is at-least-once. Flink checkpoints Kafka offsets and writes stable
dedup keys into `sink_records`; Analytics performs deduplicated reads.

DataFlow Temporal workflows order dependent deployments. Cohestra exclusively
owns Flink deploy, upgrade, health gates, savepoints, pause/resume, rollback,
and cancellation. DataFlow stores only Cohestra ID, Temporal ID, desired state,
and last error and integrates through Cohestra's HTTP API first.

## 9. Paid plans and internal access

Add `sparkSql` and `flinkSql` entitlement keys. Requirements:

- `stream-direct` requires `realtime`.
- `spark-sql` requires `sparkSql`.
- `flink-sql` requires `realtime` and `flinkSql`.
- Iceberg requires `advancedConnectors`.

Unentitled users see locked engines and examples but cannot select them in a
saved definition, activate, deploy, or run them. Backend enforcement is
authoritative.

QA and CI tenants receive all entitlements through existing seed/API paths.
There is no production bypass flag. Entitlement changes are audited. Pricing is
outside this implementation plan.

## 10. Realtime test fixture

Wikimedia SSE is test data, not a product connector:

```text
Replayable SSE fixture -> temporary Kafka topic -> DataFlow Kafka source
  -> stream-direct or Flink SQL -> ClickHouse -> Analytics
```

CI uses a deterministic local fixture. An optional manual test may use the
public Wikimedia stream. No Wikimedia catalog entry, UI, API model, or stored
product configuration is added.

## 11. Tests and CI

Unit-test only logic that can fail without infrastructure: AI config merging,
Mermaid conversion, engine/entitlement validation, SQL allowlists, Iceberg
Arrow conversion/idempotency, offset commit rules, Spark/Flink spec generation,
and time ranges.

Add one integration/E2E happy path and one failure/retry path for workflow,
Iceberg, direct CDC, Spark, and Flink. Playwright covers auth/roles, pipeline
editing, AI drawer, connectors, lifecycle, Runs/calendar, themes, Monitoring,
Lineage, Analytics, paid locks, and engine lifecycle controls.

Use three CI levels:

1. PR fast: build, typecheck, and unit tests.
2. PR integration: core stack, browser smoke, workflow/Iceberg/Analytics.
3. Nightly/release: CDC, Spark, Flink, Cohestra, and recovery tests.

## 12. Delivery

### Release A — Main MVP

1. Playground AI drawer.
2. Theme, calendar, filters, and Runs fixes.
3. Iceberg append sink.
4. Analytics baseline.
5. Core browser regression.

### Release B — Realtime add-on

1. Direct streaming worker.
2. PostgreSQL CDC to ClickHouse vertical slice.
3. Lifecycle and monitoring.
4. Failure recovery.

### Release C — Spark add-on

1. S3/Iceberg input.
2. Spark SQL transform.
3. Iceberg/ClickHouse output.
4. Spark Operator lifecycle and incremental snapshots.

### Release D — Flink add-on

1. Kafka/CDC input.
2. Flink SQL transform.
3. Direct ClickHouse output.
4. Cohestra lifecycle and checkpoint/rollback tests.

Each release ships independently behind entitlements.

## 13. Deferred

- More direct-stream sinks and Spark JDBC paths.
- Arbitrary Spark/Flink code, PySpark, ML, and Flink DataStream API.
- Exactly-once ClickHouse delivery.
- Iceberg create/evolve/upsert/CDC.
- Persistent or token-streaming AI chat.
- Generic actor framework.
- Wikimedia as a product connector.
- User-managed internal CDC topics.

