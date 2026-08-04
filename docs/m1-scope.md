# M1 scope: crash-recovery demo + audit trail

One page. No implementation here — this is scoping only.

## 1. Crash-recovery demo

**What it proves:** Temporal stores workflow history durably (Cassandra), so
killing the `workflow-{test,prod}` container mid-run loses zero progress —
the run still reaches `completed` once the container comes back.

**How to run it:**

```bash
# 1. Seed a pipeline + demo account (if you don't already have one)
./scripts/demo-seed.sh

# 2. Run the crash-recovery demo against that pipeline's rowId
PIPELINE_ID=<rowId printed as "pipeline (ok) <rowId>"> \
  ./scripts/crash-recovery-demo.sh
```

It logs a timeline (`started` → `killed worker at node checkpoint N/M` →
`resumed` → `completed`/`failed`) and exits 0 only if the run completed after
the kill+restart. See the script header for all env vars (`BASE_URL`,
`AUTH_EMAIL`/`AUTH_PASSWORD`, `KILL_DELAY`, `POLL_INTERVAL`, `MAX_ATTEMPTS`).

**What the website GIF should show** (screen recording of the script's
terminal output, or a split view with Temporal UI at `localhost:8082` on one
side):
1. `./scripts/crash-recovery-demo.sh` running, execution ID printed.
2. The `[HH:MM:SS] killed worker at node checkpoint …` line, ideally paired
   with a `docker ps` pane showing the `workflow-test` container flip to
   `Exited`.
3. The `worker container restarted` line, then `resumed`.
4. The final `✓ crash-recovery demo passed …` line.
5. Optional: the Temporal UI workflow history page for the run, showing the
   history unbroken across the kill (no gap, no new run).

Known ceiling (see `ponytail:` comment in the script): the timeline reports a
*count* of completed nodes at kill time, not the specific in-flight node ID —
the workflow's Temporal query handler doesn't track "currently running," only
finished node results. Good enough for narration ("worker died after 1 of 3
nodes"); not precise enough to highlight one node by name in the recording.

## 2. Audit trail surfacing

### Current state
- `audit_log` table exists (`db/002_auth.sql:59`) and is written on most
  mutating actions via `server.audit()` (`apps/workflow-go/internal/api/auth.go:143`).
- The only way to see it today is `GET /api/edition/audit-export`
  (`apps/workflow-go/internal/api/routes_core.go:62,111`), which is:
  - gated behind the `governance` feature flag (paid edition/entitlement),
  - gated to `owner` role only (`owner()` middleware),
  - CSV download only, no filtering/pagination, no in-app UI.
- The only web UI touchpoint is a "Download audit CSV" button on
  `apps/web/src/pages/BillingPage.tsx:183`, calling `api.ts:212`. There is no
  audit page, table, or per-run "who did this" surfacing anywhere else in
  `apps/web/src/pages/`.

### Gap: showing audit trail to ordinary (non-owner) users

| Item | What's needed | Size |
|---|---|---|
| Read-only audit list API for non-owners | Either drop `owner()` off a *new* JSON list endpoint (keep `auditExport`'s CSV owner-only), or add `GET /api/audit` returning paginated rows (`created_at, action, resource, user_id, ip_address` — reuse `auditExport`'s query, add `LIMIT/OFFSET` or keyset pagination, drop `metadata` or redact it since it can contain free-form details). Role check: any authenticated tenant member (viewer+), no `governance` gate — audit visibility for your own actions shouldn't require the paid feature. | S |
| Audit page in `apps/web` | New `apps/web/src/pages/AuditPage.tsx`: table of `GET /api/audit` rows with basic filters (action, date range — same shape as `executionList`'s query params for consistency), nav entry alongside `TeamPage.tsx`/`SettingsPage.tsx`. | S–M |
| Per-run audit surfacing | On `RunDetailPage.tsx`, show "triggered by / retried by" using existing `action='execution.started'\|'execution.retried'` rows filtered by `resource=<executionId>` — one extra query param on the new endpoint (`?resource=`), a small panel in the page. | S |
| User-facing action labels | `action` values are internal strings (`pipeline.saved`, `execution.retried`, `auth.login`, …) — needs a small display-name map in the frontend so the list reads like an activity feed, not a log dump. | S |
| Metadata redaction for non-owner view | `metadata` jsonb can carry things like `retryOf`, `environment` — fine — but confirm nothing sensitive gets written into it elsewhere before exposing it below owner role (spot check `s.audit(...)` call sites). | S |

No item above requires schema changes; `audit_log` already has everything
needed. The work is entirely: one new (or loosened) API route + one new web
page + a small panel on an existing page.
