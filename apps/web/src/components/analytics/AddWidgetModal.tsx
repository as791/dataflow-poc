import { useEffect, useState } from 'react';
import type { Dataset, SchemaField, QuerySpec, ChartType, WidgetDef } from './types';

type FilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE';
interface FilterRow { field: string; op: FilterOp; value: string }
const FILTER_OPS: FilterOp[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE'];

interface Props {
  datasets: Dataset[];
  initialDataset?: string;
  editing?: WidgetDef;
  onClose: () => void;
  onAdd: (widget: Omit<WidgetDef, 'data'>) => void;
  schema: (name: string) => Promise<SchemaField[]>;
}

export function AddWidgetModal({ datasets, initialDataset, editing, onClose, onAdd, schema }: Props) {
  const [title, setTitle] = useState(editing?.title ?? 'New Widget');
  const [dataset, setDataset] = useState(editing?.dataset ?? initialDataset ?? datasets[0]?.collection ?? '');
  const [chartType, setChartType] = useState<ChartType>(editing?.type ?? 'bar');
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [xCol, setXCol] = useState(editing?.spec.groupBy?.[0] ?? editing?.spec.select?.[0] ?? '');
  const [yCol, setYCol] = useState(editing?.spec.aggregate?.field ?? editing?.spec.select?.[1] ?? '');
  const [agg, setAgg] = useState<'count' | 'sum' | 'avg' | 'min' | 'max' | 'none'>(
    editing ? (editing.spec.aggregate?.fn ?? 'none') : 'count');
  const [filters, setFilters] = useState<FilterRow[]>(
    (editing?.spec.where ?? []).filter(w => w.op !== 'IN').map(w => ({ field: w.field, op: w.op as FilterOp, value: String(w.value) })));
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaErr, setSchemaErr] = useState<string | null>(null);

  useEffect(() => {
    if (!dataset) return;
    setLoadingSchema(true);
    setSchemaErr(null);
    schema(dataset)
      .then(s => {
        setFields(s);
        setXCol(prev => (prev && s.some(f => f.name === prev)) ? prev : (s[0]?.name ?? ''));
        setYCol(prev => (prev && s.some(f => f.name === prev)) ? prev : (s[1]?.name ?? s[0]?.name ?? ''));
      })
      .catch(e => setSchemaErr(e.message))
      .finally(() => setLoadingSchema(false));
  }, [dataset, schema]);

  const handleAdd = () => {
    const fieldType = (name: string) => fields.find(f => f.name === name)?.type;
    // IN clauses aren't editable in this UI (API-authored) — carry them through untouched
    const inClauses = (editing?.spec.where ?? []).filter(w => w.op === 'IN');
    const where = [...inClauses, ...filters
      .filter(f => f.field && f.value !== '')
      .map(f => ({
        field: f.field,
        op: f.op,
        value: fieldType(f.field) === 'number' && !Number.isNaN(Number(f.value)) ? Number(f.value) : f.value as unknown,
      }))];
    const base: QuerySpec = chartType === 'table'
      ? { select: [xCol, ...(yCol ? [yCol] : [])], limit: 50 }
      : agg === 'none'
        ? { select: [xCol, yCol], limit: 50 }
        : { groupBy: [xCol], aggregate: { field: yCol, fn: agg as 'count' | 'sum' | 'avg' | 'min' | 'max' }, limit: 50 };
    const spec: QuerySpec = where.length ? { ...base, where } : base;
    onAdd({
      id: editing?.id ?? `w_${Date.now()}`,
      layout: editing?.layout ?? { x: 0, y: Infinity, w: 4, h: 4 },
      type: chartType,
      dataset,
      title,
      spec,
    });
    onClose();
  };

  const chartTypes: ChartType[] = ['bar', 'line', 'pie', 'table'];
  const aggOptions: Array<'count' | 'sum' | 'avg' | 'min' | 'max' | 'none'> = ['count', 'sum', 'avg', 'min', 'max', 'none'];
  const cols = fields.map(f => f.name);

  return (
    <div className="glass-modal-backdrop" onClick={onClose}>
      <div className="glass-modal max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{editing ? 'Edit Widget' : 'Add Widget'}</h2>
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
              <select className="glass-select w-full" value={agg} onChange={e => setAgg(e.target.value as 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none')}>
                {aggOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}

          {cols.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="glass-label mb-0">Filters</label>
                <button className="glass-btn-ghost text-xs px-2 py-1"
                  onClick={() => setFilters(prev => [...prev, { field: cols[0], op: '=', value: '' }])}>
                  + Add filter
                </button>
              </div>
              {filters.map((f, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select className="glass-select flex-1" value={f.field}
                    onChange={e => setFilters(prev => prev.map((p, pi) => pi === i ? { ...p, field: e.target.value } : p))}>
                    {cols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="glass-select w-20" value={f.op}
                    onChange={e => setFilters(prev => prev.map((p, pi) => pi === i ? { ...p, op: e.target.value as FilterOp } : p))}>
                    {FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input className="glass-input flex-1" placeholder="value" value={f.value}
                    onChange={e => setFilters(prev => prev.map((p, pi) => pi === i ? { ...p, value: e.target.value } : p))} />
                  <button className="glass-btn-ghost px-2" title="Remove filter"
                    onClick={() => setFilters(prev => prev.filter((_, pi) => pi !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="glass-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="glass-btn-primary"
            disabled={!dataset || !title || (!loadingSchema && cols.length === 0)}
            onClick={handleAdd}>
            {editing ? 'Save widget →' : 'Add widget →'}
          </button>
        </div>
      </div>
    </div>
  );
}
