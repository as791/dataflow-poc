import { useMemo, useState } from 'react';
import { ArrowRight, Code2, Sparkles, WandSparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { mermaidToDefinition } from '@dataflow/shared';
import { useCatalog } from '../context/CatalogContext';
import { MermaidPreview } from '../components/MermaidPreview';
import { ApiError } from '../components/ApiError';
import { useAiGenerate } from '../hooks/useAiGenerate';

interface Definition {
  nodes: any[]; edges: any[]; trigger: any; suggestedName?: string;
}

export default function AIBuilderPage() {
  const nav = useNavigate();
  const { catalog } = useCatalog();
  const [prompt, setPrompt] = useState('Pull Zendesk tickets every 5 minutes, drop deleted ones, and write them to Postgres.');
  const [mermaid, setMermaid] = useState('');
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const { generate: aiGenerate, refine: aiRefine, loading: busy, error: aiError } = useAiGenerate();

  const canOpen = !!definition?.nodes?.length;

  const generate = async (doRefine: boolean) => {
    setStatusMsg(doRefine ? 'Refining…' : 'Generating…');
    const result = doRefine && definition
      ? await aiRefine(definition, prompt)
      : await aiGenerate(prompt);
    if (result) {
      setMermaid(result.mermaid);
      setDefinition(result.definition);
      setWarnings([]);
      setStatusMsg(`Generated ${result.definition.nodes.length} node(s)`);
    }
  };

  const onMermaidChange = (src: string) => {
    setMermaid(src);
    const { nodes, edges, warnings } = mermaidToDefinition(src, catalog);
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
    <div className="grid h-full" style={{ gridTemplateColumns: '340px 1fr 260px' }}>
      {/* ── Prompt panel ── */}
      <div className="flex flex-col gap-3 overflow-auto border-r border-gray-200 dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.018] p-5">
        <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-500/10 text-brand-500 dark:text-brand-300">
          <Sparkles size={18} />
        </span>
        <h2 className="m-0 text-sm font-semibold text-gray-900 dark:text-white/90">Describe pipeline</h2>
        <textarea className="glass-input h-40 text-[13px]" value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. Every hour, fetch new GitHub issues, keep only open ones, and send them to a webhook." />
        <div className="flex gap-2">
          <button className="glass-btn-primary flex-1" disabled={busy} onClick={() => generate(false)}>
            <WandSparkles size={15} /> {busy ? 'Generating…' : 'Generate'}
          </button>
          <button className="glass-btn-ghost" disabled={busy || !definition} onClick={() => generate(true)}>
            Refine
          </button>
        </div>
        {aiError ? <ApiError message={aiError} /> : <span className="text-[11px] text-gray-500 dark:opacity-70">{statusMsg}</span>}

        {warnings.length > 0 && (
          <div className="glass-panel p-2 mt-1">
            <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1">Warnings</div>
            <ul className="text-[11px] text-gray-600 dark:opacity-80 list-disc pl-4 space-y-1">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-gray-400 dark:opacity-50 mt-auto">
          Generation runs on a local Ollama model. Mermaid carries structure only —
          configure each node's fields after opening in the canvas.
        </p>
      </div>

      {/* ── Mermaid editor + preview ── */}
      <div className="grid grid-rows-[auto_1fr_1fr] gap-3 overflow-auto p-5">
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-white/45">
          <Code2 size={14} /> Mermaid source
        </div>
        <textarea className="glass-input font-mono text-[12px]" value={mermaid}
          onChange={e => onMermaidChange(e.target.value)}
          placeholder="flowchart TD&#10;  src[&quot;Zendesk (zendesk.fetch)&quot;] --> snk[&quot;Postgres sink (sink.postgres)&quot;]" />
        <div className="glass-panel p-3 overflow-auto">
          <MermaidPreview source={mermaid} />
        </div>
      </div>

      {/* ── Open in canvas ── */}
      <div className="flex flex-col gap-3 border-l border-gray-200 dark:border-white/[0.07] bg-gray-50/80 dark:bg-white/[0.018] p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90 m-0">Review</h3>
        {definition ? (
          <div className="text-[12px] text-gray-600 dark:opacity-80 space-y-1">
            <div><b className="text-gray-900 dark:text-white">{definition.suggestedName ?? 'Untitled'}</b></div>
            <div>{definition.nodes.length} nodes · {definition.edges.length} edges</div>
            {triggerSummary && <div>Trigger: {triggerSummary}</div>}
          </div>
        ) : (
          <div className="text-[12px] text-gray-400 dark:opacity-60">Generate a pipeline to begin.</div>
        )}
        <button className="glass-btn-primary mt-2" disabled={!canOpen} onClick={openInCanvas}>
          Open in canvas <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
