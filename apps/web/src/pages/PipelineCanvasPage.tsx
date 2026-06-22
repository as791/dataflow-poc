import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  type Node, type Connection, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { definitionToMermaid, mermaidToDefinition } from '@dataflow/shared';
import { CATALOG, byType, type CatalogEntry, type FieldSpec } from '../catalog';
import { MermaidPreview } from '../components/MermaidPreview';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { SheetPicker } from '../components/connectors/SheetPicker';
import { DrivePicker } from '../components/connectors/DrivePicker';
import { ExcelPicker } from '../components/connectors/ExcelPicker';
import { ZendeskPicker } from '../components/connectors/ZendeskPicker';

function FlowNode({ data }: { data: any }) {
  const entry: CatalogEntry = byType[data.activityType];
  const statusRing =
    data.status === 'failed' ? 'ring-2 ring-rose-400/70'
    : data.status === 'success' ? 'ring-2 ring-emerald-400/60'
    : '';
  return (
    <div className={`glass-card px-3.5 py-2.5 min-w-[150px] text-[13px] ${statusRing}`}
         style={{ borderColor: `${entry?.color ?? '#888'}88` }}>
      <Handle type="target" position={Position.Left} />
      <div className="font-semibold" style={{ color: entry?.color }}>{entry?.label ?? data.activityType}</div>
      <div className="text-[11px] opacity-70">
        {data.label || data.activityType}
        {data.status && <span> · {data.status}{data.recordCount != null ? ` · ${data.recordCount} rec` : ''}</span>}
      </div>
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

function ConfigPanel({ node, onChange, onDelete }: {
  node: Node; onChange: (id: string, patch: any) => void; onDelete: (id: string) => void;
}) {
  const entry: CatalogEntry = byType[node.data.activityType];
  if (!entry) return null;
  const cfg = node.data.config ?? {};
  const ing = node.data.ingestion ?? { mode: 'incremental' };

  return (
    <div className="glass-panel p-3 mb-3">
      <h3 className="m-0 mb-1 text-sm font-semibold">{entry.label}</h3>
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
        <fieldset className="border border-white/10 rounded-md p-2 my-2">
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

      <button className="glass-btn-danger w-full mt-2" onClick={() => onDelete(node.id)}>Delete node</button>
    </div>
  );
}

function TriggerEditor({ trigger, onChange }: { trigger: any; onChange: (t: any) => void }) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <span className="text-xs opacity-70">Trigger:</span>
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
        <code className="text-[10px] opacity-60">POST /api/hooks/{trigger.path}</code>
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
    <div className="glass-panel p-3 max-h-52 overflow-auto">
      <div className="text-xs">
        <b>{executionId.slice(0, 30)}…</b> — <span className={phaseColor}>{status?.phase ?? 'starting'}</span>
      </div>
      <div className="flex gap-1.5 my-2">
        {['pause', 'resume', 'cancel'].map(a =>
          <button key={a} className="glass-btn-ghost text-xs" onClick={() => api.signal(executionId, a)}>{a}</button>)}
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
function definitionToFlow(def: any): { nodes: Node[]; edges: any[] } {
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
  const edges = (def.edges ?? []).map((e: any) => ({ id: e.id ?? `e${Date.now()}-${e.source}-${e.target}`, source: e.source, target: e.target }));
  return { nodes, edges };
}

let nid = 0;
export default function PipelineCanvasPage() {
  const { wrapDekForWorker } = useAuth();
  const location = useLocation();
  const hydrated = useRef(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [name, setName] = useState('My pipeline');
  const [trigger, setTrigger] = useState<any>({ type: 'manual' });
  const [savedRowId, setSavedRowId] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [showMermaid, setShowMermaid] = useState(false);
  const [mermaidDraft, setMermaidDraft] = useState('');

  // Hydrate from the AI builder ("Open in canvas" passes the definition in
  // router state). Runs once.
  useEffect(() => {
    const def = (location.state as any)?.definition;
    if (!def || hydrated.current) return;
    hydrated.current = true;
    const { nodes: ns, edges: es } = definitionToFlow(def);
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
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
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
    setMsg(`Activated · trigger: ${r.trigger.type}`);
  };
  const run = async () => {
    if (!savedRowId) return setMsg('Save first');
    try {
      const encryptedDek = await wrapDekForWorker();
      const r = await api.run(savedRowId, encryptedDek ?? undefined);
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
    const { nodes: parsed, edges: pEdges, warnings } = mermaidToDefinition(mermaidDraft, CATALOG);
    const prevData = new Map(nodes.map(n => [n.id, n.data]));
    const flow = definitionToFlow({ nodes: parsed, edges: pEdges });
    flow.nodes.forEach(n => {
      const prev = prevData.get(n.id);
      if (prev) { n.data.config = prev.config; if (prev.ingestion) n.data.ingestion = prev.ingestion; }
    });
    setNodes(flow.nodes); setEdges(flow.edges); setSelected(null);
    setMsg(warnings.length ? `Applied Mermaid · ${warnings.length} warning(s)` : 'Applied Mermaid');
  };

  const palette = useMemo(() => {
    const groups: Record<string, CatalogEntry[]> = {};
    CATALOG.forEach(c => (groups[c.nodeType] ??= []).push(c));
    return groups;
  }, []);

  return (
    <div className="grid h-[calc(100vh-56px)]" style={{ gridTemplateColumns: '200px 1fr 300px', gridTemplateRows: '56px 1fr' }}>
      <div className="col-span-3 flex items-center gap-2.5 px-4 border-b border-white/10 glass-panel rounded-none">
        <input className="glass-input w-56" value={name} onChange={e => setName(e.target.value)} />
        <TriggerEditor trigger={trigger} onChange={setTrigger} />
        <div className="flex-1" />
        <button className="glass-btn-ghost"
          onClick={() => (showMermaid ? setShowMermaid(false) : openMermaidPanel())}>
          {showMermaid ? 'Hide Mermaid' : 'Mermaid'}
        </button>
        <button className="glass-btn-ghost" onClick={save}>Save</button>
        <button className="glass-btn-ghost" onClick={activate}>Activate</button>
        <button className="glass-btn-success" onClick={run}>▶ Run now</button>
        <span className="text-[11px] opacity-70">{msg}</span>
      </div>

      <div className="p-2.5 border-r border-white/10 overflow-auto">
        {Object.entries(palette).map(([group, entries]) => (
          <div key={group}>
            <div className="text-[10px] uppercase opacity-55 mt-2.5 mb-1 tracking-wider">{group}</div>
            {entries.map(e => (
              <button key={e.activityType}
                className="glass-btn-ghost w-full mb-1 text-left text-xs"
                style={{ borderColor: `${e.color}66` }}
                onClick={() => addNode(e)}>+ {e.label}</button>
            ))}
          </div>
        ))}
      </div>

      <div>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onNodeClick={(_, n) => setSelected(n)} fitView>
          <Background gap={20} size={1} color="rgba(255,255,255,0.08)" />
          <Controls /><MiniMap />
        </ReactFlow>
      </div>

      <div className="border-l border-white/10 p-2.5 overflow-auto">
        {showMermaid && (
          <div className="glass-panel p-3 mb-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="m-0 text-sm font-semibold">Mermaid</h3>
              <button className="glass-btn-ghost text-xs" onClick={applyMermaid}>Apply to canvas</button>
            </div>
            <textarea className="glass-input font-mono text-[11px] h-40 w-full"
              value={mermaidDraft} onChange={e => setMermaidDraft(e.target.value)} />
            <div className="mt-2"><MermaidPreview source={mermaidDraft} /></div>
            <p className="text-[10px] opacity-50 mt-1">
              Structure only — node config is preserved by id across edits.
            </p>
          </div>
        )}
        {selected
          ? <ConfigPanel node={nodes.find(n => n.id === selected.id) ?? selected}
              onChange={patchNode} onDelete={deleteNode} />
          : <div className="text-xs opacity-60">Select a node to configure it.<br /><br />
              Drag from a node's right handle to another node's left handle to connect.</div>}
        <ExecutionMonitor executionId={executionId} onNodeStatus={onNodeStatus} />
      </div>
    </div>
  );
}
