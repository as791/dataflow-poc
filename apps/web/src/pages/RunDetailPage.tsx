import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactFlow, { Background, BackgroundVariant, Handle, Position, type NodeProps } from 'reactflow';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';
import { useCatalog } from '../context/CatalogContext';
import { buildRunGraph, type NodeRun } from './runGraph';
import { displayEnvironment } from './LifecyclePage';
import { useTheme } from '../context/ThemeContext';

const TERMINAL = ['completed', 'failed', 'cancelled'];
const STATUS_RING: Record<string, string> = {
  success:   'border-emerald-400/60',
  completed: 'border-emerald-400/60',
  failed:    'border-red-400/70',
  running:   'border-amber-400/60',
};

function RunFlowNode({ data }: NodeProps) {
  const { byType } = useCatalog();
  const entry = byType[data.activityType];
  const ring = STATUS_RING[data.status] ?? 'border-gray-200 dark:border-white/10';
  return (
    <div className={`rounded-xl border bg-white dark:bg-[#12151f]/95 px-3 py-2 text-xs shadow-sm dark:shadow-lg ${ring}`}
      style={{ minWidth: 150 }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry?.color ?? '#7F77DD' }} />
        <span className="font-medium text-gray-900 dark:text-white/90">{data.label ?? entry?.label ?? data.activityType}</span>
      </div>
      <div className="mt-1 text-[10px] text-gray-400 dark:text-white/50">
        {data.status ?? 'pending'}
        {data.recordCount != null && ` · ${data.recordCount.toLocaleString()} rec`}
        {data.durationMs != null && ` · ${data.durationMs}ms`}
      </div>
      {data.error && <div className="mt-1 text-[10px] text-red-500 dark:text-danger/90 break-words">{String(data.error).slice(0, 120)}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { runNode: RunFlowNode };

export default function RunDetailPage() {
  const { id } = useParams();
  const { dark } = useTheme();
  const [data, setData] = useState<{ execution: any; definition: any; nodeRuns: NodeRun[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const d = await api.getExecution(id!);
        if (!alive) return;
        setData(d);
        if (!TERMINAL.includes(d.execution?.phase)) timer.current = setTimeout(poll, 1500);
      } catch (e: any) { if (alive) setError(e.message ?? 'Failed to load run'); }
    };
    poll();
    return () => { alive = false; clearTimeout(timer.current); };
  }, [id]);

  const graph = useMemo(
    () => data ? buildRunGraph(data.definition, data.nodeRuns) : { nodes: [], edges: [] },
    [data],
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-gray-100 dark:border-white/[0.07] px-6 py-4">
        <Link to="/runs" className="glass-btn-ghost flex items-center gap-1 text-sm"><ArrowLeft size={15} /> Runs</Link>
        <div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white/90">{data?.execution?.name ?? 'Run'}</h1>
          <p className="text-xs text-gray-400 dark:text-white/40">
            {displayEnvironment(data?.execution?.environment)} · {data?.execution?.phase ?? '…'}
          </p>
        </div>
      </div>
      {error && (
        <div className="mx-6 mt-4 text-xs text-red-600 dark:text-danger/90 bg-red-50 dark:bg-danger/10 border border-red-200 dark:border-danger/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex-1">
        <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes}
          fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
          <Background variant={BackgroundVariant.Dots} gap={24} size={1}
            color={dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
        </ReactFlow>
      </div>
    </div>
  );
}
