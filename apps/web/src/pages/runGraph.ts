import type { Edge, Node } from 'reactflow';

export interface NodeRun {
  node_id: string; status?: string; duration_ms?: number | null;
  record_count?: number | null; error?: string | null;
}

// Map a pipeline definition + node_runs into ReactFlow nodes/edges for the
// read-only run view. Edge label encodes data volume crossing the edge:
// downstream input = upstream output = the source node's record_count.
export function buildRunGraph(
  def: { nodes?: any[]; edges?: any[] }, nodeRuns: NodeRun[],
): { nodes: Node[]; edges: Edge[] } {
  const byNode = new Map(nodeRuns.map(r => [r.node_id, r]));
  const nodes: Node[] = (def.nodes ?? []).map((pn, i) => {
    const run = byNode.get(pn.id);
    return {
      id: pn.id, type: 'runNode',
      position: { x: 80 + i * 220, y: 80 + (i % 5) * 130 },
      data: {
        activityType: pn.activityType, nodeType: pn.type, label: pn.label,
        status: run?.status, recordCount: run?.record_count ?? null,
        durationMs: run?.duration_ms ?? null, error: run?.error ?? null,
      },
    };
  });
  const edges: Edge[] = (def.edges ?? []).map((e, i) => {
    const out = byNode.get(e.source)?.record_count;
    return {
      id: e.id ?? `e-${e.source}-${e.target}-${i}`, source: e.source, target: e.target,
      label: out == null ? undefined : `${out.toLocaleString()} rec`,
      labelStyle: { fill: '#cbd5e1', fontSize: 10 },
      labelBgStyle: { fill: '#11141d', fillOpacity: 0.85 },
    };
  });
  return { nodes, edges };
}
