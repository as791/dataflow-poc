# DataFlow — Local Setup

> Living setup guide. Phases fill in as features land. See `docs/PLAN.md` for the full roadmap.

## Prerequisites

- Docker Desktop (with at least 8 GB RAM, 4 CPUs allocated)
- Node 20+ (only needed for editing outside containers)
- A modern browser (WebCrypto is required for E2E encryption in Phase 1+)

## Quickstart

```bash
docker compose up -d --build
```

Services:
- Web UI — http://localhost:5173
- API — http://localhost:4000 (`/health`, `/metrics`)
- Temporal UI — http://localhost:8233
- Grafana — http://localhost:3000

## Phase 0 — Foundation (current)

- Tailwind + glass UI design system wired into the web app
- React Router with stub pages for every planned route
- API middleware stubs (`requireAuth`, `withTenantTx`, `auditLog`, `requireQuota`)
- Cassandra-backed Temporal history store
- A single bootstrap tenant (`00000000-0000-0000-0000-000000000001`) is assigned to every request

Nothing to configure manually yet. Phase 1 introduces the env vars listed below.

## Phase 1 — Auth & multi-tenancy (planned)

Will require:
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `SMTP_*` (Mailhog provided locally)
- Postgres role `dataflow_app` (RLS) — created by migration

## Phase 2 — OAuth connectors (planned)

Each provider needs an app registered in its developer console. Step-by-step guides will live in:
- `docs/oauth/google.md` — Sheets + Drive
- `docs/oauth/microsoft.md` — Excel (Graph API)
- `docs/oauth/zendesk.md`

Env vars (planned): `GOOGLE_CLIENT_ID/SECRET`, `MS_CLIENT_ID/SECRET`, `ZENDESK_CLIENT_ID/SECRET`, `OAUTH_REDIRECT_BASE`.

## Phase 3 — Razorpay billing

Workflow metering enforces 5 free executions per tenant per UTC month. Beyond
that, tenants buy "units" of 5 executions for ₹100 each via Razorpay Checkout.

### One-time Razorpay account setup

1. Sign up at https://razorpay.com and **activate test mode** (top-right toggle).
2. Dashboard → **Settings → API Keys → Generate Test Key**. Copy the
   **Key ID** and **Key Secret**.
3. Dashboard → **Settings → Webhooks → Add New Webhook**:
   - **URL:** `https://<your-public-host>/api/billing/webhook`
     - For local dev expose the API with ngrok:
       ```
       ngrok http 4000
       ```
       and use the printed `https://…ngrok-free.app/api/billing/webhook` URL.
   - **Active events:** `payment.captured`, `payment.failed`, `order.paid`.
   - Set a webhook **secret** — Razorpay does not generate one, you pick it.
4. Copy the webhook secret.

### Env vars

Add to `.env` (and `.env.example` already lists them):

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=pick-anything-long
```

After updating, restart the API container:

```
docker compose up -d --build api
```

### Verifying the flow

1. Log in → visit `/billing`. You should see `0 / 5 executions`.
2. Trigger workflow runs until you hit `5 / 5`. The next `Run` returns
   HTTP 402 with `{ error: 'Quota exceeded', buyUrl: '/billing' }`.
3. On `/billing` click **Buy 5 more executions**. Razorpay Checkout opens.
4. Use test card `4111 1111 1111 1111`, any future expiry, any CVV/OTP.
5. The webhook fires; the page polls `/api/billing/usage` every 2s until
   `extra_quota` updates. Limit should jump to 10.

### Troubleshooting

- **Webhook returns 401** — secret mismatch between Razorpay dashboard and
  `RAZORPAY_WEBHOOK_SECRET`. Razorpay signs the raw body with HMAC-SHA256;
  the API verifies via `express.raw({type:'application/json'})`.
- **Checkout opens but order create fails** — `RAZORPAY_KEY_ID/SECRET` not
  loaded into the API container. `docker compose exec api env | grep RAZORPAY`.
- **Quota doesn't update after payment** — check `payment_orders.status` in
  Postgres. If still `'created'`, the webhook never reached the API. Confirm
  ngrok is forwarding and the dashboard shows recent successful deliveries.

## Phase 4 — ClickHouse analytics (planned)

- ClickHouse service added to docker-compose with hot/cold tiered storage policy
- Env vars: `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`

## Troubleshooting

- **Worker can't connect to Temporal**: check `TEMPORAL_ADDRESS=temporal:7233` is set; the worker uses `NativeConnection.connect`.
- **Cassandra slow on first boot**: healthcheck `start_period` is 90s. Temporal will retry until ready.
- **Web build fails with rollup native binding**: do not pass `--omit=optional` to `npm install` in the Dockerfile.
