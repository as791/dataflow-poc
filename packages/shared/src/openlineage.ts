import type { PipelineDefinition } from './types';
import { deriveAssetBindings, type ExternalLineageJob, type WorkspaceLineage } from './lineage';

export type OpenLineageEventType = 'START' | 'RUNNING' | 'COMPLETE' | 'ABORT' | 'FAIL' | 'OTHER';
export interface OpenLineageDataset { namespace: string; name: string; facets?: Record<string, unknown> }
export interface OpenLineageRunEvent {
  eventTime: string;
  eventType: OpenLineageEventType;
  producer: string;
  schemaURL: string;
  run: { runId: string };
  job: { namespace: string; name: string };
  inputs?: OpenLineageDataset[];
  outputs?: OpenLineageDataset[];
}

export const OPENLINEAGE_RUN_EVENT_SCHEMA = 'https://openlineage.io/spec/2-0-2/OpenLineage.json#/$defs/RunEvent';
const EVENT_TYPES = new Set<OpenLineageEventType>(['START', 'RUNNING', 'COMPLETE', 'ABORT', 'FAIL', 'OTHER']);

function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must be a non-empty string up to ${max} characters`);
  return value.trim();
}

function dataset(value: any): OpenLineageDataset {
  return { namespace: text(value?.namespace, 'dataset.namespace'), name: text(value?.name, 'dataset.name', 2000) };
}

export function parseOpenLineageRunEvent(value: unknown): OpenLineageRunEvent {
  const event = value as any;
  const eventType = text(event?.eventType, 'eventType') as OpenLineageEventType;
  if (!EVENT_TYPES.has(eventType)) throw new Error('eventType must be START|RUNNING|COMPLETE|ABORT|FAIL|OTHER');
  const eventTime = text(event?.eventTime, 'eventTime');
  if (Number.isNaN(Date.parse(eventTime))) throw new Error('eventTime must be ISO-8601');
  const producer = text(event?.producer, 'producer', 2000), schemaURL = text(event?.schemaURL, 'schemaURL', 2000);
  try { new URL(producer); new URL(schemaURL); } catch { throw new Error('producer and schemaURL must be URLs'); }
  const parseDatasets = (items: unknown, label: string) => {
    if (items === undefined) return undefined;
    if (!Array.isArray(items) || items.length > 1000) throw new Error(`${label} must contain at most 1000 datasets`);
    return items.map(dataset);
  };
  return {
    eventTime, eventType, producer, schemaURL,
    run: { runId: text(event?.run?.runId, 'run.runId', 200) },
    job: { namespace: text(event?.job?.namespace, 'job.namespace'), name: text(event?.job?.name, 'job.name') },
    inputs: parseDatasets(event?.inputs, 'inputs'), outputs: parseDatasets(event?.outputs, 'outputs'),
  };
}

export function dataflowOpenLineageRunEvent(params: {
  definition: PipelineDefinition;
  pipelineKey: string;
  executionId: string;
  tenantId: string;
  environment: string;
  phase: 'started' | 'completed' | 'failed' | 'cancelled';
  eventTime: string;
  namespace?: string;
}): OpenLineageRunEvent {
  const bindings = deriveAssetBindings(params.definition);
  const datasets = (direction: 'input' | 'output') => [...new Map(bindings
    .filter(binding => binding.direction === direction)
    .map(binding => [binding.asset.urn, { namespace: binding.asset.platform, name: binding.asset.urn }])).values()];
  return {
    eventTime: params.eventTime,
    eventType: params.phase === 'started' ? 'START' : params.phase === 'completed' ? 'COMPLETE' : params.phase === 'failed' ? 'FAIL' : 'ABORT',
    producer: 'https://github.com/dataflow/dataflow', schemaURL: OPENLINEAGE_RUN_EVENT_SCHEMA,
    run: { runId: params.executionId.replace(/^exec-/, '') },
    job: {
      namespace: `${params.namespace ?? 'dataflow'}/${params.tenantId}/${params.environment}`,
      name: params.pipelineKey,
    },
    inputs: datasets('input'), outputs: datasets('output'),
  };
}

export function openLineageDatasetUrn(value: OpenLineageDataset): string {
  try {
    const url = new URL(value.name);
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return `openlineage://${encodeURIComponent(value.namespace)}/${encodeURIComponent(value.name)}`;
  }
}

export function mergeExternalLineage(graph: WorkspaceLineage, jobs: ExternalLineageJob[]): WorkspaceLineage {
  const nodes = [...graph.nodes], edges = [...graph.edges];
  const nodeIds = new Set(nodes.map(node => node.id));
  for (const job of jobs) {
    const jobId = `external:${encodeURIComponent(job.namespace)}:${encodeURIComponent(job.name)}:${job.environment}`;
    if (!nodeIds.has(jobId)) {
      nodes.push({ id: jobId, kind: 'external-job', externalJob: job }); nodeIds.add(jobId);
    }
    for (const [direction, datasets] of [['input', job.inputs], ['output', job.outputs]] as const) {
      for (const item of datasets) {
        const urn = openLineageDatasetUrn(item), assetId = `asset:${urn}`;
        if (!nodeIds.has(assetId)) {
          let platform = item.namespace;
          try { platform = new URL(urn).protocol.replace(':', ''); } catch { /* logical dataset */ }
          nodes.push({ id: assetId, kind: 'asset', asset: {
            urn, platform, namespace: item.namespace, name: item.name, type: 'table',
          } });
          nodeIds.add(assetId);
        }
        edges.push({
          id: `${jobId}:${direction}:${assetId}`,
          source: direction === 'input' ? assetId : jobId,
          target: direction === 'input' ? jobId : assetId,
          pipelineRowId: jobId, nodeId: 'openlineage',
        });
      }
    }
  }
  const assetUse = new Map<string, Set<string>>();
  for (const edge of edges) for (const id of [edge.source, edge.target]) if (id.startsWith('asset:')) {
    const peer = edge.source === id ? edge.target : edge.source;
    const uses = assetUse.get(id) ?? new Set<string>(); uses.add(peer); assetUse.set(id, uses);
  }
  return {
    ...graph, nodes, edges,
    stats: {
      ...graph.stats, assets: nodes.filter(node => node.kind === 'asset').length,
      links: edges.length, sharedAssets: [...assetUse.values()].filter(uses => uses.size > 1).length,
      externalJobs: jobs.length,
    },
  };
}
