import { Router } from 'express';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { pool } from '../db';
import { signAccessToken, requireAuth } from '../middleware/auth';
import { auditAs } from '../middleware/audit';
import { rateLimit, ipKey } from '../middleware/rateLimit';

export const auth = Router();

const REFRESH_TTL_DAYS = 30;
const STATE_TTL_MINUTES = 10;
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const isProd = process.env.NODE_ENV === 'production';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

function setRefreshCookie(res: any, token: string) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: REFRESH_TTL_DAYS * 24 * 3600 * 1000,
    path: '/api/auth',
  });
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
    [userId, sha256(token), expiresAt],
  );
  return token;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// Resolve a verified Google identity to a local user, provisioning as needed.
// Returns the user id so the caller can mint a session.
async function resolveGoogleUser(
  sub: string,
  email: string,
  ip: string | null,
  ua: string | null,
): Promise<string> {
  // 1. Known Google identity → sign in.
  const bySub = await pool.query(
    `SELECT id, tenant_id FROM users WHERE google_sub=$1`, [sub]);
  if (bySub.rows.length) {
    const { id, tenant_id } = bySub.rows[0];
    auditAs(tenant_id, id, 'auth.login', ip, ua, { provider: 'google' });
    return id;
  }

  // 2. Existing account with this email (invited/legacy) → link google_sub.
  const byEmail = await pool.query(
    `SELECT id, tenant_id FROM users WHERE email=$1`, [email]);
  if (byEmail.rows.length) {
    const { id, tenant_id } = byEmail.rows[0];
    await pool.query(
      `UPDATE users SET google_sub=$1, email_verified=true WHERE id=$2`, [sub, id]);
    auditAs(tenant_id, id, 'auth.login', ip, ua, { provider: 'google', linked: true });
    return id;
  }

  // 3. First sign-in: join a pending invitation, else auto-create a workspace.
  const inv = await pool.query(
    `SELECT tenant_id, role FROM user_invitations
       WHERE email=$1 AND accepted_at IS NULL AND expires_at > now()
       ORDER BY expires_at DESC LIMIT 1`,
    [email]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let tenantId: string;
    let role: string;
    if (inv.rows.length) {
      tenantId = inv.rows[0].tenant_id;
      role = inv.rows[0].role;
      await client.query(
        `UPDATE user_invitations SET accepted_at=now()
           WHERE email=$1 AND accepted_at IS NULL`, [email]);
    } else {
      role = 'owner';
      const t = await client.query(
        `INSERT INTO tenants (name) VALUES ($1) RETURNING id`, [email.split('@')[0]]);
      tenantId = t.rows[0].id;
    }
    const u = await client.query(
      `INSERT INTO users (tenant_id, email, google_sub, role, email_verified)
       VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [tenantId, email, sub, role]);
    await client.query('COMMIT');
    const userId = u.rows[0].id;
    auditAs(tenantId, userId, 'auth.register', ip, ua,
      { provider: 'google', invited: inv.rows.length > 0 });
    return userId;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ─── GET /google — kick off the OAuth consent flow ───────────────────────────
auth.get('/google',
  rateLimit({ scope: 'oauth-start', keyFn: ipKey, limit: 20, windowSeconds: 60 }),
  (_req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ error: 'Google OAuth is not configured' });
    }
    const state = randomToken();
    res.cookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: STATE_TTL_MINUTES * 60 * 1000,
      path: '/api/auth',
    });
    const url = oauthClient().generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state,
    });
    res.redirect(url);
  });

// ─── GET /google/callback — exchange code, provision, set session cookie ─────
auth.get('/google/callback', async (req, res) => {
  const code = req.query.code ? String(req.query.code) : '';
  const state = req.query.state ? String(req.query.state) : '';
  const cookieState = req.cookies?.oauth_state;
  res.clearCookie('oauth_state', { path: '/api/auth' });

  if (!code || !state || !cookieState || state !== cookieState) {
    return res.redirect(`${APP_URL}/login?error=oauth_state`);
  }

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return res.redirect(`${APP_URL}/login?error=oauth_token`);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const sub = payload?.sub;
    const email = payload?.email?.toLowerCase();
    if (!sub || !email || payload?.email_verified === false) {
      return res.redirect(`${APP_URL}/login?error=oauth_profile`);
    }

    const userId = await resolveGoogleUser(
      sub, email, req.ip ?? null, req.get('user-agent') ?? null);
    const refresh = await issueRefreshToken(userId);
    setRefreshCookie(res, refresh);
    res.redirect(APP_URL);
  } catch (e: any) {
    console.error('google oauth callback failed', e?.message ?? e);
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
});

// ─── POST /refresh ──────────────────────────────────────────────────────────
auth.post('/refresh', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'no refresh token' });
  const hash = sha256(token);

  const { rows } = await pool.query(
    `SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash=$1`, [hash]);
  const row = rows[0];
  if (!row) return res.status(401).json({ error: 'invalid refresh token' });
  if (row.revoked_at) {
    // Reuse detected → revoke entire chain for this user. Session-hijack defense.
    await pool.query(`UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [row.user_id]);
    return res.status(401).json({ error: 'refresh token reuse detected' });
  }
  if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: 'refresh token expired' });

  await pool.query(`UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1`, [row.id]);
  const u = await pool.query(
    `SELECT id, tenant_id, email, role, email_verified FROM users WHERE id=$1`, [row.user_id]);
  const user = u.rows[0];
  const access = signAccessToken({
    sub: user.id, tenantId: user.tenant_id, email: user.email,
    role: user.role, emailVerified: user.email_verified });
  const newRefresh = await issueRefreshToken(user.id);
  setRefreshCookie(res, newRefresh);
  res.json({ accessToken: access, user });
});

// ─── POST /logout ───────────────────────────────────────────────────────────
auth.post('/logout', async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    await pool.query(`UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL`,
      [sha256(token)]);
  }
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.json({ ok: true });
});

// ─── GET /me ────────────────────────────────────────────────────────────────
auth.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.tenant_id, u.email, u.role, u.email_verified, t.name AS tenant_name
       FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1`,
    [req.tenant.userId]);
  if (!rows.length) return res.status(404).json({ error: 'user not found' });
  res.json({ user: rows[0] });
});

// ─── GET /accept-invite — validate token (used by the /accept-invite UI) ─────
auth.get('/accept-invite', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) return res.status(400).json({ error: 'token required' });
  const { rows } = await pool.query(
    `SELECT i.email, i.role, i.expires_at, t.name AS tenant_name
       FROM user_invitations i JOIN tenants t ON t.id=i.tenant_id
       WHERE i.token_hash=$1 AND i.accepted_at IS NULL`,
    [sha256(token)]);
  if (!rows.length) return res.status(400).json({ error: 'invalid or used token' });
  if (new Date(rows[0].expires_at) < new Date()) return res.status(400).json({ error: 'token expired' });
  res.json({ email: rows[0].email, role: rows[0].role, tenantName: rows[0].tenant_name });
});
