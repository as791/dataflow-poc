import axios from 'axios';

// Thin client for a local Ollama sidecar. No SDK, no API key. The model is
// asked for strict JSON (`format: 'json'`); a single retry re-asks if the body
// is not parseable. Generation is opt-in: the `ai` compose profile starts the
// sidecar. When OLLAMA_URL is unreachable the caller surfaces a 503.

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.1:8b';
const TIMEOUT_MS = 60_000;

export class OllamaUnavailableError extends Error {}

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

async function rawChat(messages: ChatMessage[]): Promise<string> {
  try {
    const res = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      { model: OLLAMA_MODEL, format: 'json', stream: false, messages },
      { timeout: TIMEOUT_MS },
    );
    return res.data?.message?.content ?? '';
  } catch (e: any) {
    // Connection refused / DNS / timeout → the sidecar isn't running.
    if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ECONNABORTED') {
      throw new OllamaUnavailableError(
        `Ollama not reachable at ${OLLAMA_URL}. Start it with: docker compose --profile ai up`,
      );
    }
    throw e;
  }
}

// Returns parsed JSON. One repair retry on malformed output.
export async function chatJSON(system: string, user: string): Promise<any> {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const first = await rawChat(messages);
  try {
    return JSON.parse(first);
  } catch {
    const repaired = await rawChat([
      ...messages,
      { role: 'assistant', content: first },
      { role: 'user', content: 'That was not valid JSON. Reply with valid JSON only — no prose, no code fences.' },
    ]);
    return JSON.parse(repaired); // throws → 500/422 upstream
  }
}
