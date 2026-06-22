import axios from 'axios';
import type { SourceFetchParams, SourceFetchResult } from '../catalog';
import { getOAuthConnection } from './oauth-client';

// Zendesk incremental export API: cursor-based, handles both backfill and
// incremental with the same cursor mechanism. start_time for first call,
// after_cursor afterwards. Rate limit: 10 req/min on incremental endpoints.
export async function zendeskFetch(p: SourceFetchParams): Promise<SourceFetchResult> {
  const { config, cursor, ingestion, tenantId } = p;
  const connectionId = config.connectionId as string;
  if (!connectionId) throw new Error('zendesk.fetch: config.connectionId required');

  const conn = await getOAuthConnection(connectionId, tenantId);
  const sub = (conn.extra?.subdomain as string) ?? (config.subdomain as string);
  if (!sub) throw new Error('zendesk.fetch: subdomain missing on connection');
  const resource = (config.resource as string) ?? 'tickets'; // tickets|users|organizations

  let url: string;
  if (cursor.afterCursor) {
    url = `https://${sub}.zendesk.com/api/v2/incremental/${resource}/cursor.json?cursor=${cursor.afterCursor}`;
  } else {
    const start = ingestion?.mode === 'backfill' && ingestion.backfillStart
      ? Math.floor(new Date(ingestion.backfillStart).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 3600; // incremental default: last hour
    url = `https://${sub}.zendesk.com/api/v2/incremental/${resource}/cursor.json?start_time=${start}`;
  }

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${conn.accessToken}` },
    timeout: 30_000,
    validateStatus: s => s < 500,
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers['retry-after'] ?? '60', 10);
    throw Object.assign(new Error('zendesk rate limited'), { retryable: true, retryAfterSec: retryAfter });
  }
  if (res.status >= 400) throw new Error(`zendesk ${res.status}: ${JSON.stringify(res.data)}`);

  const records = res.data[resource] ?? [];
  return {
    records,
    nextCursor: { afterCursor: res.data.after_cursor,
                  backfillDone: res.data.end_of_stream === true },
    hasMore: res.data.end_of_stream === false,
  };
}
