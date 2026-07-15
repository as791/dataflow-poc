# DataFlow pre-release engineering and product audit

Date: 2026-07-10  
Branch reviewed: `feat/ai-pipeline-builder`  
Target: first 10 daily users; credible path from 10K to 1M stored DAGs

## Scope and method

Reviewed repository architecture, Go backend, React frontend, Temporal
workflows, connector runtime, PostgreSQL/RLS migrations, Redis/outboxes,
ClickHouse, Helm, Docker Compose, Terraform/GCP, CI, tests, documentation, and
tracked artifacts.

Live product walkthrough used the authenticated deployment at
`https://34.14.212.157.nip.io` across desktop and 390×844 mobile viewports.
Routes inspected: pipeline builder, Pipelines, Lifecycle, Runs, Monitoring,
Lineage, Connectors, Analytics, Team, Billing, Settings, and Profile. Console
errors were checked during the walkthrough.

Verification included TypeScript typecheck/Vite build, frontend/shared tests,
Go race tests and vet, Helm lint/render, Compose config, shell syntax, and
Terraform formatting/validation attempts.

This was source-assisted review, not a penetration test, formal accessibility
conformance test, production load test, legal review, or certification audit.

## Executive verdict

External pre-release is **no-go until Gate 0 is complete**. Controlled internal
demo is viable after credential rotation, GCP migration/restore verification,
production secret injection, seeded data, and deployed smoke tests.

Strong foundations:

- Go API/workflow/activity process separation is simple and operationally useful.
- Temporal workflow code is deterministic and already bounds source history.
- Tenant transactions, RLS, connector ownership checks, encrypted credentials,
  audit events, and transactional outboxes are meaningful security/reliability work.
- Keyset pagination exists for executions.
- Resource cleanup is generally disciplined: rows, bodies, tickers, Redis,
  Temporal clients, Kafka clients, and successful DB/Mongo connections close.
- Frontend has typed builds, shared API auth refresh, real lifecycle/monitoring,
  and now route-level bundle boundaries.

Release blockers found:

- A plaintext-named Supabase database password file was tracked in the latest
  commit, and old Terraform configuration persisted a secret JSON value in
  state. Treat both credential paths as compromised if shared.
- GCP path was single-VM Kind with publicly exposed admin/UI ports, replaceable
  boot-disk persistence, default compute identity, no Redis PVC, and no tested restore.
- Helm silently used static JWT/OAuth defaults and omitted Temporal encryption
  from workflow workers; HTTPS cookies were not marked Secure.
- Pipeline catalog endpoint returns every full definition with no pagination.
- User-controlled outbound URLs lack SSRF controls.
- Auth, webhook tenancy, retention, CI security, and compliance evidence remain incomplete.
- Live demo workspace was empty, so product value and operational views were not legible.

No evidence supports a current 10K or 1M-DAG capacity claim. That target is
feasible only as staged engineering with an explicit workload envelope and
published load evidence.

## Changes applied during this audit

### Reliability and memory

- Failed MySQL and Snowflake pings now close the allocated `sql.DB`.
- Failed MongoDB ping now disconnects the allocated client.
- MySQL, MongoDB, and Snowflake page size is clamped to `1..10,000`.
- Acknowledged Redis stream entries are deleted instead of accumulating forever.
- Redis Helm deployment now has AOF persistence and a PVC.
- Builder drag-resize global pointer listeners are removed on component unmount.

### Security

- Unhandled API errors return `internal error`; detailed errors stay in logs.
- Rate limiting trusts the internal proxy’s replacement `X-Real-IP`, not a
  client-controlled first `X-Forwarded-For` value.
- Snowflake table, cursor, and record-column identifiers are allowlisted.
- Production Temporal clients fail closed without a valid payload key.
- Helm wires the same Temporal key to API, activity workers, and workflow workers.
- Production Helm mode requires JWT, OAuth, Temporal, app URL, PostgreSQL, and
  Redis secret values; local mode remains usable.
- Production mode sets Secure cookies through `NODE_ENV=production`.
- nginx adds anti-framing, MIME-sniffing, referrer, and permissions headers.
- Local Helm secrets use a mode-0600 temporary file, deleted on exit.
- Secret files, RDB dumps, ZIP artifacts, and Terraform state inputs are ignored.
- SMTP moved from removed/deprecated `net/smtp` surface to maintained
  `github.com/wneessen/go-mail/smtp` compatibility package.

### Frontend/product

- All route pages lazy-load; initial route no longer eagerly imports the entire product.
- Invalid/empty DAGs cannot Save, Activate, or Run; buttons explain the blocker.
- Empty Pipelines workspace shows “Create pipeline” instead of claiming filters hid data.

### GCP and documentation

- Public firewall reduced to 80/443; SSH requires explicit trusted CIDR.
- Dedicated runtime service account replaces default compute identity.
- Static IP, protected data disk, `/var/lib/docker` mount, and daily 14-day
  snapshots added.
- Secret values removed from Terraform state flow; versions are added out-of-band.
- Conflicting completed plans and loop logs removed; canonical architecture,
  pending-only roadmap, GCP runbook, and security-control guide added.

These changes reduce known risk. They do not make the system production-ready
until deployed, migrated, and independently verified.

## Gate 0 release blockers

| ID | Blocker | Required evidence |
| --- | --- | --- |
| R0-1 | Tracked/state-held secrets | Credential rotation timestamp, tracked file removed, Git and Terraform-state exposure assessed/purged, secret scan green |
| R0-2 | Production secrets/config | Secret Manager version complete; production Helm render and pod startup fail closed on omission |
| R0-3 | Persistence migration | Data disk mounted on deployed host; logical backup and isolated restore succeed |
| R0-4 | Network/IAM hardening | Terraform plan applied; external scan sees only 80/443 and trusted SSH; VM uses dedicated SA |
| R0-5 | Empty demo | Seed script/data shows a successful and failed pipeline, lineage, alert, and analytics dataset |
| R0-6 | Core smoke | Deployed login → create → save → activate → run → inspect → logout passes desktop/mobile |
| R0-7 | Auth/public-route abuse | Token audience/issuer verified; refresh/webhook/OpenLineage/billing routes rate-limited |
| R0-8 | Data disclosure | Temporal history and persisted payload samples verified ciphertext; logs reviewed for secrets/PII |
| R0-9 | Rollback | Previous images/config and DB compatibility tested; operator can recover within stated RTO |

## Memory and resource audit

### Fixed leaks

`mysqlDB`, `snowflakeDB`, and `mongoClient` created resources and returned them
alongside a ping error. Callers returned before installing their `defer`, leaking
connections/clients on repeated invalid-credential or unavailable-host tests.
Constructors now close on the failure path.

Pipeline builder’s drawer resize attached `window` listeners and removed them
only on pointer-up. Navigation/unmount mid-drag could retain component closures.
Unmount cleanup now calls the same stop handler.

### Existing cleanup verified

- Go HTTP response bodies and SQL query rows close.
- API and workers close Redis and Temporal clients on shutdown.
- worker processes stop tickers and respect context cancellation.
- Kafka and Mongo resources close after successful construction.
- React polling intervals/timeouts on Lifecycle, Runs, Monitoring, Lineage,
  Analytics, Billing, run detail, auth refresh, and execution monitor clean up.
- Object URLs used for CSV/audit downloads are revoked.

### Remaining memory/capacity risks

| Priority | Risk | Impact | Required fix |
| --- | --- | --- | --- |
| P0 | `GET /api/pipelines` loads all rows and full JSON definitions | API/DB/browser memory grows with catalog; 10K is already unsafe | Keyset summary endpoint and separate detail fetch |
| P0 | `DataRef` write marshals whole pages; read uses unbounded `io.ReadAll` | One large payload can exceed worker memory | Max encrypted/compressed bytes; streamed object reads/writes |
| P0 | `mergeRefs` can materialize many pages | Up to bounded 50 pages can still be hundreds of MB/500K records | Streaming/spill merge and hard byte/record budget |
| P1 | No maximum DAG nodes/edges/config/fan-out/maxParallel | Huge definition creates workflow replay/coroutine pressure | Validate explicit product limits at API and UI |
| P1 | Database sinks issue row-at-a-time writes | High allocations, round trips, long activity lifetime | COPY/batches/BulkWrite and bounded transactions |
| P1 | Connector pools/clients created per activity/page | Connection churn and remote saturation | Worker-scoped TTL/LRU pools with tenant/provider caps |
| P1 | Execution/node/payload/object records lack lifecycle cleanup | Persistent storage—not heap—grows without bound | Retention policy, partition drop/GC, legal holds |
| P2 | Analytics refresh performs side effects inside state updater | Strict/dev replay can duplicate requests | Keep latest widgets in ref; schedule requests outside updater |

“No memory leaks” cannot be guaranteed by static inspection. Add long-running
heap/goroutine/browser-profile tests under connector failures, polling,
navigation, backfills, and max-size payloads; assert steady-state plateaus.

## Backend architecture and scale

### Current shape

Current modular-monolith process split is correct for first users. API, workflow
workers, and activity workers already scale separately via Temporal queues.
Connector registry maps are a useful plugin seam, not speculative abstraction.

Main coupling that blocks later service extraction:

- API, dispatchers, and workers share tables and schema ownership.
- Domain commands/events are implicit JSON and not versioned.
- route handlers coordinate persistence and external clients directly.
- one environment configuration object spans all domains.
- no per-domain SLO, deployment, or data ownership contract.

Fix with packages/ports and table-write ownership inside the monolith. Do not add
network hops until a hot domain has typed contracts and measured need.

### Scale bottlenecks

| Area | Current behavior | Consequence |
| --- | --- | --- |
| Pipeline catalog | Unpaged full definitions plus latest-run lateral query | Linear DB/API/browser cost; blocks 10K |
| Event dispatch | 20 records per one-second loop | Roughly 20/s per dispatcher before DB/Redis latency |
| Alert dispatch | 5 records per two seconds | Backlog under incident storms |
| Backfill dispatch | 20 per default five seconds | Slow large backfill release |
| Workers | One replica per env in demo Helm | No HA; queue start latency under bursts |
| Data stores | One Postgres/Redis/ClickHouse/Temporal on one node | Shared bottleneck and failure domain |
| Source workflow | Max 50 pages, 20 concurrent activities | Useful guardrails, but large pages/levels still pressure history/memory |
| Sinks | Row-by-row, new remote pool per activity | Poor throughput and connection churn |
| Redis consumer | Fixed consumer identity, no stale-claim protocol | Multi-replica/restart recovery needs `XAUTOCLAIM` or leased design |
| Retention | Temporal 3 days; app/object retention absent | DB/object growth and compliance ambiguity |
| Kubernetes | No HPA/PDB/anti-affinity/resource policy | Cannot make or verify capacity promises |

### Recommended service boundaries

1. Keep identity/tenant, pipeline catalog, and execution API together first.
2. Scale connector activity workers by queue/provider without a service split.
3. Extract execution dispatch only when start-rate or ownership requires it.
4. Extract analytics because it already owns a distinct derived store and workload.
5. Keep billing/entitlements behind a trusted internal adapter; do not let tenant
   owners write commercial truth.
6. Keep Cohestra as a separate compute control plane with versioned job contracts.

## Frontend architecture

### Positive

- Route chunks now form natural feature boundaries.
- Auth refresh, catalog, feature flags, and theme are shell-level concerns.
- Shared Mermaid/lineage contracts live outside pages.
- Polling effects mostly clean up correctly.
- Canvas already has extracted flow node, config panel, execution monitor,
  conversion, validation, and AI hook components.

### Debt

- `PipelineCanvasPage.tsx` remains about 1,050 lines and owns navigation,
  hydration, catalog, connector instances, members, usage, editor, AI,
  lifecycle, runs/logs, resizing, and policy state.
- `PipelinesPage.tsx` remains about 420 lines and fetches/filters full definitions.
- API response types use broad `any`; runtime errors still surface raw status/body text.
- Multiple pages duplicate fetch/loading/error/poll behavior; `useApiResource`
  exists but is not the single data path and cannot abort network requests.
- No route error boundary or standard empty/error/skeleton component.
- UI primitives are Tailwind class conventions, not a documented/tested package.

Refactor direction: feature folders, typed API schemas, query cache with abort,
shared error/empty states, and an accessible UI package. Avoid Module Federation
until independent teams require independent deploys.

Bundle evidence: route splitting reduced main JS from about 1.13 MB minified
(306 KB gzip) to about 180 KB (59 KB gzip). Pipeline editor is about 111 KB and
Analytics about 477 KB. A 663 KB Mermaid internal chunk still triggers the
>500 KB warning; load it only when Mermaid is opened or replace full Mermaid
distribution with supported flowchart-only loading. Add CI budgets for initial
route bytes and largest lazy chunk.

## Security findings

### Critical/high

1. **Tracked secret:** `secrets/supabase-db-password.txt` was committed. Rotate;
   removing current file does not remove Git history.
2. **SSRF:** HTTP connector, alert webhook, user connector endpoints, and redirects
   can reach internal/metadata addresses. Enforce URL policy and network egress.
3. **Auth token binding:** Google token verification must confirm configured
   audience/issuer, not only identity claims.
4. **Webhook tenancy:** webhook path lookup selects the first matching active
   pipeline across tenants. Make path globally random/unique or tenant-scoped.
5. **Production secret defaults:** previously silent static Helm JWT/OAuth and
   missing Temporal key. Chart now fails closed, but deployed release must migrate.
6. **Public admin surfaces:** previous firewall exposed SSH and internal UIs to
   the internet. Terraform is fixed; live network must be independently scanned.
7. **Default VM identity:** previous broad default compute identity. Dedicated SA
   is defined; IAM roles still need an allowlist review.

### Medium

- Password registration marks email verified without proving mailbox ownership.
- Refresh rotation spans non-atomic read/revoke/issue operations and is not
  independently rate-limited.
- No MFA, password reset, session/device view, or global session revocation UI.
- Owner/member roles are too coarse for least privilege.
- Public webhook/OpenLineage/metrics surfaces lack a complete rate/exposure policy.
- HTTP connector and many DB defaults permit plaintext or `sslMode=disable`.
- Audit-retention DELETE may be blocked by application-role grants/RLS, making
  the documented retention control ineffective.
- Audit export caps 10K rows without cursor/signed archive strategy.
- No CSP/HSTS, NetworkPolicy, pod resource/security context, or admission policy yet.
- Mutable `latest`/local images, no digest policy for every component, no SBOM/signature.
- Anonymous Grafana admin exists in dev Compose; ensure profile cannot be exposed.
- Connector card claim “credentials encrypted per tenant” needs key-rotation,
  access-control, and ciphertext evidence, not copy alone.

### Compliance gaps

Missing operating program: asset/data/vendor inventories, classification,
retention/deletion, privacy requests, access reviews, vulnerability SLAs,
incident exercises, DR tests, change samples, vendor DPAs/subprocessors,
security training, risk register, evidence ownership, and audit-period records.

Treat [SECURITY_COMPLIANCE.md](../SECURITY_COMPLIANCE.md) as control backlog,
not proof of compliance.

## GCP persistence and operations

### Before audit

Single boot disk backed Kind and all PVCs; instance replacement/destroy could
remove data, Redis had no volume/AOF, storage was 2 GiB, no snapshot policy,
manual backup wrote `pg_dump` to `/tmp` and optionally AWS S3, and no ClickHouse,
Temporal, Redis, object, or restore procedure existed. `infra/README.md`
incorrectly described AWS EC2 while Terraform provisioned GCP.

### After repository changes

- Separate 200 GiB default persistent disk mounted at `/var/lib/docker`.
- Terraform `prevent_destroy`; daily snapshot schedule; static IP.
- Redis AOF/PVC.
- dedicated service account and restricted firewall.
- GCP-specific deployment/restore runbook.

### Residual limitation

Disk-level persistence is still single-zone and crash-consistent. Production
pilot should use Cloud SQL HA/PITR, managed event transport, GCS, supported
Temporal topology, and backed-up ClickHouse. Snapshot policy must be applied and
restore-tested; Terraform code alone is not operational evidence.

## Live product and UX audit

### Cross-product observations

- Deployment loaded without observed console warnings/errors during route walkthrough.
- Most shell routes render two H1-equivalent page titles: shell header plus page
  content. This weakens hierarchy and screen-reader landmark navigation.
- Empty workspace dominates every feature. No guided sample/demo makes the
  system look unfinished even where capability exists.
- Many controls are 22–38 px tall on mobile, below common 44×44 px touch guidance.
- Dark-theme eyebrow text measured around 2.5:1; inactive filter text around
  4.4:1. Small text needs stronger contrast for WCAG AA.
- Mobile shell is responsive enough to avoid document overflow, but the editor
  sacrifices context and canvas width to persistent tool/action rails.
- Keyboard behavior was not conclusively validated by browser automation;
  static focusability is present but needs manual keyboard/screen-reader testing.

### Pipelines

Good: stage/trigger/failure/search filters, refresh, list/drawer structure,
responsive wrapping. Previous empty message said filters hid results even when
workspace had zero pipelines; fixed with first-pipeline CTA.

Gaps:

- Filters are client-side because entire catalog loads; unusable at scale.
- Zero-state should offer sample pipeline/import/connect connector, not only create.
- Mobile filter/control density is high and tap targets are small.
- Successful run, owner, freshness, and last failure should be scannable without drawer.

### Pipeline builder

Good: strong canvas metaphor, source/transform/sink/flow palette, AI proposal,
Mermaid, lifecycle, run/log drawer, engine selection.

Gaps:

- Save/Activate/Run appeared enabled on empty DAG; now disabled with explanation.
- At 390 px, persistent icon rail and top actions leave too little canvas; name
  and context disappear. Use mobile read/review mode or full-screen tool sheets.
- Full-bleed root route weakens orientation. Preserve a clear back-to-Pipelines
  affordance and use `/pipelines/new` / `/pipelines/:id/edit` URLs.
- Configuration completeness, dirty state, save progress, and last saved version
  need one coherent status model.
- Break the 1,050-line component before independent teams touch it.

### Lifecycle

Good: stage language and backfill affordance. Gap: duplicate page title and empty
workspace. Explain promotion prerequisites and show a “create/import pipeline” CTA.

### Runs

Good: useful filtering model. Gap: empty page has no next action or sample;
provide “run a pipeline” CTA and describe manual/scheduled/event runs.

### Monitoring

Best-developed operational surface: KPIs, incidents, data quality, trend, logs,
and per-pipeline table. Empty numbers still need demo seed data and metric
definitions/tooltips. Duplicate title and small mobile controls remain.

### Lineage

Strong planned controls for environment/domain/layer/health/focus and change
history. Empty graph has no guided next action. Several controls expose the
accessible name “All”; each needs a specific label such as “All domains”. Search
needs an explicit label, not placeholder-only naming.

### Connectors

Catalog breadth communicates product value. Cards distinguish OAuth, database,
configurable, and planned providers. Missing: onboarding order, prerequisite
links, last test/health, credential owner/rotation, and a recommended first
connector. “Plan” cards are fake doors unless disabled with roadmap context.

### Analytics

Clear ClickHouse intent but zero-state ends without CTA/sample. Offer “send a
pipeline to ClickHouse”, sample dataset, or docs. Dashboard actions need role
and sharing-risk clarity.

### Team

Invitation flow is simple. Only owner/member prevents least privilege. Add
admin/editor/operator/viewer or task-based permissions, pending/expiry details,
last active, MFA/session status, and access-review export.

### Billing

Usage is understandable. Owner-visible add-on checkboxes currently write
entitlements directly, so they are demo controls, not billing enforcement.
Hide behind explicit internal-demo mode or route through trusted commercial state.

### Settings and Profile

Settings says values save locally, which conflicts with workspace expectation;
label device-only settings separately. `Asia/Calcutta` should display modern
`Asia/Kolkata`. `v0.1.0-dev` is honest but should include immutable build SHA.

Profile lacks password change/reset, MFA, active sessions, API tokens, security
history, account deletion/export, and verified-email controls. These are pilot
security requirements, not polish.

## Product priority

1. Seed an opinionated five-minute success path: connector → sample DAG → run →
   lineage/monitoring/analytics evidence.
2. Make pipeline catalog/server pagination and editor validity reliable.
3. Close auth/SSRF/secret/persistence gates.
4. Fix mobile review path, headings, labels, contrast, and touch targets.
5. Add role/session/security administration.
6. Defer broad connector count, micro-frontends, and service splitting until
   core activation and operating evidence exist.

## Ponytail whole-repo audit

Ranked complexity-only findings; security/correctness findings above are excluded.

1. `delete:` checked-in Go vendor tree and `-mod=vendor` build path when CI/build
   network and checksum cache are reliable. Use Go module checksum verification
   plus BuildKit cache. `[apps/workflow-go/vendor, apps/workflow-go/Dockerfile]`
2. `delete:` completed design handoff bundle duplicated implemented UI and tokens.
   Replacement: Git history/design source, not inert `.jsx.txt` copies.
   `[design_handoff_pipeline_builder]`
3. `delete:` obsolete AWS EC2 module beside active GCP module. Replacement:
   current `dataflow-gce` only. `[infra/modules/dataflow-ec2]`
4. `delete:` generated ZIP, Redis dump, completed loop logs, and superseded
   implementation/audit plans. Replacement: release artifacts outside Git and
   dated current docs. `[DataFlow.zip, dump.rdb, STATE.md, UI-LOOP-STATE.md,
   loop-*.md, docs/*PLAN*, docs/RELEASE_*, docs/audit legacy files]`

`net: -~1,000,000 vendored/generated lines and -0 runtime dependencies possible.`

Items 2–4 were removed in this audit. Vendor removal remains optional because
offline/reproducible builds may justify its cost; make that tradeoff explicit.

## Ponytail debt ledger

Current literal `ponytail:` markers are listed below. `no-trigger` means the
comment gives no explicit condition for revisiting/removal.

### `docker-compose.yml`

- `docker-compose.yml:60`, local simulated Cohestra image only. ceiling: local
  Compose. upgrade: use a registry digest for real Kubernetes.

### `apps/web/src/pages/ConnectorsPage.tsx`

- `apps/web/src/pages/ConnectorsPage.tsx:27`, local OAuth helpers removed.
  ceiling: shared API helper is canonical. upgrade: none named. `no-trigger`

### `apps/web/src/pages/PipelinesPage.tsx`

- `apps/web/src/pages/PipelinesPage.tsx:55`, duplicate activity-icon helper
  removed. ceiling: shared `ActivityIcon`. upgrade: none named. `no-trigger`

### `apps/web/src/hooks/useApiResource.ts`

- `apps/web/src/hooks/useApiResource.ts:12`, counter ignores stale results but
  does not abort transport. ceiling: stale UI suppression only. upgrade: none
  named. `no-trigger`

### `apps/workflow-go/internal/workflows/dynamic_dag.go`

- `apps/workflow-go/internal/workflows/dynamic_dag.go:328`, source partition
  limited to 50 pages. ceiling: 50 pages/run. upgrade: reduce partition size or
  increase bounded page size; later execution resumes cursor.

### `apps/workflow-go/internal/api/routes_ai.go`

- `apps/workflow-go/internal/api/routes_ai.go:236`, four-minute Ollama timeout.
  ceiling: CPU model around 4 tokens/s. upgrade: none named. `no-trigger`

### `apps/workflow-go/internal/api/routes_analytics.go`

- `apps/workflow-go/internal/api/routes_analytics.go:22`, flat ClickHouse query
  caps. ceiling: 10 seconds/10M rows per query. upgrade: make per-tenant when a
  tenant needs more.

### `apps/workflow-go/internal/connectors/saas.go`

- `apps/workflow-go/internal/connectors/saas.go:344`, sorted map keys for sink
  determinism. ceiling: map-backed records. upgrade: none named. `no-trigger`

### `apps/web/tests/deployed/p1-ai-authoring.spec.ts`

- `apps/web/tests/deployed/p1-ai-authoring.spec.ts:12`, 290-second AI request
  timeout. ceiling: CPU Ollama. upgrade: none named. `no-trigger`

### `apps/web/tests/deployed/global-teardown.ts`

- `apps/web/tests/deployed/global-teardown.ts:5`, recursive QA runs-prefix
  cleanup. ceiling: bucket dedicated to QA. upgrade: none named. `no-trigger`

### `apps/web/tests/deployed/deployed-api.ts`

- `apps/web/tests/deployed/deployed-api.ts:16`, token cache in OS temp directory.
  ceiling: 15-minute token/rate-limited deployed tests. upgrade: none named.
  `no-trigger`
- `apps/web/tests/deployed/deployed-api.ts:29`, login 429 retry/backoff. ceiling:
  shared 10/min IP limit. upgrade: none named. `no-trigger`

### `cohestra/internal/api/web/app.js`

- `cohestra/internal/api/web/app.js:250`, target cards fall back without health.
  ceiling: target identity only. upgrade: none named. `no-trigger`
- `cohestra/internal/api/web/app.js:723`, regex YAML parser handles only
  name/namespace/labels/serviceAccount. ceiling: those four fields. upgrade: use
  a real YAML parser when more fields are needed.

### `cohestra/internal/auth/auth.go`

- `cohestra/internal/auth/auth.go:16`, in-memory sessions. ceiling: one replica
  and restart loss. upgrade: Redis when replicas exceed one.

`15 markers, 10 with no trigger.`

## Verification snapshot

Baseline before edits:

- Frontend build/typecheck: pass; initial chunk warning at ~1.13 MB minified.
- Frontend unit tests: pass.
- Shared Mermaid/lineage tests: pass.
- Go `test -race ./...`: 37 tests across 16 packages passed.
- Helm lint: pass.
- Docker Compose config: pass.
- Terraform validation: environment/provider process failed before schema load;
  not a configuration verdict.

Post-change verification:

- Go `test -race ./...`: pass across all 16 packages; new error-redaction and
  production-encryption tests included.
- Go vet: pass.
- Frontend/shared tests and production build/typecheck: pass.
- Initial frontend main chunk reduced to about 180 KB minified/59 KB gzip.
- npm production dependency audit: 0 vulnerabilities.
- `govulncheck`: 0 reachable vulnerabilities. It reports GO-2026-5932 in the
  required `x/crypto` module's unmaintained `openpgp` package, but no imported or
  called vulnerable symbols; keep this visible in dependency review.
- Helm lint and production render: pass. Production render without required
  secrets fails as designed.
- Docker Compose config, bootstrap shell syntax, Terraform format: pass.
- Terraform validation: success outside sandbox. Local ignored
  `terraform.tfvars.json` still contains obsolete `dataflow_secrets_json`; remove
  that key locally so secret material is no longer passed to Terraform state.
- Web Docker image: pass. Go Docker image was included in final verification.
- `git diff --check`: pass.

Local success becomes release evidence only when protected CI repeats it in a
clean environment and the deployed smoke/restore gates also pass.

## Decision summary

- Architecture: keep modular monolith; strengthen domain ownership and queues.
- First scale work: catalog pagination, limits, batch/pool connectors, retention.
- First extraction: connector/data plane or analytics only after measured need.
- Frontend: feature packages + lazy routes now; micro-frontend runtime later, if ever.
- GCP: protected disk makes demo durable; managed stores required for pilot/production.
- Security: Gate 0 no-go until secret rotation, deployed hardening, auth/SSRF fixes,
  restore proof, and smoke evidence.
- Product: seed the workspace and make one success path obvious before adding breadth.
