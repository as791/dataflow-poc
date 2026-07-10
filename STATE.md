# Loop State

Updated: 2026-07-10 (analytics enterprise loop)

## Analytics enterprise loop (2026-07-10)

Branch `feat/ai-pipeline-builder`, commits `a9bc022` (persisted box hotfixes), `787b918`/P0, `5e09c75`/P1–P3. Deployed via box build → kind load → rollout restart.

- [x] P0 bugs fixed: saved dashboards froze absolute time window (now relative `timeRangeHours`), time-range select desync, phantom dirty flag from react-grid-layout mount event, ClickHouse Float64-vs-string filter errors (typed `sqlLiteral`). **Verified live.**
- [x] P0 features: filter rows in widget modal, edit-widget-in-place, share button. **Verified live.**
- [x] P1: paginated `GET /api/analytics/datasets/{name}/rows` + DatasetPreview browse modal. **Verified live.**
- [x] P2: area/stat charts, `bucket` time-series group-by (toStartOfInterval), auto-refresh, CSV export. **Bucket API verified live; new chart types UI-only, not yet exercised live.**
- [x] P3: share list/revoke endpoints + ShareModal, delete/share gated to creator-or-owner, ClickHouse guardrails (max_execution_time=10, max_rows_to_read=10M). **Revoke lifecycle verified live.**
- Deployed test coverage extended in `p1-analytics.spec.ts`: typed numeric filters, row pagination, bucketed aggregates, invalid bucket 400, share revoke lifecycle.
- Note: box's live uncommitted hotfixes (nginx timeout, AI routes, connectors) are now committed as `a9bc022` — box tree is clean w.r.t. branch.

## Suite status (deployed, 2026-07-06 run 2)

8 passed, 26 failed, 6 skipped. **Zero rate-limit failures** (was 26). All remaining failures are missing connectors in fresh qa-primary workspace: s3 (most tests), mysql, mongodb, clickhouse, kafka, postgres, google — plus QA_WEBHOOK_URL unset. Human-only: needs real AWS keys, DB hosts/creds, Google OAuth in workspace UI.

## Actionable

- [ ] Connect Google, S3, PostgreSQL, MySQL, MongoDB, ClickHouse, Kafka connectors in the **new** QA workspace (tenant `qa-primary`, aryamansinha123+qa@gmail.com) — fresh tenant, zero connectors. Also add `qa-aws-s3-denied` S3 connection per README.
- [ ] Set remaining fixture env vars in secrets/qa.env (AWS_QA_BUCKET, GOOGLE_QA_*_SPREADSHEET_ID, QA_*_TABLE/TOPIC/COLLECTION, QA_WEBHOOK_URL), then rerun full `npm -w apps/web run test:deployed`.

## QA accounts (2026-07-06)

- Primary: aryamansinha123+qa@gmail.com (tenant qa-primary), secondary: aryamansinha123+qa2@gmail.com (tenant qa-secondary). Passwords in gitignored `secrets/qa.env`, auto-loaded by `playwright.deployed.config.ts`.

## Done (2026-07-06)

- [x] Deployed suite login rate-limit fix: token cached per worker in `apps/web/tests/deployed/deployed-api.ts` (was 40+ logins/run vs 10/min server cap → 26 test failures). Typecheck clean.

## Done (2026-07-06, cont.)

- [x] Mongo TLS/SRV connector fix (databases.go) — deployed, verified live.
- [x] S3 connector bad `endpoint` field cleared (DB fix, no redeploy needed).
- [x] Rate-limit handling in deployed test scripts — retry-with-backoff on 429, root cause was shared per-IP bucket across manual probing + test runs.
- [x] Google Drive API + Sheets API were never enabled on GCP project `data-pipeline-poc-500418` — enabled both, fixed 2 failing tests.
- [x] qa-primary tenant quota bumped to 5005/month (was 5).

## Deploy gotcha (found 2026-07-07)

`sudo docker build -t dataflow-app:local .` on the deployed box builds into the **host's** Docker daemon — it does NOT automatically become visible to the `kind` cluster's containerd. Every redeploy needs an explicit `sudo kind load docker-image --name dataflow dataflow-app:local` after the build, before `kubectl rollout restart`. Skipped this on 2-3 earlier iterations; pods silently kept running the old binary despite successful builds and restarts (`crictl images` on the kind node showed a stale digest while `docker images` on host showed the new one). Confirmed no fixes were lost — re-verified gsheets/S3/mongo fixes all still hold post-correction.

## AI pipeline builder — 3-layer timeout chain fixed (2026-07-07)

Ollama on this box is CPU-only (~4 tok/s), a generate/refine call can take 1-4 minutes. Three independent timeouts were all shorter than that, each masking the next:
1. Playwright client default (30s) → fixed: `api.post()` now takes an explicit timeout param, AI tests pass 290_000ms.
2. Go server's own client to Ollama (`routes_ai.go` `client.Timeout`, was 2min) → fixed: 4min.
3. **`apps/web/nginx.conf` `/api/` `proxy_read_timeout` (was 120s)** → fixed: 300s. This one was the sneaky one — lives in the `web` image, not obviously related to AI at all, discovered via `ss -tlnp` finding a *native* Caddy process (not the docker container) forwarding everything to the web pod's own internal nginx.
All three fixed and verified live. Remaining gap: model output itself is unreliable for the 3-node DAG task (wrong node type / missing nodes across different runs) — a model-capability limit, not infra.

## Watch

- Postgres (Supabase pooler `aws-0-ap-southeast-2.pooler.supabase.com`): persistent "tenant/user not found" — external Supabase-side issue, not our config. Direct host is IPv6-only, unreachable from this GCE box — not a viable workaround. Revisit after some time for propagation.
- GitHub incremental-watermark test hits GitHub's unauthenticated rate limit (60/hr) from repeated runs — self-resolves hourly, or add a GitHub token to that connector.
- 2 Google Sheets tests fail on data-content assertions (pipeline executes fine now) — likely fixture-sheet drift from earlier partial test runs, needs the QA sheet reset or the assertions re-checked.
- `.claude/skills/enterprise-readiness/SKILL.md` is stale: describes Express/TypeScript API (`apps/api`) but main tree is now Go backend (`apps/workflow-go`). Update before next enterprise-readiness loop.
