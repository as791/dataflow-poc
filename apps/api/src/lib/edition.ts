import type { RequestHandler } from 'express';

// ─── Open-core edition seam ────────────────────────────────────────────────
// DataFlow is open core: the whole pipeline product — authoring (incl. the AI
// builder), connectors, environments, execution — is free in the community
// edition. A small set of operational/governance features unlock in the
// enterprise edition. Set EDITION=enterprise to enable them.

export type Edition = 'community' | 'enterprise';

export function edition(): Edition {
  return process.env.EDITION === 'enterprise' ? 'enterprise' : 'community';
}
export function isEnterprise(): boolean {
  return edition() === 'enterprise';
}

// Feature flags surfaced to the UI and enforced server-side. Core features are
// intentionally absent here — they are always on. Add enterprise-only features
// as the seam grows (SSO/SAML, advanced RBAC, unlimited seats, …).
export interface Features {
  auditExport: boolean;
  sso: boolean;
  advancedRbac: boolean;
}

export function features(): Features {
  const ent = isEnterprise();
  return { auditExport: ent, sso: ent, advancedRbac: ent };
}

// Gate an enterprise-only route. Community returns 402 with an upgrade hint so
// the boundary is discoverable rather than a silent 404.
export function requireEnterprise(feature: keyof Features): RequestHandler {
  return (_req, res, next) => {
    if (features()[feature]) return next();
    res.status(402).json({
      error: 'This feature requires the DataFlow enterprise edition.',
      feature,
      edition: edition(),
    });
  };
}
