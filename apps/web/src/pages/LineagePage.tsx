import { memo, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Position,
  type Edge, type Node, type NodeProps,
} from 'reactflow';
import { Link } from 'react-router-dom';
import { AlertTriangle, Database, History, RefreshCw, Search, Workflow } from 'lucide-react';
import { filterWorkspaceLineage, type PipelineLineageChange, type WorkspaceLineage } from '@dataflow/shared';
import { api } from '../api';
import { useTheme } from '../context/ThemeContext';
import { ApiError } from '../components/ApiError';

const LAYER_X: Record<string, number> = { external: 40, bronze: 520, silver: 1000, gold: 1480 };
const LAYER_COLOR: Record<string, string> = {
  external: '#64748b', bronze: '#b7791f', silver: '#94a3b8', gold: '#eab308',
};
const HEALTH_COLOR: Record<string, string> = {
  healthy: '#10b981', warning: '#f59e0b', critical: '#ef4444', unmonitored: '#94a3b8',
};
type PipelineHealth = {
  id: string; health: 'healthy' | 'warning' | 'critical' | 'unmonitored';
  last_execution_id?: string; last_phase?: string;
  breaches?: Array<{ type: string; severity: string; message: string }>;
};
type LineageHistoryItem = {
  rowId: string; pipelineKey: string; name: string; status: string; environment: string;
  fromVersion: number | null; toVersion: number; createdAt: string;
  summary: Record<'breaking' | 'warning' | 'info', number>; changes: PipelineLineageChange[];
};

const AssetNode = memo(function AssetNode({ data }: NodeProps) {
  const layer = data.layer ?? 'external';
  return (
    <div className="min-w-[210px] rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-white/10 dark:bg-[#12151f]/95">
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <Database size={14} style={{ color: LAYER_COLOR[layer] }} />
        <span className="truncate text-xs font-semibold text-gray-900 dark:text-white/90">{data.name}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-gray-400 dark:text-white/45">{data.platform} · {data.namespace}</p>
      {data.schema?.fields?.length > 0 && <p className="mt-1 text-[10px] text-violet-500">Contract · {data.schema.fields.length} fields</p>}
      {data.materialization && <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
        Updated {new Date(data.materialization.materializedAt).toLocaleString()}
        {data.materialization.recordCount != null ? ` · ${data.materialization.recordCount.toLocaleString()} rows` : ''}
      </p>}
      {data.quality && <p className={`mt-1 text-[10px] font-semibold ${data.quality.status === 'passed' ? 'text-emerald-600 dark:text-emerald-400' : data.quality.status === 'failed' ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
        Quality {data.quality.status} · {data.quality.failedCount.toLocaleString()} rejected
      </p>}
      <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
        style={{ background: LAYER_COLOR[layer] }}>{layer}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const PipelineNode = memo(function PipelineNode({ data }: NodeProps) {
  const health = data.health ?? 'unmonitored';
  return (
    <div className="min-w-[190px] rounded-xl border bg-brand-50 px-3 py-2 shadow-md dark:bg-brand-500/10"
      style={{ borderColor: HEALTH_COLOR[health] }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <Workflow size={14} className="text-brand-500" />
        <span className="truncate text-xs font-semibold text-gray-900 dark:text-white/90">{data.name}</span>
      </div>
      <p className="mt-1 text-[10px] text-gray-500 dark:text-white/50">
        {data.external ? `${data.namespace} · external` : `v${data.version} · ${data.environment === 'prod' ? 'Production' : 'Integration'} · ${data.status}`}
      </p>
      {!data.external && <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold capitalize" style={{ color: HEALTH_COLOR[health] }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEALTH_COLOR[health] }} />
        {health}{data.breaches?.length ? ` · ${data.breaches.length} breach${data.breaches.length === 1 ? '' : 'es'}` : ''}
      </p>}
      {(data.metadata?.domain || data.metadata?.owner) && <p className="mt-1 truncate text-[10px] text-gray-400 dark:text-white/45">
        {data.metadata?.domain ?? 'Unassigned'}{data.metadata?.owner ? ` · ${data.metadata.owner}` : ''}
      </p>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = { asset: AssetNode, pipeline: PipelineNode };

function buildFlow(graph: WorkspaceLineage, healthById: Record<string, PipelineHealth>): { nodes: Node[]; edges: Edge[] } {
  const edgeByNode = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const sourceEdges = edgeByNode.get(edge.source);
    if (sourceEdges) sourceEdges.push(edge.target);
    else edgeByNode.set(edge.source, [edge.target]);
    const targetEdges = edgeByNode.get(edge.target);
    if (targetEdges) targetEdges.push(edge.source);
    else edgeByNode.set(edge.target, [edge.source]);
  }
  const assetLayer = new Map(graph.nodes.filter(n => n.kind === 'asset').map(n => [n.id, n.asset.layer ?? 'external']));
  const laneCounts: Record<string, number> = { external: 0, bronze: 0, silver: 0, gold: 0 };
  const pipelineCount = { value: 0 };
  const nodes = graph.nodes.map<Node>(node => {
    if (node.kind === 'asset') {
      const lane = node.asset.layer ?? 'external';
      const index = laneCounts[lane]++;
      return {
        id: node.id, type: 'asset', position: { x: LAYER_X[lane], y: 90 + index * 125 },
        data: { ...node.asset, layer: lane, materialization: node.materialization, quality: node.quality }, draggable: false,
      };
    }
    const neighbours = edgeByNode.get(node.id) ?? [];
    const xs = neighbours.map(id => LAYER_X[assetLayer.get(id) ?? 'external']);
    const min = xs.length ? Math.min(...xs) : LAYER_X.external;
    const max = xs.length ? Math.max(...xs) : LAYER_X.bronze;
    const x = min === max ? min + 250 : (min + max) / 2;
    const data = node.kind === 'external-job'
      ? { ...node.externalJob, external: true, status: 'external', health: 'unmonitored' }
      : { ...node.pipeline, ...(healthById[node.pipeline.rowId] ?? { health: 'unmonitored', breaches: [] }) };
    return {
      id: node.id, type: 'pipeline', position: { x, y: 40 + pipelineCount.value++ * 150 },
      data, draggable: false,
    };
  });
  const edges = graph.edges.map<Edge>(edge => ({
    id: edge.id, source: edge.source, target: edge.target,
    style: { stroke: HEALTH_COLOR[healthById[edge.pipelineRowId]?.health] ?? '#8b86f8', strokeWidth: 1.5 },
  }));
  return { nodes, edges };
}

export default function LineagePage() {
  const { dark } = useTheme();
  const [graph, setGraph] = useState<WorkspaceLineage | null>(null);
  const [healthById, setHealthById] = useState<Record<string, PipelineHealth>>({});
  const [changes, setChanges] = useState<LineageHistoryItem[]>([]);
  const [showChanges, setShowChanges] = useState(false);
  const [environment, setEnvironment] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [layerFilter, setLayerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const [lineage, monitoring, history] = await Promise.all([
        api.workspaceLineage(environment || undefined),
        api.monitoringOverview(7).catch(() => ({ pipelines: [] })),
        api.lineageChanges(environment || undefined, 30).catch(() => ({ items: [] })),
      ]);
      setGraph(lineage);
      setChanges(history.items);
      setHealthById(Object.fromEntries((monitoring.pipelines as PipelineHealth[]).map(pipeline => [pipeline.id, pipeline])));
    }
    catch (e: any) { setError(e.message ?? 'Failed to load lineage'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [environment]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 275);
    return () => clearTimeout(timer);
  }, [search]);

  const domains = useMemo(() => [...new Set((graph?.nodes ?? []).flatMap(node =>
    node.kind === 'pipeline' ? [node.pipeline.metadata?.domain ?? 'Unassigned'] : []))].sort(), [graph]);
  const filteredGraph = useMemo(() => graph ? filterWorkspaceLineage(graph, {
    query: debouncedSearch, domains: domainFilter ? [domainFilter] : undefined,
    layers: layerFilter ? [layerFilter as 'external' | 'bronze' | 'silver' | 'gold'] : undefined,
    focusId: focusDepth && selectedId ? selectedId : undefined, depth: focusDepth,
  }) : null, [graph, debouncedSearch, domainFilter, layerFilter, focusDepth, selectedId]);
  const flow = useMemo(() => filteredGraph ? buildFlow(filteredGraph, healthById) : { nodes: [], edges: [] }, [filteredGraph, healthById]);
  const flowNodeById = useMemo(() => new Map(flow.nodes.map(node => [node.id, node])), [flow.nodes]);
  const visible = useMemo(() => {
    if (!healthFilter) return flow;
    const matched = new Set(flow.nodes.filter(node =>
      node.type === 'pipeline' && node.data.health === healthFilter,
    ).map(node => node.id));
    for (const edge of flow.edges) if (matched.has(edge.source) || matched.has(edge.target)) {
      matched.add(edge.source); matched.add(edge.target);
    }
    return { nodes: flow.nodes.filter(node => matched.has(node.id)), edges: flow.edges.filter(edge => matched.has(edge.source) && matched.has(edge.target)) };
  }, [flow, healthFilter]);
  const impact = useMemo(() => {
    if (!selectedId || !visible.nodes.some(node => node.id === selectedId)) {
      return { ...visible, upstream: new Set<string>(), downstream: new Set<string>() };
    }
    const rootId = selectedId;
    const incoming = new Map<string, string[]>(), outgoing = new Map<string, string[]>();
    for (const edge of visible.edges) {
      const sources = incoming.get(edge.target);
      if (sources) sources.push(edge.source);
      else incoming.set(edge.target, [edge.source]);
      const targets = outgoing.get(edge.source);
      if (targets) targets.push(edge.target);
      else outgoing.set(edge.source, [edge.target]);
    }
    const walk = (reverse: boolean) => {
      const found = new Set<string>([rootId]), queue = [rootId];
      for (let index = 0; index < queue.length; index++) {
        const id = queue[index];
        for (const next of (reverse ? incoming : outgoing).get(id) ?? []) if (!found.has(next)) {
          found.add(next); queue.push(next);
        }
      }
      found.delete(rootId); return found;
    };
    const upstream = walk(true), downstream = walk(false), active = new Set([rootId, ...upstream, ...downstream]);
    return {
      upstream, downstream,
      nodes: visible.nodes.map(node => ({ ...node, style: { ...node.style, opacity: active.has(node.id) ? 1 : 0.18 } })),
      edges: visible.edges.map(edge => ({ ...edge, style: { ...edge.style, opacity: active.has(edge.source) && active.has(edge.target) ? 1 : 0.12, strokeWidth: active.has(edge.source) && active.has(edge.target) ? 2.25 : 1 } })),
    };
  }, [visible, selectedId]);
  const selected = visible.nodes.find(node => node.id === selectedId);
  const selectedColumns = selected?.type === 'asset' ? (filteredGraph?.columnEdges ?? []).filter(edge =>
    edge.sourceAssetUrn === selected.data.urn || edge.targetAssetUrn === selected.data.urn) : [];
  const atRisk = [...impact.downstream].filter(id => flowNodeById.get(id)?.data.health === 'critical').length;
  const activeFilterCount = [
    environment, healthFilter, domainFilter, layerFilter, search.trim(), focusDepth && selectedId ? 'focus' : '',
  ].filter(Boolean).length;
  const clearFilters = () => {
    setEnvironment(''); setHealthFilter(''); setDomainFilter(''); setLayerFilter('');
    setSearch(''); setDebouncedSearch(''); setFocusDepth(0); setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-4 py-2.5 dark:border-white/[0.07] lg:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="Lineage filters">
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Environment</span>
            <select className="glass-input w-auto py-1.5 text-[12px]" value={environment}
              onChange={event => setEnvironment(event.target.value)} aria-label="Lineage environment">
              <option value="">All</option><option value="test">Integration</option><option value="prod">Production</option>
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Health</span>
            <select className="glass-input w-auto py-1.5 text-[12px]" value={healthFilter}
              onChange={event => { setHealthFilter(event.target.value); setSelectedId(null); }} aria-label="Lineage health">
              <option value="">All</option><option value="critical">Critical</option><option value="warning">Warning</option>
              <option value="healthy">Healthy</option><option value="unmonitored">Unmonitored</option>
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Domain</span>
            <select className="glass-input w-auto max-w-36 py-1.5 text-[12px]" value={domainFilter}
              onChange={event => { setDomainFilter(event.target.value); setSelectedId(null); }} aria-label="Lineage domain">
              <option value="">All</option>{domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Layer</span>
            <select className="glass-input w-auto py-1.5 text-[12px]" value={layerFilter}
              onChange={event => { setLayerFilter(event.target.value); setSelectedId(null); }} aria-label="Lineage layer">
              <option value="">All</option><option value="external">Sources</option><option value="bronze">Bronze</option>
              <option value="silver">Silver</option><option value="gold">Gold</option>
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Focus</span>
            <select className="glass-input w-auto py-1.5 text-[12px]" value={focusDepth}
              onChange={event => setFocusDepth(Number(event.target.value))} disabled={!selected} aria-label="Lineage graph focus">
              <option value={0}>Full graph</option><option value={1}>Selected + 1 hop</option><option value={2}>Selected + 2 hops</option>
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Search</span>
            <span className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-2 text-gray-400" />
              <input type="search" className="glass-input w-44 py-1.5 pl-7 text-[12px]" value={search}
                onChange={event => { setSearch(event.target.value); setSelectedId(null); }}
                placeholder="Pipeline or asset" aria-label="Search lineage" />
            </span>
          </label>
          {activeFilterCount > 0 && <button className="glass-btn-ghost whitespace-nowrap px-2.5 py-1.5 text-xs"
            onClick={clearFilters} aria-label="Clear all lineage filters">Clear {activeFilterCount}</button>}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {graph && <span className="whitespace-nowrap text-[11px] text-gray-500 dark:text-white/50" aria-live="polite">
              {visible.nodes.length}/{graph.nodes.length} nodes · {visible.edges.length} links
            </span>}
            <button className="glass-btn-ghost flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-xs"
              onClick={() => { setShowChanges(value => !value); setSelectedId(null); }} aria-expanded={showChanges} aria-controls="lineage-changes">
              <History size={14} /> Changes {changes.length > 0 && <span className="glass-badge">{changes.length}</span>}
            </button>
            <button className="glass-btn-ghost flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-xs"
              onClick={refresh} disabled={loading} aria-label="Refresh lineage">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </div>
      {error && <div className="m-4"><ApiError message={error} onRetry={refresh} /></div>}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute left-4 right-4 top-3 z-10 grid grid-cols-4 gap-2 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-white/35">
          {(['external', 'bronze', 'silver', 'gold'] as const).map(layer => <span key={layer}>{layer === 'external' ? 'Sources' : layer}</span>)}
        </div>
        {loading && <div role="status" aria-live="polite" className={`pointer-events-none absolute z-30 flex items-center justify-center ${graph ? 'left-1/2 top-12 -translate-x-1/2' : 'inset-0 bg-white/65 dark:bg-[#080a10]/65'}`}>
          <span className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs text-gray-600 shadow-sm dark:border-white/10 dark:bg-[#11141d]/95 dark:text-white/65">
            <RefreshCw size={13} className="animate-spin" /> {graph ? 'Refreshing lineage…' : 'Loading lineage…'}
          </span>
        </div>}
        {!loading && graph?.nodes.length === 0 && <p className="p-8 text-sm text-gray-400">No pipeline assets found. Configure source and sink assets, then save a pipeline.</p>}
        {showChanges && <aside id="lineage-changes" className="absolute left-4 top-14 z-20 max-h-[calc(100%-4.5rem)] w-80 overflow-auto rounded-xl border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#11141d]/95">
          <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">Architecture changes</p><h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white/90">Pipeline version history</h3></div><button className="icon-button h-7 w-7" aria-label="Close architecture changes" onClick={() => setShowChanges(false)}>×</button></div>
          <p className="mt-1 text-[10px] text-gray-400">Derived from immutable saved versions.</p>
          {changes.length === 0 && <p className="mt-4 text-xs text-gray-500">No lineage changes found.</p>}
          <div className="mt-3 space-y-3">{changes.map(item => <article key={item.rowId} className="rounded-lg border border-gray-100 p-3 dark:border-white/[0.07]">
            <div className="flex items-start justify-between gap-2"><div><p className="truncate text-xs font-semibold text-gray-800 dark:text-white/80">{item.name}</p><p className="mt-0.5 text-[9px] text-gray-400">{item.environment === 'prod' ? 'Production' : 'Integration'} · {item.fromVersion == null ? 'Created' : `v${item.fromVersion} → v${item.toVersion}`}</p></div><time className="shrink-0 text-[9px] text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</time></div>
            <div className="mt-2 flex gap-1.5 text-[9px] font-semibold">{item.summary.breaking > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600 dark:bg-red-500/10">{item.summary.breaking} breaking</span>}{item.summary.warning > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-600 dark:bg-amber-500/10">{item.summary.warning} warning</span>}{item.summary.info > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600 dark:bg-blue-500/10">{item.summary.info} info</span>}</div>
            <div className="mt-2 space-y-1">{item.changes.slice(0, 4).map((change, index) => <p key={`${change.kind}:${change.assetUrn ?? ''}:${change.field ?? ''}:${index}`} className={`text-[10px] ${change.severity === 'breaking' ? 'text-red-600 dark:text-red-300' : change.severity === 'warning' ? 'text-amber-600 dark:text-amber-300' : 'text-gray-500 dark:text-white/50'}`}>{change.message}</p>)}{item.changes.length > 4 && <p className="text-[9px] text-gray-400">+{item.changes.length - 4} more</p>}</div>
          </article>)}</div>
        </aside>}
        {selected && <aside className="absolute right-4 top-14 z-20 w-72 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/10 dark:bg-[#11141d]/95">
          <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">Impact analysis</p><h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white/90">{selected.data.name}</h3></div><button className="icon-button h-7 w-7" aria-label="Close impact analysis" onClick={() => setSelectedId(null)}>×</button></div>
          <p className="mt-1 text-[10px] text-gray-400">{selected.type === 'pipeline' ? `${selected.data.external ? 'External job' : 'Pipeline'} · ${selected.data.environment}` : `${selected.data.platform} · ${selected.data.layer}`}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-gray-50 p-2 dark:bg-white/[0.04]"><p className="text-lg font-semibold">{impact.upstream.size}</p><p className="text-[9px] uppercase text-gray-400">Upstream</p></div><div className="rounded-lg bg-gray-50 p-2 dark:bg-white/[0.04]"><p className="text-lg font-semibold">{impact.downstream.size}</p><p className="text-[9px] uppercase text-gray-400">Downstream</p></div><div className="rounded-lg bg-red-50 p-2 dark:bg-red-500/10"><p className="text-lg font-semibold text-red-500">{atRisk}</p><p className="text-[9px] uppercase text-gray-400">At risk</p></div></div>
          {selected.data.metadata?.owner && <p className="mt-3 text-xs text-gray-600 dark:text-white/60">Owner · {selected.data.metadata.owner}</p>}
          {selected.type === 'asset' && selected.data.materialization && <div className="mt-3 rounded-lg bg-emerald-50 p-2 text-[10px] dark:bg-emerald-500/10"><p className="font-semibold text-emerald-700 dark:text-emerald-300">Last materialization</p><p className="mt-1 text-gray-600 dark:text-white/55">{new Date(selected.data.materialization.materializedAt).toLocaleString()}{selected.data.materialization.recordCount != null ? ` · ${selected.data.materialization.recordCount.toLocaleString()} rows` : ''}</p><Link to={`/runs/${selected.data.materialization.executionId}`} className="mt-1 block text-brand-500">Open producing run</Link></div>}
          {selected.type === 'asset' && selected.data.quality && <div className={`mt-3 rounded-lg p-2 text-[10px] ${selected.data.quality.status === 'passed' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}><p className="font-semibold">Data quality · {selected.data.quality.status}</p><p className="mt-1 text-gray-600 dark:text-white/55">{selected.data.quality.passedCount.toLocaleString()} passed · {selected.data.quality.failedCount.toLocaleString()} rejected{selected.data.quality.quarantineAvailable ? ' · quarantined' : ''}</p><Link to={`/runs/${selected.data.quality.executionId}`} className="mt-1 block text-brand-500">Open quality run</Link></div>}
          {selected.type === 'pipeline' && !selected.data.external && <div className="mt-3 rounded-lg border p-2" style={{ borderColor: HEALTH_COLOR[selected.data.health ?? 'unmonitored'] }}><p className="text-[10px] font-semibold capitalize" style={{ color: HEALTH_COLOR[selected.data.health ?? 'unmonitored'] }}>{selected.data.health ?? 'unmonitored'}</p>{selected.data.breaches?.map((breach: any) => <p key={breach.type} className="mt-1 flex gap-1 text-[10px] text-gray-600 dark:text-white/55"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{breach.message}</p>)}{selected.data.last_execution_id && <Link to={`/runs/${selected.data.last_execution_id}`} className="mt-2 block text-[10px] text-brand-500">Open latest run · {selected.data.last_phase}</Link>}</div>}
          {selected.type === 'pipeline' && selected.data.external && <p className="mt-3 text-[10px] text-gray-600 dark:text-white/55">Last observed {new Date(selected.data.eventTime).toLocaleString()}</p>}
          {selected.data.schema?.fields?.length > 0 && <div className="mt-3"><p className="text-[10px] font-semibold uppercase text-gray-400">Contract fields</p><p className="mt-1 text-[10px] text-gray-600 dark:text-white/55">{selected.data.schema.fields.slice(0, 8).map((field: any) => `${field.name}: ${field.type}${field.nullable ? '?' : ''}`).join(' · ')}</p></div>}
          {selectedColumns.length > 0 && <div className="mt-3"><p className="text-[10px] font-semibold uppercase text-gray-400">Column lineage</p><div className="mt-1 max-h-32 space-y-1 overflow-auto">{selectedColumns.slice(0, 20).map(edge => <p key={edge.id} className="truncate text-[10px] text-gray-600 dark:text-white/55" title={`${edge.sourceAssetUrn}.${edge.sourceField} → ${edge.targetAssetUrn}.${edge.targetField}`}>{edge.sourceField} → {edge.targetField}</p>)}</div></div>}
        </aside>}
        <ReactFlow nodes={impact.nodes} edges={impact.edges} nodeTypes={nodeTypes} fitView onlyRenderVisibleElements
          nodesDraggable={false} nodesConnectable={false} elementsSelectable
          onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}>
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'} />
          <Controls showInteractive={false} />
          <MiniMap className="hidden md:block" pannable zoomable
            nodeColor={node => node.type === 'pipeline' ? '#7c6cf2' : LAYER_COLOR[node.data.layer ?? 'external']}
            nodeStrokeColor={dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)'}
            nodeStrokeWidth={2}
            maskColor={dark ? 'rgba(8,10,18,0.78)' : 'rgba(235,237,245,0.78)'}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
