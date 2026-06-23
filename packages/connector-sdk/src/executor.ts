import axios from 'axios';
import type { SourceFetchParams, SourceFetchResult, SourceFn } from './runtime-types';
import type { ConnectorManifest } from './manifest';

// Generic REST source executor. This is the reference implementation that both
// the legacy `http.fetch` connector and every manifest-driven connector run
// through. Supports three pagination styles + an incremental watermark param,
// all driven by config (see HttpSourceConfig).

export interface HttpSourceConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  auth?:
    | { type: 'bearer'; token: string }
    | { type: 'header'; name: string; value: string }
    | { type: 'basic'; username: string; password: string };
  pagination?: { style: 'cursor' | 'page' | 'offset'; cursorPath?: string; param?: string; limitParam?: string; limit?: number };
  incremental?: { sinceParam: string; recordTimestampPath: string };
  recordsPath?: string;
}

// Minimal HTTP surface so tests can inject a stub.
export interface HttpClient {
  request(opts: any): Promise<{ status: number; data: any; headers?: any }>;
}

const dig = (obj: any, path?: string) =>
  path ? path.split('.').reduce((o: any, k: string) => o?.[k], obj) : undefined;

export async function runHttpSource(
  c: HttpSourceConfig,
  cursor: Record<string, any>,
  ingestion?: SourceFetchParams['ingestion'],
  http: HttpClient = axios,
): Promise<SourceFetchResult> {
  const params: Record<string, any> = { ...(c.params ?? {}) };

  const pg = c.pagination ?? ({} as NonNullable<HttpSourceConfig['pagination']>);
  if (pg.style === 'cursor' && cursor.next) params[pg.param ?? 'cursor'] = cursor.next;
  if (pg.style === 'page')                  params[pg.param ?? 'page'] = cursor.page ?? 1;
  if (pg.style === 'offset')                params[pg.param ?? 'offset'] = cursor.offset ?? 0;
  if (pg.limitParam)                        params[pg.limitParam] = pg.limit ?? ingestion?.pageSize ?? 100;

  if (c.incremental?.sinceParam) {
    const since = cursor.watermark
      ?? (ingestion?.mode === 'backfill' ? ingestion.backfillStart : new Date(Date.now() - 3600_000).toISOString());
    if (since) params[c.incremental.sinceParam] = since;
  }

  const headers: Record<string, string> = { ...(c.headers ?? {}) };
  if (c.auth?.type === 'bearer') headers['Authorization'] = `Bearer ${c.auth.token}`;
  if (c.auth?.type === 'header') headers[c.auth.name] = c.auth.value;

  const res = await http.request({
    url: c.url, method: c.method ?? 'GET', headers, params, timeout: 30_000,
    auth: c.auth?.type === 'basic' ? { username: c.auth.username, password: c.auth.password } : undefined,
    validateStatus: (s: number) => s < 500,
  });
  if (res.status === 429) throw Object.assign(new Error('rate limited'), { retryable: true });
  if (res.status >= 400) throw new Error(`http source ${res.status}`);

  const records: any[] = c.recordsPath
    ? (dig(res.data, c.recordsPath) ?? [])
    : (Array.isArray(res.data) ? res.data : [res.data]);

  const next: Record<string, any> = { ...cursor };
  let hasMore = false;
  if (pg.style === 'cursor') {
    const nc = dig(res.data, pg.cursorPath);
    next.next = nc; hasMore = !!nc;
  } else if (pg.style === 'page') {
    hasMore = records.length >= (pg.limit ?? 100);
    next.page = hasMore ? (cursor.page ?? 1) + 1 : 1;
  } else if (pg.style === 'offset') {
    hasMore = records.length >= (pg.limit ?? 100);
    next.offset = hasMore ? (cursor.offset ?? 0) + records.length : 0;
  }
  if (c.incremental?.recordTimestampPath && records.length) {
    const ts = records
      .map(r => dig(r, c.incremental!.recordTimestampPath))
      .filter(Boolean).sort().pop();
    if (ts) next.watermark = ts;
  }
  next.backfillDone = !hasMore;
  return { records, nextCursor: next, hasMore };
}

// Fill {placeholders} in a string from config values.
function interpolate(template: string, config: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (config[k] != null ? String(config[k]) : `{${k}}`));
}

// Build a source function from a manifest. Manifest values are defaults; node
// config overrides them (e.g. the user pastes an API key into a declared field).
export function makeManifestSource(m: ConnectorManifest): SourceFn {
  return async (p: SourceFetchParams): Promise<SourceFetchResult> => {
    const cfg = p.config as Record<string, any>;
    const auth = (() => {
      const a = m.auth;
      if (!a || a.type === 'none') return undefined;
      if (a.type === 'bearer') return { type: 'bearer' as const, token: String(cfg[a.tokenField ?? 'token'] ?? '') };
      if (a.type === 'header') return { type: 'header' as const, name: a.headerName ?? 'Authorization', value: String(cfg[a.tokenField ?? 'token'] ?? '') };
      if (a.type === 'basic') return { type: 'basic' as const, username: String(cfg.username ?? ''), password: String(cfg.password ?? '') };
      return undefined;
    })();

    const httpConfig: HttpSourceConfig = {
      url: interpolate(cfg.url ? String(cfg.url) : m.url, cfg),
      method: cfg.method ?? m.method,
      headers: { ...(m.headers ?? {}), ...(cfg.headers ?? {}) },
      params: cfg.params,
      auth,
      pagination: cfg.pagination ?? m.pagination,
      incremental: cfg.incremental ?? m.incremental,
      recordsPath: cfg.recordsPath ?? m.recordsPath,
    };
    return runHttpSource(httpConfig, p.cursor, p.ingestion);
  };
}
