import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { TenantContext } from '@dataflow/shared';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me';
const ACCESS_TTL_SECONDS = 15 * 60;

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

// Reads the bearer token, populates req.tenant. Routes that need an
// email-verified user should chain `requireVerified` after this.
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const claims = verifyAccessToken(header.slice(7));
    const ctx: TenantContext = {
      tenantId: claims.tenantId,
      userId: claims.sub,
      email: claims.email,
      role: claims.role,
      emailVerified: claims.emailVerified,
    };
    req.tenant = ctx;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
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
