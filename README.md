# DataFlow

Self-serve, open-core data pipeline platform — an n8n-shaped product on a
Temporal-durable engine. Build DAG workflows visually **or** describe them in
natural language and let a local LLM draft them. A generic Go Temporal workflow
interprets every pipeline while TypeScript activity workers run connectors,
transforms, and sinks.

**What sets it apart from n8n:**
- **AI + Mermaid authoring.** Describe a pipeline in English → a local **Ollama**
  model drafts an editable **Mermaid** diagram kept in sync with the canvas. No
  API key, opt-in. See [docs/AI_BUILDER.md](docs/AI_BUILDER.md).
- **Plug-and-play connectors.** Add a REST source with a single JSON manifest —
  no code, no redeploy. See [docs/CONNECTORS.md](docs/CONNECTORS.md).
- **Temporal-durable execution.** Pause/resume/cancel, durable cursors, crash-safe
  backfill, replay-deterministic by construction.
- **Test → production environments.** Iterate in `test`, promote a tested version
  to `prod`; each environment is its own Temporal namespace + worker pool.
- **Open core.** The whole product is free in the community edition; an
  `EDITION=enterprise` seam unlocks governance features (audit export, …).

Sources: Zendesk, Google Sheets, Google Drive, Microsoft Excel, PostgreSQL,
MySQL, MongoDB, Kafka/Redpanda, S3, custom REST, plus any manifest connector. Sinks include
PostgreSQL, MySQL, MongoDB, Kafka/Redpanda, ClickHouse, S3, Sheets, and webhooks. Triggers
(cron / webhook / event) are declared **inside
the pipeline definition**. Historical backfill + incremental ingestion with
durable cursor state. Full observability (OTel → Prometheus/Grafana/Jaeger).

## Architecture in one paragraph

The UI (React Flow) emits a frozen `PipelineDefinition` JSON. The API stores it
as an immutable version and registers its trigger (Temporal Schedule for cron,
HTTP route for webhook, Redis subscriber for events). Every firing starts the Go
`DynamicDAGWorkflow` with the **full definition as input** — replay-deterministic
by construction. Go workflow workers poll `dynamic-dag-<env>` while TypeScript
activity workers poll `dynamic-activities-<env>`. The workflow topologically
sorts the DAG into parallel levels and dispatches each node by stable activity
name. Source nodes merge up to 50 cursor pages per execution and persist
progress in Postgres (`connector_state`). Payloads travel as encrypted
`DataRef` pointers instead of raw datasets.

## Database cursor and CDC modes

PostgreSQL, MySQL, and MongoDB sources support `Cursor` polling or managed CDC.
CDC runs as bounded micro-batches from Debezium topics; offsets commit only
after the full DAG succeeds, so retries are at-least-once. Database sinks can
use `apply-cdc` to upsert creates/updates and delete by primary key.

```bash
docker compose --profile cdc up -d
```

Add a database credential, enable CDC for a comma-separated resource allowlist
(`public.orders`, `app.orders`, or `database.collection`), then select `CDC` on
the source node. PostgreSQL requires logical replication/`pgoutput`; MySQL
requires ROW binlogs and a replication-capable user; MongoDB requires a replica
set. The managed CDC Redpanda and Kafka Connect services remain internal-only.

## Kafka / Redpanda pipelines

Add a Kafka credential with comma-separated brokers, optional TLS, and optional
SASL/PLAIN or SCRAM credentials. `kafka.fetch` reads bounded pages from an
`earliest` or `latest` initial position; partition offsets join the same
post-DAG checkpoint transaction as database cursors. `sink.kafka` publishes
acknowledged JSON batches and can derive message keys from a record field.
Set the same **Lineage cluster name** on producer and consumer nodes so separate
pipelines meet at one `kafka://cluster/topic` asset in workspace lineage.
Kafka producer retries are idempotent within a producer session; pipeline
re-runs can still re-emit messages, so downstream consumers should deduplicate
by the configured message key when exactly-once business effects are required.
Run the broker conformance smoke with
`KAFKA_TEST_BROKERS=localhost:9092 npm -w apps/worker run test:kafka`; it verifies
produce, bounded paging, and offset resume against a real Kafka-compatible broker.

Monitoring persists deduplicated SLO incidents in `pipeline_alerts`; operators
can acknowledge or resolve them from `/monitoring`, and a later healthy run
auto-resolves cleared breaches. Fresh installations apply migrations through
`db/020_cross_run_dedupe.sql` automatically. Existing Docker volumes must apply
migrations 011–020 once before incidents, run retry, asset history, quality,
external lineage, partitioned backfills, RBAC, and paid feature controls are available.

Multi-pipeline chaining uses tenant/environment-scoped Redis Stream events backed
by `pipeline_event_outbox`. Choose **Asset materialized** for medallion consumers:
the asset history row and event outbox entry commit atomically, and stable URNs
survive producer replacement. Choose **Upstream pipeline** for pipeline-specific
completed, failed, or cancelled events. Both appear in workspace lineage.

Set `OPENLINEAGE_URL` to emit durable START and terminal RunEvents to Marquez or
another OpenLineage backend. External tools can POST standard RunEvents to
`/api/openlineage?environment=prod`; their jobs and datasets merge into `/lineage`
whenever dataset names use the same stable asset URNs. An owner creates or rotates
the tenant token with `POST /api/pipelines/lineage/openlineage-key`; only its hash
is stored. Send the returned value as `Authorization: Bearer <token>`. Revoke it
with `DELETE /api/pipelines/lineage/openlineage-key`.

## Run it — one command

Everything runs in containers on one private Docker network. No Node, no npm,
no Postgres on your host. The bootstrap script generates `.env`, the worker RSA
keypair, and random encryption keys, then starts the stack (idempotent):

```bash
./scripts/bootstrap.sh          # generate config + secrets, then start
./scripts/bootstrap.sh --ai     # also start the Ollama AI builder
./scripts/smoke-test.sh         # end-to-end verification, no creds needed
```

| Service     | URL                    |
|-------------|------------------------|
| Pipeline UI | http://localhost:3002  |
| Temporal UI | http://localhost:8082  |
| Grafana     | http://localhost:3001  |
| Jaeger      | http://localhost:16686 |
| Prometheus  | http://localhost:9090  |

> Connector OAuth still expects `APP_URL=http://localhost:3000`; the web app is
> served on `:3002` and proxies `/api` internally.

## Editions

DataFlow is open core. Everything that makes it a product — visual + AI
authoring, all connectors, test/prod environments, execution, observability — is
free in the **community** edition. Set `EDITION=enterprise` to unlock governance
features behind the seam in `apps/api/src/lib/edition.ts` (audit-log export
today; SSO/SAML and advanced RBAC are scaffolded). `GET /api/edition` reports the
active edition and feature flags.

**Encryption status:** Temporal workflow history uses a cross-SDK AES-256-GCM
payload codec, OAuth tokens are encrypted at rest, and intermediate
`node_payloads` plus oversized webhook payloads are encrypted with the platform
payload key. Set `PAYLOAD_S3_BUCKET` to move payloads larger than 4 KiB to any
S3-compatible store; the object body is encrypted before upload and its bucket/key
travels as a `DataRef`. Per-tenant customer-managed keys are not currently provided.

The API is **not** exposed to the host by default — the web container proxies
`/api` to it over the internal network (nginx). To expose it for the smoke test
or curl access, add `ports: ["4000:4000"]` to the `api` service, or run the
smoke test from inside the network:

```bash
docker compose exec api sh -c "apt-get install -y curl >/dev/null 2>&1; \
  curl -s http://localhost:4000/health"
```

Startup ordering is enforced: Postgres healthcheck gates Temporal; a
`wait-for.sh` wrapper inside api/worker images blocks until `temporal:7233`
accepts connections (auto-setup takes ~30s on first boot).

Scale workers horizontally:

```bash
docker compose up -d --scale worker=3
```

Tear down completely (including pipeline data):

```bash
docker compose down -v
```

## Run it — hybrid dev mode

For fast iteration on app code with infra in containers:

```bash
docker compose up -d postgres redis temporal temporal-ui otel-collector prometheus grafana jaeger
npm install
npm run dev:worker   # terminal 1
npm run dev:api      # terminal 2
npm run dev:web      # terminal 3 → http://localhost:3000
```

(Point `.env` at `localhost` ports in this mode: `DATABASE_URL=postgres://dataflow:dataflow@localhost:5433/dataflow`, etc. Add `ports: ["5433:5432"]` to postgres and `ports: ["7233:7233"]` to temporal in the compose file.)

## Ingestion modes & state management

Each source node declares `ingestion.mode`:

- **incremental** — cursor-based change detection per connector:
  Zendesk incremental export cursors, Drive changes feed (`startPageToken`),
  Sheets row-hash diffing, custom API watermark params.
- **backfill** — pages from `backfillStart` until the connector reports
  `end of stream`, then **automatically anchors the incremental cursor** at
  that moment (see `gdrive.ts`) — no gap, no overlap.
- Cursor checkpoints commit to `connector_state` only after the full DAG
  succeeds. Failed transforms or sinks therefore cannot skip source rows.

Owners can preview and start date-partitioned PostgreSQL, MySQL, or MongoDB
backfills from **Lifecycle → Backfill**. Sources must use `cursor` mode with a
date cursor. Plans use non-overlapping `[from,to)` ranges, cap concurrency at
five executions, and isolate partition cursors from normal incremental state.
Each partition handles at most 50 × 10,000 source rows; split denser ranges
before retrying. Use idempotent sink keys because reprocessing intentionally
re-emits historical records.

## Dev → prod: the actor model with Build IDs

Every worker image is stamped with a `BUILD_ID` (git SHA) and registers with
`useVersioning: true`. Each workflow execution is an isolated actor **pinned to
the build that started it**:

```bash
docker build -f apps/worker/Dockerfile --build-arg BUILD_ID=$(git rev-parse --short HEAD) -t worker:$SHA .
# run the new image alongside the old one, then atomically promote:
node scripts/promote-build.js $SHA
```

New executions route to the new build; in-flight executions keep replaying on
the old image until they drain (then it can be retired). Rollback = promote the
previous build ID. A bad deploy can never corrupt a running workflow's replay.

## Observability

- **Metrics** (Prometheus, pre-built Grafana dashboard "DataFlow Platform"):
  executions/min, node p95 duration, node failures, records ingested per
  connector, cursor lag.
- **Traces** (OTel → Jaeger): API request → workflow → each activity.
- **Logs**: structured pino JSON from API and worker.
- **Live execution state**: the UI polls the workflow's `status` query handler —
  node-by-node status painted directly on the canvas; pause/resume/cancel
  buttons send Temporal signals.
- **Audit tables**: `executions`, `node_runs` retain per-node duration, record
  counts, and errors after workflows complete.
- **Activity search**: `/monitoring` searches durable node outcomes across
  pipelines by level, run, node, pipeline, or error; secrets are redacted both
  when new errors are stored and when historical errors are returned.

## Repo layout

```
packages/shared      PipelineDefinition, DataRef, NodeResult types
apps/workflow-go     Go Temporal workflow state machine + payload codec
apps/api             control plane: pipeline CRUD, triggers, executions
apps/worker          TypeScript Temporal activity workers + connector catalog
apps/web             React Flow self-serve builder + live monitor
db/init.sql          control plane + cursor state + data plane tables
observability/       otel-collector, prometheus, grafana provisioning
scripts/             promote-build.js (build ID promotion), smoke-test.sh
examples/            ready-to-import pipeline definitions
```

## Production gaps (deliberate POC cuts)

- Credentials are env vars → move to the envelope-encrypted vault (KMS + per-user DEK)
  from the main design doc.
- Per-tenant customer-managed payload keys are not implemented.
- Configure S3-compatible DataRefs plus bucket lifecycle/retention in production;
  Postgres remains the zero-config development fallback.
- Event trigger uses Redis pub/sub → Kafka with consumer groups + DLQ.
- Docker Compose is a development topology; production Cassandra,
  Elasticsearch, and Temporal require multi-node deployment and backups.
