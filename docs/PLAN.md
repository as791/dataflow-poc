# DataFlow Platform — Implementation Plan

Status: **Superseded by implementation and ADR-001**
Last updated: 2026-06-25

> Historical implementation plan. Current Temporal persistence and worker
> architecture are defined in `docs/ADR-001-TEMPORAL-RUNTIME.md`: Cassandra
> stores Temporal history, Elasticsearch provides advanced visibility, Go owns
> workflows, and TypeScript owns activities.

This document captures the full plan to evolve the dataflow-poc into a multi-tenant SaaS platform with E2E encryption, OAuth connectors, billing, and analytics. Review and approve before implementation begins.

---

## Table of Contents

1. [Already Completed](#1-already-completed)
2. [Decisions Locked](#2-decisions-locked)
3. [Final Architecture](#3-final-architecture)
4. [Phase 0 — Foundations](#phase-0--foundations-2-days)
5. [Phase 1 — Multi-Tenant Auth, RLS, Email Verification](#phase-1--multi-tenant-auth-rls-email-verification-9-days)
6. [Phase 2 — OAuth Connectors](#phase-2--oauth-connectors-6-days)
7. [Phase 3 — Razorpay Billing & Workflow Metering](#phase-3--razorpay-billing--workflow-metering-5-days)
8. [Phase 4 — ClickHouse Hot + Cold Storage](#phase-4--clickhouse-hot--cold-storage-4-days)
9. [Phase 5 — Interactive Analytics UI](#phase-5--interactive-analytics-ui-7-days)
10. [Phase 6 — KMS + End-to-End Encryption](#phase-6--kms--end-to-end-encryption-13-days)
11. [Phase 7 — Docker Compose Final + Env Vars](#phase-7--docker-compose-final--env-vars-1-day)
12. [External Service Setup (`docs/SETUP.md`)](#12-external-service-setup-docssetupmd)
13. [Security Model Summary](#13-security-model-summary)
14. [Open Items](#14-open-items)

---

## 1. Already Completed

| Change | Files |
|---|---|
| Dockerfile fixes — `COPY` before `CMD`, `chmod +x` on `wait-for.sh`, removed `--omit=optional` (blocked native binaries on Linux ARM64) | `apps/{api,worker,web}/Dockerfile` |
| Worker uses `NativeConnection` with `TEMPORAL_ADDRESS` env var | `apps/worker/src/worker.ts` |
| Cassandra replaces Postgres as Temporal's history store | `docker-compose.yml` |

---

## 2. Decisions Locked

| Decision | Choice |
|---|---|
| Signup model | Self-serve with email verification |
| Forgotten password + E2E | BIP39 24-word recovery phrase shown at signup |
| Existing `'default'` tenant data | Wipe on migration |
| Sub-user invitation | Email link, 24h expiry |
| Worker RSA keypair storage | File mount `./secrets/worker-keypair.pem` (gitignored) |
| Storage of sink records | ClickHouse only (hot + cold tiered storage), drop Postgres `sink_records` |
| Audit log | Yes — append-only `audit_log` table in Postgres |
| Deployment target | Docker Compose only (K8s out of scope) |
| OAuth providers | Google (Sheets + Drive + Login), Microsoft (Excel), Zendesk |
| Billing model | Free tier: 5 executions/month/tenant. Then ₹100 per 5 additional executions via Razorpay |
| UI design system | Tailwind CSS + glassmorphism (frosted panels, gradient canvas, indigo accent) |

---

## 3. Final Architecture

### Storage Layout

```
Postgres (transactional / metadata)
├── tenants, users, refresh_tokens, email_verifications, user_invitations
├── pipelines, executions, node_runs
├── node_payloads (intermediate workflow data only)
├── connector_state, oauth_connections
├── billing_plans, usage_counters, payment_orders
├── dashboards
├── audit_log
└── key_rotation_log, user_key_shares (Phase 6)

ClickHouse (analytical / all sink records, hot + cold tiered)
├── sink_records   ← single table; TTL auto-moves Hot → Cold disk
└── execution_metrics

Cassandra (Temporal internal — workflow history only)
└── temporal, temporal_visibility keyspaces
```

### Service Topology (Docker Compose)

```
postgres        — app metadata
redis           — pub/sub, OAuth state nonces, rate limits
cassandra       — Temporal's history store
temporal        — workflow orchestration
temporal-ui     — Temporal dashboard
clickhouse      — sink data + analytics
mailhog         — local SMTP catcher (dev only)
api             — Express, JWT auth, all REST endpoints
worker          — Temporal worker, runs activities
web             — React SPA (nginx serves built bundle)
otel-collector, prometheus, grafana, jaeger — observability
```

### Auth & Tenant Context Flow

```
Browser → Login (email/pw or Google SSO)
  → API issues:
      - access JWT (15min) in Authorization header
      - refresh token (32B random) in httpOnly Secure SameSite=Strict cookie
  → Every API request: requireAuth middleware
      - Verifies JWT
      - Loads tenant_id, user_id, role into req.tenant
      - Opens per-request Postgres transaction with SET LOCAL app.tenant_id = '<uuid>'
      - Postgres RLS policies enforce tenant isolation on every query
```

---

## Phase 0 — Foundations (2 days)

**Goal:** Establish design system, middleware patterns, and shared type contracts that all phases depend on.

### Deliverables

#### Tailwind + Glass Design System
- `apps/web/package.json` — add `tailwindcss@^3`, `postcss`, `autoprefixer`
- `apps/web/tailwind.config.js` — glass color palette, custom backdrop-blur sizes, indigo brand color, canvas-gradient background image
- `apps/web/postcss.config.js`
- `apps/web/src/index.css` — `@tailwind base/components/utilities` + custom utility classes:
  - `.glass-panel` — `bg-glass-white backdrop-blur-glass border border-glass-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.37)]`
  - `.glass-card`, `.glass-input`, `.glass-btn-primary`, `.glass-btn-ghost`, `.glass-modal`
- Refactor `apps/web/src/App.tsx` — replace all inline `React.CSSProperties` with Tailwind utility classes. The 3-column grid (180px sidebar / canvas / 280px config) becomes responsive flex with glass panels.

#### Middleware Stubs
- `apps/api/src/middleware/auth.ts` — exports `requireAuth`. Initial stub sets `req.tenant = { tenantId: '<bootstrap-uuid>', userId: null, role: 'owner' }`. Real implementation in Phase 1.
- `apps/api/src/middleware/quota.ts` — exports `requireQuota`. Initial stub is a passthrough. Real implementation in Phase 3.
- `apps/api/src/middleware/audit.ts` — exports `auditLog(req, action, resource, metadata)` helper. Initial stub no-ops.
- `apps/api/src/middleware/tenantPg.ts` — exports `withTenantTx(req, fn)` that opens a Postgres transaction and runs `SET LOCAL app.tenant_id = $1`.
- `apps/api/src/index.ts` — chain: `app.use(cors())`, `express.json()`, `pinoHttp()`, `requireAuth`. All routes use `withTenantTx`.

#### Shared Types
- `packages/shared/src/types.ts`:
  - Add `TenantContext` interface
  - Augment Express `Request` declaration (`req.tenant`)
  - Add to `DynamicWorkflowInput`: `encryptedDek?: string; dekIv?: string` (Phase 6)
  - Add to `PipelineNode.config`: optional `oauthConnectionId?: string` (Phase 2)

#### React Router Setup
- `apps/web/package.json` — add `react-router-dom@^6`
- `apps/web/src/App.tsx` — wrap in `<BrowserRouter>`, define routes (most are stubs initially):
  - `/login`, `/register`, `/forgot-password`, `/verify-email`
  - `/` (pipeline canvas — current)
  - `/connectors`, `/billing`, `/analytics`, `/team`, `/settings`
- `apps/web/src/components/ProtectedRoute.tsx` — redirects unauthenticated users to `/login`

#### Setup Doc Skeleton
- `docs/SETUP.md` — skeleton sections for Razorpay, Google, Microsoft, Zendesk app registration. Filled out in Phases 2 & 3.

### Files Created in Phase 0

```
apps/web/tailwind.config.js
apps/web/postcss.config.js
apps/web/src/index.css
apps/web/src/components/ProtectedRoute.tsx
apps/api/src/middleware/auth.ts
apps/api/src/middleware/quota.ts
apps/api/src/middleware/audit.ts
apps/api/src/middleware/tenantPg.ts
docs/SETUP.md
docs/PLAN.md           ← this file
```

### Files Modified in Phase 0

```
apps/web/package.json
apps/web/src/App.tsx
apps/api/src/index.ts
packages/shared/src/types.ts
```

---

## Phase 1 — Multi-Tenant Auth, RLS, Email Verification (9 days)

**Goal:** Real authentication, per-tenant data isolation enforced by Postgres RLS, email verification, sub-user invitations, and audit logging.

### Database Migrations

#### `db/migrations/001_auth.sql`
```sql
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                    TEXT NOT NULL UNIQUE,
  password_hash            TEXT,                  -- bcrypt cost 12; null for SSO-only
  google_sub               TEXT UNIQUE,
  role                     TEXT NOT NULL DEFAULT 'member',  -- owner | member
  email_verified           BOOLEAN NOT NULL DEFAULT false,
  -- Phase 6 key material columns
  pbkdf2_salt              TEXT,
  encrypted_dek_password   TEXT,
  password_dek_iv          TEXT,
  encrypted_dek_recovery   TEXT,
  recovery_dek_iv          TEXT,
  recovery_phrase_used_at  TIMESTAMPTZ,
  public_key               TEXT,                  -- RSA-OAEP JWK
  encrypted_private_key    TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE email_verifications (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_invitations (
  token_hash  TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES users(id),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  resource    TEXT,
  metadata    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);
```

#### `db/migrations/002_tenant_uuid.sql`
- Drop existing data (per Q5 decision).
- Drop `sink_records` table entirely (moves to ClickHouse in Phase 4).
- Alter `pipelines.tenant_id`, `executions.tenant_id`, `connector_state.tenant_id`, `node_payloads.tenant_id`, `node_runs.tenant_id` from `TEXT` to `UUID REFERENCES tenants(id) ON DELETE CASCADE`.

#### `db/migrations/003_rls.sql`
```sql
-- Two Postgres roles
-- dataflow (existing) — superuser used only by migrations
-- dataflow_app — app role, subject to RLS

CREATE ROLE dataflow_app LOGIN PASSWORD '<from env>' NOSUPERUSER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dataflow_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO dataflow_app;
-- Append-only for audit_log
REVOKE UPDATE, DELETE ON audit_log FROM dataflow_app;

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pipelines
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- Repeat for executions, node_runs, connector_state, node_payloads, audit_log
-- (oauth_connections, dashboards, billing tables added in their own migrations)
```

API connects with `dataflow_app` role. Worker uses the same role. Temporal connects to Cassandra (separate concern).

### API Routes — `apps/api/src/routes/auth.ts`

```
POST   /api/auth/register
  Body: { email, password, tenantName }
  - Creates tenant
  - Creates user with email_verified=false, role='owner'
  - Generates email_verifications token (24h)
  - Sends verification email via nodemailer → mailhog (dev) / SMTP (prod)
  - Does NOT issue JWT yet — user must verify first
  - Returns 201 { message: "Check your email" }

POST   /api/auth/login
  Body: { email, password }
  - Verifies bcrypt
  - Requires email_verified=true (otherwise 403 "Verify your email")
  - Issues access JWT (15min) + refresh token (httpOnly cookie)
  - Audit log: 'login.password'

POST   /api/auth/logout
  - Revokes refresh token (delete row)
  - Clears cookie
  - Audit log: 'logout'

POST   /api/auth/refresh
  - Rotates refresh token, issues new access JWT
  - Detects reuse (token already revoked) → revoke all tokens for user as a session-hijack defense

GET    /api/auth/me
  - Returns { user, tenant }

GET    /api/auth/verify?token=<base64>
  - Validates token, sets email_verified=true, deletes token row
  - Auto-issues JWT + cookie (one-click verification → logged in)
  - Audit log: 'email.verified'

POST   /api/auth/resend-verification
  Body: { email }
  - Rate-limited via Redis (1 per 60s per email)

GET    /api/auth/google                   — redirect to consent
GET    /api/auth/google/callback          — code exchange, upsert user (google_sub),
                                            auto-marks email_verified=true,
                                            issues JWT, audit 'login.google'

POST   /api/auth/forgot-password
  Body: { email }
  - Stub initially. Full implementation in Phase 6 (uses BIP39 recovery phrase on client).
```

### API Routes — `apps/api/src/routes/team.ts`

```
POST   /api/team/invitations              — owner-only
  Body: { email, role }
  - Creates user_invitations row (24h)
  - Sends invite email
  - Audit log: 'team.invited'

GET    /api/team/invitations              — list pending
DELETE /api/team/invitations/:id          — revoke
GET    /api/team/members                  — list users in tenant

GET    /api/auth/accept-invite?token=X    — validates token, prefills register form
                                            (no auth required)
POST   /api/auth/accept-invite            — creates user under invitee's tenant
                                            with role from invitation
```

### Worker

- Postgres pool uses `dataflow_app` role.
- Worker activities that touch tenant data set `app.tenant_id` per call.

### Web — `apps/web/src/pages/`

```
LoginPage.tsx          — glass card, email/pw + "Sign in with Google" button
RegisterPage.tsx       — email/pw + tenant name + Glass UI password strength meter
                          On submit: triggers Phase 6 key generation (browser-only),
                          then POST /api/auth/register
VerifyEmailPage.tsx    — handles /verify-email?token=... — shows success/failure
ForgotPasswordPage.tsx — stub initially
AcceptInvitePage.tsx   — handles /accept-invite?token=... — prefills register form
TeamPage.tsx           — owner-only: list members + invites + "Invite by email" form
```

### Web — `apps/web/src/context/AuthContext.tsx`

- Provides `{ user, tenant, accessToken, login(email, pw), loginGoogle(), logout(), refresh() }`
- On mount: try `/api/auth/me`; if 401, try refresh; if still 401, set unauthenticated
- Auto-refresh 60s before access token expiry
- 401 interceptor on fetch wrapper triggers single refresh attempt

### Email Infrastructure

- `nodemailer` added to API
- New service `mailhog` in `docker-compose.yml`:
  ```yaml
  mailhog:
    image: mailhog/mailhog:v1.0.1
    ports: ["8025:8025"]   # web UI
    networks: [dataflow]
  ```
- Env vars: `SMTP_HOST=mailhog`, `SMTP_PORT=1025`, `SMTP_FROM=noreply@dataflow.local`
- Email templates live in `apps/api/src/email/templates/` (verify.html, invite.html, payment-receipt.html). Simple HTML with inline styles for email-client compatibility.

### Files Created in Phase 1

```
db/migrations/001_auth.sql
db/migrations/002_tenant_uuid.sql
db/migrations/003_rls.sql
apps/api/src/routes/auth.ts
apps/api/src/routes/team.ts
apps/api/src/email/mailer.ts
apps/api/src/email/templates/verify.html
apps/api/src/email/templates/invite.html
apps/web/src/pages/{Login,Register,VerifyEmail,ForgotPassword,AcceptInvite,Team}Page.tsx
apps/web/src/context/AuthContext.tsx
```

### Files Modified in Phase 1

```
apps/api/src/middleware/auth.ts     — real JWT + RLS implementation
apps/api/src/middleware/audit.ts    — real audit_log writes
apps/api/src/routes/{pipelines,executions,triggers}.ts  — use req.tenant.tenantId
apps/api/src/db.ts                  — connect as dataflow_app, withTenantTx helper
docker-compose.yml                  — add mailhog, env vars
.env.example                        — JWT_SECRET, SMTP_*, GOOGLE_CLIENT_*
```

### Security Considerations
- Refresh tokens are 32 random bytes, stored as SHA-256 hash
- Refresh-token rotation with reuse detection (revoke entire chain on reuse — session-hijack defense)
- Google OAuth uses `state` param tied to Redis nonce (5min TTL, CSRF protection)
- Rate limits via Redis on `/login`, `/resend-verification`, `/forgot-password` (10 req/min/IP)
- Email tokens are 32 random bytes; stored as SHA-256 hash; 24h TTL
- Sensitive fields never logged: passwords, JWTs, refresh tokens, OAuth tokens

---

## Phase 2 — OAuth Connectors (6 days)

**Goal:** Replace env-var-based credentials with per-tenant OAuth for Google (Sheets + Drive), Microsoft (Excel), Zendesk. Interactive UI pickers in the pipeline editor.

### Connector Matrix

| Connector | Provider | Scopes |
|---|---|---|
| Google Sheets | Google | `spreadsheets.readonly` |
| Google Drive | Google | `drive.readonly` |
| Microsoft Excel | Microsoft (Azure AD) | `Files.Read`, `Sites.Read.All`, `offline_access`, `User.Read` |
| Zendesk | Zendesk (per-subdomain) | `read` |

Note: Google Sheets + Drive share one OAuth flow (combined scope list).

### Database — `db/migrations/004_oauth.sql`

```sql
CREATE TABLE oauth_connections (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL,            -- 'google' | 'microsoft' | 'zendesk'
  provider_account_email TEXT,                     -- display label
  scopes                 TEXT[] NOT NULL,
  access_token           TEXT NOT NULL,            -- encrypted at rest (Phase 6 hardens)
  refresh_token          TEXT NOT NULL,            -- encrypted at rest
  expires_at             TIMESTAMPTZ NOT NULL,
  extra                  JSONB,                    -- e.g. { subdomain: 'acme' } for Zendesk
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, user_id, provider, provider_account_email)
);
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON oauth_connections
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

**Token-at-rest encryption (before Phase 6 KMS):** AES-256-GCM with `OAUTH_TOKEN_ENCRYPTION_KEY` (32 bytes from env). Phase 6 supersedes this with per-tenant DEK.

### API Routes — `apps/api/src/routes/connectors.ts`

```
GET    /api/connectors                              — list all connections for tenant
DELETE /api/connectors/:connectionId                — revoke + delete
POST   /api/connectors/:connectionId/refresh        — force refresh

# Google
GET    /api/connectors/google/auth                  — redirect to Google consent
GET    /api/connectors/google/callback              — exchange code, store tokens
GET    /api/connectors/google/spreadsheets          — list Drive-visible spreadsheets
GET    /api/connectors/google/spreadsheets/:id/sheets       — list tabs
GET    /api/connectors/google/spreadsheets/:id/sheets/:name/preview
GET    /api/connectors/google/drive/folders         — browse folder tree
GET    /api/connectors/google/drive/files/:id/preview

# Microsoft
GET    /api/connectors/microsoft/auth               — Azure AD OAuth
GET    /api/connectors/microsoft/callback
GET    /api/connectors/microsoft/drives             — list OneDrive + SharePoint
GET    /api/connectors/microsoft/drives/:driveId/items
GET    /api/connectors/microsoft/workbooks/:itemId/sheets
GET    /api/connectors/microsoft/workbooks/:itemId/sheets/:name/preview

# Zendesk
POST   /api/connectors/zendesk/auth                 — body: { subdomain } → redirect
GET    /api/connectors/zendesk/callback
GET    /api/connectors/zendesk/resources            — tickets/users/orgs available on this account
```

OAuth `state` param tied to Redis nonce (5min TTL) for CSRF.

### Worker

#### `apps/worker/src/activities/connectors/oauth-client.ts`
```typescript
export async function getOAuthToken(connectionId: string, tenantId: string): Promise<string>
// Loads from oauth_connections, refreshes if expired, returns plaintext access_token
// All 4 connectors call this — single source of truth for token lifecycle
```

#### Modified connectors
- `gsheets.ts`, `gdrive.ts`, `zendesk.ts`: remove env-var auth, call `getOAuthToken(config.connectionId, tenantId)`
- New `excel.ts`: Microsoft Graph API client. Reads `/me/drive/items/{id}/workbook/worksheets/{name}/usedRange`. Row-hash diffing for incremental mode (same pattern as Sheets).

### Web — `apps/web/src/pages/ConnectorsPage.tsx`

Glass UI showing one card per provider:
```
┌──────────────────────────────────────────────┐
│ [G] Google                          ✓ Active │
│     aryaman@gmail.com                 ✕     │
│     Connected 2 days ago                     │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ [M] Microsoft                  ○ Not connected│
│                              [Connect ►]      │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ [Z] Zendesk                        ✓ Active │
│     acme.zendesk.com                  ✕     │
│ [+ Connect another Zendesk subdomain]        │
└──────────────────────────────────────────────┘
```

### Web — Pipeline Node Config Updates

`apps/web/src/catalog.ts`: replace plain-text `spreadsheetId` field with new field type `oauth-picker`. New components:

- `apps/web/src/components/connectors/SheetPicker.tsx` — Google Sheets picker
- `apps/web/src/components/connectors/DrivePicker.tsx` — Google Drive file tree
- `apps/web/src/components/connectors/ExcelPicker.tsx` — Microsoft Excel picker
- `apps/web/src/components/connectors/ZendeskPicker.tsx` — Subdomain + resource picker
- `apps/web/src/components/connectors/SheetPreview.tsx` — Reusable 5-row preview

### Setup Doc

`docs/SETUP.md` filled in with step-by-step OAuth app registration:

#### Google Cloud Console
1. Go to console.cloud.google.com → create project "DataFlow"
2. APIs & Services → Library → enable: Google Sheets API, Google Drive API
3. OAuth consent screen → External → app name, support email
4. Scopes: `userinfo.email`, `userinfo.profile`, `spreadsheets.readonly`, `drive.readonly`
5. Add test users while in dev mode
6. Credentials → Create OAuth client ID → Web application
7. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback` (login)
   - `http://localhost:3000/api/connectors/google/callback` (connector)
8. Copy to `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

#### Microsoft Azure AD
1. portal.azure.com → Microsoft Entra ID → App registrations → New
2. Name: "DataFlow", Supported accounts: "Accounts in any organizational directory and personal Microsoft accounts"
3. Redirect URI: Web → `http://localhost:3000/api/connectors/microsoft/callback`
4. Certificates & secrets → New client secret (copy value once)
5. API permissions → Microsoft Graph → Delegated:
   - `Files.Read`, `Sites.Read.All`, `offline_access`, `User.Read`
6. Grant admin consent
7. `.env`: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID=common`

#### Zendesk OAuth
1. In Zendesk admin (per subdomain): Apps and integrations → APIs → OAuth Clients → Add
2. Identifier: `dataflow`
3. Redirect URI: `http://localhost:3000/api/connectors/zendesk/callback`
4. Copy Unique Identifier + Secret
5. `.env`: `ZENDESK_OAUTH_CLIENT_ID`, `ZENDESK_OAUTH_CLIENT_SECRET`

### New Packages
- API: `googleapis`, `@azure/msal-node`
- Worker: same set
- Web: none new

---

## Phase 3 — Razorpay Billing & Workflow Metering (5 days)

**Goal:** Track workflow executions per tenant per month, gate beyond free tier, accept Razorpay payments to unlock quota.

### Database — `db/migrations/005_billing.sql`

```sql
CREATE TABLE billing_plans (
  tenant_id          UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  free_tier_limit    INT NOT NULL DEFAULT 5,
  price_per_5_paise  INT NOT NULL DEFAULT 10000,    -- ₹100 in paise
  extra_quota        INT NOT NULL DEFAULT 0,        -- purchased beyond free tier
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE usage_counters (
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month            DATE NOT NULL,                   -- first day of month
  execution_count  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, month)
);

CREATE TABLE payment_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  razorpay_order_id    TEXT NOT NULL UNIQUE,
  razorpay_payment_id  TEXT UNIQUE,                 -- set on capture
  amount_paise         INT NOT NULL,
  quota_units          INT NOT NULL,                -- 1 unit = 5 executions
  status               TEXT NOT NULL DEFAULT 'created',  -- created | paid | failed
  created_at           TIMESTAMPTZ DEFAULT now(),
  paid_at              TIMESTAMPTZ
);

ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
-- (policies same as other tables)
```

### Quota Middleware (real implementation)

```typescript
// apps/api/src/middleware/quota.ts
export async function requireQuota(req, res, next) {
  const month = startOfMonthUTC();
  const plan = await loadPlan(req.tenant.tenantId);
  const used = await loadCounter(req.tenant.tenantId, month);
  const limit = plan.free_tier_limit + plan.extra_quota;
  if (used >= limit) {
    return res.status(402).json({
      error: 'Quota exceeded',
      used, limit,
      buyUrl: '/billing'
    });
  }
  next();
}
```

Applied to: `POST /api/pipelines/:id/run`, `POST /api/hooks/:path`, event-triggered execution dispatcher.

After firing execution, atomically:
```sql
INSERT INTO usage_counters (tenant_id, month, execution_count) VALUES ($1, $2, 1)
ON CONFLICT (tenant_id, month) DO UPDATE SET execution_count = usage_counters.execution_count + 1
```

### API Routes — `apps/api/src/routes/billing.ts`

```
GET   /api/billing/usage               — { used, limit, free_tier, extra_quota, daysUntilReset }
POST  /api/billing/orders              — body: { units: number }
                                         creates Razorpay order, persists payment_orders row
                                         returns { orderId, amount, currency, razorpayKey }
POST  /api/billing/webhook             — Razorpay webhook (no auth, HMAC verified)
                                         on payment.captured:
                                           - verify signature against RAZORPAY_WEBHOOK_SECRET
                                           - check payment_orders.status != 'paid' (idempotent)
                                           - increment billing_plans.extra_quota by units × 5
                                           - set payment_orders.status='paid', paid_at=now()
                                           - audit log: 'payment.captured'
GET   /api/billing/history             — list payment_orders
```

### Web — `apps/web/src/pages/BillingPage.tsx`

Glass UI:
```
┌─────────────────────────────────────────────────┐
│  Usage this month                               │
│  ████████████░░░░░░  12 / 20 executions         │
│                                                 │
│  Free tier: 5 / month                           │
│  Purchased: 15 (3 units × 5)                    │
│  Resets in: 17 days                             │
│                                                 │
│  [+ Buy 5 more executions — ₹100]               │
└─────────────────────────────────────────────────┘

Recent payments
─────────────────────────────────────────────────
  May 12, 2026   ₹100  Captured   Receipt →
  Apr 28, 2026   ₹200  Captured   Receipt →
```

Razorpay Checkout.js loaded as inline script. On payment-success callback, polls `/api/billing/usage` every 2s until extra_quota updates (webhook race protection).

### Setup Doc

`docs/SETUP.md` Razorpay section:
1. Sign up at razorpay.com → activate test mode
2. Dashboard → Settings → API Keys → Generate Test Key → copy Key ID + Secret
3. Settings → Webhooks → Add new webhook
   - URL: `https://<your-domain>/api/billing/webhook` (use ngrok for local dev: `ngrok http 3000`)
   - Active events: `payment.captured`, `payment.failed`, `order.paid`
4. Copy webhook secret
5. `.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

### New Packages
- API: `razorpay`

### Security Considerations
- Webhook idempotency: check `payment_orders.status='paid'` BEFORE incrementing quota
- HMAC verification: `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')` compared to `X-Razorpay-Signature`
- Webhook secret never logged or exposed
- All quota updates in Postgres transactions

---

## Phase 4 — ClickHouse Hot + Cold Storage (4 days)

**Goal:** ClickHouse becomes single source of truth for all sink records. Tiered storage transparently moves old data from hot to cold disk.

### Docker Compose

```yaml
clickhouse:
  image: clickhouse/clickhouse-server:24.5-alpine
  environment:
    CLICKHOUSE_USER: dataflow
    CLICKHOUSE_PASSWORD: dataflow
    CLICKHOUSE_DB: dataflow
  volumes:
    - ./db/clickhouse-init.sql:/docker-entrypoint-initdb.d/init.sql
    - ./db/clickhouse-config.xml:/etc/clickhouse-server/config.d/storage.xml
    - chdata_hot:/var/lib/clickhouse/hot
    - chdata_cold:/var/lib/clickhouse/cold
    - chdata_meta:/var/lib/clickhouse
  ports: ["8123:8123", "9000:9000"]
  healthcheck:
    test: ["CMD-SHELL", "clickhouse-client --query 'SELECT 1'"]
    interval: 10s
    timeout: 5s
    retries: 10
  networks: [dataflow]

# Add to volumes section:
chdata_hot:
chdata_cold:
chdata_meta:
```

### Storage Policy — `db/clickhouse-config.xml`

```xml
<clickhouse>
  <storage_configuration>
    <disks>
      <hot_disk><path>/var/lib/clickhouse/hot/</path></hot_disk>
      <cold_disk><path>/var/lib/clickhouse/cold/</path></cold_disk>
    </disks>
    <policies>
      <hot_cold>
        <volumes>
          <hot><disk>hot_disk</disk></hot>
          <cold><disk>cold_disk</disk></cold>
        </volumes>
      </hot_cold>
    </policies>
  </storage_configuration>
</clickhouse>
```

### Schema — `db/clickhouse-init.sql`

```sql
CREATE DATABASE IF NOT EXISTS dataflow;

CREATE TABLE dataflow.sink_records (
  tenant_id     UUID,
  collection    String,
  record        String CODEC(ZSTD(3)),
  dedup_key     String,
  encrypted     UInt8 DEFAULT 0,
  encryption_iv String DEFAULT '',
  created_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
PARTITION BY (tenant_id, toYYYYMM(created_at))
ORDER BY (tenant_id, collection, dedup_key)
TTL created_at + INTERVAL 90 DAY TO VOLUME 'cold',
    created_at + INTERVAL 2 YEAR DELETE
SETTINGS storage_policy = 'hot_cold';

CREATE TABLE dataflow.execution_metrics (
  tenant_id     UUID,
  execution_id  String,
  pipeline_id   UUID,
  node_id       String,
  activity_type String,
  status        String,
  duration_ms   Int32,
  record_count  Int32,
  finished_at   DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(finished_at))
ORDER BY (tenant_id, finished_at, execution_id)
TTL finished_at + INTERVAL 1 YEAR DELETE;
```

### Worker

- `db/init.sql` removes `sink_records` table from Postgres
- `apps/worker/src/activities/catalog.ts`: rename `sink.postgres` → `sink.records`. Single write path to ClickHouse using `@clickhouse/client`.
- New file `apps/worker/src/activities/clickhouse.ts`:
  - `clickhouseClient()` — singleton HTTP client
  - `writeRecords(tenantId, collection, records, dedupField)` — batch insert
  - `writeExecutionMetric(metric)` — for `execution_metrics` table
- `apps/worker/src/activities/index.ts`: `recordNodeRun` writes Postgres `node_runs` (operational audit) + ClickHouse `execution_metrics` (aggregation)

### Resilience

ClickHouse outage handling:
- Initial: retry with exponential backoff (3 attempts), then fail the activity → Temporal retries the activity per its retry policy
- Future enhancement (not in scope): Redis-backed buffered queue for failed ClickHouse writes

### Tenant Isolation in ClickHouse

ClickHouse has no row-level security like Postgres. Enforced at application layer:
- All queries must include `WHERE tenant_id = ?` (injected from `req.tenant.tenantId`)
- Tenant ID never trusted from client input
- Optional: ClickHouse row policies (22.3+) as defense-in-depth — added in Phase 7 hardening if time permits

### New Packages
- Worker: `@clickhouse/client`
- API: `@clickhouse/client` (for Phase 5 analytics)

---

## Phase 5 — Interactive Analytics UI (7 days)

**Goal:** Self-serve analytics dashboard. User picks dataset (a collection produced by a pipeline sink), columns, chart type, aggregation, group-by, filters. Saves dashboards.

### Database — `db/migrations/006_dashboards.sql`

```sql
CREATE TABLE dashboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  definition  JSONB NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dashboards
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE dashboard_shares (
  share_token_hash  TEXT PRIMARY KEY,
  dashboard_id      UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  expires_at        TIMESTAMPTZ NOT NULL,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

### API Routes — `apps/api/src/routes/analytics.ts`

```
GET    /api/analytics/datasets
  Returns distinct collections from sink_records for tenant

GET    /api/analytics/datasets/:name/schema
  Returns inferred column names + types from first 100 rows
  (parses record JSON, infers types)

POST   /api/analytics/query
  Body: {
    dataset: string,
    select: string[],            // columns
    where?: Array<{ field, op, value }>,
    groupBy?: string[],
    aggregate?: { field, fn },   // count | sum | avg | min | max
    orderBy?: { field, dir },
    limit?: number               // default 1000
  }
  Builds parameterized SQL, executes on ClickHouse
  Tenant filter ALWAYS injected server-side: WHERE tenant_id = $req.tenant

GET    /api/analytics/dashboards
POST   /api/analytics/dashboards
GET    /api/analytics/dashboards/:id
PUT    /api/analytics/dashboards/:id
DELETE /api/analytics/dashboards/:id
POST   /api/analytics/dashboards/:id/share    — generate share token (24h)
GET    /api/analytics/shared/:token           — read-only view
```

### Query Builder (Server-Side)

`apps/api/src/lib/queryBuilder.ts`:
- Whitelist of allowed `op` values: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IN`
- Whitelist of allowed `fn` values: `count`, `sum`, `avg`, `min`, `max`
- All field names validated against schema discovered from `/schema` endpoint
- All values passed as parameters, never interpolated
- Tenant filter mandatory and prepended in all branches

### Web — `apps/web/src/pages/AnalyticsPage.tsx`

Glass UI layout:
```
┌──────────────┬──────────────────────────────────────────┐
│ Datasets     │  Dashboard: Customer Insights  [Save]    │
│ ─────────    ├──────────────────────────────────────────┤
│ ● tickets    │  ┌─────────────┐  ┌─────────────┐         │
│ ○ users      │  │ Tickets/day │  │ Status mix  │         │
│ ○ orders     │  │  Line chart │  │  Pie chart  │         │
│              │  └─────────────┘  └─────────────┘         │
│              │  ┌──────────────────────────────┐         │
│ [+ Add       │  │ Top assignees                │         │
│   widget]    │  │  Bar chart                   │         │
│              │  └──────────────────────────────┘         │
└──────────────┴──────────────────────────────────────────┘
```

`react-grid-layout` for draggable/resizable widgets. Each widget is a glass card.

### Components

```
apps/web/src/pages/AnalyticsPage.tsx
apps/web/src/components/analytics/
  ChartWidget.tsx             — wraps Recharts charts
  ChartConfigDrawer.tsx       — slide-in panel for editing a widget
  DataTable.tsx               — paginated table widget
  BarChart.tsx, LineChart.tsx, ScatterChart.tsx, PieChart.tsx
  DatasetSelector.tsx
  AddWidgetModal.tsx
```

Recharts rendered with transparent backgrounds, white/60 axis labels, white/20 gridlines to match glass aesthetic.

### New Packages
- Web: `recharts`, `react-grid-layout`

---

## Phase 6 — KMS + End-to-End Encryption (13 days)

**Goal:** Tenant data is encrypted with a key the server never sees in plaintext. Forgotten password is recoverable via BIP39 24-word phrase saved at signup.

### Crypto Design

#### At signup (browser-only)
```
1. DEK              = WebCrypto.generateKey(AES-GCM-256)
2. salt             = crypto.getRandomValues(32 bytes)
3. recoveryEntropy  = crypto.getRandomValues(32 bytes)
4. recoveryPhrase   = bip39.entropyToMnemonic(recoveryEntropy)   // 24 words
5. passwordKEK      = PBKDF2(password, salt, 600_000 iters, SHA-256)
6. recoveryKEK      = PBKDF2(recoveryPhrase, salt, 600_000 iters, SHA-256)
7. encDekPassword   = AES-GCM(DEK, passwordKEK, iv1)
8. encDekRecovery   = AES-GCM(DEK, recoveryKEK, iv2)
9. rsaKeyPair       = WebCrypto.generateKey(RSA-OAEP-2048)
10. encPrivateKey   = AES-GCM(exported privateKey, passwordKEK, iv3)
11. publicKeyJWK    = export(publicKey)
12. POST /api/auth/keys/init with all encrypted blobs + IVs + salt + publicKeyJWK
13. Show recoveryPhrase ONCE in full-screen modal, require checkbox confirmation
```

#### At login (browser)
```
1. Receive { salt, iv1, encDekPassword } in /api/auth/me response
2. passwordKEK = PBKDF2(password, salt, 600_000 iters)
3. DEK = AES-GCM-decrypt(encDekPassword, passwordKEK, iv1)
4. Hold DEK in React state (in-memory only, NEVER localStorage)
5. On tab close: DEK gone, must re-enter password to access encrypted data
```

#### Forgotten password
```
1. User enters email + 24-word phrase
2. recoveryKEK = PBKDF2(phrase, salt, 600_000 iters)
3. DEK = AES-GCM-decrypt(encDekRecovery, recoveryKEK, iv2)
4. User sets new password
5. newKEK = PBKDF2(newPassword, newSalt, 600_000 iters)
6. newEncDekPassword = AES-GCM(DEK, newKEK, newIv)
7. POST /api/auth/keys/rotate-password
8. Mark recovery_phrase_used_at = now()
9. Force user to generate new recovery phrase (security: old phrase may be compromised)
```

#### Workflow dispatch — server's brief plaintext touch
```
When user clicks "Run pipeline":
1. Browser sends { trigger, encryptedDek, dekIv } in /api/pipelines/:id/run body
   (DEK was decrypted client-side at login, in memory; browser re-encrypts it with workerPublicKey)
2. API receives encryptedDek (encrypted with worker's public key — server can't decrypt)
3. API passes encryptedDek directly to Temporal workflow input
4. Worker activity decryptDek() unwraps DEK using worker's private key (file mount)
5. DEK held in workflow context for that execution; never persisted
```

#### Sub-user key sharing
```
1. Owner navigates to /team
2. For each sub-user without DEK share:
   - Fetch sub-user's publicKeyJWK
   - Browser encrypts owner's DEK with sub-user's RSA-OAEP public key
   - POST /api/auth/keys/share { targetUserId, encryptedDek }
3. Sub-user on next login: decrypts share with their RSA private key → gets DEK
```

### Database — `db/migrations/007_kms.sql`

```sql
-- Most key material columns already added to users in 001_auth.sql
-- This migration adds the supporting tables and payload encryption columns

CREATE TABLE user_key_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id    UUID NOT NULL REFERENCES users(id),
  to_user_id      UUID NOT NULL REFERENCES users(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  encrypted_dek   TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, to_user_id)
);
ALTER TABLE user_key_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_key_shares
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE key_rotation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  rotated_at  TIMESTAMPTZ DEFAULT now(),
  reason      TEXT
);

-- Payload encryption flags
ALTER TABLE node_payloads
  ADD COLUMN encrypted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN encryption_iv TEXT;
```

`sink_records` in ClickHouse already has `encrypted` + `encryption_iv` columns (Phase 4).

### API Routes (additions to auth.ts)

```
POST /api/auth/keys/init
  Body: { encDekPassword, dekIv, encDekRecovery, recoveryDekIv, salt,
          publicKey, encryptedPrivateKey, privateKeyIv }
  - Server stores blobs as opaque columns
  - Cannot decrypt any of them

POST /api/auth/keys/rotate-password
  Body: { newEncDekPassword, newDekIv, newSalt, newEncPrivateKey, newPrivateKeyIv }
  - Authenticated request
  - Updates the password-encrypted blob
  - Logs to key_rotation_log
  - Returns 200

GET  /api/auth/keys/share/:userId
  Body: returns { publicKey } so owner can encrypt DEK
  Owner-only

POST /api/auth/keys/share
  Body: { targetUserId, encryptedDek }
  - Owner-only
  - Stores in user_key_shares
  - Notifies target user via email + in-app banner

GET  /api/auth/keys/my-share
  - Returns the encrypted_dek for the calling user (if owner shared)
  - User's browser decrypts with their RSA private key

GET  /api/auth/keys/worker-public-key
  - Returns worker's RSA public key (for browser to wrap DEK before workflow dispatch)
```

### Web — `apps/web/src/lib/crypto.ts`

```typescript
// Web Crypto API wrappers
export async function generateDEK(): Promise<CryptoKey>
export async function deriveKEK(password: string, salt: Uint8Array): Promise<CryptoKey>
export async function encryptWithKey(data: ArrayBuffer, key: CryptoKey): Promise<{ ciphertext: string; iv: string }>
export async function decryptWithKey(ciphertext: string, iv: string, key: CryptoKey): Promise<ArrayBuffer>
export async function generateRSAKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }>
export async function exportPublicKeyJWK(key: CryptoKey): Promise<string>
export async function rsaEncrypt(data: ArrayBuffer, publicKeyJWK: string): Promise<string>
export async function rsaDecrypt(ciphertext: string, privateKey: CryptoKey): Promise<ArrayBuffer>
```

### Web — `apps/web/src/lib/bip39.ts`

- Bundled wordlist (2048 words)
- `entropyToMnemonic(entropy: Uint8Array): string`
- `mnemonicToSeed(phrase: string): Promise<Uint8Array>` (PBKDF2 + salt)
- `validateMnemonic(phrase: string): boolean`

Use the `bip39` npm package directly — well-audited, tiny.

### Web — RecoveryPhraseModal

Glass modal shown ONCE at signup:
```
┌─────────────────────────────────────────────────────┐
│  Your Recovery Phrase                               │
│                                                     │
│  Save these 24 words. We CANNOT recover them for    │
│  you. Without them and your password, your data is  │
│  permanently lost.                                  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  1. abandon    7. result    13. ...           │   │
│  │  2. ability    8. wisdom    14. ...           │   │
│  │  3. able       9. orient    15. ...           │   │
│  │  ...                                          │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  [📋 Copy]  [💾 Download as .txt]                   │
│                                                     │
│  ☐ I have saved this phrase securely                │
│                                       [Continue ►]  │
└─────────────────────────────────────────────────────┘
```

Continue button disabled until checkbox checked.

### Worker

#### `apps/worker/src/activities/crypto.ts`
```typescript
import fs from 'fs';
import crypto from 'crypto';

const WORKER_PRIVATE_KEY = crypto.createPrivateKey(
  fs.readFileSync(process.env.WORKER_PRIVATE_KEY_PATH ?? '/secrets/worker-keypair.pem')
);

export function decryptDekFromWorkflowInput(encryptedDek: string): Buffer {
  return crypto.privateDecrypt(
    { key: WORKER_PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(encryptedDek, 'base64')
  );
}

export function encryptPayload(data: Buffer, dek: Buffer): { ciphertext: string; iv: string }
export function decryptPayload(ciphertext: string, iv: string, dek: Buffer): Buffer
```

#### `apps/worker/src/activities/db.ts` — updates
- `writePayload()` accepts `dek?: Buffer`. If present, encrypt before storing.
- `readPayload()` accepts `dek?: Buffer`. If row is encrypted, decrypt before returning.

#### `apps/worker/src/workflows/dynamic-dag.ts` — updates
- Workflow input now includes `encryptedDek?: string`
- First step: if encrypted DEK present, call `decryptDek` activity (non-retryable, never logged)
- Pass DEK reference to all subsequent activities

#### Temporal Data Converter
- Custom data converter encrypts all workflow input/output at SDK level — extra defense for data in Temporal's storage
- Located: `apps/worker/src/temporal-data-converter.ts`
- Worker and API both register the same converter when starting the Temporal client

### Worker Keypair Generation

New script `scripts/gen-worker-keypair.js`:
```bash
node scripts/gen-worker-keypair.js
# Generates ./secrets/worker-keypair.pem + ./secrets/worker-keypair.pub
# Documents that worker mounts the .pem, API gets the .pub via env var
```

`.gitignore`: add `/secrets/`

Docker compose:
```yaml
worker:
  volumes:
    - ./secrets/worker-keypair.pem:/secrets/worker-keypair.pem:ro
  environment:
    WORKER_PRIVATE_KEY_PATH: /secrets/worker-keypair.pem
api:
  environment:
    WORKER_PUBLIC_KEY_PEM: ${WORKER_PUBLIC_KEY_PEM}
```

### Files Created in Phase 6

```
db/migrations/007_kms.sql
apps/web/src/lib/crypto.ts
apps/web/src/lib/bip39.ts
apps/web/src/components/RecoveryPhraseModal.tsx
apps/web/src/pages/ForgotPasswordPage.tsx  (real implementation)
apps/worker/src/activities/crypto.ts
apps/worker/src/temporal-data-converter.ts
scripts/gen-worker-keypair.js
secrets/.gitkeep
```

### Files Modified in Phase 6

```
apps/api/src/routes/auth.ts                  — add keys/* endpoints
apps/web/src/pages/RegisterPage.tsx          — integrate key generation + modal
apps/web/src/pages/LoginPage.tsx             — derive KEK, decrypt DEK
apps/web/src/context/AuthContext.tsx        — hold DEK in memory
apps/worker/src/workflows/dynamic-dag.ts     — accept encryptedDek
apps/worker/src/activities/db.ts             — encrypt/decrypt payloads
db/init.sql                                  — add encrypted/encryption_iv columns
```

### Security Considerations

- DEK never leaves browser memory in plaintext
- Password and recovery phrase never sent to server
- Server's brief touch of plaintext is only when re-wrapping DEK with worker's public key for workflow dispatch — this happens in-process, never written to disk or logs
- Temporal stores `encryptedDek` (wrapped with worker's RSA public key) in workflow history — even Temporal admin can't decrypt
- Custom data converter at Temporal SDK level encrypts ALL workflow payloads — defense in depth
- Worker private key on disk is the weakest link — must be backed up, access-controlled, never committed
- Key rotation: if worker private key is compromised, all stored encrypted DEKs must be re-wrapped (users prompted on next login)

### New Packages
- Web: `bip39`
- API: none (uses Node's built-in `crypto`)
- Worker: none

---

## Phase 7 — Docker Compose Final + Env Vars (1 day)

**Goal:** All env vars documented, all services wired, observability stack updated for new datasources.

### `.env.example` — complete file

```
# Postgres
POSTGRES_PASSWORD=dataflow
DATAFLOW_APP_PASSWORD=<generated>

# JWT
JWT_SECRET=<32-byte random hex>
JWT_SECRET_PREVIOUS=

# SMTP (use mailhog locally)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_FROM=noreply@dataflow.local

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Microsoft OAuth
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=common
AZURE_REDIRECT_URI=http://localhost:3000/api/connectors/microsoft/callback

# Zendesk OAuth
ZENDESK_OAUTH_CLIENT_ID=
ZENDESK_OAUTH_CLIENT_SECRET=

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Encryption-at-rest (Phase 2 stepping stone)
OAUTH_TOKEN_ENCRYPTION_KEY=<32 bytes base64>

# Worker keypair (Phase 6)
WORKER_PUBLIC_KEY_PEM=<paste contents of ./secrets/worker-keypair.pub>

# Build ID
BUILD_ID=dev-local
```

### Grafana ClickHouse Datasource

`observability/grafana-datasources.yml` — add:
```yaml
- name: ClickHouse
  type: grafana-clickhouse-datasource
  url: http://clickhouse:8123
  jsonData:
    defaultDatabase: dataflow
    username: dataflow
  secureJsonData:
    password: dataflow
```

Grafana image must include `grafana-clickhouse-datasource` plugin (set via `GF_INSTALL_PLUGINS` env var).

### nginx Updates

`apps/web/nginx.conf`:
- SPA fallback for all new routes (`/connectors`, `/billing`, `/analytics`, `/team`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/accept-invite`)
- Proxy `/api/billing/webhook` to API container (Razorpay sends here)
- All other `/api/*` already proxied

### Final docker-compose.yml summary

12 services: postgres, redis, cassandra, temporal, temporal-ui, clickhouse, mailhog, api, worker, web, otel-collector, prometheus, grafana, jaeger (14 actually).

---

## 12. External Service Setup (`docs/SETUP.md`)

Step-by-step documentation for:
1. Razorpay test account + webhook + ngrok for local dev
2. Google Cloud Console — OAuth app for Sheets/Drive/Login
3. Microsoft Azure AD — app registration for Excel
4. Zendesk OAuth app (per-subdomain)
5. Worker keypair generation (`node scripts/gen-worker-keypair.js`)
6. First-run checklist:
   - Copy `.env.example` → `.env`, fill all required values
   - `node scripts/gen-worker-keypair.js`
   - `docker compose up -d`
   - Wait ~2 minutes for Cassandra to bootstrap
   - Navigate to `http://localhost:3000/register`
   - Mailhog UI at `http://localhost:8025` to see verification emails

---

## 13. Security Model Summary

| Threat | Mitigation |
|---|---|
| Cross-tenant data leak | Postgres RLS + mandatory `WHERE tenant_id` in ClickHouse queries |
| Stolen JWT (XSS) | Short-lived (15min) access tokens; refresh tokens in httpOnly cookies |
| Stolen refresh token | Token rotation with reuse detection (revoke chain on reuse) |
| CSRF on OAuth callbacks | `state` param tied to Redis nonce, 5min TTL |
| Razorpay webhook replay | Idempotency check on `payment_orders.status` + signature verification |
| Developer reading user data | E2E encryption — DEK never reaches server plaintext |
| Temporal admin reading workflow history | Custom data converter encrypts at SDK level |
| Forgotten password = data loss | BIP39 24-word recovery phrase (user responsibility documented) |
| Worker key compromise | Documented rotation procedure; all DEKs re-wrapped on rotation |
| SQL injection via analytics query | Strict whitelist of ops/fns/fields + parameterized queries |
| Email tokens stolen | SHA-256 hashed in DB; 24h TTL; rate-limited resends |
| Audit log tampering | `dataflow_app` role lacks UPDATE/DELETE on `audit_log` |
| OAuth tokens at rest | AES-256-GCM with `OAUTH_TOKEN_ENCRYPTION_KEY` (Phase 6 supersedes with DEK) |

---

## 14. Open Items

None blocking. All defaults from Q8 (worker keypair file mount) and Q10 (audit log yes) accepted.

If anything needs to change before implementation begins, edit this file or comment with what to revise.

---

## Implementation Order & Dependencies

```
Phase 0 ─────────► Phase 1 ─────► Phase 2 ─────┐
                       │            │           │
                       ├──► Phase 3 │           ├──► Phase 6
                       │            │           │
                       ├──► Phase 4 ─► Phase 5 ─┘
                       │
                       └──► Phase 7 (rolling, finalized at end)
```

**Critical path:** Phase 0 → 1 → 6 (~24 days serial). Phases 2/3/4 are parallel-safe after Phase 1.

**Estimated total:** ~47 working days for one engineer, ~5-6 weeks with two engineers.
