import type { SourceFn } from '@dataflow/connector-sdk';
import { loadCredentialInstance } from './credentials';

type Icebird = typeof import('icebird');
const loadIcebird = () => new Function('return import("icebird")')() as Promise<Icebird>;

export const icebergFetch: SourceFn = async ({ config, cursor, ingestion, tenantId }) => {
  const { icebergRead, restCatalogConnect, restCatalogLoadTable, s3SignedResolver } = await loadIcebird();
  const instance = await loadCredentialInstance(String(config.connectionId ?? ''), tenantId);
  if (instance.provider !== 'iceberg') throw new Error(`connector ${config.connectionId} is not Iceberg`);
  const namespace = String(config.namespace ?? '').split('.').filter(Boolean), table = String(config.table ?? '');
  if (!namespace.length || !table) throw new Error('iceberg.fetch: namespace and table are required');
  const requestInit = instance.secret.token ? { headers: { Authorization: `Bearer ${instance.secret.token}` } } : undefined;
  const catalog = await restCatalogConnect({ url: instance.extra.url, warehouse: instance.extra.warehouse, requestInit });
  const loaded = await restCatalogLoadTable(catalog, { namespace, table });
  const metadata: any = loaded.metadata;
  const snapshotId = String(metadata['current-snapshot-id'] ?? '');
  if (!snapshotId || cursor.snapshotId === snapshotId) return { records: [], nextCursor: cursor, hasMore: false };
  const snapshot = metadata.snapshots?.find((item: any) => String(item['snapshot-id']) === snapshotId);
  if (cursor.snapshotId && snapshot?.summary?.operation !== 'append') {
    throw new Error('iceberg.fetch: incremental mode supports append snapshots; run a backfill after overwrite/delete snapshots');
  }
  const totalRecords = Number(snapshot?.summary?.['total-records'] ?? 0);
  const start = cursor.pendingSnapshotId === snapshotId ? Number(cursor.rowOffset ?? 0) : Number(cursor.totalRecords ?? 0);
  const pageSize = Math.min(Math.max(Number(ingestion?.pageSize ?? config.pageSize ?? 1000) || 1000, 1), 10_000);
  const resolver = instance.secret.accessKeyId ? s3SignedResolver({
    accessKeyId: instance.secret.accessKeyId, secretAccessKey: instance.secret.secretAccessKey,
    region: instance.extra.region ?? 'us-east-1', endpoint: instance.extra.endpoint || undefined,
    pathStyle: !!instance.extra.forcePathStyle,
  }) : undefined;
  const records = await icebergRead({ tableUrl: metadata.location, metadata, snapshotId: BigInt(snapshotId), rowStart: start, rowEnd: start + pageSize, resolver });
  const hasMore = start + records.length < totalRecords;
  return {
    records, hasMore,
    nextCursor: hasMore
      ? { ...cursor, pendingSnapshotId: snapshotId, rowOffset: start + records.length, totalRecords }
      : { snapshotId, totalRecords },
  };
};
