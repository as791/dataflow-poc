---
description: Enterprise readiness build skill for dataflow-poc. Covers architecture, current gaps, P0–P3 priorities, and loop engineering execution pattern.
---

# Enterprise Readiness — dataflow-poc

## What this app is

Multi-tenant data pipeline platform (n8n-style open-core). React/Vite frontend, Express/TypeScript API, Temporal workflow engine (Go worker), Postgres + Redis. Pipelines defined as DAGs (ReactFlow canvas + Mermaid editor). Connectors: Zendesk, Postgres, MySQL, MongoDB, Kafka, S3, ClickHouse, Google Sheets, REST.

## Dev environment startup

```bash
bash scripts/dev-start.sh
# Web: http://localhost:3002
# API: http://localhost:4000
# Dev login (bypass Google OAuth): http://localhost:4000/dev/login
```

Postgres: `dataflow-postgres-local` docker container (port 5432)
Redis: `dataflow-poc-redis-1` docker container (local 6379)
Temporal: NOT running in dev — all pipeline execution fails (expected)

## Critical architectural facts

- API auth: Google OAuth SSO → JWT (15m) + refresh token rotation (30d, DB-backed, SHA256-hashed)
- Pipeline validation: `packages/shared/src/safe-expression.ts` + `apps/api/src/lib/validatePipeline.ts`
- Mermaid-parsed nodes have `config: {}` — sink nodes (postgres, mysql, etc.) require `connectionId` before save
- `syncSchedule` in `apps/api/src/temporal.ts` — gates Temporal connection behind cron check (fixed)
- `requireOwner` middleware checks `role === 'owner'` (not 'admin')
- Token rotation: reuse detected → entire chain revoked for that user
- Rate limiting via ioredis, fails open when Redis unreachable
- Tenant FK: pipelines.tenant_id references tenants table — seed user tenant_id = `aaaaaaaa-0000-0000-0000-000000000001`

## Enterprise readiness gaps (from ENTERPRISE_ROADMAP.md)

### P0 — Ship blockers (do these first)
1. **Pipeline RBAC** — only `owner`/`member` roles today; no resource-level permissions, no API/service accounts
2. **Object storage mandatory in prod** — DataRef encryption works but storage is optional; no retention/orphan cleanup
3. **Centralized log ingestion** — logs go to stdout/files, no structured retention or redaction pipeline
4. **Backup/restore** — no automated DB snapshot, no restore drills, no HA manifests

### P1 — Data reliability
1. **Backfill improvements** — no byte/row estimates, no failed-partition retry, no cancellation UI
2. **Sink idempotency checks** — no deduplication guarantee on re-delivery

### P2 — Connector ecosystem
1. **Connector SDK unification** — catalog duplicated in API, worker, web; should be single source
2. **Conformance tests** — no auth/pagination/rate-limit/CDC replay tests per connector
3. **Missing connectors** — Snowflake, BigQuery, Databricks, SFTP, Azure Blob, GCS

### P3 — Enterprise governance
1. **SAML/OIDC SSO + SCIM** — Google OAuth only today
2. **Git-backed pipelines** — no GitOps, no CI validation, no promotion approvals
3. **Usage/cost attribution** — no per-tenant/pipeline metering

## Loop engineering execution pattern

Each P0/P1 item follows this loop:

```
1. DISCOVER  — read current code, identify exact gap, list files to touch
2. IMPLEMENT — write minimum code in isolation (worktree preferred for big changes)
3. VERIFY    — spawn reviewer sub-agent, run type-check + tests
4. STATE     — update memory/MEMORY.md with what shipped and what's next
```

Sub-agent roles:
- **Explorer**: read-only, maps current state, returns file:line table
- **Implementer**: writes the diff, no scope creep beyond the P-item
- **Reviewer**: checks for security issues, FK constraints, missing validation, auth bypass

## Key files to know before touching anything

| Area | File |
|---|---|
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Pipeline validation | `apps/api/src/lib/validatePipeline.ts` |
| Shared types | `packages/shared/src/types.ts` |
| Connector catalog | `apps/worker/src/activities/catalog.ts` (duplicated in web/api) |
| DB schema | `db/migrations/` |
| Temporal wiring | `apps/api/src/temporal.ts` |
| Route index | `apps/api/src/index.ts` |
| Pipeline canvas | `apps/web/src/pages/PipelineCanvasPage.tsx` |

## Definition of done for enterprise-ready

Per `ENTERPRISE_ROADMAP.md`: automated integration tests against real services for restore, tenant isolation, connector replay, contract compatibility, alert delivery, and lineage import/export. UI builds + unit tests alone do not prove these gates.
