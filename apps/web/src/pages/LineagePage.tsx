import { useEffect, useState } from 'react';
import { Activity, GitBranch, History } from 'lucide-react';
import type { PipelineLineageChange } from '@dataflow/shared';
import { api } from '../api';
import { ApiError } from '../components/ApiError';
import RuntimeLineage from './RuntimeLineage';
import ArchitectureLineage from './ArchitectureLineage';

// /lineage shell. Runtime (default): aggregated execution metrics over a
// bounded window. Architecture: the saved pipeline/version graph. Changes:
// lineage history derived from immutable saved versions.

type LineageTab = 'runtime' | 'architecture' | 'changes';

const TABS: Array<{ key: LineageTab; label: string; icon: typeof Activity }> = [
  { key: 'runtime', label: 'Runtime lineage', icon: Activity },
  { key: 'architecture', label: 'Architecture lineage', icon: GitBranch },
  { key: 'changes', label: 'Changes', icon: History },
];

type LineageHistoryItem = {
  rowId: string; pipelineKey: string; name: string; status: string; environment: string;
  fromVersion: number | null; toVersion: number; createdAt: string;
  summary: Record<'breaking' | 'warning' | 'info', number>; changes: PipelineLineageChange[];
};

function LineageChanges() {
  const [environment, setEnvironment] = useState('');
  const [items, setItems] = useState<LineageHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (env: string) => {
    setLoading(true); setError(null);
    try {
      const history = await api.lineageChanges(env || undefined, 50);
      setItems(history.items ?? []);
    } catch (e: any) { setError(e.message ?? 'Failed to load lineage changes'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(environment); }, [environment]);

  return (
    <div className="h-full min-h-0 overflow-auto px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">Pipeline version history</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">Derived from immutable saved versions.</p>
          </div>
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Environment</span>
            <select className="glass-input w-auto py-1.5 text-[12px]" value={environment}
              onChange={event => setEnvironment(event.target.value)} aria-label="Changes environment">
              <option value="">All</option><option value="test">Integration</option><option value="prod">Production</option>
            </select>
          </label>
        </div>
        {error && <div className="mt-4"><ApiError message={error} onRetry={() => refresh(environment)} /></div>}
        {loading && <p className="mt-6 text-xs text-gray-500 dark:text-white/50">Loading changes…</p>}
        {!loading && !error && items.length === 0 && <p className="mt-6 text-xs text-gray-500">No lineage changes found.</p>}
        <div className="mt-4 space-y-3">{items.map(item => <article key={item.rowId} className="rounded-lg border border-gray-100 p-3 dark:border-white/[0.07]">
          <div className="flex items-start justify-between gap-2"><div><p className="truncate text-xs font-semibold text-gray-800 dark:text-white/80">{item.name}</p><p className="mt-0.5 text-[9px] text-gray-400">{item.environment === 'prod' ? 'Production' : 'Integration'} · {item.fromVersion == null ? 'Created' : `v${item.fromVersion} → v${item.toVersion}`}</p></div><time className="shrink-0 text-[9px] text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</time></div>
          <div className="mt-2 flex gap-1.5 text-[9px] font-semibold">{item.summary.breaking > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600 dark:bg-red-500/10">{item.summary.breaking} breaking</span>}{item.summary.warning > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600 dark:bg-amber-500/10">{item.summary.warning} warning</span>}{item.summary.info > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600 dark:bg-blue-500/10">{item.summary.info} info</span>}</div>
          <div className="mt-2 space-y-1">{item.changes.slice(0, 4).map((change, index) => <p key={`${change.kind}:${change.assetUrn ?? ''}:${change.field ?? ''}:${index}`} className={`text-[10px] ${change.severity === 'breaking' ? 'text-red-600 dark:text-red-300' : change.severity === 'warning' ? 'text-amber-600 dark:text-amber-300' : 'text-gray-500 dark:text-white/50'}`}>{change.message}</p>)}{item.changes.length > 4 && <p className="text-[9px] text-gray-400">+{item.changes.length - 4} more</p>}</div>
        </article>)}</div>
      </div>
    </div>
  );
}

export default function LineagePage() {
  const [tab, setTab] = useState<LineageTab>('runtime');
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-4 dark:border-white/[0.07] lg:px-6">
        <nav className="flex gap-1" role="tablist" aria-label="Lineage views">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} role="tab" aria-selected={tab === key}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${tab === key
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-white/50 dark:hover:text-white/80'}`}
              onClick={() => setTab(key)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'runtime' && <RuntimeLineage />}
        {tab === 'architecture' && <ArchitectureLineage />}
        {tab === 'changes' && <LineageChanges />}
      </div>
    </div>
  );
}
