/**
 * Temporal payload codec — shared with apps/worker/src/temporal-data-converter.ts.
 * Both must be kept in sync: the same key and wire format must be used by
 * both sides (API client encodes, worker decodes, and vice versa).
 *
 * Wire format: 12-byte IV || 16-byte GCM auth tag || ciphertext
 * Encoding label: "binary/encrypted+aes-gcm"
 */

import crypto from 'crypto';
import type { Payload } from '@temporalio/client';

const ENCODING_LABEL = 'binary/encrypted+aes-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.TEMPORAL_PAYLOAD_ENCRYPTION_KEY;
  if (!raw) return Buffer.alloc(0); // no-op in dev without a key
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

export class EncryptionCodec {
  async encode(payloads: Payload[]): Promise<Payload[]> {
    const key = getKey();
    if (key.length === 0) return payloads;
    return payloads.map(payload => ({
      metadata: {
        encoding: Buffer.from(ENCODING_LABEL),
        ...(payload.metadata?.encoding
          ? { originalEncoding: payload.metadata.encoding }
          : {}),
      },
      data: encrypt(payload.data ?? new Uint8Array(), key),
    }));
  }

  async decode(payloads: Payload[]): Promise<Payload[]> {
    const key = getKey();
    if (key.length === 0) return payloads;
    return payloads.map(payload => {
      const label = payload.metadata?.encoding
        ? Buffer.from(payload.metadata.encoding).toString()
        : '';
      if (label !== ENCODING_LABEL) return payload;
      const plaintext = decrypt(payload.data ?? new Uint8Array(), key);
      const originalEncoding = payload.metadata?.originalEncoding;
      return {
        metadata: { encoding: originalEncoding ?? Buffer.from('json/plain') },
        data: plaintext,
      };
    });
  }
}

export const encryptedDataConverter = {
  payloadCodecs: [new EncryptionCodec()],
};
