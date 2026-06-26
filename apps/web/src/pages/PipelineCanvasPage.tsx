import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertCircle, ArrowDownToLine, Braces, Check, CircleDot,
  Code2, Database, GitFork, Layers3, Merge, MoreHorizontal, PanelLeft,
  Pause, Play, Rocket, RotateCcw, Save, Search, Settings2, Trash2, X,
  XCircle,
} from 'lucide-react';
import ReactFlow, {
  Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  type Node, type Connection, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { definitionToMermaid, mermaidToDefinition } from '@dataflow/shared';
import { type CatalogEntry, type FieldSpec } from '../catalog';
import { useCatalog } from '../context/CatalogContext';
import { MermaidPreview } from '../components/MermaidPreview';
import { api } from '../api';
import { SheetPicker } from '../components/connectors/SheetPicker';
import { DrivePicker } from '../components/connectors/DrivePicker';
import { ExcelPicker } from '../components/connectors/ExcelPicker';
import { ZendeskPicker } from '../components/connectors/ZendeskPicker';
import { displayEnvironment, StageBadge } from './LifecyclePage';

function FlowNode({ data }: { data: any }) {
  const { byType } = useCatalog();
  const entry: CatalogEntry = byType[data.activityType];
  const NodeIcon =
    data.nodeType === 'source' ? Database
    : data.nodeType === 'sink' ? ArrowDownToLine
    : data.nodeType === 'fork' ? GitFork
    : data.nodeType === 'merge' ? Merge
    : Braces;
  const statusRing =
    data.status === 'failed' ? 'ring-1 ring-rose-400/60 shadow-[0_0_24px_rgba(251,113,133,.13)]'
    : data.status === 'success' ? 'ring-1 ring-emerald-400/50 shadow-[0_0_24px_rgba(52,211,153,.10)]'
    : '';
  return (
    <div className={`relative min-w-[176px] overflow-hidden rounded-[14px] border border-white/[0.10] bg-[#11141d]/88 px-3.5 py-3 text-[13px] shadow-[0_16px_35px_rgba(0,0,0,.28)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] ${statusRing}`}>
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: entry?.color ?? '#8c7cf4' }} />
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.045]" style={{ color: entry?.color }}>
          <NodeIcon size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white/90">{data.label || entry?.label || data.activityType}</div>
          <div className="truncate text-[10px] text-white/35">{entry?.label ?? data.activityType}</div>
        </div>
        {data.status && (
          <span className={`h-2 w-2 rounded-full ${
            data.status === 'failed' ? 'bg-rose-400'
            : data.status === 'success' ? 'bg-emerald-400'
            : 'animate-pulse bg-amber-300'
          }`} title={data.status} />
        )}
      </div>
      {data.recordCount != null && <div className="mt-2 text-[10px] text-white/35">{data.recordCount.toLocaleString()} records</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { flowNode: FlowNode };

function OAuthPickerField({ field, value, onChange }: {
  field: FieldSpec;
  value: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}) {
  switch (field.picker) {
    case 'gsheets':  return <SheetPicker  value={value} onChange={onChange} />;
    case 'gdrive':   return <DrivePicker  value={value} onChange={onChange} />;
    case 'excel':    return <ExcelPicker  value={value} onChange={onChange} />;
    case 'zendesk':  return <ZendeskPicker value={value} onChange={onChange} />;
    default:         return null;
  }
}

// A6/A3 — pick a connector instance of `provider`; writes config.connectionId.
function InstancePicker({ provider, value, onChange }: {
  provider?: string;
  value: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}) {
  const [instances, setInstances] = useState<any[]>([]);
  useEffect(() => {
    api.listConnectors()
      .then((list: any[]) => setInstances(list.filter(i => !provider || i.provider === provider)))
      .catch(() => setInstances([]));
  }, [provider]);
  return (
    <select className="glass-select" value={value.connectionId ?? ''}
      onChange={e => onChange({ connectionId: e.target.value })}>
      <option value="">— select destination —</option>
      {instances.map(i => <option key={i.id} value={i.id}>{i.name ?? i.email ?? i.id} ({i.provider}{i.kind ? `, ${i.kind}` : ''})</option>)}
    </select>
  );
}

function ConfigPanel({ node, onChange, onDelete }: {
  node: Node; onChange: (id: string, patch: any) => void; onDelete: (id: string) => void;
}) {
  const { byType } = useCatalog();
  const entry: CatalogEntry = byType[node.data.activityType];
  if (!entry) return null;
  const cfg = node.data.config ?? {};
  const ing = node.data.ingestion ?? { mode: 'incremental' };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05]" style={{ color: entry.color }}>
          <Settings2 size={18} />
        </span>
        <div>
          <h3 className="m-0 text-sm font-semibold text-white/90">{entry.label}</h3>
          <p className="text-[11px] text-white/35">{node.data.activityType}</p>
        </div>
      </div>
      <label className="glass-label">Label
        <input className="glass-input" value={node.data.label ?? ''}
          onChange={e => onChange(node.id, { label: e.target.value })} />
      </label>

      {entry.fields.map(f => (
        <div key={f.key} className="glass-label">
          <span>{f.label}</span>
          {f.type === 'oauth-picker' ? (
            <OAuthPickerField field={f} value={cfg}
              onChange={patch => onChange(node.id, { config: { ...cfg, ...patch } })} />
          ) : f.type === 'instance-picker' ? (
            <InstancePicker provider={f.provider} value={cfg}
              onChange={patch => onChange(node.id, { config: { ...cfg, ...patch } })} />
          ) : f.type === 'checkbox' ? (
            <input type="checkbox" className="glass-checkbox" checked={!!cfg[f.key]}
              onChange={e => onChange(node.id, { config: { ...cfg, [f.key]: e.target.checked } })} />
          ) : f.type === 'select' ? (
            <select className="glass-select" value={cfg[f.key] ?? f.options?.[0]}
              onChange={e => onChange(node.id, { config: { ...cfg, [f.key]: e.target.value } })}>
              {f.options?.map(o => <option key={o}>{o}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea className="glass-input font-mono text-[11px] h-16"
              placeholder={f.placeholder} value={cfg[f.key] ?? ''}
              onChange={e => onChange(node.id, { config: { ...cfg, [f.key]: e.target.value } })} />
          ) : (
            <input className="glass-input" placeholder={f.placeholder} value={cfg[f.key] ?? ''}
              onChange={e => onChange(node.id, { config: { ...cfg, [f.key]: e.target.value } })} />
          )}
          {f.help && <span className="text-[10px] opacity-60">{f.help}</span>}
        </div>
      ))}

      {entry.supportsIngestion && (
        <fieldset className="my-4 rounded-[14px] border border-white/[0.08] bg-black/10 p-3">
          <legend className="text-[11px] opacity-70 px-1">Ingestion mode</legend>
          <select className="glass-select" value={ing.mode}
            onChange={e => onChange(node.id, { ingestion: { ...ing, mode: e.target.value } })}>
            <option value="incremental">Incremental (cursor)</option>
            <option value="backfill">Historical backfill → then incremental</option>
          </select>
          {ing.mode === 'backfill' && (
            <>
              <label className="glass-label">Backfill start (ISO)
                <input className="glass-input" placeholder="2024-01-01T00:00:00Z" value={ing.backfillStart ?? ''}
                  onChange={e => onChange(node.id, { ingestion: { ...ing, backfillStart: e.target.value } })} />
              </label>
              <label className="glass-label">Page size
                <input className="glass-input" type="number" value={ing.pageSize ?? 100}
                  onChange={e => onChange(node.id, { ingestion: { ...ing, pageSize: +e.target.value } })} />
              </label>
            </>
          )}
        </fieldset>
      )}

      <button className="glass-btn-danger mt-4 w-full" onClick={() => onDelete(node.id)}>
        <Trash2 size={15} /> Delete node
      </button>
    </div>
  );
}

function TriggerEditor({ trigger, onChange }: { trigger: any; onChange: (t: any) => void }) {
  return (
    <div className="flex items-center gap-2">
      <CircleDot size={14} className="text-white/35" />
      <select className="glass-select w-auto" value={trigger.type}
        onChange={e => onChange({ type: e.target.value,
          ...(e.target.value === 'cron' ? { schedule: '*/5 * * * *' } : {}),
          ...(e.target.value === 'webhook' ? { path: 'my-hook', secret: 'change-me' } : {}),
          ...(e.target.value === 'event' ? { topic: 'orders' } : {}) })}>
        <option value="manual">Manual</option>
        <option value="cron">Cron schedule</option>
        <option value="webhook">Webhook</option>
        <option value="event">Event (Redis topic)</option>
      </select>
      {trigger.type === 'cron' &&
        <input className="glass-input w-auto" value={trigger.schedule}
          onChange={e => onChange({ ...trigger, schedule: e.target.value })} placeholder="*/5 * * * *" />}
      {trigger.type === 'webhook' && <>
        <input className="glass-input w-auto" value={trigger.path}
          onChange={e => onChange({ ...trigger, path: e.target.value })} placeholder="hook path" />
        <input className="glass-input w-auto" value={trigger.secret}
          onChange={e => onChange({ ...trigger, secret: e.target.value })} placeholder="HMAC secret" />
        <code className="hidden text-[10px] opacity-60 xl:inline">POST /api/hooks/{trigger.path}</code>
      </>}
      {trigger.type === 'event' &&
        <input className="glass-input w-auto" value={trigger.topic}
          onChange={e => onChange({ ...trigger, topic: e.target.value })} placeholder="topic" />}
    </div>
  );
}

function ExecutionMonitor({ executionId, onNodeStatus }: {
  executionId: string | null; onNodeStatus: (s: Record<string, any>) => void;
}) {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    if (!executionId) return;
    const t = setInterval(async () => {
      try {
        const s = await api.executionStatus(executionId);
        setStatus(s);
        if (s.nodeResults) onNodeStatus(s.nodeResults);
        if (s.nodeRuns) onNodeStatus(Object.fromEntries(
          s.nodeRuns.map((r: any) => [r.node_id, { status: r.status, meta: { recordCount: r.record_count } }])));
        if (['completed', 'failed', 'cancelled'].includes(s.phase)) clearInterval(t);
      } catch { /* polling */ }
    }, 1500);
    return () => clearInterval(t);
  }, [executionId]);

  if (!executionId) return null;
  const phaseColor =
    status?.phase === 'failed' ? 'text-rose-400'
    : status?.phase === 'completed' ? 'text-emerald-400'
    : 'text-amber-400';
  return (
    <div className="glass-panel flex items-center gap-3 rounded-[14px] px-3 py-2.5 shadow-glass-glow">
      <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.055] ${phaseColor}`}>
        {status?.phase === 'completed' ? <Check size={15} />
          : status?.phase === 'failed' ? <AlertCircle size={15} />
          : <CircleDot size={15} className="animate-pulse" />}
      </span>
      <div className="min-w-[150px]">
        <div className="text-xs font-medium text-white/85">{status?.phase ?? 'starting'}</div>
        <div className="max-w-[190px] truncate font-mono text-[9px] text-white/30">{executionId}</div>
      </div>
      <div className="flex gap-1">
        <button className="icon-button h-8 w-8" title="Pause" onClick={() => api.signal(executionId, 'pause')}><Pause size={14} /></button>
        <button className="icon-button h-8 w-8" title="Resume" onClick={() => api.signal(executionId, 'resume')}><RotateCcw size={14} /></button>
        <button className="icon-button h-8 w-8 hover:text-rose-300" title="Cancel" onClick={() => api.signal(executionId, 'cancel')}><XCircle size={14} /></button>
      </div>
    </div>
  );
}

// Inverse of buildDefinition's config flattening: object sub-configs become the
// JSON-text form fields the ConfigPanel renders.
function configToForm(cfg: Record<string, any> = {}): Record<string, any> {
  const out: Record<string, any> = { ...cfg };
  for (const k of ['pagination', 'auth', 'incremental']) {
    if (out[k] && typeof out[k] === 'object') { out[`${k}Json`] = JSON.stringify(out[k]); delete out[k]; }
  }
  if (out.mapping && typeof out.mapping === 'object') out.mapping = JSON.stringify(out.mapping);
  return out;
}

// PipelineDefinition (or AI/mermaid output) → ReactFlow nodes + edges.
function definitionToFlow(def: any, byType: Record<string, CatalogEntry>): { nodes: Node[]; edges: any[] } {
  const nodes: Node[] = (def.nodes ?? []).map((pn: any, i: number) => ({
    id: pn.id,
    type: 'flowNode',
    position: { x: 80 + i * 60, y: 80 + (i % 5) * 100 },
    data: {
      activityType: pn.activityType,
      nodeType: pn.type ?? byType[pn.activityType]?.nodeType,
      label: pn.label,
      ingestion: pn.ingestion,
      config: configToForm({
        ...pn.config,
        ...(pn.mergeStrategy ? { mergeStrategy: pn.mergeStrategy } : {}),
        ...(pn.joinKey ? { joinKey: pn.joinKey } : {}),
      }),
    },
  }));
  const edges = (def.edges ?? []).map((e: any) => ({
    id: e.id ?? `e${Date.now()}-${e.source}-${e.target}`,
    source: e.source, target: e.target,
    data: { condition: e.condition },
    label: e.condition || undefined,
    animated: !!e.condition,
    style: e.condition ? { stroke: '#f5b342' } : undefined,
    labelStyle: e.condition ? { fill: '#f5b342', fontSize: 10 } : undefined,
  }));
  return { nodes, edges };
}

let nid = 0;
export default function PipelineCanvasPage() {
  const { catalog, byType } = useCatalog();
  const location = useLocation();
  const hydrated = useRef(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<any | null>(null);
  const [name, setName] = useState('My pipeline');
  const [trigger, setTrigger] = useState<any>({ type: 'manual' });
  const [savedRowId, setSavedRowId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [showMermaid, setShowMermaid] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [mermaidDraft, setMermaidDraft] = useState('');

  // Hydrate from the AI builder ("Open in canvas" passes the definition in
  // router state). Runs once.
  useEffect(() => {
    const def = (location.state as any)?.definition;
    if (!def || hydrated.current) return;
    hydrated.current = true;
    const { nodes: ns, edges: es } = definitionToFlow(def, byType);
    setNodes(ns); setEdges(es);
    if (def.name) setName(def.name);
    if (def.trigger) setTrigger(def.trigger);
    setMsg('Loaded from AI builder — review and Save');
  }, [location.state]);

  const onConnect = useCallback((c: Connection) =>
    setEdges(eds => addEdge({ ...c, id: `e${Date.now()}` }, eds)), []);

  const addNode = (entry: CatalogEntry) => {
    const id = `n${++nid}-${Date.now() % 10000}`;
    setNodes(ns => [...ns, {
      id, type: 'flowNode',
      position: { x: 80 + ns.length * 40, y: 80 + (ns.length % 5) * 90 },
      data: { activityType: entry.activityType, nodeType: entry.nodeType,
              config: {}, label: entry.label },
    }]);
  };

  const patchNode = (id: string, patch: any) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));

  // A5: per-edge branch condition (conditional fork). The Go engine already
  // evaluates edge `condition`; this exposes + persists it.
  const patchEdgeCondition = (id: string, condition: string) =>
    setEdges(es => es.map(e => e.id === id ? {
      ...e, data: { ...e.data, condition },
      label: condition || undefined, animated: !!condition,
      style: condition ? { stroke: '#f5b342' } : undefined,
      labelStyle: condition ? { fill: '#f5b342', fontSize: 10 } : undefined,
    } : e));

  const deleteNode = (id: string) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
    setSelected(null);
  };

  const buildDefinition = () => ({
    id: '', version: 0, name, tenantId: 'default', trigger,
    nodes: nodes.map(n => {
      const cfg = { ...n.data.config };
      for (const k of ['paginationJson', 'authJson', 'incrementalJson']) {
        if (cfg[k]) {
          try { cfg[k.replace('Json', '')] = JSON.parse(cfg[k]); } catch { /* keep raw */ }
          delete cfg[k];
        }
      }
      // transform.rename stores its mapping as JSON text in the form.
      if (typeof cfg.mapping === 'string') {
        try { cfg.mapping = JSON.parse(cfg.mapping); } catch { /* keep raw */ }
      }
      return {
        id: n.id, type: n.data.nodeType, activityType: n.data.activityType,
        label: n.data.label, config: cfg,
        ingestion: n.data.ingestion,
        mergeStrategy: cfg.mergeStrategy, joinKey: cfg.joinKey,
      };
    }),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target,
      condition: (e.data as any)?.condition || undefined })),
  });

  const save = async () => {
    try {
      const r = await api.savePipeline(buildDefinition());
      setSavedRowId(r.rowId);
      setMsg(`Saved v${r.version}`);
    } catch (e: any) { setMsg(`Save failed: ${e.message}`); }
  };
  const activate = async () => {
    if (!savedRowId) return setMsg('Save first');
    const r = await api.activate(savedRowId);
    setMsg(`Activated in ${displayEnvironment(r.environment)} · trigger: ${r.trigger.type}`);
  };
  const promote = async () => {
    if (!savedRowId) return setMsg('Save first');
    try {
      const r = await api.promote(savedRowId);
      setMsg(`Promoted to production · prod v${r.version}`);
    } catch (e: any) { setMsg(`Promote failed: ${e.message}`); }
  };
  const run = async () => {
    if (!savedRowId) return setMsg('Save first');
    try {
      const r = await api.run(savedRowId);
      setExecutionId(r.executionId);
      setMsg('Running…');
    } catch (e: any) { setMsg(`Run failed: ${e.message}`); }
  };

  const onNodeStatus = (results: Record<string, any>) =>
    setNodes(ns => ns.map(n => results[n.id]
      ? { ...n, data: { ...n.data, status: results[n.id].status,
          recordCount: results[n.id].meta?.recordCount } } : n));

  // ─── Mermaid round-trip panel ───
  const openMermaidPanel = () => {
    const def = buildDefinition();
    setMermaidDraft(definitionToMermaid(def.nodes as any, def.edges as any));
    setShowMermaid(true);
  };
  const applyMermaid = () => {
    const { nodes: parsed, edges: pEdges, warnings } = mermaidToDefinition(mermaidDraft, catalog);
    const prevData = new Map(nodes.map(n => [n.id, n.data]));
    const flow = definitionToFlow({ nodes: parsed, edges: pEdges }, byType);
    flow.nodes.forEach(n => {
      const prev = prevData.get(n.id);
      if (prev) { n.data.config = prev.config; if (prev.ingestion) n.data.ingestion = prev.ingestion; }
    });
    setNodes(flow.nodes); setEdges(flow.edges); setSelected(null);
    setMsg(warnings.length ? `Applied Mermaid · ${warnings.length} warning(s)` : 'Applied Mermaid');
  };

  const palette = useMemo(() => {
    const groups: Record<string, CatalogEntry[]> = {};
    catalog
      .filter(c => !paletteQuery || `${c.label} ${c.activityType}`.toLowerCase().includes(paletteQuery.toLowerCase()))
      .forEach(c => (groups[c.nodeType] ??= []).push(c));
    return groups;
  }, [catalog, paletteQuery]);

  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden">
      <div className="absolute inset-0 soft-grid">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => { setSelected(n); setSelectedEdge(null); setShowMermaid(false); }}
          onEdgeClick={(_, ed) => { setSelectedEdge(ed); setSelected(null); setShowMermaid(false); }}
          fitView>
          <Background gap={24} size={1} color="rgba(255,255,255,0.018)" />
          <Controls position="bottom-left" />
          <MiniMap position="bottom-right" nodeColor={(n) => byType[n.data.activityType]?.color ?? '#7c6cf2'} maskColor="rgba(8,10,16,.7)" />
        </ReactFlow>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto glass-panel flex min-w-0 items-center gap-2 rounded-[14px] p-2">
          <button className={`icon-button ${paletteOpen ? 'bg-brand-500/15 text-brand-300' : ''}`} title="Toggle node library" onClick={() => setPaletteOpen(v => !v)}>
            <PanelLeft size={16} />
          </button>
          <input className="glass-input w-48 border-transparent bg-transparent font-medium" value={name} onChange={e => setName(e.target.value)} aria-label="Pipeline name" />
          <div className="h-6 w-px bg-white/[0.08]" />
          <TriggerEditor trigger={trigger} onChange={setTrigger} />
          <span className="hidden lg:inline-flex"><StageBadge stage="draft" /></span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {msg && <span className="glass-panel hidden max-w-[220px] truncate rounded-[10px] px-3 py-2 text-[11px] text-white/55 xl:block">{msg}</span>}
          <div className="glass-panel flex items-center gap-1 rounded-[14px] p-1.5">
            <button className="glass-btn-ghost border-transparent bg-transparent" onClick={save}><Save size={15} /> Save</button>
            <button className="glass-btn-ghost border-transparent bg-transparent" onClick={activate}><Rocket size={15} /> Activate</button>
            <button className="glass-btn-success" onClick={run}><Play size={15} fill="currentColor" /> Run</button>
            <div className="relative">
              <button className="icon-button border-transparent" aria-label="More pipeline actions" onClick={() => setMoreOpen(v => !v)}>
                <MoreHorizontal size={17} />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-11 w-48 rounded-[14px] border border-white/[0.1] bg-[#11141d]/95 p-1.5 shadow-glass backdrop-blur-2xl">
                  <button className="glass-btn-ghost w-full justify-start border-transparent bg-transparent text-xs" onClick={() => { openMermaidPanel(); setMoreOpen(false); }}>
                    <Code2 size={14} /> Edit Mermaid
                  </button>
                  <button className="glass-btn-ghost w-full justify-start border-transparent bg-transparent text-xs" onClick={() => { promote(); setMoreOpen(false); }}>
                    <Layers3 size={14} /> Promote to prod
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {paletteOpen && (
        <aside className="glass-panel absolute bottom-4 left-4 top-[84px] z-10 flex w-[232px] flex-col overflow-hidden rounded-[16px]">
          <div className="border-b border-white/[0.07] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white/85">Node library</p>
                <p className="text-[10px] text-white/35">Add building blocks</p>
              </div>
              <button className="icon-button h-7 w-7 border-transparent bg-transparent" onClick={() => setPaletteOpen(false)}><X size={14} /></button>
            </div>
            <label className="relative block">
              <Search className="absolute left-2.5 top-2.5 text-white/25" size={14} />
              <input className="glass-input pl-8 text-xs" placeholder="Search nodes…" value={paletteQuery} onChange={e => setPaletteQuery(e.target.value)} />
            </label>
          </div>
          <div className="flex-1 overflow-auto p-2.5">
            {Object.entries(palette).map(([group, entries]) => (
              <div key={group} className="mb-4">
                <div className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">{group}</div>
                {entries.map(e => (
                  <button key={e.activityType}
                    className="group mb-1 flex w-full items-center gap-2.5 rounded-[11px] border border-transparent px-2.5 py-2 text-left transition hover:border-white/[0.08] hover:bg-white/[0.055]"
                    onClick={() => addNode(e)}>
                    <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-white/65 group-hover:text-white/90">{e.label}</span>
                    <span className="text-sm text-white/20 group-hover:text-brand-300">+</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>
      )}

      {(selected || selectedEdge || showMermaid) && (
        <aside className="absolute bottom-0 right-0 top-0 z-20 w-full max-w-[380px] border-l border-white/[0.08] bg-[#0d1018]/92 shadow-[-24px_0_60px_rgba(0,0,0,.35)] backdrop-blur-2xl">
          <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-4">
            <div>
              <p className="text-xs font-semibold text-white/85">{showMermaid ? 'Mermaid editor' : selectedEdge ? 'Branch condition' : 'Node settings'}</p>
              <p className="text-[10px] text-white/30">{showMermaid ? 'Edit graph structure as code' : selectedEdge ? 'Route records on this edge' : 'Configure selected node'}</p>
            </div>
            <button className="icon-button h-8 w-8" onClick={() => { setShowMermaid(false); setSelected(null); setSelectedEdge(null); }}><X size={15} /></button>
          </div>
          <div className="h-[calc(100%-56px)] overflow-auto p-4">
            {showMermaid ? (
              <>
                <textarea className="glass-input h-52 w-full font-mono text-[11px]" value={mermaidDraft} onChange={e => setMermaidDraft(e.target.value)} />
                <button className="glass-btn-primary mt-3 w-full" onClick={applyMermaid}><Code2 size={15} /> Apply to canvas</button>
                <div className="mt-4 overflow-hidden rounded-[14px] border border-white/[0.08] bg-black/15 p-2"><MermaidPreview source={mermaidDraft} /></div>
                <p className="mt-2 text-[10px] text-white/30">Structure only. Node config preserved by matching ID.</p>
              </>
            ) : selectedEdge ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-white/85">Branch condition</p>
                <p className="mb-3 text-[10px] text-white/35">Records flow down this edge only when the predicate is true. Leave blank for always.</p>
                <textarea className="glass-input h-20 w-full font-mono text-[11px]"
                  placeholder="r.amount > 100"
                  value={selectedEdge.data?.condition ?? ''}
                  onChange={e => {
                    patchEdgeCondition(selectedEdge.id, e.target.value);
                    setSelectedEdge((s: any) => ({ ...s, data: { ...s.data, condition: e.target.value } }));
                  }} />
              </div>
            ) : selected ? (
              <ConfigPanel node={nodes.find(n => n.id === selected.id) ?? selected} onChange={patchNode} onDelete={deleteNode} />
            ) : null}
          </div>
        </aside>
      )}

      {executionId && (
        <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
          <ExecutionMonitor executionId={executionId} onNodeStatus={onNodeStatus} />
        </div>
      )}

      {!nodes.length && !paletteOpen && (
        <button className="glass-panel absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-[16px] px-5 py-4 text-left hover:border-brand-300/20" onClick={() => setPaletteOpen(true)}>
          <PanelLeft size={20} className="text-brand-300" />
          <span><b className="block text-sm">Open node library</b><span className="text-xs text-white/35">Start building pipeline</span></span>
        </button>
      )}
    </div>
  );
}
