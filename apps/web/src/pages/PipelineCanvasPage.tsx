import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Activity, ArrowDownToLine, Braces, Cable, ChevronDown, ChevronUp,
  Clock, Code2, CreditCard, Database, GitFork, History, Layers3,
  Maximize2, Minimize2, Moon, Play, Plus, Rocket, Save, Search,
  Settings, Sparkles, Sun, Terminal, User, Users, X, Zap,
} from 'lucide-react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Node, type Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { definitionToMermaid, mermaidToDefinition } from '@dataflow/shared';
import { useCatalog } from '../context/CatalogContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { MermaidPreview } from '../components/MermaidPreview';
import { api } from '../api';
import { ActivityIcon, nodeTypes } from '../components/canvas/FlowNode';
import { ConfigPanel } from '../components/canvas/ConfigPanel';
import { ExecutionMonitor } from '../components/canvas/ExecutionMonitor';
import { definitionToFlow, flowToDefinition } from '../utils/pipelineConvert';
import { validatePipeline } from '../utils/validatePipeline';
import { deriveStage, displayEnvironment, type Stage } from './LifecyclePage';

const TOOLBAR_CATS = [
  { id: 'source',    label: 'Sources',    icon: Database,         color: '#1D9E75' },
  { id: 'transform', label: 'Transforms', icon: Braces,           color: '#D85A30' },
  { id: 'sink',      label: 'Sinks',      icon: ArrowDownToLine,  color: '#639922' },
  { id: 'flow',      label: 'Flow',       icon: GitFork,          color: '#7F77DD' },
] as const;
type CatId = typeof TOOLBAR_CATS[number]['id'];
type WorkspacePanel = 'connectors' | 'settings' | null;
type BottomTab = 'runs' | 'logs' | 'lifecycle' | 'mermaid';

const STAGE_STYLES: Record<Stage, string> = {
  draft:      'bg-amber-100  text-amber-700  dark:bg-amber-500/15  dark:text-amber-300',
  testing:    'bg-blue-100   text-blue-700   dark:bg-blue-500/15   dark:text-blue-300',
  production: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  archived:   'bg-gray-100   text-gray-500   dark:bg-white/5       dark:text-white/35',
};

let nid = 0;

export default function PipelineCanvasPage() {
  const { catalog, byType } = useCatalog();
  const location = useLocation();
  const { dark, toggle: toggleTheme } = useTheme();
  const { user } = useAuth();
  const hydrated = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const connectSource = useRef<string | null>(null);
  const connected = useRef(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<any | null>(null);

  const [name, setName] = useState('My pipeline');
  const [trigger, setTrigger] = useState<any>({ type: 'manual' });
  const [savedRowId, setSavedRowId] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState<Stage>('draft');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const [activeCat, setActiveCat] = useState<CatId | null>(null);
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>(null);
  const [catQuery, setCatQuery] = useState('');
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [showMermaid, setShowMermaid] = useState(false);
  const [mermaidDraft, setMermaidDraft] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('runs');
  const [drawerHeight, setDrawerHeight] = useState(260);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [recentRuns, setRecentRuns] = useState<any[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [runDetail, setRunDetail] = useState<any | null>(null);
  const [contextAdd, setContextAdd] = useState<{ source: string; x: number; y: number } | null>(null);
  const [connectorInstances, setConnectorInstances] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [usage, setUsage] = useState<any | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

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

  useEffect(() => {
    if (!workspacePanel) return;
    if (workspacePanel === 'connectors') {
      api.listConnectors().then(setConnectorInstances).catch(() => setConnectorInstances([]));
    } else {
      Promise.all([
        api.listMembers().catch(() => []),
        api.getUsage().catch(() => null),
      ]).then(([nextMembers, nextUsage]) => {
        setMembers(nextMembers); setUsage(nextUsage);
      });
    }
  }, [workspacePanel]);

  const onConnect = useCallback((c: Connection) => {
    connected.current = true;
    setEdges(eds => addEdge({ ...c, id: `e${Date.now()}` }, eds));
  }, []);

  const addNode = (entry: any, sourceId?: string) => {
    const id = `n${++nid}-${Date.now() % 10000}`;
    setNodes(ns => {
      const source = sourceId ? ns.find(n => n.id === sourceId) : null;
      return [...ns, {
        id, type: 'flowNode',
        position: source
          ? { x: source.position.x + 260, y: source.position.y }
          : { x: 160 + ns.length * 44, y: 120 + (ns.length % 5) * 90 },
        data: { activityType: entry.activityType, nodeType: entry.nodeType, config: {}, label: entry.label },
      }];
    });
    if (sourceId) setEdges(es => addEdge({ id: `e${Date.now()}`, source: sourceId, target: id }, es));
    setContextAdd(null);
  };

  const finishConnection = (event: MouseEvent | TouchEvent) => {
    if (connected.current || !connectSource.current || !canvasRef.current) {
      connected.current = false; connectSource.current = null; return;
    }
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const bounds = canvasRef.current.getBoundingClientRect();
    setContextAdd({
      source: connectSource.current,
      x: Math.min(point.clientX - bounds.left, bounds.width - 300),
      y: Math.min(point.clientY - bounds.top, bounds.height - 240),
    });
    connectSource.current = null;
  };

  const patchNode = (id: string, patch: any) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));

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

  const buildDefinition = () => flowToDefinition(nodes, edges, { name, trigger });

  const validate = () => {
    const def = buildDefinition();
    const errs = validatePipeline(
      def.nodes.map(n => ({ id: n.id, type: n.type, label: n.label })),
      def.edges,
    );
    if (errs.length) { setMsg(errs[0].message); return false; }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    try {
      const r = await api.savePipeline(buildDefinition());
      setSavedRowId(r.rowId);
      setPipelineStage(deriveStage('inactive', 'test'));
      setMsg(`Saved v${r.version}`);
    } catch (e: any) { setMsg(`Save failed: ${e.message}`); }
  };

  const activate = async () => {
    if (!savedRowId) return setMsg('Save first');
    const r = await api.activate(savedRowId);
    setPipelineStage(deriveStage('active', r.environment));
    setMsg(`Activated in ${displayEnvironment(r.environment)}`);
  };

  const promote = async () => {
    if (!savedRowId) return setMsg('Save first');
    try {
      const r = await api.promote(savedRowId);
      setPipelineStage('production');
      setMsg(`Promoted to production · v${r.version}`);
    } catch (e: any) { setMsg(`Promote failed: ${e.message}`); }
  };

  const run = async () => {
    if (!savedRowId) return setMsg('Save first');
    if (!validate()) return;
    try {
      const r = await api.run(savedRowId);
      setExecutionId(r.executionId);
      setMsg('Running…');
    } catch (e: any) { setMsg(`Run failed: ${e.message}`); }
  };

  const onNodeStatus = (results: Record<string, any>) =>
    setNodes(ns => ns.map(n => results[n.id]
      ? { ...n, data: { ...n.data, status: results[n.id].status, recordCount: results[n.id].meta?.recordCount } } : n));

  const openMermaid = () => {
    const def = buildDefinition();
    setMermaidDraft(definitionToMermaid(def.nodes as any, def.edges as any));
    setShowMermaid(true); setSelected(null); setSelectedEdge(null);
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

  const runAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true); setAiState('loading'); setMsg('Generating pipeline');
    try {
      const response = await api.generatePipeline(aiPrompt);
      const def = response.definition ?? response;
      const { nodes: ns, edges: es } = definitionToFlow(def, byType);
      setNodes(ns); setEdges(es);
      if (def.name) setName(def.name);
      if (def.trigger) setTrigger(def.trigger);
      setMermaidDraft(response.mermaid ?? definitionToMermaid(def.nodes, def.edges));
      setBottomTab('mermaid'); setDrawerOpen(true); setAiState('success');
      setShowAI(false); setAiPrompt('');
      setMsg('AI pipeline generated. DAG and Mermaid ready.');
    } catch (e: any) { setAiState('error'); setMsg(`AI failed: ${e.message}`); }
    finally { setAiLoading(false); }
  };

  const openDrawer = async (tab: BottomTab = 'runs') => {
    setBottomTab(tab); setDrawerOpen(true);
    if (recentRuns.length === 0) {
      setRunsLoading(true);
      try { setRecentRuns(await api.listExecutions({})); }
      catch { /* ignore */ }
      finally { setRunsLoading(false); }
    }
  };

  const selectRun = async (row: any) => {
    setSelectedRun(row); setBottomTab('logs'); setRunDetail(null);
    try { setRunDetail(await api.getExecution(row.id)); }
    catch (e: any) { setRunDetail({ error: e.message }); }
  };

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = drawerHeight;
    const move = (e: PointerEvent) => setDrawerHeight(Math.max(150,
      Math.min(window.innerHeight * .52, startHeight + startY - e.clientY)));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const inviteMember = async (event: React.FormEvent) => {
    event.preventDefault(); setInviteBusy(true); setInviteMsg('');
    try {
      await api.invite({ email: inviteEmail, role: 'member' });
      setInviteMsg('Invitation sent'); setInviteEmail('');
    } catch (e: any) { setInviteMsg(e.message); }
    finally { setInviteBusy(false); }
  };

  const catEntries = useMemo(() => {
    const q = catQuery.toLowerCase();
    return catalog.filter(c => {
      const matchesCat = activeCat === 'flow'
        ? c.nodeType === 'fork' || c.nodeType === 'merge'
        : c.nodeType === activeCat;
      const matchesQuery = !q || `${c.label} ${c.activityType}`.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [catalog, activeCat, catQuery]);

  const rightPanelOpen = selected || selectedEdge || showMermaid;
  const drawerOffset = drawerExpanded ? 'calc(52vh + 12px)' : drawerHeight + 12;
  const executionOffset = drawerExpanded ? 'calc(52vh + 16px)' : drawerHeight + 16;

  return (
    <div ref={canvasRef} className="relative h-screen overflow-hidden bg-[#f5f5f5] dark:bg-[#0d0f17]">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={(_, params) => { connectSource.current = params.nodeId; connected.current = false; }}
        onConnectEnd={finishConnection}
        onNodeClick={(_, n) => { setSelected(n); setSelectedEdge(null); setShowMermaid(false); }}
        onEdgeClick={(_, ed) => { setSelectedEdge(ed); setSelected(null); setShowMermaid(false); }}
        onPaneClick={() => { setActiveCat(null); setWorkspacePanel(null); setShowLifecycle(false); setContextAdd(null); }}
        fitView
        className="absolute inset-0">
        <Background variant={BackgroundVariant.Dots} gap={24} size={1}
          color={dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'} />
        <Controls position="bottom-left" style={{ left: 56, bottom: drawerOpen ? drawerOffset : 12 }} />
        <MiniMap position="bottom-left" pannable zoomable
          style={{ left: 110, bottom: drawerOpen ? drawerOffset : 12, width: 190, height: 112 }}
          nodeColor={n => byType[n.data.activityType]?.color ?? '#6965db'}
          nodeStrokeColor={dark ? '#ffffff' : '#111827'} nodeStrokeWidth={2}
          maskColor={dark ? 'rgba(8,10,16,.7)' : 'rgba(245,245,245,.7)'} />
      </ReactFlow>

      {contextAdd && (
        <div className="absolute z-40 w-72 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-white/[0.1] dark:bg-[#12151e]"
          style={{ left: contextAdd.x, top: contextAdd.y }}>
          <div className="flex items-center justify-between px-2 py-1.5">
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white/90">Add next step</p>
              <p className="text-[10px] text-gray-400 dark:text-white/35">Valid transforms, branches, and destinations</p>
            </div>
            <button className="icon-button h-7 w-7" onClick={() => setContextAdd(null)}><X size={13} /></button>
          </div>
          <div className="max-h-48 overflow-auto pt-1">
            {catalog.filter(entry => entry.nodeType !== 'source').map(entry => (
              <button key={entry.activityType} onClick={() => addNode(entry, contextAdd.source)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/[0.06]">
                <span className="h-7 w-1 rounded-full" style={{ background: entry.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-gray-700 dark:text-white/75">{entry.label}</span>
                  <span className="block text-[10px] capitalize text-gray-400 dark:text-white/30">{entry.nodeType}</span>
                </span>
                <Plus size={13} className="text-gray-300 dark:text-white/25" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Left Miro-style toolbar */}
      <aside className="absolute left-0 top-0 bottom-0 z-20 flex w-[52px] flex-col items-center gap-1
        border-r border-gray-200 dark:border-white/[0.08]
        bg-white/95 dark:bg-[#0d0f17]/95 backdrop-blur-lg py-3">
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-md shadow-brand-500/20">
          <Zap size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />
        {TOOLBAR_CATS.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCat === cat.id;
          return (
            <button key={cat.id} title={cat.label}
              onClick={() => { setActiveCat(isActive ? null : cat.id as CatId); setWorkspacePanel(null); setCatQuery(''); }}
              className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all ${
                isActive
                  ? 'text-white shadow-md'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
              }`}
              style={isActive ? { background: cat.color } : undefined}>
              <Icon size={17} strokeWidth={1.75} />
            </button>
          );
        })}
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />
        <button title="AI Builder" onClick={() => { setShowAI(v => !v); setActiveCat(null); setWorkspacePanel(null); }}
          className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all ${
            showAI ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
          }`}>
          <Sparkles size={17} strokeWidth={1.75} />
        </button>
        <button title="Edit as Mermaid" onClick={() => { setActiveCat(null); setWorkspacePanel(null); openMermaid(); }}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
          <Code2 size={17} strokeWidth={1.75} />
        </button>
        <div className="flex-1" />
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />
        <button title="Connectors" onClick={() => {
          setWorkspacePanel(workspacePanel === 'connectors' ? null : 'connectors'); setActiveCat(null);
        }} className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all ${
          workspacePanel === 'connectors' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
        }`}><Cable size={17} strokeWidth={1.75} /></button>
        <button title="Pipeline runs"
          onClick={() => { setActiveCat(null); setWorkspacePanel(null); drawerOpen && bottomTab === 'runs' ? setDrawerOpen(false) : openDrawer('runs'); }}
          className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all ${
            drawerOpen && bottomTab === 'runs' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
          }`}>
          <History size={17} strokeWidth={1.75} />
        </button>
        <button title="Pipeline lifecycle" onClick={() => { setActiveCat(null); setWorkspacePanel(null); openDrawer('lifecycle'); }}
          className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all ${
            drawerOpen && bottomTab === 'lifecycle' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
          }`}><Rocket size={17} strokeWidth={1.75} /></button>
        <button title="Profile and settings" onClick={() => {
          setWorkspacePanel(workspacePanel === 'settings' ? null : 'settings'); setActiveCat(null);
        }} className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all ${
          workspacePanel === 'settings' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
        }`}><Settings size={17} strokeWidth={1.75} /></button>
        <button title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </aside>

      {/* Category flyout panel */}
      {activeCat && (
        <div className="absolute left-[52px] top-0 bottom-0 z-10 w-[220px] flex flex-col
          border-r border-gray-200 dark:border-white/[0.08]
          bg-white/97 dark:bg-[#0d0f17]/97 backdrop-blur-lg shadow-xl">
          <div className="border-b border-gray-100 dark:border-white/[0.07] p-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-white/90 capitalize mb-2">
              {TOOLBAR_CATS.find(c => c.id === activeCat)?.label}
            </p>
            <label className="relative block">
              <Search className="absolute left-2.5 top-2 text-gray-400 dark:text-white/30" size={13} />
              <input className="glass-input pl-8 py-1.5 text-xs" placeholder="Search…"
                value={catQuery} onChange={e => setCatQuery(e.target.value)} />
            </label>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {catEntries.map(entry => (
              <button key={entry.activityType} onClick={() => addNode(entry)}
                className="group mb-1 flex w-full items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 py-2 text-left transition
                  hover:border-gray-200 hover:bg-gray-50 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.05]">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: entry.color }} />
                <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-white/65
                  group-hover:text-gray-900 dark:group-hover:text-white">{entry.label}</span>
                <Plus size={13} className="flex-none text-gray-300 dark:text-white/20 group-hover:text-brand-500" />
              </button>
            ))}
            {catEntries.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-gray-400 dark:text-white/30">No matches</p>
            )}
          </div>
        </div>
      )}

      {workspacePanel && (
        <aside className="absolute left-[52px] top-0 bottom-0 z-20 flex w-[320px] flex-col border-r border-gray-200 bg-white/97 shadow-xl backdrop-blur-lg dark:border-white/[0.08] dark:bg-[#0d0f17]/97">
          <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4 dark:border-white/[0.07]">
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white/90">
                {workspacePanel === 'connectors' ? 'Connectors' : 'Workspace settings'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-white/35">
                {workspacePanel === 'connectors' ? 'Add and configure pipeline integrations' : 'Profile, billing, and members'}
              </p>
            </div>
            <button className="icon-button h-8 w-8" onClick={() => setWorkspacePanel(null)}><X size={14} /></button>
          </div>

          {workspacePanel === 'connectors' ? (
            <div className="flex-1 overflow-auto p-3">
              <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/[0.07] dark:bg-white/[0.035]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">Connected accounts</p>
                <p className="mt-1 text-xs text-gray-700 dark:text-white/70">{connectorInstances.length} configured</p>
              </div>
              <div className="space-y-2">
                {catalog.filter(entry => entry.nodeType === 'source' || entry.nodeType === 'sink').map(entry => (
                  <div key={entry.activityType} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: entry.color }}>
                        <ActivityIcon activityType={entry.activityType} nodeType={entry.nodeType} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-gray-800 dark:text-white/80">{entry.label.replace(' (destination)', '')}</p>
                        <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-white/30">{entry.activityType}</p>
                        <span className="mt-2 inline-flex rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-500 dark:bg-white/[0.06] dark:text-white/35">{entry.nodeType}</span>
                      </div>
                      <button title={`Add ${entry.label}`} onClick={() => addNode(entry)} className="icon-button h-8 w-8"><Plus size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-auto p-3">
              <section className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-white/80"><User size={14} /> Profile</div>
                <p className="mt-3 truncate text-xs text-gray-700 dark:text-white/70">{user?.email}</p>
                <p className="mt-1 text-[10px] capitalize text-gray-400 dark:text-white/35">{user?.role ?? 'member'} role</p>
              </section>
              <section className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-white/80"><CreditCard size={14} /> Billing</div>
                <div className="mt-3 flex items-end justify-between">
                  <div><p className="text-lg font-semibold text-gray-900 dark:text-white/90">{usage?.used ?? '—'}</p><p className="text-[10px] text-gray-400 dark:text-white/35">executions used</p></div>
                  <p className="text-[10px] text-gray-400 dark:text-white/35">limit {usage?.limit ?? '—'}</p>
                </div>
              </section>
              <section className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-800 dark:text-white/80"><span className="flex items-center gap-2"><Users size={14} /> Members</span><span className="glass-badge">{members.length}</span></div>
                <div className="mt-2 divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {members.slice(0, 6).map(member => <div key={member.id} className="flex items-center justify-between gap-2 py-2 text-[11px]"><span className="truncate text-gray-600 dark:text-white/60">{member.email}</span><span className="capitalize text-gray-400 dark:text-white/30">{member.role}</span></div>)}
                  {!members.length && <p className="py-2 text-[11px] text-gray-400 dark:text-white/30">No members loaded</p>}
                </div>
                {user?.role === 'owner' && (
                  <form className="mt-2 flex gap-2" onSubmit={inviteMember}>
                    <input type="email" required className="glass-input min-w-0 flex-1 py-1.5 text-xs" placeholder="teammate@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                    <button className="glass-btn-primary px-2.5 py-1.5 text-xs" disabled={inviteBusy}>{inviteBusy ? 'Sending' : 'Invite'}</button>
                  </form>
                )}
                {inviteMsg && <p className="mt-2 text-[10px] text-gray-400 dark:text-white/35">{inviteMsg}</p>}
              </section>
            </div>
          )}
        </aside>
      )}

      {/* Top floating: name pill + lifecycle */}
      <div className="absolute top-4 z-10 flex -translate-x-1/2 items-center gap-2 pointer-events-none transition-[left] duration-200"
        style={{ left: activeCat || workspacePanel ? 'calc(50% + 150px)' : 'calc(50% + 26px)' }}>
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-white/[0.09]
          bg-white/95 dark:bg-[#0d1018]/90 px-3 py-2 shadow-sm dark:shadow-glass backdrop-blur-xl">
          <input
            className="bg-transparent text-sm font-semibold text-gray-900 dark:text-white/90 outline-none w-40 placeholder-gray-400 dark:placeholder-white/30"
            value={name} onChange={e => setName(e.target.value)} aria-label="Pipeline name" />
          <div className="h-4 w-px bg-gray-200 dark:bg-white/[0.1]" />
          <div className="relative">
            <button onClick={() => setShowLifecycle(v => !v)}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all ${STAGE_STYLES[pipelineStage]}`}>
              {pipelineStage} <ChevronDown size={10} />
            </button>
            {showLifecycle && (
              <div className="absolute top-7 left-0 z-50 w-52 rounded-2xl border border-gray-200 dark:border-white/[0.1]
                bg-white dark:bg-[#11141d]/95 p-2 shadow-xl dark:shadow-glass backdrop-blur-xl">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">Lifecycle</p>
                {pipelineStage === 'draft' && (
                  <button className="glass-btn-ghost w-full justify-start text-xs"
                    onClick={() => { activate(); setShowLifecycle(false); }}>
                    <Rocket size={13} /> Activate → Integration
                  </button>
                )}
                {pipelineStage === 'testing' && (
                  <button className="glass-btn-primary w-full justify-start text-xs"
                    onClick={() => { promote(); setShowLifecycle(false); }}>
                    <Layers3 size={13} /> Promote to Production
                  </button>
                )}
                {pipelineStage === 'production' && (
                  <p className="flex items-center gap-1.5 px-2 py-2 text-xs text-emerald-600 dark:text-emerald-400"><Activity size={13} /> Live in production</p>
                )}
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-gray-200 dark:bg-white/[0.1]" />
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-gray-400 dark:text-white/30" />
            <select className="bg-transparent text-xs text-gray-600 dark:text-white/60 outline-none cursor-pointer"
              value={trigger.type}
              onChange={e => setTrigger({ type: e.target.value,
                ...(e.target.value === 'cron' ? { schedule: '*/5 * * * *' } : {}),
                ...(e.target.value === 'webhook' ? { path: 'my-hook', secret: 'change-me' } : {}),
                ...(e.target.value === 'event' ? { topic: 'orders' } : {}) })}>
              <option value="manual">Manual</option>
              <option value="cron">Cron</option>
              <option value="webhook">Webhook</option>
              <option value="event">Event</option>
            </select>
            {trigger.type === 'cron' && (
              <input className="bg-transparent text-xs outline-none w-28 text-gray-600 dark:text-white/60 font-mono"
                value={trigger.schedule} onChange={e => setTrigger({ ...trigger, schedule: e.target.value })} />
            )}
          </div>
        </div>
      </div>

      {/* Top right: actions */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 pointer-events-none">
        {msg && (
          <span className="pointer-events-auto hidden xl:block rounded-xl border border-gray-200 dark:border-white/[0.09] bg-white/90 dark:bg-[#0d1018]/85 px-3 py-1.5 text-[11px] text-gray-500 dark:text-white/50 backdrop-blur-xl max-w-[200px] truncate shadow-sm">
            {msg}
          </span>
        )}
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-gray-200 dark:border-white/[0.09]
          bg-white/95 dark:bg-[#0d1018]/90 px-2 py-2 shadow-sm dark:shadow-glass backdrop-blur-xl">
          <button className="glass-btn-ghost border-transparent bg-transparent text-xs" onClick={save}><Save size={14} /> Save</button>
          <button className="glass-btn-ghost border-transparent bg-transparent text-xs" onClick={activate}><Rocket size={14} /> Activate</button>
          <button className="glass-btn-primary text-xs" onClick={run}><Play size={13} fill="currentColor" /> Run</button>
        </div>
      </div>

      {/* AI command bar */}
      {showAI && (
        <div className="absolute top-20 left-1/2 z-30 -translate-x-1/2 w-full max-w-xl px-4 pointer-events-none">
          <div className="pointer-events-auto rounded-2xl border border-gray-200 dark:border-white/[0.12]
            bg-white dark:bg-[#11141d]/95 shadow-xl dark:shadow-glass-glow backdrop-blur-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Sparkles size={16} className="text-brand-500 flex-none" />
              <input
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white/90 outline-none placeholder-gray-400 dark:placeholder-white/30"
                placeholder="Describe your pipeline… e.g. Sync Zendesk tickets to Postgres"
                value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAI()} autoFocus />
              <button className="glass-btn-primary text-xs flex-none"
                disabled={aiLoading || !aiPrompt.trim()} onClick={runAI}>
                {aiLoading ? '…' : 'Generate'}
              </button>
              <button className="icon-button h-7 w-7 border-transparent bg-transparent flex-none" onClick={() => setShowAI(false)}>
                <X size={14} />
              </button>
            </div>
            {aiState === 'error' && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-[10px] text-red-600 dark:border-red-500/15 dark:bg-red-500/[0.06] dark:text-red-300">{msg}</p>}
            {aiState === 'loading' && <div className="h-0.5 animate-pulse bg-brand-500" />}
          </div>
        </div>
      )}

      {/* Right config drawer */}
      {rightPanelOpen && (
        <aside className="absolute right-0 top-0 bottom-0 z-20 w-full max-w-[360px]
          border-l border-gray-200 dark:border-white/[0.08]
          bg-white/97 dark:bg-[#0d1018]/94 backdrop-blur-xl shadow-[-16px_0_40px_rgba(0,0,0,.06)] dark:shadow-[-24px_0_60px_rgba(0,0,0,.35)]">
          <div className="flex h-14 items-center justify-between border-b border-gray-100 dark:border-white/[0.07] px-4">
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white/85">
                {showMermaid ? 'Mermaid editor' : selectedEdge ? 'Branch condition' : 'Node settings'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-white/30">
                {showMermaid ? 'Edit graph as code' : selectedEdge ? 'Conditional routing' : 'Configure selected node'}
              </p>
            </div>
            <button className="icon-button h-8 w-8" onClick={() => { setShowMermaid(false); setSelected(null); setSelectedEdge(null); }}>
              <X size={15} />
            </button>
          </div>
          <div className="h-[calc(100%-56px)] overflow-auto p-4">
            {showMermaid ? (
              <>
                <textarea className="glass-input h-52 w-full font-mono text-[11px]"
                  value={mermaidDraft} onChange={e => setMermaidDraft(e.target.value)} />
                <button className="glass-btn-primary mt-3 w-full" onClick={applyMermaid}>
                  <Code2 size={15} /> Apply to canvas
                </button>
                <div className="mt-4 overflow-hidden rounded-[14px] border border-gray-100 dark:border-white/[0.08] bg-gray-50 dark:bg-black/15 p-2">
                  <MermaidPreview source={mermaidDraft} />
                </div>
                <p className="mt-2 text-[10px] text-gray-400 dark:text-white/30">Structure only. Node config preserved by matching ID.</p>
              </>
            ) : selectedEdge ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-900 dark:text-white/85">Branch condition</p>
                <p className="mb-3 text-[10px] text-gray-400 dark:text-white/35">Records flow only when true. Blank = always.</p>
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

      {/* Execution monitor */}
      {executionId && (
        <div className="absolute left-1/2 z-20 -translate-x-1/2" style={{ bottom: drawerOpen ? executionOffset : 20 }}>
          <ExecutionMonitor executionId={executionId} onNodeStatus={onNodeStatus} />
        </div>
      )}

      {/* IDE-style output drawer */}
      {drawerOpen && (
        <div className="absolute bottom-0 left-[52px] right-0 z-20 flex flex-col
          border-t border-gray-200 dark:border-white/[0.08]
          bg-white/97 dark:bg-[#0d1018]/96 backdrop-blur-xl
          shadow-[0_-4px_24px_rgba(0,0,0,.08)] dark:shadow-[0_-8px_32px_rgba(0,0,0,.4)]"
          style={{ height: drawerExpanded ? '52vh' : drawerHeight }}>
          <button aria-label="Resize output panel" onPointerDown={startResize}
            className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize bg-transparent" />
          <div className="flex h-10 flex-none items-center gap-1 border-b border-gray-100 px-3 dark:border-white/[0.06]">
            {([
              ['runs', History, 'Runs'], ['logs', Terminal, 'Logs'],
              ['lifecycle', Activity, 'Lifecycle'], ['mermaid', Code2, 'Mermaid'],
            ] as const).map(([id, Icon, label]) => (
              <button key={id} onClick={() => setBottomTab(id)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition ${bottomTab === id ? 'bg-gray-100 text-gray-800 dark:bg-white/[0.08] dark:text-white/80' : 'text-gray-400 hover:text-gray-700 dark:text-white/35 dark:hover:text-white/65'}`}>
                <Icon size={12} /> {label}
              </button>
            ))}
            <div className="flex-1" />
            <span className="hidden text-[10px] text-gray-400 dark:text-white/30 sm:inline">Drag top edge to resize</span>
            <button className="icon-button h-7 w-7 border-transparent bg-transparent" title={drawerExpanded ? 'Restore panel' : 'Expand panel'}
              onClick={() => setDrawerExpanded(v => !v)}>{drawerExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
            <button className="icon-button h-7 w-7 border-transparent bg-transparent" title="Collapse panel"
              onClick={() => setDrawerOpen(false)}><ChevronDown size={14} /></button>
            <button className="icon-button h-6 w-6 border-transparent bg-transparent"
              onClick={() => setDrawerOpen(false)}><X size={13} /></button>
          </div>
          <div className="flex-1 overflow-auto">
            {bottomTab === 'runs' && runsLoading && (
              <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-white/30">Loading…</div>
            )}
            {bottomTab === 'runs' && !runsLoading && recentRuns.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <p className="text-xs text-gray-400 dark:text-white/30">No runs yet.</p>
                <button className="glass-btn-primary text-xs" onClick={run}><Play size={12} /> Run pipeline</button>
              </div>
            )}
            {bottomTab === 'runs' && !runsLoading && recentRuns.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    <th className="px-4 py-1.5 text-left font-medium text-gray-400 dark:text-white/30">Pipeline</th>
                    <th className="px-4 py-1.5 text-left font-medium text-gray-400 dark:text-white/30">Status</th>
                    <th className="px-4 py-1.5 text-left font-medium text-gray-400 dark:text-white/30">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.slice(0, 20).map(r => {
                    const statusColor =
                      r.phase === 'completed' ? 'text-emerald-600 dark:text-emerald-400'
                      : r.phase === 'failed'  ? 'text-red-500 dark:text-danger'
                      : r.phase === 'running' ? 'text-amber-600 dark:text-amber-300'
                      : 'text-gray-400 dark:text-white/40';
                    return (
                      <tr key={r.id}
                        className="border-b border-gray-50 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.03] cursor-pointer"
                        onClick={() => selectRun(r)}>
                        <td className="px-4 py-2 text-gray-700 dark:text-white/70 truncate max-w-[200px]">{r.name}</td>
                        <td className={`px-4 py-2 font-medium ${statusColor}`}>{r.phase ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-400 dark:text-white/35">
                          {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {bottomTab === 'logs' && (
              <div className="h-full p-3 font-mono text-[11px] text-gray-600 dark:text-white/60">
                {!selectedRun && !executionId && <p className="text-gray-400 dark:text-white/30">Select a run to inspect execution output.</p>}
                {executionId && !selectedRun && <p><span className="text-amber-500">RUNNING</span> {executionId}</p>}
                {selectedRun && <div className="mb-3 flex items-center gap-3 font-sans"><span className="font-semibold text-gray-800 dark:text-white/80">{selectedRun.name}</span><span className="glass-badge">{selectedRun.phase}</span></div>}
                {selectedRun && !runDetail && <p className="text-gray-400 dark:text-white/30">Loading execution detail…</p>}
                {runDetail && <pre className="whitespace-pre-wrap break-words leading-relaxed">{runDetail.error ?? JSON.stringify(runDetail, null, 2)}</pre>}
              </div>
            )}
            {bottomTab === 'lifecycle' && (
              <div className="grid h-full gap-3 p-4 sm:grid-cols-3">
                {(['draft', 'testing', 'production'] as Stage[]).map((stage, index) => (
                  <div key={stage} className={`rounded-xl border p-3 ${pipelineStage === stage ? 'border-brand-400/50 bg-brand-500/[0.06]' : 'border-gray-200 dark:border-white/[0.07]'}`}>
                    <div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${pipelineStage === stage ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-white/30'}`}>{index + 1}</span><p className="text-xs font-semibold capitalize text-gray-800 dark:text-white/80">{stage === 'testing' ? 'Integration' : stage}</p></div>
                    <p className="mt-2 text-[10px] text-gray-400 dark:text-white/30">{pipelineStage === stage ? 'Current pipeline stage' : stage === 'production' ? 'Promote after green Integration run' : 'Saved pipeline version'}</p>
                  </div>
                ))}
              </div>
            )}
            {bottomTab === 'mermaid' && (
              <div className="grid min-h-full gap-3 p-3 md:grid-cols-2">
                <div className="flex min-h-0 flex-col">
                  <textarea className="glass-input min-h-36 flex-1 font-mono text-[11px]" value={mermaidDraft} onChange={e => setMermaidDraft(e.target.value)} />
                  <button className="glass-btn-primary mt-2 self-start text-xs" onClick={applyMermaid}><Code2 size={13} /> Apply to DAG</button>
                </div>
                <div className="min-h-36 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-white/[0.07] dark:bg-black/15"><MermaidPreview source={mermaidDraft} /></div>
              </div>
            )}
          </div>
        </div>
      )}

      {!drawerOpen && (
        <button title="Open output panel" onClick={() => openDrawer(bottomTab)}
          className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-gray-200 bg-white/95 px-3 py-1.5 text-[11px] text-gray-500 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-[#11141d]/90 dark:text-white/45">
          <ChevronUp size={13} /> Output
        </button>
      )}

      {/* Empty state */}
      {!nodes.length && !activeCat && !showAI && (
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4 text-center pointer-events-none">
          <p className="text-sm font-medium text-gray-400 dark:text-white/30">Start building your pipeline</p>
          <div className="flex gap-2 pointer-events-auto">
            <button
              className="flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-white/[0.09] bg-white dark:bg-white/[0.05] px-4 py-2.5 text-sm text-gray-600 dark:text-white/60 shadow-sm hover:bg-gray-50 hover:border-gray-300 dark:hover:bg-white/[0.08] transition-all"
              onClick={() => { setActiveCat('source'); setCatQuery(''); }}>
              <Database size={15} className="text-emerald-500" /> Add a source
            </button>
            <button
              className="flex items-center gap-2 rounded-2xl border border-brand-300/30 bg-brand-500/10 text-brand-600 dark:text-brand-300 px-4 py-2.5 text-sm shadow-sm hover:bg-brand-500/15 transition-all"
              onClick={() => setShowAI(true)}>
              <Sparkles size={15} /> Generate with AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
