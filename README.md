# DataFlow POC

Self-serve data pipeline platform. Users build DAG workflows in a visual editor;
one generic Temporal workflow interprets them. Zendesk, Google Sheets, Google
Drive, and custom REST APIs as sources; cron / webhook / event triggers declared
**inside the pipeline definition**; historical backfill + incremental ingestion
with durable cursor state; dev→prod promotion via Temporal worker Build IDs;
full observability (OTel → Prometheus/Grafana/Jaeger).

## Architecture in one paragraph

The UI (React Flow) emits a frozen `PipelineDefinition` JSON. The API stores it
as an immutable version and registers its trigger (Temporal Schedule for cron,
HTTP route for webhook, Redis subscriber for events). Every firing starts
`DynamicDAGWorkflow` with the **full definition as input** — replay-deterministic
by construction. The workflow topologically sorts the DAG into parallel levels
and dispatches each node to a catalog of pre-registered activities. Source nodes
page in a loop using cursors persisted in Postgres (`connector_state`), so
backfill survives crashes and seamlessly hands off to incremental mode;
`continueAsNew` bounds history on long backfills. Payloads travel as `DataRef`
pointers — Temporal history holds IDs, never data.

## Run it — fully isolated (recommended)

Everything runs in containers on one private Docker network. No Node, no npm,
no Postgres on your host. Credentials enter only via `.env` at runtime — they
are never baked into images.

```bash
cp .env.example .env            # connector creds (optional for smoke test)
docker compose up -d --build    # ~2-3 min first build
./scripts/smoke-test.sh         # end-to-end verification, no creds needed
```

| Service     | URL                    |
|-------------|------------------------|
| Pipeline UI | http://localhost:3000  |
| Temporal UI | http://localhost:8080  |
| Grafana     | http://localhost:3001  |
| Jaeger      | http://localhost:16686 |
| Prometheus  | http://localhost:9090  |

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
- Cursor checkpoints commit to `connector_state` **after** each successful page,
  so a crash mid-backfill resumes from the last good page. Sinks are idempotent
  (`ON CONFLICT` on dedup keys), so a replayed page cannot duplicate data.

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

## Repo layout

```
packages/shared      PipelineDefinition, DataRef, NodeResult types
apps/api             control plane: pipeline CRUD, triggers, executions
apps/worker          Temporal worker: DynamicDAGWorkflow + activity catalog
apps/web             React Flow self-serve builder + live monitor
db/init.sql          control plane + cursor state + data plane tables
observability/       otel-collector, prometheus, grafana provisioning
scripts/             promote-build.js (build ID promotion), smoke-test.sh
examples/            ready-to-import pipeline definitions
```

## Production gaps (deliberate POC cuts)

- Credentials are env vars → move to the envelope-encrypted vault (KMS + per-user DEK)
  from the main design doc.
- `transform.map/filter` use `new Function` → swap for `isolated-vm` sandbox.
- DataRefs store payloads in Postgres → S3 with client-side encryption.
- Event trigger uses Redis pub/sub → Kafka with consumer groups + DLQ.
- No authn/z on the API → JWT + tenant RLS.
