import { useEffect, useRef, useState } from 'react';
import { Activity, CalendarClock, CreditCard, Gauge, Plus } from 'lucide-react';
import { api } from '../api';

type Usage = {
  used: number;
  limit: number;
  free_tier: number;
  extra_quota: number;
  daysUntilReset: number;
};

type Payment = {
  id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount_paise: number;
  quota_units: number;
  status: 'created' | 'paid' | 'failed';
  created_at: string;
  paid_at: string | null;
};

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise(resolve => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const s = document.createElement('script');
    s.src = RAZORPAY_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function fmtINR(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric' });
}

export function BillingPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [history, setHistory] = useState<Payment[]>([]);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  async function refresh() {
    try {
      const [u, h] = await Promise.all([api.getUsage(), api.getBillingHistory()]);
      setUsage(u);
      setHistory(h);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  // After payment success, poll usage until extra_quota actually moves —
  // protects against the webhook still being in flight.
  function startPostPaymentPoll(prevExtra: number) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = window.setInterval(async () => {
      attempts++;
      try {
        const u: Usage = await api.getUsage();
        setUsage(u);
        if (u.extra_quota > prevExtra || attempts > 30) {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          api.getBillingHistory().then(setHistory).catch(() => {});
        }
      } catch { /* keep polling */ }
    }, 2000);
  }

  async function buy(units: number) {
    setBuying(true);
    setError(null);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Razorpay checkout failed to load');
      const order = await api.createOrder(units);
      const prevExtra = usage?.extra_quota ?? 0;
      const rzp = new window.Razorpay({
        key: order.razorpayKey,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'DataFlow',
        description: `${units * 5} workflow executions`,
        handler: () => startPostPaymentPoll(prevExtra),
        modal: { ondismiss: () => setBuying(false) },
        theme: { color: '#6366f1' },
      });
      rzp.on('payment.failed', (resp: any) => {
        setError(resp?.error?.description ?? 'Payment failed');
        setBuying(false);
      });
      rzp.open();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuying(false);
    }
  }

  const used = usage?.used ?? 0;
  const limit = usage?.limit ?? 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="page-heading">Usage & billing</h1>
        <p className="page-subtitle mt-1">Track workflow executions and extend monthly capacity.</p>
      </div>
      <div className="glass-panel p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base font-semibold">Usage this month</h2>
          <span className="glass-badge"><Activity size={12} /> live meter</span>
        </div>

        {error && (
          <div className="glass-card p-3 mb-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mb-3 h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-indigo-400/80 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-sm opacity-80 mb-6">
          {used} / {limit} executions
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="glass-card p-4">
            <dt className="flex items-center gap-2 text-xs text-white/40"><Gauge size={14} /> Free tier</dt>
            <dd className="text-lg">{usage?.free_tier ?? '—'} / month</dd>
          </div>
          <div className="glass-card p-4">
            <dt className="flex items-center gap-2 text-xs text-white/40"><CreditCard size={14} /> Purchased</dt>
            <dd className="text-lg">
              {usage?.extra_quota ?? 0}
              {usage && usage.extra_quota > 0 && (
                <span className="opacity-60 text-sm ml-2">
                  ({usage.extra_quota / 5} × 5)
                </span>
              )}
            </dd>
          </div>
          <div className="glass-card p-4">
            <dt className="flex items-center gap-2 text-xs text-white/40"><CalendarClock size={14} /> Resets in</dt>
            <dd className="text-lg">{usage?.daysUntilReset ?? '—'} days</dd>
          </div>
        </dl>

        <div className="mt-6">
          <button
            className="glass-btn-primary"
            disabled={buying}
            onClick={() => buy(1)}
          >
            <Plus size={15} /> {buying ? 'Opening checkout…' : 'Buy 5 executions — ₹100'}
          </button>
        </div>
      </div>

      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold mb-4">Recent payments</h2>
        {history.length === 0 ? (
          <p className="opacity-60 text-sm">No payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="opacity-60 text-left">
              <tr>
                <th className="py-2">Date</th>
                <th>Amount</th>
                <th>Units</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map(p => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="py-2">{fmtDate(p.created_at)}</td>
                  <td>{fmtINR(p.amount_paise)}</td>
                  <td>{p.quota_units} × 5</td>
                  <td>
                    <span className={
                      p.status === 'paid' ? 'text-emerald-300' :
                      p.status === 'failed' ? 'text-red-300' :
                      'opacity-70'
                    }>
                      {p.status === 'paid' ? 'Captured' :
                       p.status === 'failed' ? 'Failed' : 'Pending'}
                    </span>
                  </td>
                  <td className="text-right">
                    {p.razorpay_payment_id && (
                      <span className="opacity-50 text-xs">
                        {p.razorpay_payment_id.slice(0, 14)}…
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default BillingPage;
