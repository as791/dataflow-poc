import { useEffect, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });

let renderSeq = 0;

// Renders a Mermaid source string to inline SVG. Parse errors are caught and
// shown as a hint (the source textarea remains the editing surface; the canvas
// is the source of truth, so a broken preview is non-fatal).
export function MermaidPreview({ source, onValidChange }: { source: string; onValidChange?: (valid: boolean) => void }) {
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!source.trim()) { setSvg(''); setErr(null); onValidChange?.(false); return; }
    const id = `mmd-${++renderSeq}`;
    setSvg('');
    mermaid.parse(source)
      .then(() => mermaid.render(id, source))
      .then(({ svg }) => { if (!cancelled) { setSvg(svg); setErr(null); } })
      .then(() => { if (!cancelled) onValidChange?.(true); })
      .catch((e: any) => { if (!cancelled) { setErr(e?.message ?? 'invalid mermaid'); onValidChange?.(false); } });
    return () => { cancelled = true; };
  }, [source, onValidChange]);

  if (err) return <div role="alert" className="text-[11px] text-amber-400">Invalid Mermaid: {err.split('\n')[0]}</div>;
  return <div role="img" aria-label="Pipeline diagram" className="overflow-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
