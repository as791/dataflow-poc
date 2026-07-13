import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Clock, Play, RefreshCw, RotateCcw, Search, X,
} from 'lucide-react';
import { api } from '../api';
import { deriveStage, type Stage } from '../utils/pipelineStage';
import { ApiError } from '../components/ApiError';
import { useCatalog } from '../context/CatalogContext';
import { ActivityIcon } from '../components/canvas/FlowNode';

// ── types ─────────────────────────────────────────────────────────────────────

interface Pipeline {
  id: string;
  pipeline_key: string;
  version: number;
  name: string;
  status: string;
  environment: string;
  created_at: string;
  definition: any;
  last_run_phase: string | null;
  last_run_at: string | null;
  last_run_id: string | null;
}

interface Execution {
  id: string;
  phase: string;
  started_at: string;
  completed_at: string | null;
  error?: string;
  record_count?: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function reltime(iso: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function duration(started: string, completed: string | null): string {
  if (!completed) return '—';
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

// ponytail: activityIcon() removed — use ActivityIcon from FlowNode directly

function stageOf(p: Pipeline): Stage { return deriveStage(p.status, p.environment); }

function pipelineName(p: Pipeline): string { return p.name?.trim() || p.pipeline_key || 'Untitled pipeline'; }

function triggerLabel(def: any): string {
  const t = def?.trigger;
  if (!t || t.type === 'manual') return 'Manual';
  if (t.type === 'cron') return `Cron · ${t.cron ?? ''}`;
  if (t.type === 'webhook') return 'Webhook';
  return t.type;
}

function pipelineNodes(def: any) {
  if (!def?.nodes) return [];
  return (def.nodes as any[]).filter(n => n.activityType && n.nodeType !== 'fork' && n.nodeType !== 'merge').slice(0, 4);
}

// ── stage config ──────────────────────────────────────────────────────────────

const STAGE_CFG: Record<Stage, { bar: string; badge: string; label: string }> = {
  draft:      { bar: 'bg-amber-400/40',   badge: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/25 dark:text-amber-300',              label: 'Draft' },
  testing:    { bar: 'bg-blue-400/60',    badge: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/25 dark:text-blue-300',                    label: 'Integration' },
  production: { bar: 'bg-emerald-400/70', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/25 dark:text-emerald-300',  label: 'Production' },
  archived:   { bar: 'bg-gray-300/60',    badge: 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-white/5 dark:border-white/10 dark:text-white/35',                           label: 'Archived' },
};

// ── sub-components ────────────────────────────────────────────────────────────

function PipelineIcon({ definition }: { definition: any }) {
  const { byType } = useCatalog();
  const node = pipelineNodes(definition)[0];
  if (!node) return null;
  const entry = byType[node.activityType];
  return (
    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border
      border-gray-200 bg-gray-50 dark:border-white/[0.1] dark:bg-white/[0.05]"
      style={{ color: entry?.color ?? '#7c6cf2' }} title={entry?.label ?? node.activityType}>
      <ActivityIcon activityType={node.activityType} nodeType={node.nodeType} size={13} />
    </span>
  );
}

function RunDot({ phase }: { phase: string | null }) {
  if (phase === 'completed') return <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />;
  if (phase === 'failed')    return <span className="h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400" />;
  if (phase === 'running')   return <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-white/20" />;
}

function RunLabel({ phase }: { phase: string | null }) {
  if (phase === 'completed') return <span className="text-emerald-600 dark:text-emerald-400">Success</span>;
  if (phase === 'failed')    return <span className="text-red-600 dark:text-red-400">Failed</span>;
  if (phase === 'running')   return <span className="text-cyan-600 dark:text-cyan-400">Running</span>;
  return <span className="text-gray-400 dark:text-white/40">Never run</span>;
}

// ── drawer ────────────────────────────────────────────────────────────────────

function PipelineDrawer({ pipeline, onClose }: { pipeline: Pipeline; onClose: () => void }) {
  const navigate = useNavigate();
  const { byType } = useCatalog();
  const [runs, setRuns] = useState<Execution[]>([]);
  const [tab, setTab] = useState<'runs'>('runs');
  const stage = stageOf(pipeline);
  const cfg = STAGE_CFG[stage];
  const nodes = pipelineNodes(pipeline.definition);

  useEffect(() => {
    api.listExecutions({ pipeline: pipeline.id, limit: '30' })
      .then((d: Execution[]) => setRuns(d))
      .catch(() => {});
  }, [pipeline.id]);

  const successRate = runs.length
    ? Math.round((runs.filter(r => r.phase === 'completed').length / runs.length) * 100)
    : null;

  return (
    <div className="flex w-[380px] flex-none flex-col border-l border-gray-200 bg-white
      dark:border-white/[0.08] dark:bg-white/[0.04] dark:backdrop-blur-xl overflow-hidden
      shadow-[-18px_0_50px_rgba(0,0,0,.08)] dark:shadow-[-18px_0_50px_rgba(0,0,0,.28)]">

      {/* header */}
      <div className="px-5 pt-4 pb-3.5 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2 mb-1 min-w-0">
          <span className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white/90 min-w-0 truncate">{pipelineName(pipeline)}</span>
          <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full border shrink-0 ${cfg.badge}`}>{cfg.label}</span>
          <button onClick={onClose} aria-label="Close pipeline details"
            className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-[6px] shrink-0
              bg-gray-100 border border-gray-200 text-gray-400 hover:bg-gray-200 hover:text-gray-700
              dark:bg-white/[0.04] dark:border-white/[0.07] dark:text-white/40
              dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
            <X size={13} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-white/35">
          <Clock size={11} />
          <span>v{pipeline.version} · {triggerLabel(pipeline.definition)}</span>
        </div>
        <div className="flex gap-1.5 mt-3">
          {[
            { label: 'Edit',     icon: <ChevronRight size={12}/>, action: () => navigate('/', { state: { pipelineId: pipeline.id } }) },
            { label: 'Run now',  icon: <Play size={11}/>,         action: () => api.run(pipeline.id).catch(() => {}) },
            { label: 'Backfill', icon: <RotateCcw size={11}/>,    action: () => navigate('/lifecycle', { state: { openBackfillId: pipeline.id } }) },
          ].map(({ label, icon, action }) => (
            <button key={label} onClick={action}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-medium transition-all
                bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-gray-900
                dark:bg-white/[0.045] dark:border-white/[0.08] dark:text-white/65
                dark:hover:bg-white/[0.085] dark:hover:text-white">
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
        {[
          { val: successRate != null ? `${successRate}%` : '—', lbl: 'Success rate', hi: successRate != null && successRate >= 80 },
          { val: String(runs.length),                            lbl: 'Runs (recent)', hi: false },
          { val: pipeline.last_run_at ? reltime(pipeline.last_run_at) : '—', lbl: 'Last run', hi: false },
        ].map(({ val, lbl, hi }) => (
          <div key={lbl} className="py-3 text-center border-r border-gray-100 dark:border-white/[0.06] last:border-r-0">
            <div className={`text-[17px] font-semibold tracking-tight ${hi ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white/90'}`}>{val}</div>
            <div className="text-[10px] uppercase tracking-[.08em] text-gray-400 dark:text-white/40 mt-0.5">{lbl}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div className="flex border-b border-gray-100 dark:border-white/[0.07] px-4 shrink-0">
        {/* ponytail: lineage/config/access tabs hidden until implemented */}
        {(['runs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-2.5 px-2.5 text-[11px] font-medium capitalize border-b-2 -mb-px transition-all ${
              tab === t
                ? 'text-gray-900 border-brand-500 dark:text-white/90'
                : 'text-gray-400 border-transparent hover:text-gray-600 dark:text-white/35 dark:hover:text-white/65'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* run list */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'runs' && (
          runs.length === 0
            ? <div className="flex items-center justify-center h-32 text-[12px] text-gray-400 dark:text-white/40">No runs yet</div>
            : runs.map(run => (
              <div key={run.id}
                className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.05]
                  hover:bg-gray-50 dark:hover:bg-white/[0.025] cursor-pointer">
                <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border shrink-0 text-[12px] font-semibold ${
                  run.phase === 'completed'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400'
                    : run.phase === 'failed'
                    ? 'bg-red-50 border-red-200 text-red-500 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400'
                    : 'bg-blue-50 border-blue-200 text-blue-500 dark:bg-cyan-500/10 dark:border-cyan-500/20 dark:text-cyan-400'
                }`}>
                  {run.phase === 'completed' ? '✓' : run.phase === 'failed' ? '✕' : '↻'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-gray-700 dark:text-white/80 truncate">
                    {reltime(run.started_at)}
                    {run.record_count != null && (
                      <span className="ml-1.5 text-gray-400 dark:text-white/45">{run.record_count.toLocaleString()} rows</span>
                    )}
                  </div>
                  {run.error && <div className="text-[10px] text-red-500 dark:text-red-400/80 truncate mt-0.5">{run.error}</div>}
                </div>
                <span className="text-[11px] text-gray-400 dark:text-white/45 shrink-0">{duration(run.started_at, run.completed_at)}</span>
              </div>
            ))
        )}
        {tab !== 'runs' && (
          <div className="flex items-center justify-center h-32 text-[12px] text-gray-400 dark:text-white/40">Coming soon</div>
        )}
      </div>

      {/* mini topology */}
      {nodes.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-white/[0.07] shrink-0">
          <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-gray-400 dark:text-white/40 mb-2">Topology</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {nodes.map((n, i) => {
              const entry = byType[n.activityType];
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 px-2 py-1 rounded-[6px] border text-[11px] font-medium
                    border-gray-200 bg-gray-50 dark:border-white/[0.1] dark:bg-white/[0.05]"
                    style={{ color: entry?.color ?? '#7c6cf2' }}>
                    <ActivityIcon activityType={n.activityType} nodeType={n.nodeType} size={11} />
                    {entry?.label ?? n.activityType}
                  </span>
                  {i < nodes.length - 1 && <span className="text-[10px] text-gray-300 dark:text-white/20">→</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'production' | 'integration' | 'draft';
type TriggerFilter = 'all' | 'cron' | 'manual' | 'webhook';

const FILTERS: { key: FilterType; label: string; dot?: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'production',  label: 'Production',      dot: 'bg-emerald-400' },
  { key: 'integration', label: 'Integration',     dot: 'bg-blue-400' },
  { key: 'draft',       label: 'Draft',           dot: 'bg-amber-400' },
];

const TRIGGER_FILTERS: { key: TriggerFilter; label: string }[] = [
  { key: 'all', label: 'All triggers' },
  { key: 'cron', label: 'Cron' },
  { key: 'manual', label: 'Manual' },
  { key: 'webhook', label: 'Webhook' },
];

function triggerType(p: Pipeline): Exclude<TriggerFilter, 'all'> | 'other' {
  const type = p.definition?.trigger?.type ?? 'manual';
  return type === 'cron' || type === 'manual' || type === 'webhook' ? type : 'other';
}

function matches(p: Pipeline, f: FilterType): boolean {
  if (f === 'all')         return true;
  if (f === 'production')  return stageOf(p) === 'production';
  if (f === 'integration') return stageOf(p) === 'testing';
  if (f === 'draft')       return stageOf(p) === 'draft';
  return true;
}

export default function PipelinesPage() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('all');
  const [failedOnly, setFailedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Pipeline | null>(null);

  const load = () => {
    setLoading(true); setError(null);
    api.listPipelines()
      .then((d: Pipeline[]) => { setPipelines(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const counts = Object.fromEntries(
    FILTERS.map(({ key }) => [key, pipelines.filter(p => matches(p, key)).length])
  ) as Record<FilterType, number>;

  const visible = pipelines
    .filter(p => matches(p, filter))
    .filter(p => triggerFilter === 'all' || triggerType(p) === triggerFilter)
    .filter(p => !failedOnly || p.last_run_phase === 'failed')
    .filter(p => !search || pipelineName(p).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {/* toolbar */}
        <div className="flex flex-col gap-2 px-6 py-2.5 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[.06em] text-gray-400 dark:text-white/30">Stage</span>
            {FILTERS.map(({ key, label, dot }) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  filter === key
                    ? 'bg-gray-900 border-gray-900 text-white dark:bg-white/[0.12] dark:border-white/[0.2] dark:text-white'
                    : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:border-white/[0.07] dark:text-white/45 dark:hover:bg-white/[0.065] dark:hover:text-white/75'
                }`}>
                {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
                {label}
                <span className="text-gray-400 dark:text-white/30 ml-0.5">{counts[key]}</span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-2.5 text-gray-400 dark:text-white/30 pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search…" className="glass-input pl-7 py-1.5 text-[12px] w-40" />
              </div>
              <button onClick={load} aria-label="Refresh pipelines" className="icon-button h-8 w-8 border-transparent bg-transparent"><RefreshCw size={14} /></button>
              <button onClick={() => navigate('/')} className="glass-btn-primary text-[12px] py-1.5 px-4">+ New</button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[.06em] text-gray-400 dark:text-white/30">Trigger</span>
            {TRIGGER_FILTERS.map(({ key, label }) => (
              <button key={key} onClick={() => setTriggerFilter(key)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${triggerFilter === key
                  ? 'bg-gray-900 border-gray-900 text-white dark:bg-white/[0.12] dark:border-white/[0.2] dark:text-white'
                  : 'bg-transparent border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-white/[0.07] dark:text-white/45 dark:hover:bg-white/[0.065] dark:hover:text-white/75'}`}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={failedOnly} onClick={() => setFailedOnly(v => !v)}
            className={`flex w-fit items-center gap-2 py-0.5 text-[12px] font-medium transition-colors ${failedOnly ? 'text-red-500' : 'text-gray-500 dark:text-white/55'}`}>
            <span className={`relative h-[17px] w-[30px] rounded-full transition-colors ${failedOnly ? 'bg-red-500' : 'bg-gray-200 dark:bg-white/[0.14]'}`}>
              <span className={`absolute top-0.5 h-[13px] w-[13px] rounded-full bg-white shadow-sm transition-[left] ${failedOnly ? 'left-[15px]' : 'left-0.5'}`} />
            </span>
            Only show last-run failures
            <span className="text-gray-400 dark:text-white/30">({pipelines.filter(p => p.last_run_phase === 'failed').length})</span>
          </button>
        </div>

        {/* rows */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex items-center justify-center h-32 text-[12px] text-gray-400 dark:text-white/25">Loading…</div>}
          {!loading && error && <div className="p-6"><ApiError message={error} onRetry={load} /></div>}
          {!loading && !error && visible.length === 0 && (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-[12px] text-gray-400 dark:text-white/35">
              {pipelines.length === 0 ? (
                <>
                  <span>No pipelines yet. Create one to run your first data flow.</span>
                  <button className="glass-btn-primary px-3 py-1 text-xs" onClick={() => navigate('/')}>Create pipeline</button>
                </>
              ) : (
                <>
                  <span>No pipelines match these filters.</span>
                  <button className="glass-btn-ghost px-3 py-1 text-xs" onClick={() => { setFilter('all'); setTriggerFilter('all'); setFailedOnly(false); setSearch(''); }}>Clear filters</button>
                </>
              )}
            </div>
          )}
          {!error && visible.map(p => {
            const stage = stageOf(p);
            const cfg = STAGE_CFG[stage];
            const sel = selected?.id === p.id;
            return (
              <button type="button" key={p.id} onClick={() => setSelected(sel ? null : p)}
                className={`group flex w-full items-stretch border-b border-gray-100 text-left text-gray-900 dark:border-white/[0.05] dark:text-white/90 cursor-pointer transition-colors ${
                  sel ? 'bg-brand-50 dark:bg-brand-500/[0.06]' : 'hover:bg-gray-50 dark:hover:bg-white/[0.025]'
                }`}>
                <div className={`w-[3px] shrink-0 ${cfg.bar}`} />
                <div className="flex flex-1 flex-wrap items-center gap-3.5 px-5 py-3 min-w-0">
                  <PipelineIcon definition={p.definition} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 dark:text-white/90 truncate">{pipelineName(p)}</div>
                    <div className="text-[11px] text-gray-400 dark:text-white/32 mt-0.5">{triggerLabel(p.definition)}</div>
                  </div>
                  <div className="flex flex-none items-center gap-2.5 ml-auto">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-white/50">
                      <RunDot phase={p.last_run_phase} />
                      <RunLabel phase={p.last_run_phase} />
                    </div>
                    <span className="text-[11px] text-gray-400 dark:text-white/28 w-16 text-right">{reltime(p.last_run_at)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* footer */}
        <div className="flex items-center px-6 py-2 border-t border-gray-100 dark:border-white/[0.06] shrink-0">
          <span className="text-[11px] text-gray-400 dark:text-white/28">{visible.length} pipeline{visible.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {selected && <PipelineDrawer key={selected.id} pipeline={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
