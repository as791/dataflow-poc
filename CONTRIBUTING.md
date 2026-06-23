# Contributing to DataFlow

Thanks for helping build DataFlow! This guide covers the dev loop and the
easiest, highest-leverage contribution: a new connector.

## Dev setup

```bash
npm install                 # builds @dataflow/shared + @dataflow/connector-sdk (prepare)
npm -w @dataflow/shared test            # mermaid round-trip
npm -w @dataflow/connector-sdk test     # executor + registry
```

Per-service:

```bash
npm run dev:api      # API on :4000
npm run dev:worker   # Temporal worker
npm run dev:web      # Vite dev server on :3000
```

Or run the whole stack in Docker: `./scripts/bootstrap.sh`.

CI (`.github/workflows/ci.yml`) runs the unit tests, typechecks the API and
worker, builds the web app, and validates `docker-compose.yml`. Please make sure
these pass locally before opening a PR.

## Contributing a connector

The fastest path — **no code** — is a manifest. Add a `*.manifest.json` to
`packages/connector-sdk/src/manifests/` (bundled) or to a directory you point
`CONNECTORS_DIR` at (loaded on restart, no rebuild). The full schema and a worked
example are in [docs/CONNECTORS.md](docs/CONNECTORS.md).

For connectors a manifest can't express (OAuth, changes-feeds, GraphQL, SDK
auth), implement a `ConnectorPlugin` — see the same doc.

A good connector PR includes:
- the manifest (or plugin) + any new config `fields`,
- a note on auth/pagination/incremental behavior,
- if it's a plugin, a small unit test alongside `executor.test.ts`.

## Repository layout

| Path | What |
|------|------|
| `packages/shared` | Pipeline types, the Mermaid mapping (AI builder). |
| `packages/connector-sdk` | Manifest schema, executor, registry, plugin API. |
| `apps/api` | Express control plane (auth, pipelines, AI, connectors, billing). |
| `apps/worker` | Temporal worker + activities (the data plane). |
| `apps/web` | React Flow canvas + AI builder. |
| `db/` | Postgres migrations (numbered, run in order on a fresh volume). |

## Conventions

- TypeScript strict mode; match the surrounding code's style and comment density.
- `@dataflow/*` packages build to `dist` (Node requires JS at runtime); don't
  commit `dist/` or compiled `.js`/`.d.ts` files under `src/`.
- New DB columns/tables that carry `tenant_id` must be covered by the RLS policy
  in `db/003_rls.sql`.

## License

By contributing you agree your contributions are licensed under the repository's
[Apache 2.0 license](LICENSE).
