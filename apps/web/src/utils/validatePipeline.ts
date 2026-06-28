export interface ValidationError {
  type: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

interface PNode { id: string; type: string; label?: string }
interface PEdge { id: string; source: string; target: string }

export function validatePipeline(nodes: PNode[], edges: PEdge[]): ValidationError[] {
  const errs: ValidationError[] = [];
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  nodes.forEach(n => { incoming.set(n.id, []); outgoing.set(n.id, []); });

  const edgeSet = new Set<string>();
  for (const e of edges) {
    if (e.source === e.target) {
      errs.push({ type: 'SELF_LOOP', message: `Node "${e.source}" has a self-loop.`, edgeId: e.id });
      continue;
    }
    const key = `${e.source}→${e.target}`;
    if (edgeSet.has(key)) {
      errs.push({ type: 'DUPLICATE_EDGE', message: `Duplicate edge ${key}.`, edgeId: e.id });
      continue;
    }
    edgeSet.add(key);
    outgoing.get(e.source)?.push(e.target);
    incoming.get(e.target)?.push(e.source);
  }

  // Cycle detection — 3-colour DFS
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour = new Map(nodes.map(n => [n.id, WHITE]));
  function dfs(id: string): boolean {
    colour.set(id, GRAY);
    for (const next of outgoing.get(id) ?? []) {
      if (colour.get(next) === GRAY) return true;
      if (colour.get(next) === WHITE && dfs(next)) return true;
    }
    colour.set(id, BLACK);
    return false;
  }
  for (const n of nodes) {
    if (colour.get(n.id) === WHITE && dfs(n.id)) {
      errs.push({ type: 'CYCLE', message: 'Pipeline contains a cycle — DAGs must be acyclic.' });
      break;
    }
  }

  for (const n of nodes) {
    if (n.type === 'source' && (incoming.get(n.id)?.length ?? 0) > 0)
      errs.push({ type: 'SOURCE_HAS_INCOMING', message: `Source "${n.label || n.id}" cannot have incoming edges.`, nodeId: n.id });
  }
  for (const n of nodes) {
    if (n.type === 'sink' && (outgoing.get(n.id)?.length ?? 0) > 0)
      errs.push({ type: 'SINK_HAS_OUTGOING', message: `Sink "${n.label || n.id}" cannot have outgoing edges.`, nodeId: n.id });
  }

  if (!nodes.some(n => n.type === 'source'))
    errs.push({ type: 'NO_SOURCE', message: 'Pipeline needs at least one source node.' });
  if (!nodes.some(n => n.type === 'sink'))
    errs.push({ type: 'NO_SINK', message: 'Pipeline needs at least one sink node.' });

  for (const n of nodes.filter(n => n.type === 'fork')) {
    if ((outgoing.get(n.id)?.length ?? 0) < 2)
      errs.push({ type: 'FORK_TOO_FEW_OUTPUTS', message: `Fork "${n.label || n.id}" needs ≥2 outgoing edges.`, nodeId: n.id });
  }
  for (const n of nodes.filter(n => n.type === 'merge')) {
    if ((incoming.get(n.id)?.length ?? 0) < 2)
      errs.push({ type: 'MERGE_TOO_FEW_INPUTS', message: `Merge "${n.label || n.id}" needs ≥2 incoming edges.`, nodeId: n.id });
  }

  for (const n of nodes) {
    const total = (incoming.get(n.id)?.length ?? 0) + (outgoing.get(n.id)?.length ?? 0);
    if (total === 0)
      errs.push({ type: 'ORPHAN', message: `Node "${n.label || n.id}" is not connected.`, nodeId: n.id });
  }

  for (const n of nodes) {
    if (n.type !== 'sink' && (outgoing.get(n.id)?.length ?? 0) === 0 && (incoming.get(n.id)?.length ?? 0) > 0)
      errs.push({ type: 'DEAD_END', message: `"${n.label || n.id}" (${n.type}) has no outgoing edge — data dropped.`, nodeId: n.id });
  }

  return errs;
}
