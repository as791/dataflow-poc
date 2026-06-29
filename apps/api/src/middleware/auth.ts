import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { TenantContext } from '@dataflow/shared';
import { pool } from '../db';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me';
const ACCESS_TTL_SECONDS = 15 * 60;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  email: string;
  role: 'owner' | 'member';
  emailVerified: boolean;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, ACCESS_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenClaims;
}

// Reads the bearer token (JWT or api_token), populates req.tenant.
// JWT path: fast, no DB. API token path: DB lookup, cached by hash.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'missing bearer token' });
  const token = header.slice(7);

  // ── JWT path (fast) ───────────────────────────────────────────────────────
  try {
    const claims = verifyAccessToken(token);
    req.tenant = {
      tenantId: claims.tenantId,
      userId: claims.sub,
      email: claims.email,
      role: claims.role,
      emailVerified: claims.emailVerified,
    };
    return next();
  } catch { /* fall through to API token path */ }

  // ── API token path (service accounts) ────────────────────────────────────
  try {
    const hash = sha256(token);
    const { rows } = await pool.query(
      `SELECT t.id, t.tenant_id, t.role, t.revoked_at, t.expires_at,
              u.email
       FROM api_tokens t
       JOIN users u ON u.id = t.created_by
       WHERE t.token_hash = $1`,
      [hash],
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'invalid token' });
    if (row.revoked_at) return res.status(401).json({ error: 'token revoked' });
    if (row.expires_at && new Date(row.expires_at) <= new Date()) {
      return res.status(401).json({ error: 'token expired' });
    }
    req.tenant = {
      tenantId: row.tenant_id,
      userId: row.id, // service account identity = token id
      email: `sa:${row.id}`,
      role: row.role,
      emailVerified: true,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
};

export const requireVerified: RequestHandler = (req, res, next) => {
  if (!req.tenant.emailVerified) return res.status(403).json({ error: 'email not verified' });
  next();
};

export const requireOwner: RequestHandler = (req, res, next) => {
  if (req.tenant.role !== 'owner') return res.status(403).json({ error: 'owner role required' });
  next();
};

// Pipeline-scoped access control.
// Workspace owners and the pipeline creator always pass.
// Other members need an explicit grant in pipeline_access with sufficient role.
const ROLE_RANK: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };

export function requirePipelineAccess(minRole: 'viewer' | 'editor' | 'admin' = 'editor'): RequestHandler {
  return async (req, res, next) => {
    // Workspace owners bypass all resource checks
    if (req.tenant.role === 'owner') return next();

    const rowId = req.params.rowId;
    if (!rowId) return res.status(400).json({ error: 'missing resource id' });

    try {
      const { rows } = await pool.query(
        `SELECT p.created_by, pa.role AS grant_role
         FROM pipelines p
         LEFT JOIN pipeline_access pa
           ON pa.pipeline_id = p.id AND pa.user_id = $2
         WHERE p.id = $1 AND p.tenant_id = $3
         LIMIT 1`,
        [rowId, req.tenant.userId, req.tenant.tenantId],
      );

      // Return 404 for both "not found" and "no access" — avoids leaking pipeline existence
      // to users who have no grant. Members with a grant see 403 with role detail.
      if (!rows.length) return res.status(404).json({ error: 'not found' });

      const { created_by, grant_role } = rows[0];
      if (created_by === req.tenant.userId) return next(); // creator: full access

      const grantRank = grant_role ? (ROLE_RANK[grant_role] ?? -1) : -1;
      if (grantRank === -1) return res.status(404).json({ error: 'not found' }); // no grant → 404, not 403
      if (grantRank < ROLE_RANK[minRole]) {
        return res.status(403).json({ error: `pipeline access requires ${minRole} role` });
      }
      next();
    } catch (err: any) {
      next(err);
    }
  };
}
