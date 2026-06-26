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
    if (node.activityType === 'transform.flatten') {
      const ap = node.config?.arrayPolicy;
      if (ap !== undefined && !['index', 'stringify', 'keep'].includes(String(ap)))
        throw new Error('transform.flatten: arrayPolicy must be index|stringify|keep');
      const md = node.config?.maxDepth;
      if (md !== undefined && (!Number.isFinite(Number(md)) || Number(md) < 1))
        throw new Error('transform.flatten: maxDepth must be a positive number');
    }
    if (node.activityType === 'transform.parse') {
      const onErr = node.config?.onError;
      if (onErr !== undefined && !['skip', 'fail', 'null'].includes(String(onErr)))
        throw new Error('transform.parse: onError must be skip|fail|null');
      const fields = node.config?.fields;
      const hasFields = Array.isArray(fields) ? fields.length > 0 : String(fields ?? '').trim().length > 0;
      if (!hasFields) throw new Error('transform.parse: at least one field is required');
    }
    // A6 — BYO destinations must reference a connector instance.
    if (node.activityType === 'sink.postgres') {
      if (!node.config?.connectionId) throw new Error('sink.postgres: a destination connector instance is required');
      if (!node.config?.table) throw new Error('sink.postgres: target table is required');
    }
    if (node.activityType === 'sink.gsheets') {
      if (!node.config?.connectionId) throw new Error('sink.gsheets: a destination connector instance is required');
      if (!node.config?.spreadsheetId) throw new Error('sink.gsheets: spreadsheetId is required');
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
  // Fork fans out, merge fans in — enforce the minimum degree the engine assumes.
  for (const node of def.nodes) {
    if (node.type === 'fork' && (out.get(node.id)?.length ?? 0) < 2)
      throw new Error(`fork node "${node.id}" must have at least 2 outgoing edges`);
    if (node.type === 'merge' && (inDeg.get(node.id) ?? 0) < 2)
      throw new Error(`merge node "${node.id}" must have at least 2 incoming edges`);
  }
  while (q.length) {
    const n = q.shift()!; seen++;
    (out.get(n) ?? []).forEach(t => {
      const d = inDeg.get(t)! - 1; inDeg.set(t, d);
      if (!d) q.push(t);
    });
  }
  if (seen !== def.nodes.length) throw new Error('pipeline contains a cycle');
}
