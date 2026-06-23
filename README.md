# DataFlow

Self-serve, open-core data pipeline platform — an n8n-shaped product on a
Temporal-durable engine. Build DAG workflows visually **or** describe them in
natural language and let a local LLM draft them; one generic Temporal workflow
interprets every pipeline.

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

Sources: Zendesk, Google Sheets, Google Drive, Microsoft Excel, custom REST, plus
any manifest connector. Triggers (cron / webhook / event) are declared **inside
the pipeline definition**. Historical backfill + incremental ingestion with
durable cursor state. Full observability (OTel → Prometheus/Grafana/Jaeger).

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

**Encryption status (honest):** Temporal workflow history is encrypted by a
custom data converter, and OAuth tokens are encrypted at rest (AES-256-GCM). The
per-tenant DEK path for encrypting large `node_payloads` rows at rest is
scaffolded (`apps/worker/src/activities/crypto.ts`) but **not yet wired into the
data plane** — treat at-rest payload encryption as roadmap, not a guarantee.

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
