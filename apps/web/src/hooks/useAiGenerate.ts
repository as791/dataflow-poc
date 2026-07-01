import { useState } from 'react';
import { api } from '../api';

export interface AiGenerateResult { mermaid: string; definition: any }

export function useAiGenerate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (prompt: string): Promise<AiGenerateResult | null> => {
    setLoading(true); setError(null);
    try {
      const r = await api.generatePipeline(prompt);
      return { mermaid: r.mermaid, definition: r.definition ?? r };
    } catch (e: any) { setError(e.message); return null; }
    finally { setLoading(false); }
  };

  const refine = async (definition: any, prompt: string): Promise<AiGenerateResult | null> => {
    setLoading(true); setError(null);
    try {
      const r = await api.refinePipeline(definition, prompt);
      return { mermaid: r.mermaid, definition: r.definition ?? r };
    } catch (e: any) { setError(e.message); return null; }
    finally { setLoading(false); }
  };

  return { generate, refine, loading, error };
}
