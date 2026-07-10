import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { api } from '../../api';

const PAGE = 50;

interface Props {
  dataset: string;
  onClose: () => void;
  onAddWidget: () => void;
}

export function DatasetPreview({ dataset, onClose, onAddWidget }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api.getDatasetRows(dataset, PAGE, offset)
      .then(r => { setRows(r.rows); setTotal(r.total); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [dataset, offset]);

  const cols = rows.length ? Object.keys(rows[0]) : [];
  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="glass-modal-backdrop" onClick={onClose}>
      <div className="glass-modal max-w-5xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{dataset}</h2>
            <p className="text-xs text-gray-400 dark:text-white/40">{total.toLocaleString()} rows</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="glass-btn-primary text-sm" onClick={onAddWidget}><Plus size={14} /> Add widget</button>
            <button className="glass-btn-ghost w-8 h-8 flex items-center justify-center" aria-label="Close" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {err ? (
          <p className="text-xs text-danger/90 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{err}</p>
        ) : loading ? (
          <p className="text-sm text-gray-400 dark:text-white/40 py-8 text-center">Loading rows…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-white/40 py-8 text-center">No rows.</p>
        ) : (
          <div className="overflow-auto max-h-[55vh] border border-gray-200 dark:border-white/10 rounded-lg">
            <table className="w-full text-xs text-gray-700 dark:text-white/80">
              <thead>
                <tr>
                  {cols.map(c => (
                    <th key={c} className="text-left py-1.5 px-2 text-gray-500 dark:text-white/50 border-b border-gray-200 dark:border-white/10 sticky top-0 bg-gray-50 dark:bg-[#1a1a2e] whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5">
                    {cols.map(c => (
                      <td key={c} className="py-1 px-2 truncate max-w-[200px]" title={String(row[c] ?? '')}>
                        {typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : String(row[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400 dark:text-white/40">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button className="glass-btn-ghost text-sm" disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}><ChevronLeft size={14} /> Prev</button>
            <button className="glass-btn-ghost text-sm" disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}>Next <ChevronRight size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
