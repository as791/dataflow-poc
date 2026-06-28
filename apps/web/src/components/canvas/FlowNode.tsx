import {
  ArrowDownToLine, BadgeHelp, Braces, Database, FileJson, FileSpreadsheet,
  Filter, GitFork, Globe2, HardDrive, Merge, Sheet, Triangle, Webhook,
} from 'lucide-react';
import { Handle, Position } from 'reactflow';
import { type CatalogEntry } from '../../catalog';
import { useCatalog } from '../../context/CatalogContext';

export function ActivityIcon({ activityType, nodeType, size = 16 }: {
  activityType?: string; nodeType?: string; size?: number;
}) {
  const Icon = activityType?.startsWith('zendesk.') ? BadgeHelp
    : activityType?.startsWith('gsheets.') ? Sheet
    : activityType?.startsWith('gdrive.') ? Triangle
    : activityType?.startsWith('excel.') ? FileSpreadsheet
    : activityType?.startsWith('http.') ? Globe2
    : activityType === 'sink.postgres' ? Database
    : activityType === 'sink.webhook' ? Webhook
    : activityType === 'sink.records' ? HardDrive
    : activityType === 'transform.filter' ? Filter
    : activityType?.startsWith('transform.parse') ? FileJson
    : nodeType === 'source' ? Database
    : nodeType === 'sink' ? ArrowDownToLine
    : nodeType === 'fork' ? GitFork
    : nodeType === 'merge' ? Merge
    : Braces;
  return <Icon size={size} strokeWidth={1.8} />;
}

export function FlowNode({ data }: { data: any }) {
  const { byType } = useCatalog();
  const entry: CatalogEntry = byType[data.activityType];
  const statusRing =
    data.status === 'failed'  ? 'ring-1 ring-rose-400/60'
    : data.status === 'success' ? 'ring-1 ring-emerald-400/50'
    : '';
  return (
    <div className={`relative min-w-[180px] overflow-hidden rounded-[14px] px-3.5 py-3 text-[13px]
      border bg-white border-gray-200 text-gray-900 shadow-sm
      dark:bg-[#11141d]/90 dark:border-white/[0.10] dark:text-white/90 dark:shadow-[0_16px_35px_rgba(0,0,0,.28)]
      transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300
      dark:hover:border-white/[0.18] backdrop-blur-xl ${statusRing}`}>
      <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-[14px]" style={{ background: entry?.color ?? '#6965db' }} />
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-gray-100 bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.045]" style={{ color: entry?.color }}>
          <ActivityIcon activityType={data.activityType} nodeType={data.nodeType} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{data.label || entry?.label || data.activityType}</div>
          <div className="truncate text-[10px] text-gray-400 dark:text-white/35">{entry?.label ?? data.activityType}</div>
        </div>
        {data.status && (
          <span className={`h-2 w-2 rounded-full ${
            data.status === 'failed'  ? 'bg-rose-400'
            : data.status === 'success' ? 'bg-emerald-400'
            : 'animate-pulse bg-amber-300'
          }`} title={data.status} />
        )}
      </div>
      {data.recordCount != null && (
        <div className="mt-2 text-[10px] text-gray-400 dark:text-white/35">{data.recordCount.toLocaleString()} records</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = { flowNode: FlowNode };
