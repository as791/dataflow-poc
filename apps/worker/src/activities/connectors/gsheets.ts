import { google } from 'googleapis';
import type { SourceFetchParams, SourceFetchResult } from '../catalog';
import { getOAuthToken } from './oauth-client';

// Sheets has no change feed; we snapshot and diff against a row-hash cursor.
// Incremental = emit only rows whose hash changed since last run.
export async function gsheetsFetch(p: SourceFetchParams): Promise<SourceFetchResult> {
  const { config, cursor, tenantId } = p;
  const connectionId = config.connectionId as string;
  if (!connectionId) throw new Error('gsheets.fetch: config.connectionId required');

  const accessToken = await getOAuthToken(connectionId, tenantId);
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });

  const sheets = google.sheets({ version: 'v4', auth: oauth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId as string,
    range: (config.range as string) ?? 'A:Z',
  });
  const rows = res.data.values ?? [];
  if (!rows.length) return { records: [], nextCursor: cursor, hasMore: false };

  const headers = rows[0];
  const crypto = await import('crypto');
  const prevHashes: Record<string, string> = cursor.rowHashes ?? {};
  const newHashes: Record<string, string> = {};
  const changed: any[] = [];

  rows.slice(1).forEach((row, i) => {
    const obj = Object.fromEntries(headers.map((h: string, j: number) => [h, row[j] ?? null]));
    const hash = crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex');
    const key = String(obj[(config.keyColumn as string) ?? headers[0]] ?? i);
    newHashes[key] = hash;
    if (prevHashes[key] !== hash) changed.push({ _rowKey: key, ...obj });
  });

  // backfill mode = emit everything on first run (prevHashes empty does this naturally)
  return { records: changed, nextCursor: { rowHashes: newHashes }, hasMore: false };
}
