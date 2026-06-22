-- Phase 3 — Razorpay billing & workflow metering.
--
-- Free tier: 5 executions / tenant / month.
-- Beyond that, tenants buy "units" (1 unit = 5 executions, ₹100 each)
-- which top up billing_plans.extra_quota. Counter resets implicitly each
-- month because usage_counters is keyed on (tenant_id, first-of-month).
--
-- RLS: ENABLE only (no FORCE) — the worker connects as the `dataflow`
-- superuser and must bypass these policies. The API (dataflow_app)
-- always runs inside SET LOCAL app.tenant_id transactions.

CREATE TABLE billing_plans (
  tenant_id          UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  free_tier_limit    INT NOT NULL DEFAULT 5,
  price_per_5_paise  INT NOT NULL DEFAULT 10000,    -- ₹100 in paise
  extra_quota        INT NOT NULL DEFAULT 0,        -- purchased beyond free tier
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE usage_counters (
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month            DATE NOT NULL,                   -- first day of UTC month
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

CREATE INDEX payment_orders_tenant_created_idx
  ON payment_orders (tenant_id, created_at DESC);

ALTER TABLE billing_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON billing_plans
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON usage_counters
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON payment_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_plans, usage_counters, payment_orders TO dataflow_app;
