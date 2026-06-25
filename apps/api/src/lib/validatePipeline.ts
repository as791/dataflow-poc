import { validateSafeExpression, type PipelineDefinition } from '@dataflow/shared';

// Structural validation shared by the pipelines route (save) and the AI builder
// (reject malformed model output before returning it). Throws on the first
// problem; the caller maps the message to an HTTP status.
export function validatePipeline(def: PipelineDefinition) {
  if (!def.nodes?.length) throw new Error('pipeline has no nodes');
  if (!def.trigger) throw new Error('pipeline must declare a trigger');
  const nodeIds = new Set<string>();
  for (const node of def.nodes) {
    if (!node.id || nodeIds.has(node.id)) throw new Error(`duplicate or empty node id "${node.id}"`);
    nodeIds.add(node.id);
    if (node.activityType === 'transform.filter') {
      validateSafeExpression(String(node.config?.predicate ?? ''), 'predicate');
    }
    if (node.activityType === 'transform.map') {
      validateSafeExpression(String(node.config?.expression ?? ''), 'map');
    }
  }
  for (const edge of def.edges ?? []) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`edge "${edge.id}" references an unknown node`);
    }
    if (edge.condition) validateSafeExpression(edge.condition, 'predicate');
  }
  const inDeg = new Map(def.nodes.map(n => [n.id, 0]));
  def.edges?.forEach(e => inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1));
  let q = def.nodes.filter(n => !inDeg.get(n.id)).map(n => n.id);
  let seen = 0;
  const out = new Map<string, string[]>();
  def.edges?.forEach(e => out.set(e.source, [...(out.get(e.source) ?? []), e.target]));
  while (q.length) {
    const n = q.shift()!; seen++;
    (out.get(n) ?? []).forEach(t => {
      const d = inDeg.get(t)! - 1; inDeg.set(t, d);
      if (!d) q.push(t);
    });
  }
  if (seen !== def.nodes.length) throw new Error('pipeline contains a cycle');
}
