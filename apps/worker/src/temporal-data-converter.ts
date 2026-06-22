/**
 * Temporal payload codec — AES-256-GCM encryption at the SDK layer.
 *
 * This is defense-in-depth: Temporal's own storage (Cassandra) holds only
 * ciphertext. Even a compromised Temporal cluster cannot read workflow
 * history in plaintext.
 *
 * The key is a 32-byte symmetric secret in TEMPORAL_PAYLOAD_ENCRYPTION_KEY
 * (base64-encoded). It is NOT the per-user DEK — that lives in workflow
 * input already wrapped with the worker's RSA public key. This key covers
 * all payloads (input, output, signals, queries, side effects).
 *
 * Wire format: 12-byte IV || 16-byte GCM auth tag || ciphertext
 * Encoding label: "binary/encrypted+aes-gcm"
 */

import crypto from 'crypto';
import type { Payload } from '@temporalio/common';

const ENCODING_LABEL = 'binary/encrypted+aes-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.TEMPORAL_PAYLOAD_ENCRYPTION_KEY;
  if (!raw) {
    // No key configured — passthrough (dev without encryption).
    return Buffer.alloc(0);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `TEMPORAL_PAYLOAD_ENCRYPTION_KEY must be 32 bytes base64-encoded (got ${key.length} bytes)`,
    );
  }
  return key;
}

function encrypt(plaintext: Uint8Array, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: IV | tag | ciphertext
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(blob: Uint8Array, key: Buffer): Buffer {
  const buf = Buffer.from(blob);
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Temporal PayloadCodec that AES-256-GCM encrypts every payload.
 * When TEMPORAL_PAYLOAD_ENCRYPTION_KEY is unset the codec is a no-op
 * so local dev without a key still works.
 */
export class EncryptionCodec {
  async encode(payloads: Payload[]): Promise<Payload[]> {
    const key = getKey();
    if (key.length === 0) return payloads;

    return payloads.map(payload => {
      const plaintext = payload.data ?? new Uint8Array();
      const blob = encrypt(plaintext, key);
      return {
        metadata: {
          encoding: Buffer.from(ENCODING_LABEL),
          // Preserve original encoding so decode can log/debug if needed.
          ...(payload.metadata?.encoding
            ? { originalEncoding: payload.metadata.encoding }
            : {}),
        },
        data: blob,
      };
    });
  }

  async decode(payloads: Payload[]): Promise<Payload[]> {
    const key = getKey();
    if (key.length === 0) return payloads;

    return payloads.map(payload => {
      const encoding = payload.metadata?.encoding;
      const label = encoding ? Buffer.from(encoding).toString() : '';
      if (label !== ENCODING_LABEL) return payload;

      const plaintext = decrypt(payload.data ?? new Uint8Array(), key);
      const originalEncoding = payload.metadata?.originalEncoding;
      return {
        metadata: {
          encoding: originalEncoding ?? Buffer.from('json/plain'),
        },
        data: plaintext,
      };
    });
  }
}

/** DataConverter config to pass to Client and Worker.create(). */
export const encryptedDataConverter = {
  payloadCodecs: [new EncryptionCodec()],
};
