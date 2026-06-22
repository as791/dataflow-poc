import axios from 'axios';
import crypto from 'crypto';
import type { SourceFetchParams, SourceFetchResult } from '../catalog';
import { getOAuthToken } from './oauth-client';

// Microsoft Graph Excel: workbook usedRange returns a 2D array of values.
// Like Sheets, there's no per-row change feed, so we use the same row-hash
// cursor pattern: hash every row, emit those whose hash changed.
//
// Required config: { connectionId, driveId, itemId, sheetName, keyColumn? }
export async function excelFetch(p: SourceFetchParams): Promise<SourceFetchResult> {
  const { config, cursor, tenantId } = p;
  const connectionId = config.connectionId as string;
  if (!connectionId) throw new Error('excel.fetch: config.connectionId required');
  const driveId   = config.driveId as string;
  const itemId    = config.itemId as string;
  const sheetName = config.sheetName as string;
  if (!driveId || !itemId || !sheetName) {
    throw new Error('excel.fetch: driveId, itemId, sheetName required');
  }

  const token = await getOAuthToken(connectionId, tenantId);
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}` +
              `/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange(valuesOnly=true)`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30_000,
    validateStatus: s => s < 500,
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers['retry-after'] ?? '60', 10);
    throw Object.assign(new Error('graph rate limited'), { retryable: true, retryAfterSec: retryAfter });
  }
  if (res.status >= 400) throw new Error(`graph ${res.status}: ${JSON.stringify(res.data)}`);

  const values: any[][] = res.data.values ?? [];
  if (!values.length) return { records: [], nextCursor: cursor, hasMore: false };

  const headers = values[0];
  const prevHashes: Record<string, string> = cursor.rowHashes ?? {};
  const newHashes:  Record<string, string> = {};
  const changed: any[] = [];

  values.slice(1).forEach((row, i) => {
    const obj = Object.fromEntries(headers.map((h: any, j: number) => [String(h), row[j] ?? null]));
    const hash = crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex');
    const key = String(obj[(config.keyColumn as string) ?? String(headers[0])] ?? i);
    newHashes[key] = hash;
    if (prevHashes[key] !== hash) changed.push({ _rowKey: key, ...obj });
  });

  return { records: changed, nextCursor: { rowHashes: newHashes }, hasMore: false };
}
