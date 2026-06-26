// A6 — load a non-OAuth credential instance (connector_instances kind=credential)
// for sink/source connectors that bring-your-own destination. Secrets were
// encrypted by the API (crypto/tokenEnc.ts) with the shared
// OAUTH_TOKEN_ENCRYPTION_KEY; decrypt is the same routine oauth-client uses.

import { pool } from '../db';
import { decrypt } from './oauth-client';

export interface CredentialInstance {
  provider: string;
  kind: string;
  secret: Record<string, any>;        // decrypted (e.g. { password } | { apiKey })
  extra: Record<string, any>;         // non-secret params (host/port/database/user/baseUrl)
}

export async function loadCredentialInstance(connectionId: string, tenantId: string): Promise<CredentialInstance> {
  const { rows } = await pool.query(
    `SELECT provider, kind, secret, extra FROM connector_instances
       WHERE id = $1 AND tenant_id = $2 AND kind = 'credential'`,
    [connectionId, tenantId]);
  if (!rows.length) throw new Error(`credential instance ${connectionId} not found for tenant ${tenantId} (wrong instance kind?)`);
  const r = rows[0];
  return {
    provider: r.provider,
    kind: r.kind,
    secret: r.secret ? JSON.parse(decrypt(r.secret)) : {},
    extra: r.extra ?? {},
  };
}
