import axios from 'axios';
import type { SourceFetchParams, SourceFetchResult } from '../catalog';

// Generic REST source. Supports three pagination styles + a timestamp param
// for incremental mode, all declared in node config by the user:
//   { url, method, headers, auth: {type:'bearer'|'basic'|'header', ...},
//     pagination: {style:'cursor'|'page'|'offset', cursorPath, param, limitParam, limit},
//     incremental: { sinceParam: 'updated_after', recordTimestampPath: 'updated_at' },
//     recordsPath: 'data.items' }
export async function httpFetch(p: SourceFetchParams): Promise<SourceFetchResult> {
  const { config, cursor, ingestion } = p;
  const c = config as any;
  const params: Record<string, any> = { ...(c.params ?? {}) };

  // pagination state
  const pg = c.pagination ?? {};
  if (pg.style === 'cursor' && cursor.next)        params[pg.param ?? 'cursor'] = cursor.next;
  if (pg.style === 'page')                          params[pg.param ?? 'page'] = cursor.page ?? 1;
  if (pg.style === 'offset')                        params[pg.param ?? 'offset'] = cursor.offset ?? 0;
  if (pg.limitParam)                                params[pg.limitParam] = pg.limit ?? ingestion?.pageSize ?? 100;

  // incremental watermark
  if (c.incremental?.sinceParam) {
    const since = cursor.watermark
      ?? (ingestion?.mode === 'backfill' ? ingestion.backfillStart : new Date(Date.now() - 3600_000).toISOString());
    if (since) params[c.incremental.sinceParam] = since;
  }

  const headers: Record<string, string> = { ...(c.headers ?? {}) };
  if (c.auth?.type === 'bearer') headers['Authorization'] = `Bearer ${c.auth.token}`;
  if (c.auth?.type === 'header') headers[c.auth.name] = c.auth.value;

  const res = await axios.request({
    url: c.url, method: c.method ?? 'GET', headers, params, timeout: 30_000,
    auth: c.auth?.type === 'basic' ? { username: c.auth.username, password: c.auth.password } : undefined,
    validateStatus: s => s < 500,
  });
  if (res.status === 429) throw Object.assign(new Error('rate limited'), { retryable: true });
  if (res.status >= 400) throw new Error(`http source ${res.status}`);

  const records: any[] = c.recordsPath
    ? c.recordsPath.split('.').reduce((o: any, k: string) => o?.[k], res.data) ?? []
    : (Array.isArray(res.data) ? res.data : [res.data]);

  // advance cursor
  const next: Record<string, any> = { ...cursor };
  let hasMore = false;
  if (pg.style === 'cursor') {
    const nc = pg.cursorPath?.split('.').reduce((o: any, k: string) => o?.[k], res.data);
    next.next = nc; hasMore = !!nc;
  } else if (pg.style === 'page') {
    hasMore = records.length >= (pg.limit ?? 100);
    next.page = (cursor.page ?? 1) + 1;
    if (!hasMore) next.page = 1;
  } else if (pg.style === 'offset') {
    hasMore = records.length >= (pg.limit ?? 100);
    next.offset = hasMore ? (cursor.offset ?? 0) + records.length : 0;
  }
  // watermark = max record timestamp seen
  if (c.incremental?.recordTimestampPath && records.length) {
    const ts = records
      .map(r => c.incremental.recordTimestampPath.split('.').reduce((o: any, k: string) => o?.[k], r))
      .filter(Boolean).sort().pop();
    if (ts) next.watermark = ts;
  }
  next.backfillDone = !hasMore;
  return { records, nextCursor: next, hasMore };
}
