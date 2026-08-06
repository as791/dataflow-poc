import { useState } from 'react';
import { api, type AiConversationMessage } from '../api';

export type AiGenerateStatus = 'ready' | 'needs_input' | 'rejected';

export interface AiGenerateResult {
  status: AiGenerateStatus;
  mermaid: string;
  definition: any | null;
  warnings: string[];
  assumptions: string[];
  questions: string[];
}

const strings = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  : [];

export function normalizeAiGenerateResult(response: any): AiGenerateResult {
  const hasStatus = response != null && Object.prototype.hasOwnProperty.call(response, 'status');
  const rawStatus = response?.status;
  const requestedStatus: AiGenerateStatus = !hasStatus
    ? 'ready'
    : rawStatus === 'ready' || rawStatus === 'needs_input' || rawStatus === 'rejected'
      ? rawStatus
      : 'rejected';
  const definition = requestedStatus === 'ready'
    ? response?.definition ?? (Array.isArray(response?.nodes) ? response : null)
    : null;
  const status = requestedStatus === 'ready' && !definition ? 'rejected' : requestedStatus;
  const warnings = strings(response?.warnings);
  if (requestedStatus === 'ready' && !definition) warnings.push('The AI response did not include a pipeline definition.');
  if (hasStatus && rawStatus !== 'ready' && rawStatus !== 'needs_input' && rawStatus !== 'rejected') {
    warnings.push('The AI response included an unsupported status.');
  }
  return {
    status,
    definition,
    mermaid: typeof response?.mermaid === 'string' ? response.mermaid : '',
    warnings,
    assumptions: strings(response?.assumptions),
    questions: strings(response?.questions),
  };
}

export function useAiGenerate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (prompt: string, mermaid = '', messages: AiConversationMessage[] = []): Promise<AiGenerateResult | null> => {
    setLoading(true); setError(null);
    try {
      return normalizeAiGenerateResult(await api.generatePipeline(prompt, { mermaid, messages }));
    } catch (e: any) { setError(e.message); return null; }
    finally { setLoading(false); }
  };

  const refine = async (definition: any, prompt: string, mermaid = '', messages: AiConversationMessage[] = []): Promise<AiGenerateResult | null> => {
    setLoading(true); setError(null);
    try {
      return normalizeAiGenerateResult(await api.refinePipeline(definition, prompt, { mermaid, messages }));
    } catch (e: any) { setError(e.message); return null; }
    finally { setLoading(false); }
  };

  return { generate, refine, loading, error };
}
