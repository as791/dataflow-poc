import { Router } from 'express';
import crypto from 'node:crypto';
import { pool, withTenantTx } from '../db';
import { requireAuth, requireVerified, requireOwner } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { sendInviteEmail } from '../email/mailer';

export const team = Router();
team.use(requireAuth, requireVerified);

const INVITE_TTL_HOURS = 24;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

team.post('/invitations', requireOwner, async (req, res) => {
  const { email, role } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const inviteRole = role === 'owner' ? 'owner' : 'member';

  const existing = await pool.query(`SELECT 1 FROM users WHERE email=$1`, [email]);
  if (existing.rowCount) return res.status(409).json({ error: 'user already exists' });

  const token = randomToken();
  const tenantId = req.tenant.tenantId;

  await withTenantTx(req, client =>
    client.query(
      `INSERT INTO user_invitations (token_hash, tenant_id, invited_by, email, role, expires_at)
       VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' hours')::interval)`,
      [sha256(token), tenantId, req.tenant.userId, email, inviteRole, String(INVITE_TTL_HOURS)]));

  const t = await pool.query(`SELECT name FROM tenants WHERE id=$1`, [tenantId]);
  try {
    await sendInviteEmail(email, token, t.rows[0]?.name ?? 'your team', req.tenant.email ?? '');
  } catch (e: any) {
    await withTenantTx(req, client =>
      client.query(
        `DELETE FROM user_invitations
          WHERE token_hash=$1 AND tenant_id=$2 AND accepted_at IS NULL`,
        [sha256(token), tenantId]));
    console.error('invite email failed', e.message);
    return res.status(502).json({ error: 'invite email failed to send' });
  }

  auditLog(req, 'team.invited', email, { role: inviteRole });
  res.status(201).json({ ok: true, expiresInHours: INVITE_TTL_HOURS });
});

team.get('/invitations', requireOwner, async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT email, role, expires_at, accepted_at, created_at
       FROM user_invitations WHERE accepted_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`));
  res.json(rows.rows);
});

team.delete('/invitations/:email', requireOwner, async (req, res) => {
  await withTenantTx(req, c => c.query(
    `DELETE FROM user_invitations WHERE email=$1 AND accepted_at IS NULL`,
    [req.params.email]));
  auditLog(req, 'team.invite_revoked', req.params.email);
  res.json({ ok: true });
});

team.get('/members', async (req, res) => {
  // Users table doesn't have RLS (login looks up by email pre-auth); filter manually.
  const { rows } = await pool.query(
    `SELECT id, email, role, email_verified, created_at FROM users WHERE tenant_id=$1 ORDER BY created_at`,
    [req.tenant.tenantId]);
  res.json(rows);
});
