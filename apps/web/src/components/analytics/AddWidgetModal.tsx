import { useEffect, useState } from 'react';
import type { Dataset, SchemaField, QuerySpec, ChartType, WidgetDef } from './types';

interface Props {
  datasets: Dataset[];
  onClose: () => void;
  onAdd: (widget: Omit<WidgetDef, 'data'>) => void;
  schema: (name: string) => Promise<SchemaField[]>;
}

export function AddWidgetModal({ datasets, onClose, onAdd, schema }: Props) {
  const [title, setTitle] = useState('New Widget');
  const [dataset, setDataset] = useState(datasets[0]?.collection ?? '');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [xCol, setXCol] = useState('');
  const [yCol, setYCol] = useState('');
  const [agg, setAgg] = useState<QuerySpec['agg']>('count');
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaErr, setSchemaErr] = useState<string | null>(null);

  useEffect(() => {
    if (!dataset) return;
    setLoadingSchema(true);
    setSchemaErr(null);
    schema(dataset)
      .then(s => { setFields(s); setXCol(s[0]?.name ?? ''); setYCol(s[1]?.name ?? s[0]?.name ?? ''); })
      .catch(e => setSchemaErr(e.message))
      .finally(() => setLoadingSchema(false));
  }, [dataset, schema]);

  const handleAdd = () => {
    onAdd({
      id: `w_${Date.now()}`,
      layout: { x: 0, y: Infinity, w: 4, h: 4 },
      type: chartType,
      dataset,
      title,
      spec: { x_column: xCol, y_column: yCol, agg, limit: 50 },
    });
    onClose();
  };

  const chartTypes: ChartType[] = ['bar', 'line', 'pie', 'table'];
  const aggOptions: QuerySpec['agg'][] = ['count', 'sum', 'avg', 'min', 'max', 'none'];
  const cols = fields.map(f => f.name);

  return (
    <div className="glass-modal-backdrop" onClick={onClose}>
      <div className="glass-modal max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Add Widget</h2>
          <button className="glass-btn-ghost w-8 h-8 flex items-center justify-center text-lg" onClick={onClose}>×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="glass-label">Widget title</label>
            <input className="glass-input w-full" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="glass-label">Dataset</label>
            <select className="glass-select w-full" value={dataset} onChange={e => setDataset(e.target.value)}>
              {datasets.map(d => (
                <option key={d.collection} value={d.collection}>
                  {d.collection} ({d.row_count.toLocaleString()} rows)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="glass-label">Chart type</label>
            <div className="flex gap-2">
              {chartTypes.map(t => (
                <button key={t}
                  className={`glass-btn flex-1 capitalize ${chartType === t ? 'bg-brand-500/40 border-brand-400/60' : ''}`}
                  onClick={() => setChartType(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {loadingSchema ? (
            <p className="text-xs text-white/40">Loading schema…</p>
          ) : schemaErr ? (
            <p className="text-xs text-danger/80">{schemaErr}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="glass-label">X column</label>
                <select className="glass-select w-full" value={xCol} onChange={e => setXCol(e.target.value)}>
                  {cols.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {chartType !== 'table' && (
                <div>
                  <label className="glass-label">Y column</label>
                  <select className="glass-select w-full" value={yCol} onChange={e => setYCol(e.target.value)}>
                    {cols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {chartType !== 'table' && (
            <div>
              <label className="glass-label">Aggregation</label>
              <select className="glass-select w-full" value={agg} onChange={e => setAgg(e.target.value as QuerySpec['agg'])}>
                {aggOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="glass-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="glass-btn-primary"
            disabled={!dataset || !title || (!loadingSchema && cols.length === 0)}
            onClick={handleAdd}>
            Add widget →
          </button>
        </div>
      </div>
    </div>
  );
}
