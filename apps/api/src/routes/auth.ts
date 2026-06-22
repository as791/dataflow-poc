import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { pool, withTenant, withTenantTx } from '../db';
import { signAccessToken, requireAuth } from '../middleware/auth';
import { auditAs } from '../middleware/audit';
import { rateLimit, ipKey } from '../middleware/rateLimit';
import { sendVerificationEmail } from '../email/mailer';

export const auth = Router();

const REFRESH_TTL_DAYS = 30;
const VERIFY_TTL_HOURS = 24;
const BCRYPT_COST = 12;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

function setRefreshCookie(res: any, token: string) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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

// ─── POST /register ─────────────────────────────────────────────────────────
auth.post('/register',
  rateLimit({ scope: 'register', keyFn: ipKey, limit: 5, windowSeconds: 60 }),
  async (req, res) => {
    const { email, password, tenantName } = req.body ?? {};
    if (!email || !password || !tenantName) return res.status(400).json({ error: 'email, password, tenantName required' });
    if (password.length < 8) return res.status(400).json({ error: 'password too short' });

    const existing = await pool.query(`SELECT 1 FROM users WHERE email=$1`, [email]);
    if (existing.rowCount) return res.status(409).json({ error: 'email already registered' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const t = await client.query(`INSERT INTO tenants (name) VALUES ($1) RETURNING id`, [tenantName]);
      const tenantId = t.rows[0].id;
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      const u = await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, role, email_verified)
         VALUES ($1,$2,$3,'owner',false) RETURNING id`,
        [tenantId, email, hash]);
      const userId = u.rows[0].id;

      const token = randomToken();
      await client.query(
        `INSERT INTO email_verifications (token_hash, user_id, expires_at)
         VALUES ($1,$2, now() + ($3 || ' hours')::interval)`,
        [sha256(token), userId, String(VERIFY_TTL_HOURS)]);
      await client.query('COMMIT');

      // Best-effort email; verification can be re-requested if this fails.
      sendVerificationEmail(email, token).catch(e =>
        console.error('verification email send failed', e.message));

      auditAs(tenantId, userId, 'auth.register',
        (req.ip ?? null), req.get('user-agent') ?? null, { email });

      res.status(201).json({ message: 'Check your email to verify your account.' });
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('register failed', e);
      res.status(500).json({ error: 'registration failed' });
    } finally {
      client.release();
    }
  });

// ─── GET /verify ────────────────────────────────────────────────────────────
auth.get('/verify', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) return res.status(400).json({ error: 'token required' });
  const { rows } = await pool.query(
    `SELECT user_id FROM email_verifications WHERE token_hash=$1 AND expires_at > now()`,
    [sha256(token)]);
  if (!rows.length) return res.status(400).json({ error: 'invalid or expired token' });
  const userId = rows[0].user_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET email_verified=true WHERE id=$1`, [userId]);
    await client.query(`DELETE FROM email_verifications WHERE user_id=$1`, [userId]);
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  const u = await pool.query(
    `SELECT id, tenant_id, email, role, email_verified FROM users WHERE id=$1`, [userId]);
  const user = u.rows[0];
  const access = signAccessToken({
    sub: user.id, tenantId: user.tenant_id, email: user.email,
    role: user.role, emailVerified: user.email_verified });
  const refresh = await issueRefreshToken(user.id);
  setRefreshCookie(res, refresh);
  auditAs(user.tenant_id, user.id, 'auth.email_verified',
    req.ip ?? null, req.get('user-agent') ?? null);
  res.json({ accessToken: access, user });
});

// ─── POST /resend-verification ──────────────────────────────────────────────
auth.post('/resend-verification',
  rateLimit({ scope: 'resend', keyFn: req => String(req.body?.email ?? ipKey(req)), limit: 1, windowSeconds: 60 }),
  async (req, res) => {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const { rows } = await pool.query(
      `SELECT id, email_verified FROM users WHERE email=$1`, [email]);
    if (!rows.length || rows[0].email_verified) return res.json({ ok: true });

    const token = randomToken();
    await pool.query(
      `INSERT INTO email_verifications (token_hash, user_id, expires_at)
       VALUES ($1,$2, now() + interval '24 hours')
       ON CONFLICT (token_hash) DO NOTHING`,
      [sha256(token), rows[0].id]);
    sendVerificationEmail(email, token).catch(e => console.error(e.message));
    res.json({ ok: true });
  });

// ─── POST /login ────────────────────────────────────────────────────────────
auth.post('/login',
  rateLimit({ scope: 'login', keyFn: ipKey, limit: 10, windowSeconds: 60 }),
  async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const { rows } = await pool.query(
      `SELECT id, tenant_id, email, password_hash, role, email_verified FROM users WHERE email=$1`, [email]);
    const user = rows[0];
    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    if (!user.email_verified) return res.status(403).json({ error: 'email not verified' });

    const access = signAccessToken({
      sub: user.id, tenantId: user.tenant_id, email: user.email,
      role: user.role, emailVerified: user.email_verified });
    const refresh = await issueRefreshToken(user.id);
    setRefreshCookie(res, refresh);
    auditAs(user.tenant_id, user.id, 'auth.login',
      req.ip ?? null, req.get('user-agent') ?? null);
    res.json({
      accessToken: access,
      user: { id: user.id, tenantId: user.tenant_id, email: user.email,
              role: user.role, emailVerified: user.email_verified },
    });
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
    `SELECT u.id, u.tenant_id, u.email, u.role, u.email_verified, t.name AS tenant_name,
            u.pbkdf2_salt, u.encrypted_dek_password, u.password_dek_iv
       FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1`,
    [req.tenant.userId]);
  if (!rows.length) return res.status(404).json({ error: 'user not found' });
  res.json({ user: rows[0] });
});

// ─── Google OAuth — future ───────────────────────────────────────────────────
auth.get('/google', (_req, res) =>
  res.status(501).json({ error: 'Google OAuth ships in Phase 1.5' }));
auth.get('/google/callback', (_req, res) =>
  res.status(501).json({ error: 'Google OAuth ships in Phase 1.5' }));

// ═══ Phase 6 KMS — /keys/* endpoints ══════════════════════════════════════════

// ─── POST /keys/init ─────────────────────────────────────────────────────────
// Store all encrypted key blobs produced by the browser at signup.
// The server stores opaque ciphertext — it can never decrypt any of them.
auth.post('/keys/init', requireAuth, async (req, res) => {
  const {
    encDekPassword, dekIv, encDekRecovery, recoveryDekIv, salt,
    publicKey, encryptedPrivateKey, privateKeyIv,
  } = req.body ?? {};

  if (!encDekPassword || !dekIv || !encDekRecovery || !recoveryDekIv ||
      !salt || !publicKey || !encryptedPrivateKey || !privateKeyIv) {
    return res.status(400).json({ error: 'missing key material fields' });
  }

  await pool.query(
    `UPDATE users SET
       pbkdf2_salt=$1, encrypted_dek_password=$2, password_dek_iv=$3,
       encrypted_dek_recovery=$4, recovery_dek_iv=$5,
       public_key=$6, encrypted_private_key=$7
     WHERE id=$8`,
    [salt, encDekPassword, dekIv, encDekRecovery, recoveryDekIv,
     publicKey, encryptedPrivateKey, req.tenant.userId]);

  res.json({ ok: true });
});

// ─── GET /keys/recovery-info ─────────────────────────────────────────────────
// Returns public key material needed for password recovery. No auth required.
auth.get('/keys/recovery-info', async (req, res) => {
  const email = String(req.query.email ?? '');
  if (!email) return res.status(400).json({ error: 'email required' });

  const { rows } = await pool.query(
    `SELECT pbkdf2_salt, encrypted_dek_recovery, recovery_dek_iv
       FROM users WHERE email=$1`,
    [email]);

  if (!rows.length || !rows[0].pbkdf2_salt) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(rows[0]);
});

// ─── POST /keys/rotate-password ──────────────────────────────────────────────
// Updates the password-encrypted DEK blob after recovery via phrase.
auth.post(
  '/keys/rotate-password',
  rateLimit({ scope: 'key-rotate', keyFn: ipKey, limit: 5, windowSeconds: 60 }),
  async (req, res) => {
    const { email, newEncDekPassword, newDekIv, newSalt } = req.body ?? {};
    if (!email || !newEncDekPassword || !newDekIv || !newSalt) {
      return res.status(400).json({ error: 'missing fields' });
    }

    const { rows } = await pool.query(
      `SELECT id, tenant_id FROM users WHERE email=$1`, [email]);
    if (!rows.length) return res.status(404).json({ error: 'user not found' });
    const { id: userId, tenant_id: tenantId } = rows[0];

    await pool.query(
      `UPDATE users SET
         pbkdf2_salt=$1, encrypted_dek_password=$2, password_dek_iv=$3,
         recovery_phrase_used_at=now()
       WHERE id=$4`,
      [newSalt, newEncDekPassword, newDekIv, userId]);

    // Audit log
    await pool.query(
      `INSERT INTO key_rotation_log (tenant_id, user_id, reason) VALUES ($1,$2,$3)`,
      [tenantId, userId, 'password_recovery']);

    auditAs(tenantId, userId, 'auth.key_rotate',
      req.ip ?? null, req.get('user-agent') ?? null, { reason: 'password_recovery' });

    res.json({ ok: true });
  });

// ─── GET /keys/share/:userId ──────────────────────────────────────────────────
// Owner fetches a sub-user's public key so it can encrypt the DEK for them.
auth.get('/keys/share/:userId', requireAuth, async (req, res) => {
  if (req.tenant.role !== 'owner') return res.status(403).json({ error: 'owner only' });

  const { rows } = await pool.query(
    `SELECT public_key FROM users WHERE id=$1 AND tenant_id=$2`,
    [req.params.userId, req.tenant.tenantId]);
  if (!rows.length) return res.status(404).json({ error: 'user not found' });
  res.json({ publicKey: rows[0].public_key });
});

// ─── POST /keys/share ────────────────────────────────────────────────────────
// Owner encrypts its DEK with the sub-user's public key and stores it.
auth.post('/keys/share', requireAuth, async (req, res) => {
  if (req.tenant.role !== 'owner') return res.status(403).json({ error: 'owner only' });

  const { targetUserId, encryptedDek } = req.body ?? {};
  if (!targetUserId || !encryptedDek) {
    return res.status(400).json({ error: 'missing fields' });
  }

  await withTenantTx(req, c => c.query(
    `INSERT INTO user_key_shares (from_user_id, to_user_id, tenant_id, encrypted_dek)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, to_user_id)
       DO UPDATE SET encrypted_dek=$4, from_user_id=$1`,
    [req.tenant.userId, targetUserId, req.tenant.tenantId, encryptedDek]));

  res.json({ ok: true });
});

// ─── GET /keys/my-share ───────────────────────────────────────────────────────
// Sub-user retrieves its RSA-wrapped DEK share, then decrypts with private key.
auth.get('/keys/my-share', requireAuth, async (req, res) => {
  const result = await withTenantTx(req, c => c.query(
    `SELECT encrypted_dek FROM user_key_shares
       WHERE to_user_id=$1 AND tenant_id=$2`,
    [req.tenant.userId, req.tenant.tenantId]));

  if (!result.rows.length) return res.status(404).json({ error: 'no share found' });
  res.json({ encryptedDek: result.rows[0].encrypted_dek });
});

// ─── GET /keys/worker-public-key ─────────────────────────────────────────────
// Returns the worker's RSA public key so the browser can wrap the DEK before
// dispatching a workflow. Authenticated — must be signed-in user.
auth.get('/keys/worker-public-key', requireAuth, async (_req, res) => {
  const pub = process.env.WORKER_PUBLIC_KEY_PEM;
  if (!pub) return res.status(503).json({ error: 'worker public key not configured' });
  res.json({ publicKeyPem: pub });
});

// ─── Accept-invite: validate token (used by /accept-invite UI) ──────────────
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

auth.post('/accept-invite',
  rateLimit({ scope: 'accept-invite', keyFn: ipKey, limit: 10, windowSeconds: 60 }),
  async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!token || !password) return res.status(400).json({ error: 'token and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'password too short' });

    const { rows } = await pool.query(
      `SELECT tenant_id, email, role, expires_at, accepted_at FROM user_invitations WHERE token_hash=$1`,
      [sha256(token)]);
    const inv = rows[0];
    if (!inv) return res.status(400).json({ error: 'invalid token' });
    if (inv.accepted_at) return res.status(400).json({ error: 'invite already used' });
    if (new Date(inv.expires_at) < new Date()) return res.status(400).json({ error: 'invite expired' });

    const existing = await pool.query(`SELECT 1 FROM users WHERE email=$1`, [inv.email]);
    if (existing.rowCount) return res.status(409).json({ error: 'email already registered' });

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const client = await pool.connect();
    let userId: string;
    try {
      await client.query('BEGIN');
      const u = await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, role, email_verified)
         VALUES ($1,$2,$3,$4,true) RETURNING id`,
        [inv.tenant_id, inv.email, hash, inv.role]);
      userId = u.rows[0].id;
      await client.query(
        `UPDATE user_invitations SET accepted_at=now() WHERE token_hash=$1`, [sha256(token)]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const access = signAccessToken({
      sub: userId, tenantId: inv.tenant_id, email: inv.email,
      role: inv.role, emailVerified: true });
    const refresh = await issueRefreshToken(userId);
    setRefreshCookie(res, refresh);
    auditAs(inv.tenant_id, userId, 'auth.invite_accepted',
      req.ip ?? null, req.get('user-agent') ?? null, { email: inv.email });
    res.json({ accessToken: access, user: { id: userId, tenantId: inv.tenant_id,
      email: inv.email, role: inv.role, emailVerified: true } });
  });
