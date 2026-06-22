// Single source of truth for OAuth tokens inside worker activities.
//
// Activities run as the postgres superuser (bypassing RLS) so we can query
// oauth_connections directly with tenant_id in the WHERE clause. Tokens on
// disk are AES-256-GCM encrypted (same format as the API: iv:tag:ct base64).
//
// Refresh strategy: if `expires_at < now + 60s` we refresh inline, persist
// the new tokens, and return plaintext. The API and worker share the
// encryption key (OAUTH_TOKEN_ENCRYPTION_KEY).

import crypto from 'crypto';
import axios from 'axios';
import { pool } from '../db';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;

function key(): Buffer {
  const hex = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY not set');
  if (hex.length !== KEY_LEN * 2) {
    throw new Error(`OAUTH_TOKEN_ENCRYPTION_KEY must be ${KEY_LEN * 2} hex chars`);
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

function decrypt(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(':');
  const iv  = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct  = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

interface ConnectionRow {
  id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  extra: Record<string, unknown> | null;
}

export interface OAuthConnection {
  id: string;
  provider: string;
  accessToken: string;
  extra: Record<string, unknown> | null;
}

export async function getOAuthToken(connectionId: string, tenantId: string): Promise<string> {
  const conn = await loadConnection(connectionId, tenantId);
  return ensureFresh(conn, tenantId);
}

// Variant that also returns extra (e.g. Zendesk needs subdomain). Avoids a
// second DB round-trip in connector activities.
export async function getOAuthConnection(connectionId: string, tenantId: string): Promise<OAuthConnection> {
  const conn = await loadConnection(connectionId, tenantId);
  const accessToken = await ensureFresh(conn, tenantId);
  return { id: conn.id, provider: conn.provider, accessToken, extra: conn.extra };
}

async function loadConnection(connectionId: string, tenantId: string): Promise<ConnectionRow> {
  const { rows } = await pool.query(
    `SELECT id, provider, access_token, refresh_token, expires_at, extra
       FROM oauth_connections
      WHERE id = $1 AND tenant_id = $2`,
    [connectionId, tenantId]);
  if (!rows.length) throw new Error(`oauth_connection ${connectionId} not found for tenant ${tenantId}`);
  return rows[0] as ConnectionRow;
}

async function ensureFresh(conn: ConnectionRow, tenantId: string): Promise<string> {
  if (conn.expires_at.getTime() > Date.now() + 60_000) return decrypt(conn.access_token);
  const refresh = decrypt(conn.refresh_token);
  const { accessToken, refreshToken, expiresAt } = await doRefreshToken(conn.provider, refresh, conn.extra);
  await pool.query(
    `UPDATE oauth_connections
       SET access_token=$1, refresh_token=$2, expires_at=$3
     WHERE id=$4 AND tenant_id=$5`,
    [encrypt(accessToken), encrypt(refreshToken ?? refresh), expiresAt, conn.id, tenantId]);
  return accessToken;
}

async function doRefreshToken(
  provider: string, refresh: string, extra: Record<string, unknown> | null,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
  if (provider === 'google') {
    const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return {
      accessToken: r.data.access_token,
      refreshToken: r.data.refresh_token,
      expiresAt: new Date(Date.now() + (r.data.expires_in ?? 3600) * 1000),
    };
  }
  if (provider === 'microsoft') {
    const r = await axios.post(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID ?? 'common'}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: process.env.AZURE_CLIENT_ID ?? '',
        client_secret: process.env.AZURE_CLIENT_SECRET ?? '',
        scope: 'offline_access User.Read Files.Read Sites.Read.All',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return {
      accessToken: r.data.access_token,
      refreshToken: r.data.refresh_token,
      expiresAt: new Date(Date.now() + (r.data.expires_in ?? 3600) * 1000),
    };
  }
  if (provider === 'zendesk') {
    const subdomain = (extra?.subdomain as string) ?? '';
    const r = await axios.post(`https://${subdomain}.zendesk.com/oauth/tokens`, {
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: process.env.ZENDESK_OAUTH_CLIENT_ID,
      client_secret: process.env.ZENDESK_OAUTH_CLIENT_SECRET,
      scope: 'read',
    });
    return {
      accessToken: r.data.access_token,
      refreshToken: r.data.refresh_token,
      expiresAt: new Date(Date.now() + (r.data.expires_in ?? 3600) * 1000),
    };
  }
  throw new Error(`unknown provider: ${provider}`);
}
