import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CATALOG } from '@dataflow/shared';
import './index.css';
import { NodePalette } from './pages/canvas/NodePalette';
import { OutputDrawer } from './pages/canvas/OutputDrawer';

// Throwaway harness to eyeball the rail's responsive layout without the
// auth/backend stack. Not part of the app router — delete after QA.
function Debug() {
  const [activeCat, setActiveCat] = useState<any>(null);
  const [workspacePanel, setWorkspacePanel] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<any>('runs');
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="relative flex h-screen w-screen overflow-hidden bg-[#f5f5f5] dark:bg-[#0d0f17]">
        <NodePalette
          catalog={CATALOG} activeCat={activeCat} setActiveCat={setActiveCat}
          addNode={() => {}} showAI={false} setShowAI={() => {}} openMermaid={() => {}}
          workspacePanel={workspacePanel} setWorkspacePanel={setWorkspacePanel}
          drawerOpen={drawerOpen} bottomTab={bottomTab}
          openDrawer={tab => { setBottomTab(tab ?? 'runs'); setDrawerOpen(true); }}
          setDrawerOpen={setDrawerOpen}
          dark={dark} toggleTheme={() => setDark(v => !v)} navigate={() => {}}
        />
        <OutputDrawer
          drawerOpen={drawerOpen} drawerExpanded={false} drawerHeight={220} startResize={() => {}}
          bottomTab={bottomTab} setBottomTab={setBottomTab} setDrawerExpanded={() => {}}
          setDrawerOpen={setDrawerOpen} openDrawer={tab => { setBottomTab(tab ?? 'runs'); setDrawerOpen(true); }}
          runsLoading={false} recentRuns={[]} run={() => {}} selectRun={() => {}}
          selectedRun={null} runDetail={null} executionId={null} pipelineStage="draft"
          mermaidDraft="" setMermaidDraft={() => {}} mermaidValid={false} setMermaidValid={() => {}} applyMermaid={() => {}}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Debug />);
