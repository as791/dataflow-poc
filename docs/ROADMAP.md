# DataFlow roadmap

Updated: 2026-07-17

Only unfinished work belongs here. Completed work belongs in release notes or
Git history. Priority is a safe ten-user pilot, then measured scale from 10K to
one million stored DAGs.

## Gate 0 — pre-release demo

Release condition: every item checked, deployed smoke test green, rollback
tested. These are blockers, not aspirational features.

- [ ] Rotate the exposed Supabase/database credential, remove its tracked file,
  and purge reachable Git history if the commit was pushed.
  *(2026-07-14: rotated and verified — old password rejected; file deleted,
  branch history rewritten and force-pushed. Remaining: GitHub support ticket
  to drop cached PR #19 refs, which still serve the old commits by SHA.)*
- [ ] Populate GCP Secret Manager with non-default JWT, OAuth, Temporal payload,
  database, Redis, SMTP, and public URL values; verify production Helm rendering
  fails when any required value is absent.
  *(2026-07-13: Helm guards for all 12 keys verified locally and enforced in CI;
  remaining: populate the real secret values.)*
- [x] Apply Terraform firewall, static IP, dedicated service account, persistent
  data disk, and snapshot schedule changes to a fresh or deliberately migrated VM.
  *(2026-07-13: applied in-place to the dataflow VM; IP 34.14.212.157 promoted
  to static, old wide-open firewall destroyed.)*
- [x] Run a restore drill from a disk snapshot and logical PostgreSQL backup;
  record recovery time and data-loss window.
  *(2026-07-14: both halves drilled — logical 11 s dump / 13 s restore with
  count validation; snapshot→disk→attach→mount in ~35 s. Caveat recorded:
  cluster PVs still live on the boot disk, so snapshots capture an empty data
  disk until storage is migrated — see docs/audit/2026-07-13-restore-drill.md.)*
- [x] Seed one credible end-to-end pipeline, connector, successful run, failed
  run, lineage graph, monitoring incident, and analytics dataset in demo tenant.
  *(2026-07-13: scripts/demo-seed.sh run against the deployed box; incident
  surfaces via monitoring overview — pipeline_alerts row creation tracked as a
  separate gap.)*
- [x] Run deployed Playwright smoke flows at desktop and 390 px; include login,
  create/save/activate/run, run detail, connector failure, and logout.
  *(2026-07-13: ui-desktop and ui-mobile-390 journeys green against the
  deployed box; found + worked around a 390 px overlap on the run drawer link —
  Gate 1 mobile IA scope.)*
- [x] Verify Google/OIDC token audience, issuer, and expiry; rate-limit refresh,
  webhook, OpenLineage, and billing-public routes.
- [x] Disable owner self-service paid-feature mutation unless an internal demo
  flag is explicitly enabled.
- [x] Add visible release banner stating demo topology is single-zone and not HA.

## Gate 1 — ten daily users / 10K stored DAGs

- [x] Replace `GET /api/pipelines` full-definition list with keyset pagination,
  a summary projection, server-side stage/trigger/search filters, and separate
  detail fetch. Acceptance: p95 under 300 ms with 10K definitions.
  *(2026-07-15: shipped; follow-up composite indexes on pipelines
  (tenant_id,created_at,id) and executions(pipeline_id,started_at) added same
  day (db/024) — confirmed via EXPLAIN on the deployed box that both the list
  scan and its per-row last-run lookup use an Index Scan, not sequential.)*
- [x] Add pipeline definition limits: nodes, edges, config bytes, fan-out,
  max-parallel, page size, and backfill partitions. Reject before persistence.
- [x] Cap payload reads and merged refs; stream or spill large merges. Acceptance:
  worker RSS stays within its configured limit for worst allowed input.
  *(2026-07-15: review caught two bugs before landing — an S3 ciphertext-vs-
  plaintext size-cap mismatch that would reject legitimate near-limit payloads,
  and an unbounded merge write-back that defeated the RSS guarantee — both fixed.)*
- [x] Batch PostgreSQL/MySQL/Snowflake writes and MongoDB bulk upserts; reuse
  bounded worker-scoped connection pools. Acceptance: no connection-per-page
  churn and documented pool caps per tenant/provider.
- [x] Add lifecycle retention for executions, node runs, payloads, audit data,
  outboxes, object storage, Redis streams, and Temporal histories.
  *(2026-07-15: S3-backed payload objects have no age index in-app — closed
  same day with an S3 bucket lifecycle rule at the infra layer instead
  (infra/payload-retention.tf), gated no-op until a bucket is configured.)*
- [ ] Move production metadata to Cloud SQL HA with PITR; Redis to Memorystore or
  replace event delivery with Pub/Sub; payloads to GCS with lifecycle/versioning;
  select a backed-up ClickHouse service.
  *(Deferred: real recurring cloud spend + live cutover, needs explicit sign-off
  before starting.)*
- [x] Add SSRF protection for HTTP connectors, webhooks, alerts, and user-provided
  endpoints: HTTPS policy, DNS/IP revalidation, private/metadata denylist, egress policy.
- [ ] Make refresh rotation atomic; add email verification, password reset,
  MFA-ready session model, session revocation, and admin/editor/operator/viewer roles.
  *(Deferred: security-critical, each sub-item needs its own scoped design pass.)*
- [x] Add CSP/HSTS at HTTPS edge, Kubernetes NetworkPolicies, resource requests
  and limits, non-root/read-only security contexts where images permit.
  *(2026-07-15: kind's default kindnet CNI does not enforce NetworkPolicy —
  policies are correct and in place but inert until a real CNI is used.)*
- [x] Fix mobile editor information architecture and all WCAG 2.1 AA findings:
  touch targets, contrast, headings, labels, focus, keyboard paths, and screen-reader names.
  *(2026-07-15: review caught the first pass fixed AppShell's touch
  targets/labels but skipped the actual canvas editor rail — closed; a same-day
  follow-up rebuilt the rail as a horizontal bottom bar with visible labels
  below the sm breakpoint instead of a cramped vertical strip.)*
- [x] Break `PipelineCanvasPage` into feature components and move API state to a
  typed query/cache layer with abortable requests and shared errors.
- [x] Add CI: deployed E2E smoke, secret scan, CodeQL/SAST, dependency and license
  review, IaC/container scan, SBOM, image digest/signature, Helm render, Terraform validate.
  *(2026-07-15: review caught the license-review job had no license policy
  (vuln-only) — deny-licenses list added. Deployed E2E smoke stays manual/
  on-demand — CI runners have no live URL to target.)*

### dbt + DuckDB transformation POCs — deferred

This is a non-gating investigation. It does not block Gate 1 or Gate 2. Product
implementation starts only after every POC passes and the execution model is
explicitly approved.

- [ ] Build a Python 3.12 activity-worker image with pinned `dbt-core`,
  `dbt-duckdb`, and DuckDB dependencies for amd64 and arm64.
- [ ] Prove two named DataRef inputs can be joined and aggregated through an
  ephemeral dbt project, returning the result as an encrypted DataRef.
- [ ] Measure execution with a 1 GiB worker limit, one DuckDB thread, a 384 MiB
  DuckDB memory limit, the existing 10 MiB per-ref and 50 MiB aggregate-input
  limits, and bounded temporary disk.
- [ ] Prove Temporal timeout and cancellation, process-group termination, retry
  isolation, and temporary-workspace cleanup.
- [ ] Verify restrictions on file, network, environment, extension, and DuckDB
  configuration access; ensure SQL, records, credentials, and secrets never
  appear in logs or retained artifacts.
- [ ] Record POC results and approve or reject the trusted-owner,
  existing-activity-worker execution model. Any dependency, architecture,
  security, resource, or cancellation failure is a no-go and requires
  reassessing an isolated runner.
- [ ] After POC approval, implement `transform.dbt-duckdb` as an entitled,
  owner-only workflow transform with named input aliases, inline SQL/Jinja,
  structured dbt tests, encrypted DataRef output, and additive data-quality
  results.
- [ ] Roll out with the entitlement disabled, enable it first in one test
  workspace, and retain entitlement disablement as the rollback.

Initial POC target: Python 3.12, `dbt-core==1.10.22`,
`dbt-duckdb==1.10.1`, and `duckdb==1.4.4`. V1 remains limited to current
normalized batch connector outputs and DataRef limits. Full dbt projects,
packages, macros, seeds, snapshots, persistent DuckDB databases, streaming SQL,
and large direct datasets are out of scope.

## Gate 2 — 100K stored DAGs / high-throughput data plane

- [ ] Define workload envelope: active schedules, starts/second, concurrent runs,
  p95 nodes/DAG, bytes/page, and retention. Build a reproducible load harness.
- [ ] Partition executions, node runs, alerts, audit, and payload metadata by time
  and tenant hash; validate pruning and tenant hot-spot behavior.
- [ ] Replace polling dispatch loops with horizontally scalable leased consumers;
  implement claim/reclaim, dead-letter handling, lag metrics, and idempotency keys.
- [ ] Add HPA/KEDA for API and workers using queue lag, start latency, CPU, and
  connector limits; add PDBs, anti-affinity, graceful drain, and rollout tests.
- [ ] Isolate connector concurrency per tenant/provider and introduce backpressure
  from sink capacity through activity queues.
- [ ] Version public events and domain commands. Stop cross-domain writes before
  extracting any service.
- [ ] Add SLOs and alerts for API latency/error rate, schedule-to-start latency,
  workflow failure, outbox lag, worker memory, DB saturation, and backup age.

## Gate 3 — one million stored DAGs

- [ ] Prove catalog query/index design with one million definitions and realistic
  version counts before selecting a new datastore.
- [ ] Separate schedule/start service if Temporal schedule operations or catalog
  scans become bottlenecks; shard by tenant/pipeline key with deterministic ownership.
- [ ] Extract connector execution/data plane only when independent deploy,
  security isolation, or capacity ownership is measured and domain tables are isolated.
- [ ] Establish tenant cells or partitions, noisy-neighbor quotas, per-cell blast
  radius, cross-cell control plane, and migration tooling.
- [ ] Decide single-region HA versus multi-region DR using explicit RTO/RPO and
  consistency requirements; test regional failover twice yearly.
- [ ] Run sustained and failure-injection tests at target starts/second and
  concurrency. “One million” is complete only with published capacity evidence.

## Explicit non-goals before evidence

- No microservices merely to match an architecture diagram.
- No Module Federation for one frontend team.
- No second metadata database without a measured PostgreSQL limit.
- No Kafka solely because Redis exists; choose a broker from durability,
  throughput, replay, and operating constraints.
- No certification claim before controls operate and evidence exists for a full
  audit period.
