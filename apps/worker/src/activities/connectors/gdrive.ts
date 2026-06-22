import { google } from 'googleapis';
import type { SourceFetchParams, SourceFetchResult } from '../catalog';
import { getOAuthToken } from './oauth-client';

// Drive has a proper change feed: startPageToken anchors the stream;
// each call returns changes since the last token. Backfill = files.list pages.
export async function gdriveFetch(p: SourceFetchParams): Promise<SourceFetchResult> {
  const { config, cursor, ingestion, tenantId } = p;
  const connectionId = config.connectionId as string;
  if (!connectionId) throw new Error('gdrive.fetch: config.connectionId required');

  const accessToken = await getOAuthToken(connectionId, tenantId);
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: oauth });

  // ── Backfill phase: page through files.list until exhausted ──
  if (ingestion?.mode === 'backfill' && !cursor.backfillDone) {
    const res = await drive.files.list({
      q: (config.query as string) ?? undefined,
      pageSize: ingestion.pageSize ?? 100,
      pageToken: cursor.pageToken ?? undefined,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)',
    });
    const done = !res.data.nextPageToken;
    let startPageToken = cursor.startPageToken;
    if (done && !startPageToken) {
      // anchor the change feed at the moment backfill completes
      const t = await drive.changes.getStartPageToken({});
      startPageToken = t.data.startPageToken;
    }
    return {
      records: res.data.files ?? [],
      nextCursor: { pageToken: res.data.nextPageToken, backfillDone: done, startPageToken },
      hasMore: !done,
    };
  }

  // ── Incremental phase: consume the changes feed ──
  let token = cursor.startPageToken;
  if (!token) {
    const t = await drive.changes.getStartPageToken({});
    return { records: [], nextCursor: { startPageToken: t.data.startPageToken, backfillDone: true }, hasMore: false };
  }
  const res = await drive.changes.list({
    pageToken: token,
    fields: 'newStartPageToken, nextPageToken, changes(fileId,removed,file(id,name,mimeType,modifiedTime,webViewLink))',
  });
  const records = (res.data.changes ?? []).map(c =>
    c.removed ? { _op: 'delete', fileId: c.fileId } : { _op: 'upsert', ...c.file });
  return {
    records,
    nextCursor: { startPageToken: res.data.newStartPageToken ?? res.data.nextPageToken ?? token,
                  backfillDone: true },
    hasMore: !!res.data.nextPageToken,
  };
}
