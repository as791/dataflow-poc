import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { api } from '../api';
import { displayEnvironment } from './LifecyclePage';

interface Execution {
  id: string; name: string; pipeline_id: string; environment?: string;
  phase?: string; started_at?: string; finished_at?: string;
}

const PHASES = ['', 'running', 'completed', 'failed', 'cancelled'];
const PHASE_STYLE: Record<string, string> = {
  completed: 'text-emerald-600 dark:text-emerald-300',
  failed:    'text-red-500 dark:text-danger',
  running:   'text-amber-600 dark:text-amber-300',
  cancelled: 'text-gray-400 dark:text-white/40',
};

export default function RunsPage() {
  const [rows, setRows] = useState<Execution[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ pipeline: '', env: '', status: '', from: '', to: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listExecutionsPage({ ...filters, limit: '50' });
      setRows(page.items); setNextCursor(page.nextCursor);
    }
    finally { setLoading(false); }
  }, [filters]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const page = await api.listExecutionsPage({ ...filters, limit: '50', cursor: nextCursor });
      setRows(current => [...current, ...page.items]); setNextCursor(page.nextCursor);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { api.listPipelines().then(setPipelines).catch(() => {}); }, []);

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFilters(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-heading">Runs</h1>
          <p className="page-subtitle mt-1">Execution history across pipelines.</p>
        </div>
        <button className="glass-btn-ghost text-sm flex items-center gap-1.5" onClick={refresh} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="glass-input" value={filters.pipeline} onChange={set('pipeline')}>
          <option value="">All pipelines</option>
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="glass-input" value={filters.env} onChange={set('env')}>
          <option value="">All envs</option>
          <option value="test">Integration</option>
          <option value="prod">Production</option>
        </select>
        <select className="glass-input" value={filters.status} onChange={set('status')}>
          {PHASES.map(p => <option key={p} value={p}>{p || 'All statuses'}</option>)}
        </select>
        <input type="date" className="glass-input" value={filters.from} onChange={set('from')} title="From" />
        <input type="date" className="glass-input" value={filters.to} onChange={set('to')} title="To" />
      </div>

      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
        {rows.length === 0 && !loading && (
          <p className="p-6 text-sm text-gray-400 dark:text-white/40">No runs match.</p>
        )}
        {rows.map(r => (
          <Link key={r.id} to={`/runs/${r.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900 dark:text-white/90">{r.name}</p>
              <p className="text-xs text-gray-400 dark:text-white/40">
                {displayEnvironment(r.environment)} · {r.started_at ? new Date(r.started_at).toLocaleString() : ''}
              </p>
            </div>
            <span className={`text-sm font-medium ${PHASE_STYLE[r.phase ?? ''] ?? 'text-gray-500 dark:text-white/60'}`}>
              {r.phase ?? 'unknown'}
            </span>
          </Link>
        ))}
      </div>
      {nextCursor && (
        <button className="glass-btn-ghost mx-auto block text-sm" onClick={loadMore} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
