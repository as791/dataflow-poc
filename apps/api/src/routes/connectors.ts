// Phase 2 — OAuth Connectors API.
//
// All routes require an authenticated, email-verified user. State for the
// OAuth handshake is a random nonce held in Redis (5-min TTL) bound to the
// user/tenant initiating the flow — protects against CSRF + cross-tenant
// callback hijack.
//
// Tokens are encrypted at rest (AES-256-GCM, see crypto/tokenEnc.ts).
// Refresh is opportunistic: any route that needs a live token calls
// `getLiveToken` which refreshes when expires_at < now + 60s.

import { Router } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import Redis from 'ioredis';
import { google } from 'googleapis';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { withTenantTx, withTenant } from '../db';
import { requireAuth, requireVerified } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { encryptToken, decryptToken } from '../crypto/tokenEnc';
import { getCatalog } from '../lib/serverCatalog';

export const connectors = Router();
connectors.use(requireAuth, requireVerified);

// Connector catalog (UI palette + node config metadata). Combines coded
// connectors with every manifest-driven connector in the registry, so a new
// connector dropped in as a JSON manifest appears here — and thus in the canvas
// palette and AI builder — with zero code changes.
connectors.get('/catalog', (_req, res) => {
  res.json({ catalog: getCatalog() });
});

// ── Redis-backed state store for OAuth CSRF nonces ────────────────────────
let redis: Redis | null = null;
function r(): Redis {
  if (!redis) redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return redis;
}
const STATE_TTL_SECONDS = 5 * 60;

interface StatePayload {
  tenantId: string;
  userId: string;
  provider: 'google' | 'microsoft' | 'zendesk';
  // Provider-specific extra (e.g. Zendesk subdomain)
  extra?: Record<string, unknown>;
}

async function mintState(payload: StatePayload): Promise<string> {
  const nonce = crypto.randomBytes(24).toString('base64url');
  await r().set(`oauth:state:${nonce}`, JSON.stringify(payload), 'EX', STATE_TTL_SECONDS);
  return nonce;
}
async function consumeState(nonce: string): Promise<StatePayload | null> {
  const key = `oauth:state:${nonce}`;
  const raw = await r().get(key);
  if (!raw) return null;
  await r().del(key);
  return JSON.parse(raw) as StatePayload;
}

// ── Provider config ───────────────────────────────────────────────────────
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const GOOGLE_REDIRECT  = `${APP_URL}/api/connectors/google/callback`;
const MS_REDIRECT      = `${APP_URL}/api/connectors/microsoft/callback`;
const ZENDESK_REDIRECT = `${APP_URL}/api/connectors/zendesk/callback`;

const GOOGLE_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];
const MS_SCOPES = [
  'offline_access', 'User.Read', 'Files.Read', 'Sites.Read.All',
];

function googleOAuth() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT,
  );
}

function msalClient() {
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.AZURE_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID ?? 'common'}`,
    },
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────
interface ConnectionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  provider: string;
  provider_account_email: string | null;
  scopes: string[];
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  extra: Record<string, unknown> | null;
  created_at: Date;
}

async function upsertConnection(
  tenantId: string, userId: string, provider: string,
  providerAccountEmail: string | null, scopes: string[],
  accessToken: string, refreshToken: string, expiresAt: Date,
  extra: Record<string, unknown> | null,
): Promise<string> {
  return withTenant(tenantId, async client => {
    const { rows } = await client.query(
      `INSERT INTO connector_instances
         (tenant_id, user_id, provider, provider_account_email,
          scopes, access_token, refresh_token, expires_at, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id, user_id, provider, provider_account_email)
       DO UPDATE SET
         scopes        = EXCLUDED.scopes,
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at    = EXCLUDED.expires_at,
         extra         = EXCLUDED.extra
       RETURNING id`,
      [tenantId, userId, provider, providerAccountEmail,
       scopes, encryptToken(accessToken), encryptToken(refreshToken),
       expiresAt, extra ? JSON.stringify(extra) : null],
    );
    return rows[0].id as string;
  });
}

async function getConnection(tenantId: string, id: string): Promise<ConnectionRow | null> {
  return withTenant(tenantId, async client => {
    const { rows } = await client.query(
      `SELECT * FROM connector_instances WHERE id = $1`, [id]);
    return (rows[0] as ConnectionRow) ?? null;
  });
}

// Refreshes if expired, persists new tokens, returns plaintext access token.
async function getLiveToken(tenantId: string, conn: ConnectionRow): Promise<string> {
  const skewMs = 60_000;
  if (conn.expires_at.getTime() > Date.now() + skewMs) {
    return decryptToken(conn.access_token);
  }
  const refresh = decryptToken(conn.refresh_token);
  const { accessToken, refreshToken, expiresAt } = await refreshProviderToken(conn.provider, refresh, conn.extra);
  await withTenant(tenantId, client =>
    client.query(
      `UPDATE connector_instances
         SET access_token=$1, refresh_token=$2, expires_at=$3
       WHERE id=$4`,
      [encryptToken(accessToken), encryptToken(refreshToken ?? refresh), expiresAt, conn.id]));
  return accessToken;
}

async function refreshProviderToken(
  provider: string, refreshToken: string, extra: Record<string, unknown> | null,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
  if (provider === 'google') {
    const oauth = googleOAuth();
    oauth.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth.refreshAccessToken();
    return {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token ?? undefined,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000),
    };
  }
  if (provider === 'microsoft') {
    const client = msalClient();
    const result = await client.acquireTokenByRefreshToken({
      refreshToken, scopes: MS_SCOPES,
    });
    if (!result?.accessToken) throw new Error('msal: empty refresh response');
    return {
      accessToken: result.accessToken,
      expiresAt: result.expiresOn ?? new Date(Date.now() + 3600 * 1000),
    };
  }
  if (provider === 'zendesk') {
    const subdomain = (extra?.subdomain as string) ?? '';
    const res = await axios.post(`https://${subdomain}.zendesk.com/oauth/tokens`, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.ZENDESK_OAUTH_CLIENT_ID,
      client_secret: process.env.ZENDESK_OAUTH_CLIENT_SECRET,
      scope: 'read',
    });
    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token,
      expiresAt: new Date(Date.now() + (res.data.expires_in ?? 3600) * 1000),
    };
  }
  throw new Error(`unknown provider: ${provider}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Connection management
// ─────────────────────────────────────────────────────────────────────────

connectors.get('/', async (req, res) => {
  const rows = await withTenantTx(req, async client => {
    const { rows } = await client.query(
      `SELECT id, kind, provider, provider_account_email, scopes, expires_at, extra, created_at
         FROM connector_instances
        ORDER BY kind, provider, created_at DESC`);
    return rows;
  });
  // Flat array; surface a display name + the common extra fields the UI reads.
  res.json(rows.map((r: any) => ({
    id: r.id, kind: r.kind, provider: r.provider,
    name: r.provider_account_email, email: r.provider_account_email,
    subdomain: r.extra?.subdomain, host: r.extra?.host, baseUrl: r.extra?.baseUrl,
    expires_at: r.expires_at, connected_at: r.created_at,
  })));
});

connectors.delete('/:connectionId', async (req, res) => {
  const { connectionId } = req.params;
  const deleted = await withTenantTx(req, async client => {
    const { rowCount } = await client.query(
      `DELETE FROM connector_instances WHERE id=$1`, [connectionId]);
    return rowCount ?? 0;
  });
  if (!deleted) return res.status(404).json({ error: 'not found' });
  await auditLog(req, 'connector.revoked', connectionId);
  res.json({ ok: true });
});

connectors.post('/:connectionId/refresh', async (req, res) => {
  const conn = await getConnection(req.tenant.tenantId, req.params.connectionId);
  if (!conn) return res.status(404).json({ error: 'not found' });
  try {
    const refresh = decryptToken(conn.refresh_token);
    const { accessToken, refreshToken, expiresAt } =
      await refreshProviderToken(conn.provider, refresh, conn.extra);
    await withTenantTx(req, client =>
      client.query(
        `UPDATE connector_instances
           SET access_token=$1, refresh_token=$2, expires_at=$3
         WHERE id=$4`,
        [encryptToken(accessToken), encryptToken(refreshToken ?? refresh), expiresAt, conn.id]));
    await auditLog(req, 'connector.refreshed', conn.id);
    res.json({ ok: true, expiresAt });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'refresh failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// A3 — non-OAuth credential instances + test-connection
// ─────────────────────────────────────────────────────────────────────────

// Create a non-OAuth credential instance (DB/host/key creds). Non-secret params
// go in `extra`; secrets are AES-GCM encrypted into `secret`.
connectors.post('/', async (req, res) => {
  const { provider, name, config, secret } = req.body ?? {};
  if (!provider || !name) return res.status(400).json({ error: 'provider and name are required' });
  let id: string;
  try {
    id = await withTenantTx(req, async client => {
      const { rows } = await client.query(
        `INSERT INTO connector_instances
           (tenant_id, user_id, kind, provider, provider_account_email, secret, extra)
         VALUES ($1,$2,'credential',$3,$4,$5,$6) RETURNING id`,
        [req.tenant.tenantId, req.tenant.userId, provider, name,
         secret ? encryptToken(JSON.stringify(secret)) : null,
         config ? JSON.stringify(config) : null]);
      return rows[0].id as string;
    });
  } catch (e: any) {
    if (e?.code === '23505') return res.status(409).json({ error: `a ${provider} connector named "${name}" already exists` });
    throw e;
  }
  await auditLog(req, 'connector.created', id, { provider, kind: 'credential' });
  res.json({ id });
});

// Test-connection: dispatch by kind/provider. Returns {ok,message} either way
// (a failed connection is a 200 with ok:false — it's an expected user outcome).
connectors.post('/:connectionId/test', async (req, res) => {
  const row = await withTenantTx(req, async client => {
    const { rows } = await client.query(
      `SELECT * FROM connector_instances WHERE id=$1`, [req.params.connectionId]);
    return rows[0];
  });
  if (!row) return res.status(404).json({ error: 'not found' });
  try {
    res.json({ ok: true, message: await testInstance(req.tenant.tenantId, row) });
  } catch (e: any) {
    res.json({ ok: false, message: e.message ?? 'connection failed' });
  }
});

export async function testInstance(tenantId: string, row: any): Promise<string> {
  if (row.kind === 'oauth') {
    await getLiveToken(tenantId, row as ConnectionRow); // forces refresh if expired
    return 'token OK';
  }
  const cfg = (row.extra ?? {}) as Record<string, any>;
  const secret = row.secret ? JSON.parse(decryptToken(row.secret)) : {};
  if (row.provider === 'postgres') {
    // Keep these client options in sync with the worker's sink.postgres
    // (apps/worker/src/activities/catalog.ts) so Test is a true preflight.
    const { Client } = await import('pg');
    const c = new Client({ host: cfg.host, port: cfg.port ?? 5432, database: cfg.database, user: cfg.user, password: secret.password, connectionTimeoutMillis: 10_000 });
    await c.connect();
    try { await c.query('SELECT 1'); } finally { await c.end(); }
    return 'SELECT 1 OK';
  }
  if (row.provider === 'http') {
    const r = await axios.get(cfg.baseUrl, { headers: secret.apiKey ? { Authorization: `Bearer ${secret.apiKey}` } : {}, timeout: 10_000 });
    return `HTTP ${r.status}`;
  }
  throw new Error(`test not supported for provider "${row.provider}"`);
}

// ─────────────────────────────────────────────────────────────────────────
// Google
// ─────────────────────────────────────────────────────────────────────────

connectors.get('/google/auth', async (req, res) => {
  const state = await mintState({
    tenantId: req.tenant.tenantId, userId: req.tenant.userId!, provider: 'google',
  });
  const url = googleOAuth().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',           // force refresh_token issuance
    scope: GOOGLE_SCOPES,
    state,
  });
  res.json({ url });
});

connectors.get('/google/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return res.status(400).send('missing code/state');
  const payload = await consumeState(state);
  if (!payload || payload.provider !== 'google') return res.status(400).send('invalid state');
  if (payload.tenantId !== req.tenant.tenantId || payload.userId !== req.tenant.userId) {
    return res.status(403).send('state tenant/user mismatch');
  }
  try {
    const oauth = googleOAuth();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return res.status(400).send('Google did not return a refresh token. Revoke the existing grant and retry.');
    }
    oauth.setCredentials(tokens);
    const me = await google.oauth2('v2').userinfo.get({ auth: oauth });
    const id = await upsertConnection(
      payload.tenantId, payload.userId, 'google',
      me.data.email ?? null, GOOGLE_SCOPES,
      tokens.access_token, tokens.refresh_token,
      new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000), null,
    );
    await auditLog(req, 'connector.connected', id, { provider: 'google', email: me.data.email });
    res.redirect(`${APP_URL}/connectors?connected=google`);
  } catch (e: any) {
    res.status(500).send(`Google OAuth failed: ${e.message ?? e}`);
  }
});

connectors.get('/google/spreadsheets', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'google', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no google connection' });
  const oauth = googleOAuth();
  oauth.setCredentials({ access_token: await getLiveToken(req.tenant.tenantId, conn) });
  const drive = google.drive({ version: 'v3', auth: oauth });
  const out = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 50,
    fields: 'files(id,name,modifiedTime,webViewLink)',
  });
  res.json({ files: out.data.files ?? [], connectionId: conn.id });
});

connectors.get('/google/spreadsheets/:id/sheets', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'google', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no google connection' });
  const oauth = googleOAuth();
  oauth.setCredentials({ access_token: await getLiveToken(req.tenant.tenantId, conn) });
  const sheets = google.sheets({ version: 'v4', auth: oauth });
  const r = await sheets.spreadsheets.get({ spreadsheetId: req.params.id });
  res.json({
    title: r.data.properties?.title,
    sheets: (r.data.sheets ?? []).map(s => ({
      sheetId: s.properties?.sheetId, title: s.properties?.title,
      rows: s.properties?.gridProperties?.rowCount,
      cols: s.properties?.gridProperties?.columnCount,
    })),
  });
});

connectors.get('/google/spreadsheets/:id/sheets/:name/preview', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'google', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no google connection' });
  const oauth = googleOAuth();
  oauth.setCredentials({ access_token: await getLiveToken(req.tenant.tenantId, conn) });
  const sheets = google.sheets({ version: 'v4', auth: oauth });
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: req.params.id,
    range: `${req.params.name}!A1:Z6`,
  });
  const rows = r.data.values ?? [];
  const [headers, ...data] = rows;
  res.json({ headers: headers ?? [], rows: data.slice(0, 5) });
});

connectors.get('/google/drive/folders', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'google', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no google connection' });
  const oauth = googleOAuth();
  oauth.setCredentials({ access_token: await getLiveToken(req.tenant.tenantId, conn) });
  const drive = google.drive({ version: 'v3', auth: oauth });
  const parent = (req.query.parent as string) ?? 'root';
  const out = await drive.files.list({
    q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    pageSize: 100,
    fields: 'files(id,name)',
  });
  res.json({ parent, folders: out.data.files ?? [] });
});

connectors.get('/google/drive/files/:id/preview', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'google', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no google connection' });
  const oauth = googleOAuth();
  oauth.setCredentials({ access_token: await getLiveToken(req.tenant.tenantId, conn) });
  const drive = google.drive({ version: 'v3', auth: oauth });
  const r = await drive.files.get({
    fileId: req.params.id,
    fields: 'id,name,mimeType,modifiedTime,size,webViewLink',
  });
  res.json({ file: r.data });
});

// ─────────────────────────────────────────────────────────────────────────
// Microsoft
// ─────────────────────────────────────────────────────────────────────────

connectors.get('/microsoft/auth', async (req, res) => {
  const state = await mintState({
    tenantId: req.tenant.tenantId, userId: req.tenant.userId!, provider: 'microsoft',
  });
  try {
    const url = await msalClient().getAuthCodeUrl({
      scopes: MS_SCOPES,
      redirectUri: MS_REDIRECT,
      state,
      prompt: 'consent',
    });
    res.json({ url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

connectors.get('/microsoft/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return res.status(400).send('missing code/state');
  const payload = await consumeState(state);
  if (!payload || payload.provider !== 'microsoft') return res.status(400).send('invalid state');
  if (payload.tenantId !== req.tenant.tenantId || payload.userId !== req.tenant.userId) {
    return res.status(403).send('state tenant/user mismatch');
  }
  try {
    const client = msalClient();
    const result = await client.acquireTokenByCode({
      code, scopes: MS_SCOPES, redirectUri: MS_REDIRECT,
    });
    if (!result?.accessToken) return res.status(400).send('no access token');

    // MSAL Node hides the refresh token in its token cache. Pull it out.
    const cache = client.getTokenCache().serialize();
    const refreshToken = extractMsalRefreshToken(cache);
    if (!refreshToken) return res.status(400).send('Microsoft did not return a refresh token (offline_access missing?)');

    const email = (result.account?.username) ?? null;
    const id = await upsertConnection(
      payload.tenantId, payload.userId, 'microsoft',
      email, MS_SCOPES, result.accessToken, refreshToken,
      result.expiresOn ?? new Date(Date.now() + 3600 * 1000), null,
    );
    await auditLog(req, 'connector.connected', id, { provider: 'microsoft', email });
    res.redirect(`${APP_URL}/connectors?connected=microsoft`);
  } catch (e: any) {
    res.status(500).send(`Microsoft OAuth failed: ${e.message ?? e}`);
  }
});

function extractMsalRefreshToken(cacheJson: string): string | null {
  try {
    const cache = JSON.parse(cacheJson);
    const rts = cache.RefreshToken ?? {};
    const first = Object.values(rts)[0] as any;
    return first?.secret ?? null;
  } catch { return null; }
}

async function graphCall(token: string, path: string): Promise<any> {
  const r = await axios.get(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30_000,
  });
  return r.data;
}

connectors.get('/microsoft/drives', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'microsoft', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no microsoft connection' });
  const token = await getLiveToken(req.tenant.tenantId, conn);
  const out: any[] = [];
  try {
    const me = await graphCall(token, '/me/drive');
    out.push({ id: me.id, name: 'OneDrive — Personal', driveType: me.driveType });
  } catch { /* personal drive may not exist */ }
  try {
    const sites = await graphCall(token, '/sites?search=*');
    for (const s of (sites.value ?? []).slice(0, 10)) {
      try {
        const d = await graphCall(token, `/sites/${s.id}/drive`);
        out.push({ id: d.id, name: `${s.displayName} (SharePoint)`, driveType: d.driveType });
      } catch { /* skip inaccessible site */ }
    }
  } catch { /* no sites */ }
  res.json({ drives: out, connectionId: conn.id });
});

connectors.get('/microsoft/drives/:driveId/items', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'microsoft', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no microsoft connection' });
  const token = await getLiveToken(req.tenant.tenantId, conn);
  const parent = (req.query.parent as string) ?? 'root';
  const data = await graphCall(token, `/drives/${req.params.driveId}/items/${parent}/children`);
  res.json({
    items: (data.value ?? []).map((i: any) => ({
      id: i.id, name: i.name, isFolder: !!i.folder,
      isWorkbook: i.name?.toLowerCase().endsWith('.xlsx'),
      webUrl: i.webUrl,
    })),
  });
});

connectors.get('/microsoft/workbooks/:itemId/sheets', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'microsoft', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no microsoft connection' });
  const driveId = req.query.driveId as string;
  if (!driveId) return res.status(400).json({ error: 'driveId required' });
  const token = await getLiveToken(req.tenant.tenantId, conn);
  const data = await graphCall(token,
    `/drives/${driveId}/items/${req.params.itemId}/workbook/worksheets`);
  res.json({ sheets: (data.value ?? []).map((s: any) => ({ id: s.id, name: s.name })) });
});

connectors.get('/microsoft/workbooks/:itemId/sheets/:name/preview', async (req, res) => {
  const conn = await pickConnection(req.tenant.tenantId, 'microsoft', req.query.connectionId as string);
  if (!conn) return res.status(404).json({ error: 'no microsoft connection' });
  const driveId = req.query.driveId as string;
  if (!driveId) return res.status(400).json({ error: 'driveId required' });
  const token = await getLiveToken(req.tenant.tenantId, conn);
  const data = await graphCall(token,
    `/drives/${driveId}/items/${req.params.itemId}/workbook/worksheets('${encodeURIComponent(req.params.name)}')/usedRange(valuesOnly=true)`);
  const values: any[][] = data.values ?? [];
  const [headers, ...rows] = values;
  res.json({ headers: headers ?? [], rows: rows.slice(0, 5) });
});

// ─────────────────────────────────────────────────────────────────────────
// Zendesk
// ─────────────────────────────────────────────────────────────────────────

connectors.post('/zendesk/auth', async (req, res) => {
  const subdomain = String(req.body?.subdomain ?? '').trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(subdomain)) return res.status(400).json({ error: 'invalid subdomain' });
  const state = await mintState({
    tenantId: req.tenant.tenantId, userId: req.tenant.userId!, provider: 'zendesk',
    extra: { subdomain },
  });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ZENDESK_OAUTH_CLIENT_ID ?? '',
    redirect_uri: ZENDESK_REDIRECT,
    scope: 'read',
    state,
  });
  res.json({ url: `https://${subdomain}.zendesk.com/oauth/authorizations/new?${params}` });
});

connectors.get('/zendesk/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return res.status(400).send('missing code/state');
  const payload = await consumeState(state);
  if (!payload || payload.provider !== 'zendesk') return res.status(400).send('invalid state');
  if (payload.tenantId !== req.tenant.tenantId || payload.userId !== req.tenant.userId) {
    return res.status(403).send('state tenant/user mismatch');
  }
  const subdomain = (payload.extra?.subdomain as string) ?? '';
  try {
    const tokRes = await axios.post(`https://${subdomain}.zendesk.com/oauth/tokens`, {
      grant_type: 'authorization_code',
      code,
      client_id: process.env.ZENDESK_OAUTH_CLIENT_ID,
      client_secret: process.env.ZENDESK_OAUTH_CLIENT_SECRET,
      redirect_uri: ZENDESK_REDIRECT,
      scope: 'read',
    });
    const { access_token, refresh_token, expires_in } = tokRes.data;
    const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000);
    const id = await upsertConnection(
      payload.tenantId, payload.userId, 'zendesk',
      subdomain, ['read'],
      access_token, refresh_token ?? access_token, // some Zendesk plans don't issue refresh tokens
      expiresAt, { subdomain },
    );
    await auditLog(req, 'connector.connected', id, { provider: 'zendesk', subdomain });
    res.redirect(`${APP_URL}/connectors?connected=zendesk`);
  } catch (e: any) {
    res.status(500).send(`Zendesk OAuth failed: ${e.message ?? e}`);
  }
});

connectors.get('/zendesk/resources', async (req, res) => {
  // Static for now; future: probe permissions per subdomain
  res.json({ resources: ['tickets', 'users', 'organizations'] });
});

// ─────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────

async function pickConnection(
  tenantId: string, provider: string, connectionId?: string,
): Promise<ConnectionRow | null> {
  return withTenant(tenantId, async client => {
    if (connectionId) {
      const { rows } = await client.query(
        `SELECT * FROM connector_instances WHERE id=$1 AND provider=$2 AND kind='oauth'`,
        [connectionId, provider]);
      return (rows[0] as ConnectionRow) ?? null;
    }
    const { rows } = await client.query(
      `SELECT * FROM connector_instances WHERE provider=$1 AND kind='oauth'
       ORDER BY created_at DESC LIMIT 1`, [provider]);
    return (rows[0] as ConnectionRow) ?? null;
  });
}
