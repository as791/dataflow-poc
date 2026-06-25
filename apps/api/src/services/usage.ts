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

// Atomically checks and consumes one execution unit. The row locks prevent two
// concurrent webhook/manual/event requests from both passing the same final
// quota slot.
export async function consumeExecutionQuota(tenantId: string): Promise<void> {
  const month = startOfMonthUTC();
  await withTenant(tenantId, async client => {
    await client.query(
      `INSERT INTO billing_plans (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO usage_counters (tenant_id, month, execution_count)
       VALUES ($1,$2,0)
       ON CONFLICT (tenant_id, month) DO NOTHING`,
      [tenantId, month],
    );
    const { rows } = await client.query(
      `SELECT bp.free_tier_limit + bp.extra_quota AS quota_limit,
              uc.execution_count
         FROM billing_plans bp
         JOIN usage_counters uc ON uc.tenant_id=bp.tenant_id AND uc.month=$2
        WHERE bp.tenant_id=$1
        FOR UPDATE OF bp, uc`,
      [tenantId, month],
    );
    const limit = Number(rows[0]?.quota_limit ?? 0);
    const used = Number(rows[0]?.execution_count ?? 0);
    if (used >= limit) throw new QuotaExceededError(used, limit);
    await client.query(
      `UPDATE usage_counters
          SET execution_count = execution_count + 1
        WHERE tenant_id=$1 AND month=$2`,
      [tenantId, month],
    );
  });
}

export async function releaseExecutionQuota(tenantId: string): Promise<void> {
  const month = startOfMonthUTC();
  await withTenant(tenantId, client => client.query(
    `UPDATE usage_counters
        SET execution_count = GREATEST(0, execution_count - 1)
      WHERE tenant_id=$1 AND month=$2`,
    [tenantId, month],
  ));
}
