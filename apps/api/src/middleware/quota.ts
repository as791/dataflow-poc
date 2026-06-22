import type { RequestHandler } from 'express';
import { withTenantTx } from '../db';
import { startOfMonthUTC } from '../services/usage';

// Phase 3 quota enforcement. Reads billing_plans + usage_counters inside
// the request's tenant transaction (RLS-scoped) and rejects with 402 if
// the tenant has burned through (free_tier_limit + extra_quota) for the
// current UTC month.
//
// Note: this does NOT increment the counter — that happens after fireExecution
// via incrementUsage(). Keeping the two separate means a failed dispatch
// doesn't burn a unit, and concurrent runs use the atomic upsert.
export const requireQuota: RequestHandler = async (req, res, next) => {
  try {
    const month = startOfMonthUTC();
    const { limit, used } = await withTenantTx(req, async client => {
      // Upsert a default billing_plans row on first access so every tenant
      // gets the free tier without an explicit signup step.
      const planRes = await client.query(
        `INSERT INTO billing_plans (tenant_id) VALUES ($1)
         ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
         RETURNING free_tier_limit, extra_quota`,
        [req.tenant.tenantId],
      );
      const plan = planRes.rows[0];
      const counterRes = await client.query(
        `SELECT execution_count FROM usage_counters
          WHERE tenant_id=$1 AND month=$2`,
        [req.tenant.tenantId, month],
      );
      const usedCount = counterRes.rows[0]?.execution_count ?? 0;
      return {
        limit: plan.free_tier_limit + plan.extra_quota,
        used: usedCount,
      };
    });

    if (used >= limit) {
      return res.status(402).json({
        error: 'Quota exceeded',
        used,
        limit,
        buyUrl: '/billing',
      });
    }
    next();
  } catch (e) {
    console.error('requireQuota failed', { error: (e as Error).message });
    next(e);
  }
};
