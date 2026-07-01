import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Plus, Save, X } from 'lucide-react';
import GridLayout, { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { Dataset, SchemaField, WidgetDef, DashboardDefinition, Dashboard } from '../components/analytics/types';
import { ChartRenderer } from '../components/analytics/ChartRenderer';
import { AddWidgetModal } from '../components/analytics/AddWidgetModal';
import { SaveDashboardModal } from '../components/analytics/SaveDashboardModal';
import { api } from '../api';
import { ApiError } from '../components/ApiError';

// ─── Main ────────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(null);
  const [widgets, setWidgets] = useState<WidgetDef[]>([]);
  const [layout, setLayout] = useState<Layout[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingData, setLoadingData] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(900);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setGridWidth(Math.floor(w));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingDatasets(true);
      try {
        const [ds, dbs] = await Promise.all([
          api.getAnalyticsDatasets().catch(() => [] as Dataset[]),
          api.listDashboards().catch(() => [] as Dashboard[]),
        ]);
        setDatasets(ds);
        setDashboards(dbs);
        if (dbs.length > 0) loadDashboard(dbs[0]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingDatasets(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadDashboard(db: Dashboard) {
    setActiveDashboard(db);
    const ws = db.definition.widgets ?? [];
    setWidgets(ws);
    setLayout(ws.map(w => ({ i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h })));
    setDirty(false);
    ws.forEach(w => fetchWidgetData(w));
  }

  const fetchWidgetData = useCallback(async (widget: WidgetDef) => {
    setLoadingData(prev => ({ ...prev, [widget.id]: true }));
    try {
      const { rows } = await api.queryAnalytics({ dataset: widget.dataset, spec: widget.spec });
      setWidgets(prev => prev.map(w => w.id === widget.id ? { ...w, data: rows } : w));
    } catch { /* chart shows "No data" */ }
    finally {
      setLoadingData(prev => ({ ...prev, [widget.id]: false }));
    }
  }, []);

  const addWidget = useCallback(async (def: Omit<WidgetDef, 'data'>) => {
    const widget: WidgetDef = { ...def, data: [] };
    setWidgets(prev => [...prev, widget]);
    setLayout(prev => [...prev, { i: widget.id, x: widget.layout.x, y: widget.layout.y, w: widget.layout.w, h: widget.layout.h }]);
    setDirty(true);
    await fetchWidgetData(widget);
  }, [fetchWidgetData]);

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
    setLayout(prev => prev.filter(l => l.i !== id));
    setDirty(true);
  }, []);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout);
    setWidgets(prev => prev.map(w => {
      const l = newLayout.find(n => n.i === w.id);
      return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
    }));
    setDirty(true);
  }, []);

  const handleSave = async (name: string, existingId?: string) => {
    const definition: DashboardDefinition = {
      widgets: widgets.map(({ id, layout, type, dataset, title, spec }) =>
        ({ id, layout, type, dataset, title, spec })),
    };
    let saved: Dashboard;
    if (existingId) {
      saved = await api.updateDashboard(existingId, { name, definition });
      setDashboards(prev => prev.map(d => d.id === existingId ? saved : d));
    } else {
      saved = await api.createDashboard({ name, definition });
      setDashboards(prev => [...prev, saved]);
    }
    setActiveDashboard(saved);
    setDirty(false);
  };

  if (loadingDatasets) {
    return <div className="flex items-center justify-center h-full text-gray-400 dark:text-white/40 text-sm">Loading analytics…</div>;
  }

  if (datasets.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-16 px-6">
        <div className="glass-panel p-8 text-center space-y-4">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-300/20 bg-brand-500/10 text-brand-300"><BarChart3 size={24} /></div>
          <h1 className="text-xl font-semibold">No datasets yet</h1>
          <p className="text-sm text-gray-500 dark:text-white/60 leading-relaxed">
            To use analytics, your pipelines need to push data into ClickHouse collections.
            Once a pipeline has executed and routed data, it will appear here as a dataset.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-gray-200 dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.018] flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-white/10">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/80">Datasets</h2>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {datasets.map(d => (
            <li key={d.collection}>
              <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-white/5 transition" title={`${d.row_count.toLocaleString()} rows`}>
                <p className="truncate text-gray-800 dark:text-white/80">{d.collection}</p>
                <p className="text-xs text-gray-400 dark:text-white/40">{d.row_count.toLocaleString()} rows</p>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-200 dark:border-white/10 p-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-white/50 mb-2 uppercase tracking-wide">Dashboards</h2>
          {dashboards.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-white/30">No saved dashboards.</p>
          ) : (
            <ul className="space-y-1">
              {dashboards.map(db => (
                <li key={db.id}>
                  <button
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition ${
                      activeDashboard?.id === db.id ? 'bg-brand-500/30 text-brand-400' : 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-white/60'
                    }`}
                    onClick={() => loadDashboard(db)}>
                    {db.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold">
              {activeDashboard ? activeDashboard.name : 'Untitled Dashboard'}
            </h1>
            {dirty && <span className="glass-badge text-warning/80 border-warning/30">● Unsaved</span>}
          </div>
          <div className="flex items-center gap-2">
            {error && <ApiError message={error} />}
            <button className="glass-btn-ghost text-sm" onClick={() => setShowAddModal(true)}><Plus size={15} /> Add widget</button>
            <button
              className={`glass-btn-primary text-sm ${!dirty ? 'opacity-50' : ''}`}
              onClick={() => setShowSaveModal(true)}
              disabled={!dirty && !!activeDashboard}>
              <Save size={15} /> Save
            </button>
          </div>
        </div>

        <div ref={containerRef} className="flex-1 overflow-auto p-4">
          {widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-100 dark:bg-white/[0.04] text-gray-400 dark:text-white/30"><BarChart3 size={24} /></div>
              <p className="text-gray-400 dark:text-white/40 text-sm">No widgets yet.</p>
              <button className="glass-btn-primary text-sm" onClick={() => setShowAddModal(true)}>
                <Plus size={15} /> Add first widget
              </button>
            </div>
          ) : (
            <GridLayout
              className="layout"
              layout={layout}
              cols={12}
              rowHeight={60}
              width={gridWidth}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".drag-handle"
              margin={[12, 12]}>
              {widgets.map(widget => (
                <div key={widget.id} className="glass-card flex flex-col overflow-hidden">
                  <div className="drag-handle flex items-center justify-between px-3 pt-3 pb-2 cursor-move flex-shrink-0 select-none">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{widget.title}</p>
                      <p className="text-xs text-gray-400 dark:text-white/40 truncate">
                        {widget.dataset}{loadingData[widget.id] ? ' · loading…' : ''}
                      </p>
                    </div>
                    <button
                      className="glass-btn-ghost w-6 h-6 flex items-center justify-center text-xs text-gray-400 dark:text-white/50 hover:text-danger flex-shrink-0 ml-2 cursor-pointer"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => removeWidget(widget.id)}
                      title="Remove">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 px-1 pb-2">
                    <ChartRenderer widget={widget} />
                  </div>
                </div>
              ))}
            </GridLayout>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddWidgetModal
          datasets={datasets}
          schema={async (name: string): Promise<SchemaField[]> => { const r = await api.getAnalyticsSchema(name); return r.schema; }}
          onClose={() => setShowAddModal(false)}
          onAdd={addWidget}
        />
      )}
      {showSaveModal && (
        <SaveDashboardModal
          existing={dashboards}
          onClose={() => setShowSaveModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

export default AnalyticsPage;
