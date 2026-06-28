import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CircleDot, Pause, RotateCcw, XCircle } from 'lucide-react';
import { api } from '../../api';

export function ExecutionMonitor({ executionId, onNodeStatus }: {
  executionId: string | null; onNodeStatus: (s: Record<string, any>) => void;
}) {
  const [status, setStatus] = useState<any>(null);
  const cbRef = useRef(onNodeStatus);
  cbRef.current = onNodeStatus;

  useEffect(() => {
    if (!executionId) return;
    const t = setInterval(async () => {
      try {
        const s = await api.executionStatus(executionId);
        setStatus(s);
        if (s.nodeResults) cbRef.current(s.nodeResults);
        if (s.nodeRuns) cbRef.current(Object.fromEntries(
          s.nodeRuns.map((r: any) => [r.node_id, { status: r.status, meta: { recordCount: r.record_count } }])));
        if (['completed', 'failed', 'cancelled'].includes(s.phase)) clearInterval(t);
      } catch { /* polling */ }
    }, 1500);
    return () => clearInterval(t);
  }, [executionId]);

  if (!executionId) return null;
  const phaseColor = status?.phase === 'failed' ? 'text-rose-500' : status?.phase === 'completed' ? 'text-emerald-500' : 'text-amber-500';
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-white/[0.09] bg-white/95 dark:bg-[#0d1018]/92 px-4 py-2.5 shadow-lg dark:shadow-glass backdrop-blur-xl">
      <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.055] ${phaseColor}`}>
        {status?.phase === 'completed' ? <Check size={15} /> : status?.phase === 'failed' ? <AlertCircle size={15} /> : <CircleDot size={15} className="animate-pulse" />}
      </span>
      <div className="min-w-[150px]">
        <div className="text-xs font-medium text-gray-800 dark:text-white/85">{status?.phase ?? 'starting'}</div>
        <div className="max-w-[190px] truncate font-mono text-[9px] text-gray-400 dark:text-white/30">{executionId}</div>
      </div>
      <div className="flex gap-1">
        <button className="icon-button h-8 w-8" title="Pause" onClick={() => api.signal(executionId, 'pause')}><Pause size={14} /></button>
        <button className="icon-button h-8 w-8" title="Resume" onClick={() => api.signal(executionId, 'resume')}><RotateCcw size={14} /></button>
        <button className="icon-button h-8 w-8 hover:text-rose-500" title="Cancel" onClick={() => api.signal(executionId, 'cancel')}><XCircle size={14} /></button>
      </div>
    </div>
  );
}
