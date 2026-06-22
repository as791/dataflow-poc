import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });

let renderSeq = 0;

// Renders a Mermaid source string to inline SVG. Parse errors are caught and
// shown as a hint (the source textarea remains the editing surface; the canvas
// is the source of truth, so a broken preview is non-fatal).
export function MermaidPreview({ source }: { source: string }) {
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!source.trim()) { setSvg(''); setErr(null); return; }
    const id = `mmd-${++renderSeq}`;
    mermaid.render(id, source)
      .then(({ svg }) => { if (!cancelled) { setSvg(svg); setErr(null); } })
      .catch((e: any) => { if (!cancelled) setErr(e?.message ?? 'invalid mermaid'); });
    return () => { cancelled = true; };
  }, [source]);

  if (err) return <div className="text-[11px] text-amber-400">Preview unavailable: {err.split('\n')[0]}</div>;
  return <div className="overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}
