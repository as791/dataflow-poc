import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mermaidToDefinition } from '@dataflow/shared';
import { CATALOG } from '../catalog';
import { api } from '../api';
import { MermaidPreview } from '../components/MermaidPreview';

interface Definition {
  nodes: any[];
  edges: any[];
  trigger: any;
  suggestedName?: string;
}

export default function AIBuilderPage() {
  const nav = useNavigate();
  const [prompt, setPrompt] = useState('Pull Zendesk tickets every 5 minutes, drop deleted ones, and write them to Postgres.');
  const [mermaid, setMermaid] = useState('');
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const canOpen = !!definition?.nodes?.length;

  const generate = async (refine: boolean) => {
    setBusy(true); setMsg(refine ? 'Refining…' : 'Generating…');
    try {
      const r = refine && definition
        ? await api.refinePipeline(definition, prompt)
        : await api.generatePipeline(prompt);
      setMermaid(r.mermaid);
      setDefinition(r.definition);
      setWarnings([]);
      setMsg(`Generated ${r.definition.nodes.length} node(s)`);
    } catch (e: any) {
      setMsg(`Failed: ${e.message}`);
    } finally { setBusy(false); }
  };

  // Editing the Mermaid text re-derives the structural part of the definition.
  const onMermaidChange = (src: string) => {
    setMermaid(src);
    const { nodes, edges, warnings } = mermaidToDefinition(src, CATALOG);
    setWarnings(warnings);
    setDefinition(d => ({
      nodes, edges,
      trigger: d?.trigger ?? { type: 'manual' },
      suggestedName: d?.suggestedName,
    }));
  };

  const openInCanvas = () => {
    if (!definition) return;
    nav('/', { state: { definition: { ...definition, name: definition.suggestedName } } });
  };

  const triggerSummary = useMemo(() => {
    const t = definition?.trigger;
    if (!t) return '';
    return t.type === 'cron' ? `cron · ${t.schedule}` : t.type;
  }, [definition]);

  return (
    <div className="grid h-[calc(100vh-56px)]" style={{ gridTemplateColumns: '320px 1fr 240px' }}>
      {/* ── Prompt ── */}
      <div className="border-r border-white/10 p-4 overflow-auto flex flex-col gap-3">
        <h2 className="text-sm font-semibold m-0">Describe your pipeline</h2>
        <textarea className="glass-input h-40 text-[13px]" value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. Every hour, fetch new GitHub issues, keep only open ones, and send them to a webhook." />
        <div className="flex gap-2">
          <button className="glass-btn-success flex-1" disabled={busy} onClick={() => generate(false)}>
            {busy ? '…' : 'Generate'}
          </button>
          <button className="glass-btn-ghost" disabled={busy || !definition} onClick={() => generate(true)}>
            Refine
          </button>
        </div>
        <span className="text-[11px] opacity-70">{msg}</span>

        {warnings.length > 0 && (
          <div className="glass-panel p-2 mt-1">
            <div className="text-[11px] font-semibold text-amber-400 mb-1">Warnings</div>
            <ul className="text-[11px] opacity-80 list-disc pl-4 space-y-1">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <p className="text-[10px] opacity-50 mt-auto">
          Generation runs on a local Ollama model. Mermaid carries structure only —
          configure each node's fields after opening in the canvas.
        </p>
      </div>

      {/* ── Mermaid editor + preview ── */}
      <div className="p-4 overflow-auto grid grid-rows-[auto_1fr_1fr] gap-2">
        <div className="text-xs opacity-70">Mermaid (editable)</div>
        <textarea className="glass-input font-mono text-[12px]" value={mermaid}
          onChange={e => onMermaidChange(e.target.value)}
          placeholder="flowchart TD&#10;  src[&quot;Zendesk (zendesk.fetch)&quot;] --> snk[&quot;Postgres sink (sink.postgres)&quot;]" />
        <div className="glass-panel p-3 overflow-auto">
          <MermaidPreview source={mermaid} />
        </div>
      </div>

      {/* ── Open in canvas ── */}
      <div className="border-l border-white/10 p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold m-0">Review</h3>
        {definition ? (
          <div className="text-[12px] opacity-80 space-y-1">
            <div><b>{definition.suggestedName ?? 'Untitled'}</b></div>
            <div>{definition.nodes.length} nodes · {definition.edges.length} edges</div>
            {triggerSummary && <div>Trigger: {triggerSummary}</div>}
          </div>
        ) : <div className="text-[12px] opacity-60">Generate a pipeline to begin.</div>}
        <button className="glass-btn-success mt-2" disabled={!canOpen} onClick={openInCanvas}>
          Open in canvas →
        </button>
      </div>
    </div>
  );
}
