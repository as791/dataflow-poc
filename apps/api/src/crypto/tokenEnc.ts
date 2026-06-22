// AES-256-GCM envelope for OAuth tokens at rest.
//
// Format on disk: base64(iv) ":" base64(tag) ":" base64(ciphertext)
//
// OAUTH_TOKEN_ENCRYPTION_KEY is a 32-byte key, hex-encoded (64 chars).
// Generate one with: `openssl rand -hex 32`.
//
// Phase 6 replaces this with a per-tenant DEK wrapped by KMS; the on-disk
// format will keep the same `iv:tag:ct` shape so migration is just a re-wrap.

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

function key(): Buffer {
  const hex = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY not set');
  if (hex.length !== KEY_LEN * 2) {
    throw new Error(`OAUTH_TOKEN_ENCRYPTION_KEY must be ${KEY_LEN * 2} hex chars (got ${hex.length})`);
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptToken(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed encrypted token');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
