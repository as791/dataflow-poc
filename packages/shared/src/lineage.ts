import type { DataAssetLayer, DataAssetRef, DataAssetType, PipelineDefinition, PipelineNode } from './types';
import { deriveMapFieldLineage } from './safe-expression';

export const ASSET_MATERIALIZATION_TOPIC_PREFIX = 'asset.materialized.';
export const assetMaterializationTopic = (assetUrn: string) => `${ASSET_MATERIALIZATION_TOPIC_PREFIX}${assetUrn}`;

export interface AssetBinding {
  nodeId: string;
  direction: 'input' | 'output';
  port: string;
  asset: DataAssetRef;
}

export interface LineagePipelineVersion {
  rowId: string;
  pipelineKey: string;
  name: string;
  version: number;
  status: string;
  environment: string;
  metadata?: PipelineDefinition['metadata'];
  slo?: PipelineDefinition['slo'];
  definition: PipelineDefinition;
}

export interface ExternalLineageJob {
  namespace: string;
  name: string;
  environment: string;
  eventTime: string;
  inputs: Array<{ namespace: string; name: string }>;
  outputs: Array<{ namespace: string; name: string }>;
}

export type WorkspaceLineageNode =
  | { id: string; kind: 'pipeline'; pipeline: Omit<LineagePipelineVersion, 'definition'> }
  | { id: string; kind: 'external-job'; externalJob: ExternalLineageJob }
  | { id: string; kind: 'asset'; asset: DataAssetRef; materialization?: AssetMaterializationSummary; quality?: AssetQualitySummary };

export interface WorkspaceLineageEdge {
  id: string;
  source: string;
  target: string;
  pipelineRowId: string;
  nodeId: string;
}

export interface WorkspaceColumnLineageEdge {
  id: string;
  pipelineRowId: string;
  sourceAssetUrn: string;
  sourceField: string;
  targetAssetUrn: string;
  targetField: string;
  transformNodeId?: string;
}

export interface AssetMaterializationSummary {
  assetUrn: string;
  executionId: string;
  pipelineRowId: string;
  nodeId: string;
  environment?: string;
  recordCount?: number;
  materializedAt: string;
}

export interface AssetQualitySummary {
  assetUrn: string;
  executionId: string;
  pipelineRowId: string;
  nodeId: string;
  status: 'passed' | 'warning' | 'failed';
  passedCount: number;
  failedCount: number;
  evaluatedAt: string;
  quarantineAvailable?: boolean;
}

export interface WorkspaceLineage {
  nodes: WorkspaceLineageNode[];
  edges: WorkspaceLineageEdge[];
  columnEdges: WorkspaceColumnLineageEdge[];
  stats: { pipelines: number; assets: number; links: number; sharedAssets: number; columnLinks: number; externalJobs: number };
}

export interface WorkspaceLineageFilter {
  query?: string;
  domains?: string[];
  layers?: Array<DataAssetLayer | 'external'>;
  focusId?: string;
  depth?: number;
}

export function filterWorkspaceLineage(
  graph: WorkspaceLineage, filter: WorkspaceLineageFilter,
): WorkspaceLineage {
  const query = filter.query?.trim().toLowerCase();
  const domains = new Set((filter.domains ?? []).filter(Boolean));
  const layers = new Set(filter.layers ?? []);
  if (!query && !domains.size && !layers.size && !filter.focusId) return graph;

  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  let allowed = new Set(byId.keys());
  const neighbours = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!neighbours.has(edge.source)) neighbours.set(edge.source, new Set());
    if (!neighbours.has(edge.target)) neighbours.set(edge.target, new Set());
    neighbours.get(edge.source)!.add(edge.target); neighbours.get(edge.target)!.add(edge.source);
  }
  const incident = (seeds: Set<string>, within: Set<string>) => {
    const out = new Set(seeds);
    for (const id of seeds) for (const neighbour of neighbours.get(id) ?? []) if (within.has(neighbour)) out.add(neighbour);
    return out;
  };

  if (domains.size) {
    const pipelines = new Set(graph.nodes.filter(node => node.kind === 'pipeline'
      && domains.has(node.pipeline.metadata?.domain ?? 'Unassigned')).map(node => node.id));
    allowed = incident(pipelines, allowed);
  }
  if (layers.size) {
    const assets = new Set(graph.nodes.filter(node => allowed.has(node.id) && node.kind === 'asset'
      && layers.has(node.asset.layer ?? 'external')).map(node => node.id));
    allowed = incident(assets, allowed);
  }
  if (query) {
    const seeds = new Set(graph.nodes.filter(node => allowed.has(node.id)
      && JSON.stringify(node).toLowerCase().includes(query)).map(node => node.id));
    allowed = incident(seeds, allowed);
  }
  if (filter.focusId && allowed.has(filter.focusId)) {
    const depth = Math.max(0, Math.trunc(filter.depth ?? 1));
    const focused = new Set([filter.focusId]), queue: Array<[string, number]> = [[filter.focusId, 0]];
    while (queue.length) {
      const [id, distance] = queue.shift()!;
      if (distance >= depth) continue;
      for (const neighbour of neighbours.get(id) ?? []) if (allowed.has(neighbour) && !focused.has(neighbour)) {
        focused.add(neighbour); queue.push([neighbour, distance + 1]);
      }
    }
    allowed = focused;
  }

  const nodes = graph.nodes.filter(node => allowed.has(node.id));
  const edges = graph.edges.filter(edge => allowed.has(edge.source) && allowed.has(edge.target));
  const assetUrns = new Set(nodes.filter(node => node.kind === 'asset').map(node => node.asset.urn));
  const columnEdges = graph.columnEdges.filter(edge => assetUrns.has(edge.sourceAssetUrn) && assetUrns.has(edge.targetAssetUrn));
  const uses = new Map<string, Set<string>>();
  for (const edge of edges) {
    const assetId = edge.source.startsWith('asset:') ? edge.source : edge.target.startsWith('asset:') ? edge.target : undefined;
    const consumer = edge.source === assetId ? edge.target : edge.source;
    if (assetId && consumer) {
      if (!uses.has(assetId)) uses.set(assetId, new Set());
      uses.get(assetId)!.add(consumer);
    }
  }
  return {
    nodes, edges, columnEdges,
    stats: {
      pipelines: nodes.filter(node => node.kind === 'pipeline').length,
      externalJobs: nodes.filter(node => node.kind === 'external-job').length,
      assets: assetUrns.size, links: edges.length,
      sharedAssets: [...uses.values()].filter(consumers => consumers.size > 1).length,
      columnLinks: columnEdges.length,
    },
  };
}

export function attachLatestMaterializations(
  graph: WorkspaceLineage,
  materializations: AssetMaterializationSummary[],
): WorkspaceLineage {
  const latest = new Map(materializations.map(item => [item.assetUrn, item]));
  return {
    ...graph,
    nodes: graph.nodes.map(node => node.kind === 'asset'
      ? { ...node, materialization: latest.get(node.asset.urn) }
      : node),
  };
}

export function attachLatestQuality(
  graph: WorkspaceLineage,
  results: AssetQualitySummary[],
): WorkspaceLineage {
  const latest = new Map<string, AssetQualitySummary>();
  for (const result of results) {
    const existing = latest.get(result.assetUrn);
    if (!existing || Date.parse(result.evaluatedAt) > Date.parse(existing.evaluatedAt)) latest.set(result.assetUrn, result);
  }
  return {
    ...graph,
    nodes: graph.nodes.map(node => node.kind === 'asset'
      ? { ...node, quality: latest.get(node.asset.urn) }
      : node),
  };
}

const value = (node: PipelineNode, key: string) => {
  const v = node.config?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

const layer = (node: PipelineNode): DataAssetLayer | undefined => {
  const v = value(node, 'layer');
  return v === 'bronze' || v === 'silver' || v === 'gold' ? v : undefined;
};

const asset = (
  urn: string, platform: string, namespace: string, name: string,
  type: DataAssetType, assetLayer?: DataAssetLayer,
): DataAssetRef => ({ urn, platform, namespace, name, type, layer: assetLayer });

function httpAsset(raw: string, assetLayer?: DataAssetLayer): DataAssetRef | null {
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return asset(`${url.protocol}//${url.host}${path}`, 'http', url.host, path, 'api', assetLayer);
  } catch { return null; }
}

// Infer assets for built-in connectors so existing pipeline definitions gain
// useful lineage. Explicit inputAssets/outputAssets always take precedence.
function infer(node: PipelineNode): DataAssetRef | null {
  const l = layer(node);
  switch (node.activityType) {
    case 'zendesk.fetch': {
      const subdomain = value(node, 'subdomain') ?? value(node, 'connectionId');
      const resource = value(node, 'resource') ?? 'records';
      return subdomain ? asset(`zendesk://${subdomain}/${resource}`, 'zendesk', subdomain, resource, 'collection', l) : null;
    }
    case 'gsheets.fetch':
    case 'sink.gsheets': {
      const book = value(node, 'spreadsheetId');
      const sheet = value(node, 'sheetName') ?? value(node, 'range') ?? 'Sheet1';
      return book ? asset(`gsheets://${book}/${sheet}`, 'google-sheets', book, sheet, 'table', l) : null;
    }
    case 'gdrive.fetch': {
      const folder = value(node, 'folderId') ?? 'root';
      return asset(`gdrive://${folder}/files`, 'google-drive', folder, 'files', 'file', l);
    }
    case 'excel.fetch': {
      const drive = value(node, 'driveId') ?? 'default';
      const item = value(node, 'itemId');
      const sheet = value(node, 'sheetName') ?? 'Sheet1';
      return item ? asset(`excel://${drive}/${item}/${sheet}`, 'excel', `${drive}/${item}`, sheet, 'table', l) : null;
    }
    case 'http.fetch': {
      const url = value(node, 'url');
      return url ? httpAsset(url, l) : null;
    }
    case 'postgres.fetch':
    case 'sink.postgres': {
      const connection = value(node, 'connectionId') ?? 'default';
      const table = value(node, 'table');
      return table ? asset(`postgres://${connection}/${table}`, 'postgres', connection, table, 'table', l) : null;
    }
    case 'mysql.fetch':
    case 'sink.mysql': {
      const connection = value(node, 'connectionId') ?? 'default';
      const table = value(node, 'table');
      return table ? asset(`mysql://${connection}/${table}`, 'mysql', connection, table, 'table', l) : null;
    }
    case 'mongodb.fetch':
    case 'sink.mongodb': {
      const connection = value(node, 'connectionId') ?? 'default';
      const collection = value(node, 'collection');
      return collection ? asset(`mongodb://${connection}/${collection}`, 'mongodb', connection, collection, 'collection', l) : null;
    }
    case 's3.fetch':
    case 'sink.s3': {
      const bucket = value(node, 'bucket');
      const key = value(node, 'key');
      return bucket && key ? asset(`s3://${bucket}/${key}`, 's3', bucket, key, 'file', l) : null;
    }
    case 'sftp.fetch':
    case 'sink.sftp': {
      const connection = value(node, 'connectionId') ?? 'default';
      const path = value(node, 'path');
      return path ? asset(`sftp://${connection}${path.startsWith('/') ? '' : '/'}${path}`, 'sftp', connection, path, 'file', l) : null;
    }
    case 'snowflake.fetch':
    case 'sink.snowflake': {
      const connection = value(node, 'connectionId') ?? 'default';
      const table = value(node, 'table');
      return table ? asset(`snowflake://${connection}/${table}`, 'snowflake', connection, table, 'table', l) : null;
    }
    case 'iceberg.fetch': {
      const connection = value(node, 'connectionId') ?? 'default';
      const name = [value(node, 'namespace'), value(node, 'table')].filter(Boolean).join('.');
      return name ? asset(`iceberg://${connection}/${name}`, 'iceberg', connection, name, 'table', l) : null;
    }
    case 'kafka.fetch':
    case 'sink.kafka': {
      const cluster = value(node, 'cluster') ?? value(node, 'connectionId') ?? 'default';
      const topic = value(node, 'topic');
      return topic ? asset(`kafka://${cluster}/${topic}`, 'kafka', cluster, topic, 'topic', l) : null;
    }
    case 'sink.webhook': {
      const url = value(node, 'url');
      return url ? httpAsset(url, l) : null;
    }
    case 'sink.records': {
      const collection = value(node, 'collection');
      return collection ? asset(`dataflow://records/${collection}`, 'dataflow', 'records', collection, 'collection', l) : null;
    }
    case 'sink.clickhouse': {
      const connection = value(node, 'connectionId') ?? 'default';
      const table = value(node, 'table');
      return table ? asset(`clickhouse://${connection}/${table}`, 'clickhouse', connection, table, 'table', l) : null;
    }
    default: return null;
  }
}

function upstreamContract(definition: PipelineDefinition, nodeId: string): DataAssetRef['schema'] | undefined {
  const byId = new Map(definition.nodes.map(node => [node.id, node]));
  const incoming = new Map<string, string[]>();
  for (const edge of definition.edges ?? []) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  const queue = [...(incoming.get(nodeId) ?? [])], seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node?.activityType === 'transform.contract') {
      try {
        const raw = node.config?.schemaJson;
        const schema = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
          return { fields: Object.entries(schema).map(([name, spec]) => {
            const value = String(spec), nullable = value.endsWith('?');
            return { name, type: nullable ? value.slice(0, -1) : value, ...(nullable ? { nullable: true } : {}) };
          }) };
        }
      } catch { return undefined; }
    }
    queue.push(...(incoming.get(id) ?? []));
  }
  return undefined;
}

export function deriveAssetBindings(definition: PipelineDefinition): AssetBinding[] {
  const bindings: AssetBinding[] = [];
  for (const node of definition.nodes ?? []) {
    const explicitInputs = node.inputAssets ?? [];
    const explicitOutputs = node.outputAssets ?? [];
    explicitInputs.forEach((a, i) => bindings.push({ nodeId: node.id, direction: 'input', port: `input-${i}`, asset: a }));
    const contract = node.type === 'sink' ? upstreamContract(definition, node.id) : undefined;
    explicitOutputs.forEach((a, i) => bindings.push({ nodeId: node.id, direction: 'output', port: `output-${i}`, asset: a.schema || !contract ? a : { ...a, schema: contract } }));
    if (explicitInputs.length || explicitOutputs.length) continue;
    const inferredAsset = infer(node);
    const inferred = inferredAsset && contract ? { ...inferredAsset, schema: contract } : inferredAsset;
    if (!inferred) continue;
    bindings.push({
      nodeId: node.id,
      direction: node.type === 'sink' ? 'output' : 'input',
      port: node.type === 'sink' ? 'output' : 'input',
      asset: inferred,
    });
  }
  return bindings;
}

export function successfulOutputBindings(
  definition: PipelineDefinition,
  nodeRuns: Array<{ nodeId: string; status: string; recordCount?: number }>,
): Array<AssetBinding & { recordCount?: number }> {
  const byNode = new Map(nodeRuns.map(run => [run.nodeId, run]));
  return deriveAssetBindings(definition)
    .filter(binding => binding.direction === 'output' && byNode.get(binding.nodeId)?.status === 'success')
    .map(binding => ({ ...binding, recordCount: byNode.get(binding.nodeId)?.recordCount }));
}

export function downstreamOutputBindings(definition: PipelineDefinition, nodeId: string): AssetBinding[] {
  const outgoing = new Map<string, string[]>();
  for (const edge of definition.edges ?? []) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  const reachable = new Set<string>(), queue = [nodeId];
  while (queue.length) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current); queue.push(...(outgoing.get(current) ?? []));
  }
  return deriveAssetBindings(definition)
    .filter(binding => binding.direction === 'output' && reachable.has(binding.nodeId));
}

export interface ContractCompatibilityIssue {
  assetUrn: string;
  kind: 'asset-removed' | 'contract-removed' | 'field-removed' | 'type-changed' | 'nullable-weakened';
  field?: string;
  message: string;
}

export interface PipelineLineageChange {
  kind: 'asset-added' | 'asset-removed' | 'layer-changed' | 'field-added' | 'field-removed'
    | 'field-type-changed' | 'field-nullability-changed' | 'trigger-changed' | 'owner-changed' | 'domain-changed';
  severity: 'info' | 'warning' | 'breaking';
  message: string;
  assetUrn?: string;
  direction?: AssetBinding['direction'];
  field?: string;
  before?: string;
  after?: string;
}

export function diffPipelineLineage(
  previous: PipelineDefinition | undefined, candidate: PipelineDefinition,
): PipelineLineageChange[] {
  const bindings = (definition?: PipelineDefinition) => new Map((definition ? deriveAssetBindings(definition) : [])
    .map(binding => [`${binding.direction}:${binding.asset.urn}`, binding] as const));
  const before = bindings(previous), after = bindings(candidate);
  const changes: PipelineLineageChange[] = [];
  for (const [key, binding] of before) if (!after.has(key)) changes.push({
    kind: 'asset-removed', severity: binding.direction === 'output' ? 'breaking' : 'warning',
    message: `${binding.direction} asset removed: ${binding.asset.urn}`,
    assetUrn: binding.asset.urn, direction: binding.direction,
  });
  for (const [key, binding] of after) {
    const prior = before.get(key);
    if (!prior) {
      changes.push({ kind: 'asset-added', severity: 'info', message: `${binding.direction} asset added: ${binding.asset.urn}`,
        assetUrn: binding.asset.urn, direction: binding.direction });
      continue;
    }
    if (prior.asset.layer !== binding.asset.layer) changes.push({
      kind: 'layer-changed', severity: 'warning', assetUrn: binding.asset.urn, direction: binding.direction,
      before: prior.asset.layer ?? 'external', after: binding.asset.layer ?? 'external',
      message: `${binding.asset.urn}: layer changed ${prior.asset.layer ?? 'external'} → ${binding.asset.layer ?? 'external'}`,
    });
    const oldFields = new Map((prior.asset.schema?.fields ?? []).map(field => [field.name, field]));
    const newFields = new Map((binding.asset.schema?.fields ?? []).map(field => [field.name, field]));
    for (const [name, field] of oldFields) {
      const replacement = newFields.get(name);
      if (!replacement) changes.push({
        kind: 'field-removed', severity: binding.direction === 'output' ? 'breaking' : 'warning',
        assetUrn: binding.asset.urn, direction: binding.direction, field: name,
        before: field.type, message: `${binding.asset.urn}: field removed: ${name}`,
      });
      else if (field.type !== replacement.type) changes.push({
        kind: 'field-type-changed', severity: binding.direction === 'output' ? 'breaking' : 'warning',
        assetUrn: binding.asset.urn, direction: binding.direction, field: name,
        before: field.type, after: replacement.type,
        message: `${binding.asset.urn}: ${name} changed ${field.type} → ${replacement.type}`,
      });
      else if (!!field.nullable !== !!replacement.nullable) changes.push({
        kind: 'field-nullability-changed',
        severity: binding.direction === 'output' && !field.nullable && replacement.nullable ? 'breaking' : 'warning',
        assetUrn: binding.asset.urn, direction: binding.direction, field: name,
        before: field.nullable ? 'nullable' : 'required', after: replacement.nullable ? 'nullable' : 'required',
        message: `${binding.asset.urn}: ${name} changed ${field.nullable ? 'nullable' : 'required'} → ${replacement.nullable ? 'nullable' : 'required'}`,
      });
    }
    for (const [name, field] of newFields) if (!oldFields.has(name)) changes.push({
      kind: 'field-added', severity: 'info', assetUrn: binding.asset.urn,
      direction: binding.direction, field: name, after: field.type,
      message: `${binding.asset.urn}: field added: ${name}`,
    });
  }
  const scalar = (kind: 'owner-changed' | 'domain-changed', label: string, oldValue?: string, newValue?: string) => {
    if ((oldValue ?? '') !== (newValue ?? '')) changes.push({
      kind, severity: 'info', before: oldValue, after: newValue,
      message: `${label} changed ${oldValue || 'Unassigned'} → ${newValue || 'Unassigned'}`,
    });
  };
  scalar('owner-changed', 'Owner', previous?.metadata?.owner, candidate.metadata?.owner);
  scalar('domain-changed', 'Domain', previous?.metadata?.domain, candidate.metadata?.domain);
  if (previous && JSON.stringify(previous.trigger) !== JSON.stringify(candidate.trigger)) changes.push({
    kind: 'trigger-changed', severity: 'warning',
    before: JSON.stringify(previous.trigger), after: JSON.stringify(candidate.trigger), message: 'Pipeline trigger changed',
  });
  return changes.sort((a, b) => ({ breaking: 0, warning: 1, info: 2 }[a.severity]
    - { breaking: 0, warning: 1, info: 2 }[b.severity]));
}

export function comparePublishedContracts(
  previous: PipelineDefinition,
  candidate: PipelineDefinition,
): ContractCompatibilityIssue[] {
  const outputs = (definition: PipelineDefinition) => new Map(
    deriveAssetBindings(definition).filter(binding => binding.direction === 'output')
      .map(binding => [binding.asset.urn, binding.asset.schema] as const),
  );
  const before = outputs(previous), after = outputs(candidate);
  const issues: ContractCompatibilityIssue[] = [];
  for (const [assetUrn, schema] of before) {
    if (!schema?.fields?.length) continue;
    if (!after.has(assetUrn)) {
      issues.push({ assetUrn, kind: 'asset-removed', message: `Published asset removed: ${assetUrn}` });
      continue;
    }
    const next = after.get(assetUrn);
    if (!next?.fields?.length) {
      issues.push({ assetUrn, kind: 'contract-removed', message: `Data contract removed: ${assetUrn}` });
      continue;
    }
    const nextFields = new Map(next.fields.map(field => [field.name, field]));
    for (const field of schema.fields) {
      const replacement = nextFields.get(field.name);
      if (!replacement) {
        issues.push({ assetUrn, field: field.name, kind: 'field-removed', message: `${assetUrn}: field removed: ${field.name}` });
      } else if (replacement.type.trim().toLowerCase() !== field.type.trim().toLowerCase()) {
        issues.push({ assetUrn, field: field.name, kind: 'type-changed', message: `${assetUrn}: ${field.name} changed ${field.type} → ${replacement.type}` });
      } else if (!field.nullable && replacement.nullable) {
        issues.push({ assetUrn, field: field.name, kind: 'nullable-weakened', message: `${assetUrn}: ${field.name} became nullable` });
      }
    }
  }
  return issues;
}

export function buildWorkspaceLineage(versions: LineagePipelineVersion[]): WorkspaceLineage {
  const pipelineNodes: WorkspaceLineageNode[] = [];
  const assets = new Map<string, DataAssetRef>();
  const assetUse = new Map<string, Set<string>>();
  const edges: WorkspaceLineageEdge[] = [];
  const columnEdges: WorkspaceColumnLineageEdge[] = [];
  const pipelineByKeyEnvironment = new Map(versions.map(version => [
    `${version.pipelineKey}:${version.environment}`, `pipeline:${version.rowId}`,
  ]));

  for (const version of versions) {
    const pipelineId = `pipeline:${version.rowId}`;
    const { definition: _definition, ...pipeline } = version;
    pipelineNodes.push({ id: pipelineId, kind: 'pipeline', pipeline });
    const bindings = deriveAssetBindings(version.definition);
    for (const binding of bindings) {
      assets.set(binding.asset.urn, binding.asset);
      const assetId = `asset:${binding.asset.urn}`;
      const source = binding.direction === 'input' ? assetId : pipelineId;
      const target = binding.direction === 'input' ? pipelineId : assetId;
      edges.push({
        id: `${pipelineId}:${binding.nodeId}:${binding.direction}:${binding.port}`,
        source, target, pipelineRowId: version.rowId, nodeId: binding.nodeId,
      });
      const uses = assetUse.get(binding.asset.urn) ?? new Set<string>();
      uses.add(version.rowId); assetUse.set(binding.asset.urn, uses);
    }
    if (version.definition.trigger?.type === 'asset') {
      const urn = version.definition.trigger.assetUrn;
      const assetId = `asset:${urn}`;
      if (!assets.has(urn)) {
        const platform = /^([a-z][a-z0-9+.-]*):/i.exec(urn)?.[1] ?? 'data';
        const name = urn.split('/').filter(Boolean).at(-1) ?? urn;
        assets.set(urn, asset(urn, platform, 'trigger', name, 'stream'));
      }
      if (!edges.some(edge => edge.source === assetId && edge.target === pipelineId)) edges.push({
        id: `asset-trigger:${pipelineId}:${urn}`, source: assetId, target: pipelineId,
        pipelineRowId: version.rowId, nodeId: 'trigger',
      });
      const uses = assetUse.get(urn) ?? new Set<string>();
      uses.add(version.rowId); assetUse.set(urn, uses);
    }
    const inputs = bindings.filter(binding => binding.direction === 'input');
    const outputs = bindings.filter(binding => binding.direction === 'output');
    if (inputs.length === 1 && outputs.length === 1) {
      const maps = version.definition.nodes.filter(node => node.activityType === 'transform.map');
      const renames = version.definition.nodes.filter(node => node.activityType === 'transform.rename');
      let transformNodeId: string | undefined;
      let mapping: Array<{ outputField: string; inputFields: string[] }> = [];
      if (maps.length === 1) {
        mapping = deriveMapFieldLineage(String(maps[0].config?.expression ?? ''));
        transformNodeId = maps[0].id;
      } else if (maps.length === 0 && renames.length === 1) {
        try {
          const raw = renames[0].config?.mapping;
          const rename = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, string>;
          const targets = new Set(Object.values(rename ?? {}));
          mapping = [
            ...Object.entries(rename ?? {}).map(([from, to]) => ({ outputField: String(to), inputFields: [from] })),
            ...(outputs[0].asset.schema?.fields ?? []).filter(field => !targets.has(field.name))
              .map(field => ({ outputField: field.name, inputFields: [field.name] })),
          ];
          transformNodeId = renames[0].id;
        } catch { mapping = []; }
      } else if (maps.length === 0 && renames.length === 0) {
        mapping = (outputs[0].asset.schema?.fields ?? []).map(field => ({ outputField: field.name, inputFields: [field.name] }));
      }
      for (const field of mapping) for (const inputField of field.inputFields) columnEdges.push({
        id: `${version.rowId}:${inputField}:${field.outputField}`,
        pipelineRowId: version.rowId,
        sourceAssetUrn: inputs[0].asset.urn, sourceField: inputField,
        targetAssetUrn: outputs[0].asset.urn, targetField: field.outputField,
        ...(transformNodeId ? { transformNodeId } : {}),
      });
    }
  }

  for (const version of versions) {
    if (version.definition.trigger?.type !== 'event') continue;
    const match = /^pipeline\.(?:completed|failed|cancelled)\.(.+)$/.exec(version.definition.trigger.topic);
    const upstream = match ? pipelineByKeyEnvironment.get(`${match[1]}:${version.environment}`) : undefined;
    if (upstream) edges.push({
      id: `pipeline-event:${upstream}:pipeline:${version.rowId}`,
      source: upstream, target: `pipeline:${version.rowId}`,
      pipelineRowId: version.rowId, nodeId: 'trigger',
    });
  }

  const assetNodes: WorkspaceLineageNode[] = [...assets.entries()]
    .map(([urn, ref]) => ({ id: `asset:${urn}`, kind: 'asset' as const, asset: ref }));
  return {
    nodes: [...pipelineNodes, ...assetNodes], edges, columnEdges,
    stats: {
      pipelines: versions.length, assets: assets.size, links: edges.length,
      sharedAssets: [...assetUse.values()].filter(uses => uses.size > 1).length,
      columnLinks: columnEdges.length, externalJobs: 0,
    },
  };
}
