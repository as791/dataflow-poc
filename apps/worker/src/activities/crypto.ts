/**
 * Worker crypto utilities for DataFlow KMS.
 *
 * The worker private key is loaded from disk (read-only file mount).
 * It is NEVER sent over the network. The server-side DEK is always
 * wrapped with the worker's RSA public key before leaving the browser,
 * so only this file can unwrap it.
 *
 * Key lifecycle per workflow execution:
 *  1. Browser wraps DEK with worker public key before dispatching.
 *  2. Temporal stores the wrapped DEK in workflow input (encrypted in-transit).
 *  3. Worker activity calls decryptDekFromWorkflowInput() → raw DEK Buffer.
 *  4. DEK is used in-process for this workflow's encrypt/decrypt operations.
 *  5. DEK is never written to disk, logs, or Temporal workflow history.
 */

import fs from 'fs';
import crypto from 'crypto';

/** Lazy-load the private key to avoid errors at import time when key not yet generated. */
const getWorkerPrivateKey = (): crypto.KeyObject =>
  crypto.createPrivateKey(
    fs.readFileSync(process.env.WORKER_PRIVATE_KEY_PATH ?? '/secrets/worker-keypair.pem'),
  );

// ─── RSA-OAEP unwrapping ─────────────────────────────────────────────────────

/**
 * Decrypt a browser-wrapped DEK using the worker's RSA private key.
 * `encryptedDek` is base64url-encoded RSA-OAEP ciphertext produced by the
 * browser's `rsaEncrypt()` helper in apps/web/src/lib/crypto.ts.
 */
export function decryptDekFromWorkflowInput(encryptedDek: string): Buffer {
  return crypto.privateDecrypt(
    {
      key: getWorkerPrivateKey(),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encryptedDek, 'base64url'),
  );
}

// ─── AES-256-GCM payload encrypt / decrypt ───────────────────────────────────

/**
 * Encrypt a data buffer with the DEK using AES-256-GCM.
 * Returns base64url-encoded { ciphertext, iv }.
 * The 16-byte GCM auth tag is appended to the ciphertext.
 */
export function encryptPayload(
  data: Buffer,
  dek: Buffer,
): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64url'),
    iv: iv.toString('base64url'),
  };
}

/**
 * Decrypt a payload encrypted by encryptPayload().
 * Expects the 16-byte auth tag appended to the ciphertext.
 */
export function decryptPayload(
  ciphertext: string,
  iv: string,
  dek: Buffer,
): Buffer {
  const enc = Buffer.from(ciphertext, 'base64url');
  const authTag = enc.subarray(enc.length - 16);
  const ciphertextOnly = enc.subarray(0, enc.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertextOnly), decipher.final()]);
}
