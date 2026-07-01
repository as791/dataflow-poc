import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../api';
import { displayEnvironment } from './LifecyclePage';
import { DateTimePicker } from '../components/DateTimePicker';

interface Execution {
  id: string; name: string; pipeline_id: string; environment?: string;
  phase?: string; started_at?: string; finished_at?: string; error?: string;
}

const PHASE_STYLE: Record<string, { bar: string; badge: string }> = {
  completed: { bar: 'bg-emerald-400/70', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/25 dark:text-emerald-400' },
  failed:    { bar: 'bg-red-400/70',     badge: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/15 dark:border-red-500/25 dark:text-red-400' },
  running:   { bar: 'bg-cyan-400/70',    badge: 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-500/15 dark:border-cyan-500/25 dark:text-cyan-400 animate-pulse' },
  cancelled: { bar: 'bg-gray-300/60',    badge: 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-white/5 dark:border-white/10 dark:text-white/35' },
};

const STATUS_PILLS = [
  { key: '',          label: 'All',       dot: '' },
  { key: 'running',   label: 'Running',   dot: 'bg-cyan-400 animate-pulse' },
  { key: 'completed', label: 'Completed', dot: 'bg-emerald-400' },
  { key: 'failed',    label: 'Failed',    dot: 'bg-red-400' },
  { key: 'cancelled', label: 'Cancelled', dot: 'bg-gray-400' },
];

const ENV_PILLS = [
  { key: '',     label: 'All envs' },
  { key: 'test', label: 'Integration' },
  { key: 'prod', label: 'Production' },
];

const PILL_CLS = (active: boolean) =>
  `flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
    active
      ? 'bg-gray-900 border-gray-900 text-white dark:bg-white/[0.12] dark:border-white/[0.2] dark:text-white'
      : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:border-white/[0.07] dark:text-white/45 dark:hover:bg-white/[0.065] dark:hover:text-white/75'
  }`;

function fmtDt(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function durMs(started?: string, finished?: string): string {
  if (!started || !finished) return '—';
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function RunDrawer({ run, onClose }: { run: Execution; onClose: () => void }) {
  const cfg = PHASE_STYLE[run.phase ?? ''];
  return (
    <div className="flex w-[360px] flex-none flex-col border-l border-gray-200 bg-white
      dark:border-white/[0.08] dark:bg-white/[0.04] dark:backdrop-blur-xl overflow-hidden
      shadow-[-18px_0_50px_rgba(0,0,0,.08)] dark:shadow-[-18px_0_50px_rgba(0,0,0,.28)]">

      <div className="px-5 pt-4 pb-3.5 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg?.badge ?? 'bg-gray-50 border-gray-200 text-gray-500'}`}>
            {run.phase ?? 'unknown'}
          </span>
          <button onClick={onClose}
            className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-[6px]
              bg-gray-100 border border-gray-200 text-gray-400 hover:bg-gray-200 hover:text-gray-700
              dark:bg-white/[0.04] dark:border-white/[0.07] dark:text-white/40
              dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
            <X size={13} />
          </button>
        </div>
        <div className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white/90 mb-0.5 truncate">{run.name}</div>
        <div className="text-[11px] text-gray-400 dark:text-white/35">{displayEnvironment(run.environment)}</div>
        <Link to={`/runs/${run.id}`}
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] text-brand-500 hover:text-brand-600 dark:hover:text-brand-300 transition-colors">
          <ExternalLink size={11} /> View full run
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-0">
        {[
          { label: 'Started',  value: fmtDt(run.started_at) },
          { label: 'Finished', value: fmtDt(run.finished_at) },
          { label: 'Duration', value: durMs(run.started_at, run.finished_at) },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] py-3 text-[12px]">
            <span className="text-gray-400 dark:text-white/40">{label}</span>
            <span className="text-gray-800 dark:text-white/80 font-medium tabular-nums">{value}</span>
          </div>
        ))}
        {run.error && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-3">
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400 mb-1">Error</p>
            <p className="text-[11px] text-red-500 dark:text-red-400/80 break-words leading-relaxed">{run.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RunsPage() {
  const [rows, setRows] = useState<Execution[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Execution | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ pipeline: '', env: '', status: '', from: '', to: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listExecutionsPage({ ...filters, limit: '50' });
      setRows(page.items ?? []); setNextCursor(page.nextCursor ?? null);
    }
    catch { setRows([]); setNextCursor(null); }
    finally { setLoading(false); }
  }, [filters]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const page = await api.listExecutionsPage({ ...filters, limit: '50', cursor: nextCursor });
      setRows(r => [...r, ...page.items]); setNextCursor(page.nextCursor);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { api.listPipelines().then(setPipelines).catch(() => {}); }, []);

  const setF = (k: keyof typeof filters, v: string) => setFilters(f => ({ ...f, [k]: v }));

  const visible = search
    ? rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0 min-h-0">

        {/* toolbar */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-100 dark:border-white/[0.06] flex-wrap shrink-0">
          {/* status pills */}
          {STATUS_PILLS.map(({ key, label, dot }) => (
            <button key={key} onClick={() => setF('status', key)} className={PILL_CLS(filters.status === key)}>
              {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
              {label}
            </button>
          ))}

          <div className="h-4 w-px bg-gray-200 dark:bg-white/10 mx-0.5" />

          {/* env pills */}
          {ENV_PILLS.map(({ key, label }) => (
            <button key={key} onClick={() => setF('env', key)} className={PILL_CLS(filters.env === key)}>
              {label}
            </button>
          ))}

          {/* right controls */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <select className="glass-input text-[12px] py-1.5" value={filters.pipeline}
              onChange={e => setF('pipeline', e.target.value)}>
              <option value="">All pipelines</option>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <DateTimePicker value={filters.from} onChange={v => setF('from', v)} placeholder="From" />
            <DateTimePicker value={filters.to}   onChange={v => setF('to',   v)} placeholder="To" />
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-gray-400 dark:text-white/30 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…" className="glass-input pl-7 py-1.5 text-[12px] w-36" />
            </div>
            <button onClick={refresh} disabled={loading}
              className="icon-button w-8 h-8 border-transparent bg-transparent">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex items-center justify-center h-32 text-[12px] text-gray-400 dark:text-white/25">Loading…</div>}
          {!loading && visible.length === 0 && (
            <div className="flex items-center justify-center h-32 text-[12px] text-gray-400 dark:text-white/40">No runs match</div>
          )}
          {visible.map(r => {
            const cfg = PHASE_STYLE[r.phase ?? ''];
            const sel = selected?.id === r.id;
            return (
              <div key={r.id} onClick={() => setSelected(sel ? null : r)}
                className={`group flex items-stretch border-b border-gray-100 dark:border-white/[0.05] cursor-pointer transition-colors ${
                  sel ? 'bg-brand-50 dark:bg-brand-500/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-white/[0.025]'
                }`}>
                <div className={`w-[3px] shrink-0 ${cfg?.bar ?? 'bg-gray-300/60'}`} />
                <div className="flex flex-1 flex-wrap items-center gap-3.5 px-5 py-3 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 dark:text-white/88 truncate">{r.name}</div>
                    <div className="text-[11px] text-gray-400 dark:text-white/35 mt-0.5">
                      {displayEnvironment(r.environment)} · {fmtDt(r.started_at)}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-2.5 ml-auto">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg?.badge ?? 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                      {r.phase ?? 'unknown'}
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-white/35 w-12 text-right tabular-nums">
                      {durMs(r.started_at, r.finished_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {nextCursor && (
            <div className="flex justify-center py-4">
              <button className="glass-btn-ghost text-sm" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center px-6 py-2 border-t border-gray-100 dark:border-white/[0.06] shrink-0">
          <span className="list-footer">{visible.length} run{visible.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {selected && <RunDrawer run={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
