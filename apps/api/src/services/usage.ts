import { withTenant } from '../db';

// First day of the current month in UTC, as a YYYY-MM-DD string.
// Postgres DATE column truncates, but we send a clean ISO date to avoid
// any TZ surprises at the boundary.
export function startOfMonthUTC(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export class QuotaExceededError extends Error {
  constructor(public used: number, public limit: number) {
    super('Quota exceeded');
    this.name = 'QuotaExceededError';
  }
}

// Enforce the monthly execution quota from any context (no request needed).
// requireQuota gates manual runs before dispatch; calling this inside
// fireExecution closes the gap for webhook/event triggers, which previously
// metered but did not enforce. Throws QuotaExceededError when over the limit.
export async function assertWithinQuota(tenantId: string): Promise<void> {
  const month = startOfMonthUTC();
  const { limit, used } = await withTenant(tenantId, async client => {
    const planRes = await client.query(
      `INSERT INTO billing_plans (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING free_tier_limit, extra_quota`,
      [tenantId]);
    const plan = planRes.rows[0];
    const counterRes = await client.query(
      `SELECT execution_count FROM usage_counters WHERE tenant_id=$1 AND month=$2`,
      [tenantId, month]);
    return {
      limit: plan.free_tier_limit + plan.extra_quota,
      used: counterRes.rows[0]?.execution_count ?? 0,
    };
  });
  if (used >= limit) throw new QuotaExceededError(used, limit);
}

// Atomic upsert of the per-tenant per-month execution counter.
// Called from every place that fires a workflow execution (manual run,
// webhook trigger, event trigger). Must be safe to call concurrently.
//
// Uses `withTenant` (not `withTenantTx`) so it works from non-request
// contexts (event subscriber loop). Runs as `dataflow_app` so RLS still
// applies — SET LOCAL app.tenant_id is set inside withTenant.
export async function incrementUsage(tenantId: string): Promise<void> {
  const month = startOfMonthUTC();
  try {
    await withTenant(tenantId, client =>
      client.query(
        `INSERT INTO usage_counters (tenant_id, month, execution_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (tenant_id, month)
         DO UPDATE SET execution_count = usage_counters.execution_count + 1`,
        [tenantId, month],
      ),
    );
  } catch (e) {
    // Metering must never break execution. Log and move on.
    console.error('incrementUsage failed', { tenantId, error: (e as Error).message });
  }
}
