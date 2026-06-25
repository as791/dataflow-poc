// AI pipeline authoring. Natural language → pipeline definition + Mermaid.
//
// Generation is free (no quota metering) and runs on a local Ollama sidecar.
// Output is validated server-side (DAG well-formedness) before it leaves the
// API; the human-in-the-loop Mermaid editor lets the user fix the rest.

import { Router } from 'express';
import { chatJSON, OllamaUnavailableError } from '../lib/ollama';
import { getCatalog } from '../lib/serverCatalog';
import { validatePipeline } from '../lib/validatePipeline';
import { definitionToMermaid } from '@dataflow/shared';
import type { PipelineDefinition, PipelineNode, PipelineEdge, CatalogEntry } from '@dataflow/shared';

export const ai = Router();

function catalogForPrompt(catalog: CatalogEntry[]): string {
  return catalog
    .map(c => `- ${c.activityType} (${c.nodeType}) "${c.label}" — config keys: ${c.fields.map(f => f.key).join(', ') || 'none'}`)
    .join('\n');
}

function systemPrompt(catalog: CatalogEntry[]): string {
  return [
    'You design data pipelines as a directed acyclic graph (DAG).',
    'Available node types (use ONLY these activityType values):',
    catalogForPrompt(catalog),
    '',
    'Rules:',
    '- A pipeline starts with one or more source nodes and ends in a sink.',
    '- transform.filter uses a constrained predicate on `r`, e.g. "r.status === \'open\'". No function calls.',
    '- transform.map uses an object projection, e.g. "({ id: r.id, status: r.status })". No function calls.',
    '- transform.dedupe uses config.key; transform.rename uses config.mapping (JSON object).',
    '- sink.postgres uses config.collection (+ optional dedupField).',
    '- trigger is one of: {"type":"manual"}, {"type":"cron","schedule":"*/5 * * * *"}, {"type":"webhook","path":"hook","secret":"change-me"}.',
    '- Node ids must be short, unique, alphanumeric (e.g. "src", "fil", "snk").',
    '- The graph must be acyclic.',
    '',
    'Respond with ONLY a JSON object of this exact shape:',
    '{',
    '  "suggestedName": string,',
    '  "trigger": object,',
    '  "nodes": [{ "id": string, "label": string, "activityType": string, "config": object }],',
    '  "edges": [{ "source": string, "target": string, "condition"?: string }]',
    '}',
  ].join('\n');
}

interface AiNode { id: string; label?: string; activityType: string; config?: Record<string, unknown> }
interface AiEdge { source: string; target: string; condition?: string }
interface AiOutput {
  suggestedName?: string;
  trigger?: PipelineDefinition['trigger'];
  nodes?: AiNode[];
  edges?: AiEdge[];
}

function toDefinition(out: AiOutput, catalog: CatalogEntry[]) {
  const byType = new Map(catalog.map(c => [c.activityType, c]));
  const nodes: PipelineNode[] = (out.nodes ?? []).map(n => ({
    id: n.id,
    type: byType.get(n.activityType)?.nodeType ?? 'transform',
    activityType: n.activityType,
    label: n.label || byType.get(n.activityType)?.label || n.id,
    config: n.config ?? {},
  }));
  const edges: PipelineEdge[] = (out.edges ?? []).map((e, i) => ({
    id: `e${i + 1}`,
    source: e.source,
    target: e.target,
    ...(e.condition ? { condition: e.condition } : {}),
  }));
  const trigger = out.trigger ?? { type: 'manual' as const };
  return { nodes, edges, trigger, suggestedName: out.suggestedName || 'Untitled pipeline' };
}

// Builds, validates, and (on failure) repairs the model output once.
async function build(userMessage: string): Promise<{ mermaid: string; definition: any }> {
  const catalog = getCatalog();
  const sys = systemPrompt(catalog);

  let out = (await chatJSON(sys, userMessage)) as AiOutput;
  let parts = toDefinition(out, catalog);

  // Validate as a full PipelineDefinition (placeholder id/version/tenant — the
  // save route assigns the real ones).
  const asDef = (): PipelineDefinition => ({
    id: '', version: 0, tenantId: '', name: parts.suggestedName,
    trigger: parts.trigger, nodes: parts.nodes, edges: parts.edges,
  });

  try {
    validatePipeline(asDef());
  } catch (err: any) {
    // One repair round-trip: hand the error back to the model.
    out = (await chatJSON(
      sys,
      `${userMessage}\n\nYour previous attempt was invalid: ${err.message}. Return a corrected JSON object.`,
    )) as AiOutput;
    parts = toDefinition(out, catalog);
    validatePipeline(asDef()); // throws → 422 upstream
  }

  // nodes/edges are the source of truth; regenerate Mermaid for consistency.
  const mermaid = definitionToMermaid(parts.nodes, parts.edges);
  return {
    mermaid,
    definition: {
      nodes: parts.nodes,
      edges: parts.edges,
      trigger: parts.trigger,
      suggestedName: parts.suggestedName,
    },
  };
}

ai.post('/generate', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    res.json(await build(prompt));
  } catch (e: any) {
    if (e instanceof OllamaUnavailableError) return res.status(503).json({ error: e.message });
    res.status(422).json({ error: `could not generate a valid pipeline: ${e.message}` });
  }
});

ai.post('/refine', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim();
  const definition = req.body?.definition;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const seed = definition
    ? `Current pipeline JSON:\n${JSON.stringify({ nodes: definition.nodes, edges: definition.edges, trigger: definition.trigger }, null, 2)}\n\nApply this change: ${prompt}`
    : prompt;
  try {
    res.json(await build(seed));
  } catch (e: any) {
    if (e instanceof OllamaUnavailableError) return res.status(503).json({ error: e.message });
    res.status(422).json({ error: `could not refine pipeline: ${e.message}` });
  }
});
