import { useMemo, useState } from 'react';
import {
  ArrowDownToLine, Braces, Cable, Code2, Database, GitFork, History,
  LayoutList, Moon, Plus, Rocket, Search, Settings, Sparkles, Sun,
} from 'lucide-react';
import type { CatalogEntry } from '@dataflow/shared';
import { AtomMark } from '../../components/AtomMark';
import { ActivityIcon } from '../../components/canvas/FlowNode';
import type { BottomTab } from './OutputDrawer';
import type { WorkspacePanel } from './WorkspaceSidePanel';

export const TOOLBAR_CATS = [
  { id: 'source',    label: 'Sources',    icon: Database,         color: '#1D9E75' },
  { id: 'transform', label: 'Transforms', icon: Braces,           color: '#D85A30' },
  { id: 'sink',      label: 'Sinks',      icon: ArrowDownToLine,  color: '#639922' },
  { id: 'flow',      label: 'Flow',       icon: GitFork,          color: '#7F77DD' },
] as const;
export type CatId = typeof TOOLBAR_CATS[number]['id'];

// Left Miro-style icon rail plus the category flyout it opens (source /
// transform / sink / flow node lists). Category-select state lives here since
// nothing outside the rail + flyout reads catQuery, and only the "active
// category" id itself needs to be visible to the page (for the outside-click
// handler and the top pill's left offset).
export function NodePalette({
  catalog, activeCat, setActiveCat, addNode,
  showAI, setShowAI, openMermaid,
  workspacePanel, setWorkspacePanel,
  drawerOpen, bottomTab, openDrawer, setDrawerOpen,
  dark, toggleTheme, navigate,
}: {
  catalog: CatalogEntry[];
  activeCat: CatId | null;
  setActiveCat: (id: CatId | null) => void;
  addNode: (entry: CatalogEntry) => void;
  showAI: boolean;
  setShowAI: (updater: boolean | ((v: boolean) => boolean)) => void;
  openMermaid: () => void;
  workspacePanel: WorkspacePanel;
  setWorkspacePanel: (panel: WorkspacePanel | ((v: WorkspacePanel) => WorkspacePanel)) => void;
  drawerOpen: boolean;
  bottomTab: BottomTab;
  openDrawer: (tab?: BottomTab) => void;
  setDrawerOpen: (open: boolean) => void;
  dark: boolean;
  toggleTheme: () => void;
  navigate: (path: string) => void;
}) {
  const [catQuery, setCatQuery] = useState('');

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

  return (
    <>
      <aside data-canvas-sidebar className="absolute left-3 top-3 bottom-3 z-20 flex w-[52px] flex-col items-center gap-1 rounded-2xl
        border border-gray-200 dark:border-white/[0.08]
        bg-white/95 dark:bg-[#0d0f17]/95 backdrop-blur-lg py-3 shadow-sm dark:shadow-glass">
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-md shadow-brand-500/20">
          <AtomMark size={20} />
        </div>
        <button title="All pipelines" aria-label="All pipelines" onClick={() => navigate('/pipelines')}
          className="group relative flex h-11 w-11 items-center justify-center rounded-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
          <LayoutList size={17} strokeWidth={1.75} />
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">All pipelines</span>
        </button>
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />
        {TOOLBAR_CATS.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCat === cat.id;
          return (
            <button key={cat.id} title={cat.label} aria-label={cat.label}
              onClick={() => { setActiveCat(isActive ? null : cat.id as CatId); setWorkspacePanel(null); setCatQuery(''); }}
              className={`group relative flex h-11 w-11 items-center justify-center rounded-[10px] transition-all ${
                isActive
                  ? 'text-white shadow-md'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
              }`}
              style={isActive ? { background: cat.color } : undefined}>
              <Icon size={17} strokeWidth={1.75} />
              <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">{cat.label}</span>
            </button>
          );
        })}
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />
        <button title="Quick AI add" aria-label="Quick AI add" onClick={() => { setShowAI(v => !v); setActiveCat(null); setWorkspacePanel(null); }}
          className={`group relative flex h-11 w-11 items-center justify-center rounded-[10px] transition-all ${
            showAI ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
          }`}>
          <Sparkles size={17} strokeWidth={1.75} />
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">Quick AI add</span>
        </button>
        <button title="Edit as Mermaid" aria-label="Edit as Mermaid" onClick={() => { setActiveCat(null); setWorkspacePanel(null); openMermaid(); }}
          className="group relative flex h-11 w-11 items-center justify-center rounded-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
          <Code2 size={17} strokeWidth={1.75} />
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">Edit as Mermaid</span>
        </button>
        <div className="flex-1" />
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />
        <button title="Connectors" aria-label="Connectors" onClick={() => {
          setWorkspacePanel(workspacePanel === 'connectors' ? null : 'connectors'); setActiveCat(null);
        }} className={`group relative flex h-11 w-11 items-center justify-center rounded-[10px] transition-all ${
          workspacePanel === 'connectors' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
        }`}>
          <Cable size={17} strokeWidth={1.75} />
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">Connectors</span>
        </button>
        <button title="Pipeline runs" aria-label="Pipeline runs"
          onClick={() => { setActiveCat(null); setWorkspacePanel(null); drawerOpen && bottomTab === 'runs' ? setDrawerOpen(false) : openDrawer('runs'); }}
          className={`group relative flex h-11 w-11 items-center justify-center rounded-[10px] transition-all ${
            drawerOpen && bottomTab === 'runs' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
          }`}>
          <History size={17} strokeWidth={1.75} />
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">Pipeline runs</span>
        </button>
        <button title="Pipeline lifecycle" aria-label="Pipeline lifecycle" onClick={() => { setActiveCat(null); setWorkspacePanel(null); drawerOpen && bottomTab === 'lifecycle' ? setDrawerOpen(false) : openDrawer('lifecycle'); }}
          className={`group relative flex h-11 w-11 items-center justify-center rounded-[10px] transition-all ${
            drawerOpen && bottomTab === 'lifecycle' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
          }`}>
          <Rocket size={17} strokeWidth={1.75} />
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">Pipeline lifecycle</span>
        </button>
        <button title="Profile and settings" aria-label="Profile and settings" onClick={() => {
          setWorkspacePanel(workspacePanel === 'settings' ? null : 'settings'); setActiveCat(null);
        }} className={`group relative flex h-11 w-11 items-center justify-center rounded-[10px] transition-all ${
          workspacePanel === 'settings' ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white'
        }`}>
          <Settings size={17} strokeWidth={1.75} />
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">Settings</span>
        </button>
        <button title={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}
          className="group relative flex h-11 w-11 items-center justify-center rounded-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">{dark ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </aside>

      {activeCat && (
        <div data-canvas-sidebar className="absolute left-[68px] top-3 bottom-3 z-10 w-[300px] flex flex-col overflow-hidden rounded-r-2xl
          border border-gray-200 dark:border-white/[0.08]
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
          <div className="grid flex-1 grid-cols-2 content-start gap-1 overflow-auto p-2">
            {catEntries.map(entry => (
              <button key={entry.activityType} onClick={() => addNode(entry)}
                className="group flex w-full items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 py-2 text-left transition
                  hover:border-gray-200 hover:bg-gray-50 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.05]">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] border transition-colors
                  border-gray-100 bg-gray-50 dark:border-white/[0.07] dark:bg-white/[0.04]
                  group-hover:border-gray-200 dark:group-hover:border-white/[0.12]"
                  style={{ color: entry.color }}>
                  <ActivityIcon activityType={entry.activityType} nodeType={entry.nodeType} size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-600 dark:text-white/65
                  group-hover:text-gray-900 dark:group-hover:text-white">{entry.label}</span>
                <Plus size={12} className="flex-none text-gray-300 dark:text-white/20 group-hover:text-brand-500" />
              </button>
            ))}
            {catEntries.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-gray-400 dark:text-white/30">No matches</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
