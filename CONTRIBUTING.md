# Contributing to DataFlow

Thanks for helping build DataFlow!

- [Code of conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Dev setup](#dev-setup)
- [Making a change](#making-a-change)
- [Commit format](#commit-format)
- [Pull request process](#pull-request-process)
- [Contributing a connector](#contributing-a-connector)
- [Repository layout](#repository-layout)
- [Conventions](#conventions)
- [Developer Certificate of Origin (DCO)](#developer-certificate-of-origin)
- [License](#license)

---

## Code of conduct

All participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
Please read it before contributing.

## Ways to contribute

- **Bug reports** — open an issue using the bug report template.
- **Feature requests** — open an issue using the feature request template.
- **Connectors** — the easiest first contribution; no Go knowledge required (see below).
- **Docs** — fix a typo, improve a setup guide, write a tutorial.
- **Bug fixes / features** — fork, branch, PR (see process below).

## Dev setup

Prerequisites: Docker + Compose v2, Go ≥ 1.22, Node ≥ 20, `npm`.

```bash
# Clone and install JS deps
git clone https://github.com/aryaman-sinha/dataflow-poc.git
cd dataflow-poc
npm install          # builds @dataflow/shared and connector-sdk

# Run the full stack locally
docker compose up    # Postgres, Temporal, API, worker, web on :3000
```

Or start services individually:

```bash
npm run dev:api              # Go API on :4000
npm run dev:activity-worker  # Temporal activity worker
npm run dev:workflow-worker  # Temporal workflow worker
npm run dev:web              # Vite dev server on :3000
```

Run tests before opening a PR:

```bash
go test ./...                            # Go unit tests
npm -w @dataflow/shared test             # Mermaid round-trip tests
npm -w @dataflow/connector-sdk test      # Executor + registry tests
npx tsc --noEmit -p apps/web/tsconfig.json  # TypeScript check
```

CI (`.github/workflows/ci.yml`) runs all of the above plus a Docker Compose
validation. Make sure they pass locally first.

## Making a change

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes. Keep the scope focused — one logical change per PR.
3. Add or update tests for non-trivial logic.
4. Update `CHANGELOG.md` under `[Unreleased]` if the change is user-visible.
5. Sign off your commits (see [DCO](#developer-certificate-of-origin)).
6. Open a PR against `main`.

## Commit format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

Signed-off-by: Your Name <you@example.com>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`

**Scope** (optional): `web`, `api`, `worker`, `connectors`, `shared`, `db`, `ci`

Examples:
```
feat(connectors): add Stripe webhook manifest
fix(web): correct contrast on dark mode pipeline badges
docs: add ClickHouse connector example to CONNECTORS.md
```

Breaking changes: add `!` after the type/scope or a `BREAKING CHANGE:` footer.

## Pull request process

1. Fill in the PR template — summary, changes, test plan.
2. A maintainer will review within a few days. Small, focused PRs land faster.
3. Address review feedback with new commits (do not force-push during review).
4. Once approved and CI is green, a maintainer will merge (squash or merge commit).
5. The branch is deleted after merge.

**For large features**: open a discussion or a draft PR first to align on design
before doing a lot of work.

## Contributing a connector

The fastest path — **no Go** — is a manifest. Add a `*.manifest.json` to
`packages/connector-sdk/src/manifests/` (bundled) or point `CONNECTORS_DIR` at
a directory of manifests (loaded on restart). Full schema and a worked example
are in [docs/CONNECTORS.md](docs/CONNECTORS.md).

For connectors a manifest can't express (OAuth, change-feeds, GraphQL, SDK auth),
implement a `ConnectorPlugin` — see the same doc.

A good connector PR includes:
- The manifest or plugin + any new config `fields`
- A note on auth, pagination, and incremental/cursor behavior
- A small unit test if it's a plugin (`executor.test.ts` alongside)

## Repository layout

| Path | What |
|------|------|
| `apps/web/` | React + Vite frontend (canvas, AI builder, monitoring) |
| `apps/workflow-go/` | Go monobinary: API, Temporal workflow worker, activity worker |
| `packages/shared/` | Pipeline types, Mermaid mapping |
| `packages/connector-sdk/` | Manifest schema, executor, registry, plugin API |
| `connectors/` | Built-in connector manifests and plugins |
| `db/` | Postgres migrations (numbered, run in order) |
| `docs/` | Architecture decision records and design docs |
| `scripts/` | Dev bootstrap and utility scripts |
| `observability/` | Prometheus / Grafana configs |

## Conventions

- **Go**: `gofmt`, standard idioms, table-driven tests.
- **TypeScript**: strict mode; match surrounding style and comment density.
- **New DB columns with `tenant_id`** must be covered by the RLS policy in
  `db/003_rls.sql`.
- **No `dist/` in source**: `@dataflow/*` packages build to `dist/`; don't
  commit compiled output.
- **Security-sensitive paths** (`crypto/`, auth middleware, credential storage)
  require review from a CODEOWNER.

## Developer Certificate of Origin

All commits must be signed off to certify you wrote the contribution or have
the right to submit it under the Apache 2.0 license. Add this to every commit:

```
Signed-off-by: Your Name <you@example.com>
```

The easiest way:

```bash
git commit -s -m "feat: my change"
```

Or configure Git globally: `git config --global commit.gpgsign true` (GPG sign)
plus `git config --global user.signingkey <key-id>`.

Full DCO text: <https://developercertificate.org/>

## License

By contributing you agree your contributions are licensed under the
[Apache 2.0 license](LICENSE). Copyright remains with the original authors
("DataFlow Contributors").
