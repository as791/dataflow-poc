import type { Node } from 'reactflow';
import type { CatalogEntry } from '@dataflow/shared';

export function definitionToFlow(def: any, byType: Record<string, CatalogEntry>): { nodes: Node[]; edges: any[] } {
  const nodes: Node[] = (def.nodes ?? []).map((pn: any, i: number) => ({
    id: pn.id,
    type: 'flowNode',
    position: { x: 80 + i * 60, y: 80 + (i % 5) * 100 },
    data: {
      activityType: pn.activityType,
      nodeType: pn.type ?? byType[pn.activityType]?.nodeType,
      label: pn.label,
      ingestion: pn.ingestion,
      config: {
        ...pn.config,
        ...(pn.mergeStrategy ? { mergeStrategy: pn.mergeStrategy } : {}),
        ...(pn.joinKey ? { joinKey: pn.joinKey } : {}),
      },
    },
  }));
  const edges = (def.edges ?? []).map((e: any) => ({
    id: e.id ?? `e${Date.now()}-${e.source}-${e.target}`,
    source: e.source, target: e.target,
    data: { condition: e.condition },
    label: e.condition || undefined,
    animated: !!e.condition,
    style: e.condition ? { stroke: '#f5b342' } : undefined,
    labelStyle: e.condition ? { fill: '#f5b342', fontSize: 10 } : undefined,
  }));
  return { nodes, edges };
}

export function flowToDefinition(
  nodes: Node[], edges: any[],
  meta: { name: string; trigger: any; pipelineKey?: string; metadata?: any; slo?: any; notifications?: any },
) {
  return {
    id: meta.pipelineKey ?? '', version: 0, name: meta.name, tenantId: 'default', trigger: meta.trigger,
    metadata: meta.metadata, slo: meta.slo,
    nodes: nodes.map(n => {
      const cfg = { ...n.data.config };
      return {
        id: n.id, type: n.data.nodeType, activityType: n.data.activityType,
        label: n.data.label, config: cfg, ingestion: n.data.ingestion,
        mergeStrategy: cfg.mergeStrategy, joinKey: cfg.joinKey,
      };
    }),
    edges: edges.map(e => ({
      id: e.id, source: e.source, target: e.target,
      condition: (e.data as any)?.condition || undefined,
    })),
  };
}
