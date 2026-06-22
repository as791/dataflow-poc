import { withTenant } from '../db';

// First day of the current month in UTC, as a YYYY-MM-DD string.
// Postgres DATE column truncates, but we send a clean ISO date to avoid
// any TZ surprises at the boundary.
export function startOfMonthUTC(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
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
