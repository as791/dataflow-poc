import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactFlow, { Background, Handle, Position, type NodeProps } from 'reactflow';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';
import { useCatalog } from '../context/CatalogContext';
import { buildRunGraph, type NodeRun } from './runGraph';
import { displayEnvironment } from './LifecyclePage';

const TERMINAL = ['completed', 'failed', 'cancelled'];
const STATUS_RING: Record<string, string> = {
  success: 'border-emerald-400/60', completed: 'border-emerald-400/60',
  failed: 'border-danger/70', running: 'border-amber-400/60',
};

// Read-only run node: reuses the catalog visual language + adds count/duration/error.
function RunFlowNode({ data }: NodeProps) {
  const { byType } = useCatalog();
  const entry = byType[data.activityType];
  const ring = STATUS_RING[data.status] ?? 'border-white/10';
  return (
    <div className={`rounded-xl border bg-[#12151f]/95 px-3 py-2 text-xs shadow-lg ${ring}`} style={{ minWidth: 150 }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry?.color ?? '#7F77DD' }} />
        <span className="font-medium text-white/90">{data.label ?? entry?.label ?? data.activityType}</span>
      </div>
      <div className="mt-1 text-[10px] text-white/50">
        {data.status ?? 'pending'}
        {data.recordCount != null && ` · ${data.recordCount.toLocaleString()} rec`}
        {data.durationMs != null && ` · ${data.durationMs}ms`}
      </div>
      {data.error && <div className="mt-1 text-[10px] text-danger/90 break-words">{String(data.error).slice(0, 120)}</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { runNode: RunFlowNode };

export default function RunDetailPage() {
  const { id } = useParams();
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
      <div className="flex items-center gap-3 px-6 py-4">
        <Link to="/runs" className="glass-btn-ghost flex items-center gap-1 text-sm"><ArrowLeft size={15} /> Runs</Link>
        <div>
          <h1 className="text-sm font-semibold text-white/90">{data?.execution?.name ?? 'Run'}</h1>
          <p className="text-xs text-white/40">
            {displayEnvironment(data?.execution?.environment)} · {data?.execution?.phase ?? '…'}
          </p>
        </div>
      </div>
      {error && <div className="mx-6 text-xs text-danger/90 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex-1">
        <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes}
          fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}
