import { useCallback, useEffect, useState } from 'react';
import { Rocket, RefreshCw } from 'lucide-react';
import { api } from '../api';

export type Stage = 'draft' | 'testing' | 'production' | 'archived';
const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft', testing: 'Integration', production: 'Production', archived: 'Archived',
};
const ENV_LABEL: Record<string, string> = { test: 'Integration', prod: 'Production' };

export function displayStage(stage: Stage) { return STAGE_LABEL[stage]; }
export function displayEnvironment(environment?: string) {
  return environment ? (ENV_LABEL[environment] ?? environment) : 'Integration';
}
export function deriveStage(status?: string, environment?: string): Stage {
  if (status === 'active' && environment === 'prod') return 'production';
  if (status === 'active' && environment === 'test') return 'testing';
  if (status === 'archived') return 'archived';
  return 'draft';
}

const STAGE_STYLE: Record<Stage, string> = {
  draft:      'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/60',
  testing:    'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  production: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  archived:   'bg-gray-50 text-gray-400 dark:bg-white/5 dark:text-white/35',
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`glass-badge ${STAGE_STYLE[stage]}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 opacity-70" />
      {displayStage(stage)}
    </span>
  );
}

interface Pipeline {
  id: string; pipeline_key: string; version: number; name: string;
  status: string; environment?: string;
}

export default function LifecyclePage() {
  const [rows, setRows] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await api.listPipelines()); }
    catch (e: any) { setError(e.message ?? 'Failed to load pipelines'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const transition = async (row: Pipeline, to: 'testing' | 'production') => {
    setBusy(row.id); setError(null);
    try { await api.setStage(row.id, to); await refresh(); }
    catch (e: any) { setError(e.message ?? 'Transition failed'); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-heading flex items-center gap-2"><Rocket size={20} /> Lifecycle</h1>
          <p className="page-subtitle mt-1">
            Promote pipelines draft → Integration → production. Production requires a green Integration run.
          </p>
        </div>
        <button className="glass-btn-ghost text-sm flex items-center gap-1.5" onClick={refresh} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-danger/90 bg-red-50 dark:bg-danger/10 border border-red-200 dark:border-danger/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="glass-card divide-y divide-gray-100 dark:divide-white/5">
        {rows.length === 0 && !loading && (
          <p className="p-6 text-sm text-gray-400 dark:text-white/40">No pipelines yet.</p>
        )}
        {rows.map(row => {
          const stage = deriveStage(row.status, row.environment);
          return (
            <div key={row.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900 dark:text-white/90">{row.name}</p>
                <p className="text-xs text-gray-400 dark:text-white/40">v{row.version} · {displayEnvironment(row.environment)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StageBadge stage={stage} />
                {stage === 'draft' && (
                  <button className="glass-btn-ghost text-sm" disabled={busy === row.id}
                    onClick={() => transition(row, 'testing')}>
                    {busy === row.id ? '…' : 'Promote to Integration →'}
                  </button>
                )}
                {stage === 'testing' && (
                  <button className="glass-btn-primary text-sm" disabled={busy === row.id}
                    onClick={() => transition(row, 'production')}>
                    {busy === row.id ? '…' : 'Promote to production →'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
