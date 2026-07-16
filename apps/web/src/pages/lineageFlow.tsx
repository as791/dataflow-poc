import { memo } from 'react';
import { Handle, Position, type Edge, type Node, type NodeProps } from 'reactflow';
import { Activity, Database, Workflow } from 'lucide-react';
import type { WorkspaceLineage } from '@dataflow/shared';

// Shared between ArchitectureLineage (saved pipeline versions) and
// RuntimeLineage (windowed execution metrics). Runtime nodes carry an extra
// `metrics` payload; architecture nodes leave it undefined.

export type LineageLayer = 'external' | 'bronze' | 'silver' | 'gold';
export const LAYER_X: Record<LineageLayer, number> = { external: 40, bronze: 640, silver: 1240, gold: 1840 };
export const LAYER_COLOR: Record<LineageLayer, string> = {
  external: '#64748b', bronze: '#b7791f', silver: '#94a3b8', gold: '#eab308',
};
export const ASSET_WIDTH = 360;
export const ASSET_HEIGHT = 128;
export const PIPELINE_WIDTH = 200;
export const PIPELINE_HEIGHT = 100;
export const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.35 };
export const FIT_VIEW_OPTIONS = { padding: 0.25, minZoom: 0.15, maxZoom: 0.4 };
export const normalizeLayer = (layer: unknown): LineageLayer =>
  typeof layer === 'string' && Object.prototype.hasOwnProperty.call(LAYER_X, layer)
    ? layer as LineageLayer
    : 'external';
export const HEALTH_COLOR: Record<string, string> = {
  healthy: '#10b981', warning: '#f59e0b', critical: '#ef4444', unmonitored: '#94a3b8',
};
export type PipelineHealth = {
  id: string; health: 'healthy' | 'warning' | 'critical' | 'unmonitored';
  last_execution_id?: string; last_phase?: string;
  breaches?: Array<{ type: string; severity: string; message: string }>;
};

export type RuntimeNodeMetrics = {
  runs: number; succeeded?: number; failed: number; running?: number; cancelled?: number;
  successRate?: number; errorRate?: number; p50Ms?: number; p95Ms?: number;
  records?: number; lastRunAt?: string; lastAt?: string;
};

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null) return '—';
  return Number(value).toLocaleString();
}

const AssetNode = memo(function AssetNode({ data }: NodeProps) {
  const layer = normalizeLayer(data.layer);
  const metrics: RuntimeNodeMetrics | undefined = data.metrics;
  return (
    <div className="h-full w-full rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-white/10 dark:bg-[#12151f]/95">
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <Database size={14} style={{ color: LAYER_COLOR[layer] }} />
        <span className="truncate text-xs font-semibold text-gray-900 dark:text-white/90">{data.name}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-gray-400 dark:text-white/45">{data.platform} · {data.namespace}</p>
      {metrics && <p className="mt-1 text-[10px] font-medium text-gray-600 dark:text-white/60">
        {formatCount(metrics.records)} records · last write {metrics.lastAt ? new Date(metrics.lastAt).toLocaleTimeString() : '—'}
      </p>}
      {!metrics && data.schema?.fields?.length > 0 && <p className="mt-1 text-[10px] text-violet-500">Contract · {data.schema.fields.length} fields</p>}
      {!metrics && data.materialization && <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
        Updated {new Date(data.materialization.materializedAt).toLocaleString()}
        {data.materialization.recordCount != null ? ` · ${data.materialization.recordCount.toLocaleString()} rows` : ''}
      </p>}
      {!metrics && data.quality && <p className={`mt-1 text-[10px] font-semibold ${data.quality.status === 'passed' ? 'text-emerald-600 dark:text-emerald-400' : data.quality.status === 'failed' ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
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
  const metrics: RuntimeNodeMetrics | undefined = data.metrics;
  return (
    <div className="h-full w-full rounded-xl border bg-brand-50 px-3 py-2 shadow-md dark:bg-brand-500/10"
      style={{ borderColor: HEALTH_COLOR[health] }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <Workflow size={14} className="text-brand-500" />
        <span className="truncate text-xs font-semibold text-gray-900 dark:text-white/90">{data.name}</span>
      </div>
      <p className="mt-1 text-[10px] text-gray-500 dark:text-white/50">
        {data.external ? `${data.namespace} · external` : `v${data.version} · ${data.environment === 'prod' ? 'Production' : 'Integration'} · ${data.status}`}
      </p>
      {metrics && <>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold">
          <span className={metrics.failed > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}>
            {metrics.runs} run{metrics.runs === 1 ? '' : 's'}{metrics.errorRate != null ? ` · ${metrics.errorRate}% err` : ''}
          </span>
          {(metrics.running ?? 0) > 0 && <span className="flex items-center gap-1 text-blue-500"><Activity size={10} className="animate-pulse" />{metrics.running}</span>}
        </p>
        <p className="text-[10px] text-gray-500 dark:text-white/50">
          {metrics.runs > 0 ? `p50 ${formatDuration(metrics.p50Ms)} · p95 ${formatDuration(metrics.p95Ms)}` : 'no runs in window'}
        </p>
      </>}
      {!metrics && !data.external && <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold capitalize" style={{ color: HEALTH_COLOR[health] }}>
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

export const nodeTypes = { asset: AssetNode, pipeline: PipelineNode };

export function buildFlow(graph: WorkspaceLineage, healthById: Record<string, PipelineHealth>): { nodes: Node[]; edges: Edge[] } {
  const edgeByNode = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const sourceEdges = edgeByNode.get(edge.source);
    if (sourceEdges) sourceEdges.push(edge.target);
    else edgeByNode.set(edge.source, [edge.target]);
    const targetEdges = edgeByNode.get(edge.target);
    if (targetEdges) targetEdges.push(edge.source);
    else edgeByNode.set(edge.target, [edge.source]);
  }
  const assetLayer = new Map<string, LineageLayer>();
  const assetPosition = new Map<string, { x: number; y: number }>();
  const laneCounts: Record<LineageLayer, number> = { external: 0, bronze: 0, silver: 0, gold: 0 };
  for (const node of graph.nodes) if (node.kind === 'asset') {
    const lane = normalizeLayer(node.asset.layer);
    assetLayer.set(node.id, lane);
    assetPosition.set(node.id, { x: LAYER_X[lane], y: 90 + laneCounts[lane]++ * (ASSET_HEIGHT + 24) });
  }
  const nextPipelineY = new Map<number, number>();
  const nodes = graph.nodes.map<Node>(node => {
    const metrics = (node as any).metrics;
    if (node.kind === 'asset') {
      const lane = assetLayer.get(node.id) ?? 'external';
      return {
        id: node.id, type: 'asset', position: assetPosition.get(node.id)!,
        width: ASSET_WIDTH, height: ASSET_HEIGHT,
        data: { ...node.asset, layer: lane, materialization: node.materialization, quality: node.quality, metrics }, draggable: false,
      };
    }
    const neighbours = edgeByNode.get(node.id) ?? [];
    const xs = neighbours.flatMap(id => {
      const lane = assetLayer.get(id);
      return lane ? [LAYER_X[lane]] : [];
    });
    const min = xs.length ? Math.min(...xs) : LAYER_X.external;
    const max = xs.length ? Math.max(...xs) : LAYER_X.bronze;
    const x = min === max
      ? min + ASSET_WIDTH + 20
      : (min + ASSET_WIDTH + max - PIPELINE_WIDTH) / 2;
    const neighbourYs = neighbours.flatMap(id => {
      const position = assetPosition.get(id);
      return position ? [position.y + ASSET_HEIGHT / 2] : [];
    });
    const preferredY = neighbourYs.length
      ? neighbourYs.reduce((sum, y) => sum + y, 0) / neighbourYs.length - PIPELINE_HEIGHT / 2
      : 40;
    const y = Math.max(40, preferredY, nextPipelineY.get(x) ?? 40);
    nextPipelineY.set(x, y + PIPELINE_HEIGHT + 24);
    const data = node.kind === 'external-job'
      ? { ...node.externalJob, external: true, status: 'external', health: 'unmonitored', metrics }
      : { ...node.pipeline, ...(healthById[node.pipeline.rowId] ?? { health: 'unmonitored', breaches: [] }), metrics };
    return {
      id: node.id, type: 'pipeline', position: { x, y },
      width: PIPELINE_WIDTH, height: PIPELINE_HEIGHT,
      data, draggable: false,
    };
  });
  const edges = graph.edges.map<Edge>(edge => ({
    id: edge.id, source: edge.source, target: edge.target,
    style: { stroke: HEALTH_COLOR[healthById[edge.pipelineRowId]?.health] ?? '#8b86f8', strokeWidth: 1.5 },
  }));
  return { nodes, edges };
}
