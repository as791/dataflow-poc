import { Router, raw } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { pool, withTenant, withTenantTx } from '../db';
import { auditLog, auditAs } from '../middleware/audit';
import { requireAuth, requireVerified } from '../middleware/auth';
import { startOfMonthUTC } from '../services/usage';

// IMPORTANT mounting order (see index.ts):
//   1. mount `billingWebhook` at /api/billing BEFORE the global express.json()
//      so the HMAC sees raw bytes.
//   2. mount `billing` at /api/billing AFTER global parsers + auth setup.
// Both share the same prefix; Express tries them in registration order so
// the webhook router wins for POST /api/billing/webhook and the main
// router handles everything else.

export const billing = Router();
export const billingWebhook = Router();

// 1 unit = 5 executions, ₹100 (10000 paise) — must match billing_plans.price_per_5_paise default.
const UNITS_TO_EXECUTIONS = 5;

function rzp() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID ?? '',
    key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
  });
}

function daysUntilMonthReset(now: Date = new Date()): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.ceil((next.getTime() - now.getTime()) / 86400000);
}

// ─── Webhook (PUBLIC, raw body for HMAC) ───────────────────────────────
// Lives on its own router (`billingWebhook`) which must be mounted BEFORE
// the global express.json() in index.ts so req.body is a Buffer.
billingWebhook.post(
  '/webhook',
  raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('RAZORPAY_WEBHOOK_SECRET unset — refusing webhook');
      return res.status(500).json({ error: 'webhook not configured' });
    }
    const sig = req.headers['x-razorpay-signature'];
    if (typeof sig !== 'string') return res.status(401).json({ error: 'missing signature' });

    const rawBody = req.body as Buffer; // raw() gives us a Buffer
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'bad signature' });
    }

    let payload: any;
    try { payload = JSON.parse(rawBody.toString('utf8')); }
    catch { return res.status(400).json({ error: 'bad json' }); }

    const event = payload.event as string | undefined;
    const ip = (req.ip ?? null) as string | null;
    const ua = req.get('user-agent') ?? null;

    // We only act on payment.captured / order.paid. Failed payments just flip status.
    try {
      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = payload.payload?.payment?.entity;
        const orderId: string | undefined =
          paymentEntity?.order_id ?? payload.payload?.order?.entity?.id;
        const paymentId: string | undefined = paymentEntity?.id;
        if (!orderId) return res.status(400).json({ error: 'no order_id' });

        // Find the order (no RLS context — superuser pool query).
        const { rows } = await pool.query(
          `SELECT id, tenant_id, quota_units, status FROM payment_orders
            WHERE razorpay_order_id=$1`, [orderId]);
        if (!rows.length) return res.status(404).json({ error: 'unknown order' });
        const order = rows[0];
        if (order.status === 'paid') {
          return res.json({ ok: true, idempotent: true });
        }

        // Apply quota inside the tenant's RLS context for consistency.
        await withTenant(order.tenant_id, async client => {
          await client.query('BEGIN');
          try {
            // Re-check inside tx — defends against concurrent webhook deliveries.
            const lock = await client.query(
              `SELECT status FROM payment_orders WHERE id=$1 FOR UPDATE`, [order.id]);
            if (lock.rows[0]?.status === 'paid') {
              await client.query('COMMIT');
              return;
            }
            await client.query(
              `UPDATE payment_orders
                  SET status='paid', paid_at=now(), razorpay_payment_id=$2
                WHERE id=$1`,
              [order.id, paymentId ?? null]);
            await client.query(
              `INSERT INTO billing_plans (tenant_id, extra_quota)
               VALUES ($1, $2)
               ON CONFLICT (tenant_id)
               DO UPDATE SET extra_quota = billing_plans.extra_quota + $2,
                             updated_at = now()`,
              [order.tenant_id, order.quota_units * UNITS_TO_EXECUTIONS]);
            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
          }
        });
        // SET LOCAL doesn't persist across the second connection used by auditAs,
        // but auditAs opens its own withTenant tx so that's fine.
        await auditAs(order.tenant_id, null, 'payment.captured', ip, ua, {
          orderId, paymentId, units: order.quota_units,
        });
      } else if (event === 'payment.failed') {
        const paymentEntity = payload.payload?.payment?.entity;
        const orderId: string | undefined = paymentEntity?.order_id;
        if (orderId) {
          await pool.query(
            `UPDATE payment_orders SET status='failed'
              WHERE razorpay_order_id=$1 AND status='created'`, [orderId]);
        }
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('webhook handler failed', { event, error: (e as Error).message });
      res.status(500).json({ error: 'webhook failed' });
    }
  },
);

// ─── Authenticated routes ──────────────────────────────────────────────
// Global express.json() in index.ts already parses JSON for this router,
// so no parser here. Auth/verification is local so we don't have to wire
// it from index.ts twice (once for webhook bypass, once for these).
billing.use(requireAuth, requireVerified);

billing.get('/usage', async (req, res) => {
  const month = startOfMonthUTC();
  const out = await withTenantTx(req, async client => {
    const planRes = await client.query(
      `INSERT INTO billing_plans (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING free_tier_limit, extra_quota`,
      [req.tenant.tenantId]);
    const plan = planRes.rows[0];
    const counterRes = await client.query(
      `SELECT execution_count FROM usage_counters
        WHERE tenant_id=$1 AND month=$2`,
      [req.tenant.tenantId, month]);
    const used = counterRes.rows[0]?.execution_count ?? 0;
    return {
      used,
      limit: plan.free_tier_limit + plan.extra_quota,
      free_tier: plan.free_tier_limit,
      extra_quota: plan.extra_quota,
      daysUntilReset: daysUntilMonthReset(),
    };
  });
  res.json(out);
});

billing.post('/orders', async (req, res) => {
  const units = Number(req.body?.units);
  if (!Number.isInteger(units) || units < 1 || units > 100) {
    return res.status(400).json({ error: 'units must be an integer between 1 and 100' });
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'razorpay not configured' });
  }

  // Snapshot price from the tenant's plan so an admin price change later
  // doesn't retroactively alter an open order.
  const plan = await withTenantTx(req, async client => {
    const r = await client.query(
      `INSERT INTO billing_plans (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING price_per_5_paise`,
      [req.tenant.tenantId]);
    return r.rows[0];
  });
  const amountPaise = plan.price_per_5_paise * units;

  let rzpOrder;
  try {
    rzpOrder = await rzp().orders.create({
      amount: amountPaise,
      currency: 'INR',
      notes: { tenantId: req.tenant.tenantId, units: String(units) },
    });
  } catch (e) {
    console.error('razorpay order create failed', (e as Error).message);
    return res.status(502).json({ error: 'razorpay error' });
  }

  await withTenantTx(req, c => c.query(
    `INSERT INTO payment_orders
       (tenant_id, razorpay_order_id, amount_paise, quota_units, status)
     VALUES ($1,$2,$3,$4,'created')`,
    [req.tenant.tenantId, rzpOrder.id, amountPaise, units]));

  auditLog(req, 'payment.order_created', rzpOrder.id, { units, amountPaise });

  res.json({
    orderId: rzpOrder.id,
    amount: amountPaise,
    currency: 'INR',
    razorpayKey: process.env.RAZORPAY_KEY_ID,
  });
});

billing.get('/history', async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT id, razorpay_order_id, razorpay_payment_id, amount_paise,
            quota_units, status, created_at, paid_at
       FROM payment_orders
      ORDER BY created_at DESC
      LIMIT 50`));
  res.json(rows.rows);
});
