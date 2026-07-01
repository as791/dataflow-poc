import { deriveAssetBindings, validateSafeExpression, type PipelineDefinition } from '@dataflow/shared';
import { validate as uuidValidate } from 'uuid';

const validKafkaTopic = (value: unknown) => {
  const topic = String(value ?? '');
  return /^[A-Za-z0-9._-]{1,249}$/.test(topic) && topic !== '.' && topic !== '..';
};

// Structural validation shared by the pipelines route (save) and the AI builder
// (reject malformed model output before returning it). Throws on the first
// problem; the caller maps the message to an HTTP status.
export function validatePipeline(def: PipelineDefinition) {
  if (!def.nodes?.length) throw new Error('pipeline has no nodes');
  if (!def.trigger) throw new Error('pipeline must declare a trigger');
  if (!['manual', 'cron', 'webhook', 'event', 'asset'].includes(def.trigger.type)) throw new Error('unsupported pipeline trigger');
  if (def.trigger.type === 'cron' && !def.trigger.schedule?.trim()) throw new Error('cron trigger requires a schedule');
  if (def.trigger.type === 'webhook' && (!def.trigger.path?.trim() || !def.trigger.secret?.trim())) throw new Error('webhook trigger requires path and secret');
  if (def.trigger.type === 'event') {
    if (!def.trigger.topic?.trim()) throw new Error('event trigger requires a topic');
    if (def.id && def.trigger.topic.endsWith(`.${def.id}`)) throw new Error('pipeline cannot trigger itself');
  }
  if (def.trigger.type === 'asset') {
    const assetUrn = def.trigger.assetUrn;
    if (!/^[a-z][a-z0-9+.-]*:\/\/[^\s?#]{1,980}$/i.test(assetUrn ?? '')) {
      throw new Error('asset trigger requires a stable URI without query or fragment');
    }
    if (deriveAssetBindings(def).some(binding => binding.direction === 'output' && binding.asset.urn === assetUrn)) {
      throw new Error('pipeline cannot trigger itself from an asset it produces');
    }
  }
  if ((def.metadata?.owner?.length ?? 0) > 200 || (def.metadata?.domain?.length ?? 0) > 100) {
    throw new Error('pipeline metadata owner/domain is too long');
  }
  if ((def.metadata?.tags?.length ?? 0) > 20 || def.metadata?.tags?.some(tag => !tag.trim() || tag.length > 50)) {
    throw new Error('pipeline metadata supports at most 20 non-empty tags of 50 characters');
  }
  const positive = (value: unknown) => value === undefined || (Number.isFinite(Number(value)) && Number(value) > 0);
  if (!positive(def.slo?.freshnessMinutes)) throw new Error('slo.freshnessMinutes must be positive');
  if (!positive(def.slo?.maxDurationMs)) throw new Error('slo.maxDurationMs must be positive');
  const failureRate = def.slo?.maxFailureRatePercent;
  if (failureRate !== undefined && (!Number.isFinite(Number(failureRate)) || Number(failureRate) < 0 || Number(failureRate) > 100)) {
    throw new Error('slo.maxFailureRatePercent must be between 0 and 100');
  }
  if (def.notifications?.connectionId && !uuidValidate(def.notifications.connectionId)) {
    throw new Error('notifications.connectionId must be a UUID');
  }
  if (def.notifications?.minimumSeverity && !['warning', 'critical'].includes(def.notifications.minimumSeverity)) {
    throw new Error('notifications.minimumSeverity must be warning|critical');
  }
  const nodeIds = new Set<string>();
  for (const node of def.nodes) {
    if (!node.id || nodeIds.has(node.id)) throw new Error(`duplicate or empty node id "${node.id}"`);
    nodeIds.add(node.id);
    const layer = node.config?.layer;
    if (layer !== undefined && !['bronze', 'silver', 'gold'].includes(String(layer))) {
      throw new Error(`${node.activityType}: layer must be bronze|silver|gold`);
    }
    if (node.activityType === 'transform.filter') {
      validateSafeExpression(String(node.config?.predicate ?? ''), 'predicate');
    }
    if (node.activityType === 'transform.map') {
      validateSafeExpression(String(node.config?.expression ?? ''), 'map');
    }
    if (node.activityType === 'transform.formula') {
      if (!/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(String(node.config?.outputField ?? ''))) {
        throw new Error('transform.formula: a valid outputField is required');
      }
      validateSafeExpression(String(node.config?.expression ?? ''), 'formula');
    }
    if (node.activityType === 'transform.select' && !String(node.config?.expression ?? '').trim()) {
      throw new Error('transform.select: expression is required');
    }
    if (node.activityType === 'transform.rename') {
      let mapping: any;
      try { mapping = typeof node.config?.mapping === 'string' ? JSON.parse(node.config.mapping) : node.config?.mapping; }
      catch { throw new Error('transform.rename: mapping must be valid JSON'); }
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || !Object.keys(mapping).length
        || Object.entries(mapping).some(([from, to]) => !from.trim() || typeof to !== 'string' || !to.trim())) {
        throw new Error('transform.rename: mapping must be a non-empty field map');
      }
    }
    if (node.activityType === 'transform.flatten') {
      const ap = node.config?.arrayPolicy;
      if (ap !== undefined && !['index', 'stringify', 'keep'].includes(String(ap)))
        throw new Error('transform.flatten: arrayPolicy must be index|stringify|keep');
      const md = node.config?.maxDepth;
      if (md !== undefined && (!Number.isInteger(Number(md)) || Number(md) < 1))
        throw new Error('transform.flatten: maxDepth must be a positive integer');
    }
    if (node.activityType === 'transform.parse') {
      const onErr = node.config?.onError;
      if (onErr !== undefined && !['skip', 'fail', 'null'].includes(String(onErr)))
        throw new Error('transform.parse: onError must be skip|fail|null');
      const fields = node.config?.fields;
      const hasFields = Array.isArray(fields) ? fields.length > 0 : String(fields ?? '').trim().length > 0;
      if (!hasFields) throw new Error('transform.parse: at least one field is required');
    }
    if (node.activityType === 'transform.dedupe') {
      const keys = Array.isArray(node.config?.key)
        ? node.config.key.map(String).map(key => key.trim()).filter(Boolean)
        : String(node.config?.key ?? '').split(',').map(key => key.trim()).filter(Boolean);
      if (!keys.length) throw new Error('transform.dedupe: at least one key is required');
      if (node.config?.keep !== undefined && !['first', 'last'].includes(String(node.config.keep))) {
        throw new Error('transform.dedupe: keep must be first|last');
      }
      if (node.config?.scope !== undefined && !['run', 'pipeline'].includes(String(node.config.scope))) {
        throw new Error('transform.dedupe: scope must be run|pipeline');
      }
    }
    if (node.type === 'merge') {
      const strategy = node.mergeStrategy ?? 'concat';
      if (!['concat', 'union', 'innerJoin', 'leftJoin', 'outerJoin', 'appendWithSourceTag'].includes(strategy)) {
        throw new Error('flow.merge: unsupported merge strategy');
      }
      if (['innerJoin', 'leftJoin', 'outerJoin'].includes(strategy) && !node.joinKey?.trim()) {
        throw new Error(`flow.merge: ${strategy} requires a joinKey`);
      }
    }
    if (node.activityType === 'transform.contract') {
      let schema: any;
      try { schema = typeof node.config?.schemaJson === 'string' ? JSON.parse(node.config.schemaJson) : node.config?.schemaJson; }
      catch { throw new Error('transform.contract: schemaJson must be valid JSON'); }
      if (!schema || typeof schema !== 'object' || Array.isArray(schema) || !Object.keys(schema).length) {
        throw new Error('transform.contract: schemaJson must be a non-empty object');
      }
      const types = new Set(['any', 'string', 'number', 'boolean', 'object', 'array', 'date']);
      if (Object.values(schema).some(value => !types.has(String(value).replace(/\?$/, '')))) {
        throw new Error('transform.contract: unsupported field type');
      }
      if (node.config?.onViolation !== undefined && !['fail', 'drop', 'quarantine'].includes(String(node.config.onViolation))) {
        throw new Error('transform.contract: onViolation must be fail|drop|quarantine');
      }
    }
    if (['postgres.fetch', 'mysql.fetch'].includes(node.activityType)) {
      if (!node.config?.connectionId || !node.config?.table) throw new Error(`${node.activityType}: connection and table are required`);
      if (node.config?.syncMode !== 'cdc' && !node.config?.cursorColumn) throw new Error(`${node.activityType}: cursorColumn is required in cursor mode`);
    }
    if (node.activityType === 'mongodb.fetch') {
      if (!node.config?.connectionId || !node.config?.collection) throw new Error('mongodb.fetch: connection and collection are required');
    }
    if (node.activityType === 's3.fetch') {
      if (!node.config?.connectionId || !node.config?.bucket || !node.config?.key) throw new Error('s3.fetch: connection, bucket, and key are required');
    }
    if (node.activityType === 'sftp.fetch' && (!node.config?.connectionId || !node.config?.path)) {
      throw new Error('sftp.fetch: connection and path are required');
    }
    if (node.activityType === 'snowflake.fetch') {
      if (!node.config?.connectionId || !node.config?.table) throw new Error('snowflake.fetch: connection and table are required');
      if (node.config?.syncMode !== 'changes' && !node.config?.cursorColumn) throw new Error('snowflake.fetch: cursorColumn is required in cursor mode');
    }
    if (node.activityType === 'iceberg.fetch' && (!node.config?.connectionId || !node.config?.namespace || !node.config?.table)) {
      throw new Error('iceberg.fetch: connection, namespace, and table are required');
    }
    if (node.activityType === 'kafka.fetch') {
      if (!node.config?.connectionId || !node.config?.topic) throw new Error('kafka.fetch: connection and topic are required');
      if (!validKafkaTopic(node.config.topic)) throw new Error('kafka.fetch: invalid topic');
      if (node.config.startPosition && !['earliest', 'latest'].includes(String(node.config.startPosition))) throw new Error('kafka.fetch: startPosition must be earliest|latest');
      if (node.config.valueFormat && !['json', 'string'].includes(String(node.config.valueFormat))) throw new Error('kafka.fetch: valueFormat must be json|string');
      if (node.config.cluster && !/^[A-Za-z0-9._-]{1,100}$/.test(String(node.config.cluster))) throw new Error('kafka.fetch: invalid lineage cluster');
    }
    const sinkResource: Record<string, string> = {
      'sink.postgres': 'table', 'sink.mysql': 'table', 'sink.mongodb': 'collection',
      'sink.clickhouse': 'table', 'sink.s3': 'bucket', 'sink.kafka': 'topic',
      'sink.sftp': 'path', 'sink.snowflake': 'table',
    };
    const resource = sinkResource[node.activityType];
    if (resource) {
      if (!node.config?.connectionId) throw new Error(`${node.activityType}: a destination connector instance is required`);
      if (!node.config?.[resource]) throw new Error(`${node.activityType}: ${resource} is required`);
      if (node.activityType === 'sink.s3' && !node.config?.key) throw new Error('sink.s3: key is required');
      if (node.activityType === 'sink.kafka' && !validKafkaTopic(node.config.topic)) throw new Error('sink.kafka: invalid topic');
      if (node.activityType === 'sink.kafka' && node.config.cluster && !/^[A-Za-z0-9._-]{1,100}$/.test(String(node.config.cluster))) throw new Error('sink.kafka: invalid lineage cluster');
      if (node.config?.writeMode === 'apply-cdc') {
        const key = node.activityType === 'sink.postgres' ? node.config?.conflictKey
          : node.activityType === 'sink.mysql' ? node.config?.primaryKey : node.config?.keyField;
        if (!key) throw new Error(`${node.activityType}: primary key is required for apply-cdc`);
      }
    }
    if (node.activityType === 'sink.gsheets') {
      if (!node.config?.connectionId) throw new Error('sink.gsheets: a destination connector instance is required');
      if (!node.config?.spreadsheetId) throw new Error('sink.gsheets: spreadsheetId is required');
    }
    if (node.activityType === 'sink.webhook' && !node.config?.connectionId && !node.config?.url) {
      throw new Error('sink.webhook: URL or HTTP connector instance is required');
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
