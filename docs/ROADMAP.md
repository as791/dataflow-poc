# DataFlow roadmap

Updated: 2026-07-10

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

- [ ] Replace `GET /api/pipelines` full-definition list with keyset pagination,
  a summary projection, server-side stage/trigger/search filters, and separate
  detail fetch. Acceptance: p95 under 300 ms with 10K definitions.
- [ ] Add pipeline definition limits: nodes, edges, config bytes, fan-out,
  max-parallel, page size, and backfill partitions. Reject before persistence.
- [ ] Cap payload reads and merged refs; stream or spill large merges. Acceptance:
  worker RSS stays within its configured limit for worst allowed input.
- [ ] Batch PostgreSQL/MySQL/Snowflake writes and MongoDB bulk upserts; reuse
  bounded worker-scoped connection pools. Acceptance: no connection-per-page
  churn and documented pool caps per tenant/provider.
- [ ] Add lifecycle retention for executions, node runs, payloads, audit data,
  outboxes, object storage, Redis streams, and Temporal histories.
- [ ] Move production metadata to Cloud SQL HA with PITR; Redis to Memorystore or
  replace event delivery with Pub/Sub; payloads to GCS with lifecycle/versioning;
  select a backed-up ClickHouse service.
- [ ] Add SSRF protection for HTTP connectors, webhooks, alerts, and user-provided
  endpoints: HTTPS policy, DNS/IP revalidation, private/metadata denylist, egress policy.
- [ ] Make refresh rotation atomic; add email verification, password reset,
  MFA-ready session model, session revocation, and admin/editor/operator/viewer roles.
- [ ] Add CSP/HSTS at HTTPS edge, Kubernetes NetworkPolicies, resource requests
  and limits, non-root/read-only security contexts where images permit.
- [ ] Fix mobile editor information architecture and all WCAG 2.1 AA findings:
  touch targets, contrast, headings, labels, focus, keyboard paths, and screen-reader names.
- [ ] Break `PipelineCanvasPage` into feature components and move API state to a
  typed query/cache layer with abortable requests and shared errors.
- [ ] Add CI: deployed E2E smoke, secret scan, CodeQL/SAST, dependency and license
  review, IaC/container scan, SBOM, image digest/signature, Helm render, Terraform validate.

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
