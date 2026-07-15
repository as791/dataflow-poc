# Local setup

Updated: 2026-07-10

## Requirements

- Docker Desktop: at least 8 GB RAM and 4 CPUs.
- Node.js 20+ and npm.
- Go version declared by `apps/workflow-go/go.mod`.
- Kind, `kubectl`, and Helm.

## Full local stack

```bash
./scripts/bootstrap.sh
./scripts/smoke-test.sh
```

Bootstrap creates `.env`, generates JWT/OAuth/Temporal keys and the worker
keypair, builds local images, creates a Kind cluster, and installs Helm. Secrets
are rendered to a mode-0600 temporary values file and deleted on exit.

Local endpoints:

| Service | URL |
| --- | --- |
| Web | `http://localhost:3002` |
| API health | `http://localhost:3002/api/health` through the web proxy |
| Temporal UI | `http://localhost:8082` |
| Cohestra UI | `http://localhost:8080` when installed |

Delete local data deliberately:

```bash
kind delete cluster --name dataflow
```

## Frontend development

```bash
npm install
npm -w apps/web run dev
npm -w apps/web run build
npm -w apps/web test
npm -w apps/web run test:e2e
```

Vite runs at `http://localhost:3000` and proxies `/api` to the local backend.
Route pages are lazy-loaded; a production build must not emit an oversized
single entry chunk warning.

## Go backend development

```bash
cd apps/workflow-go
go test -race ./...
go vet ./...
```

The repository vendors Go modules because the Docker build uses
`go build -mod=vendor`. After changing dependencies:

```bash
go mod tidy
go mod vendor
```

Run processes separately when debugging:

```bash
npm run dev:api
npm run dev:workflow-worker
npm run dev:activity-worker
```

## Configuration rules

- `.env.example` documents local variables; `.env` is ignored.
- Everything under `secrets/` except `.gitkeep` is ignored.
- Production must set `NODE_ENV=production` and a valid
  `TEMPORAL_PAYLOAD_ENCRYPTION_KEY`; plaintext Temporal history is development-only.
- Never use production credentials in deployed Playwright fixtures.

For GCP, persistence, backups, and Secret Manager, use
[DEPLOYMENT_GCP.md](DEPLOYMENT_GCP.md). For system boundaries, use
[ARCHITECTURE.md](ARCHITECTURE.md).
