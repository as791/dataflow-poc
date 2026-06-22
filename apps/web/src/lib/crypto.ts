/**
 * WebCrypto API wrappers for DataFlow KMS.
 *
 * All cryptographic operations run entirely in the browser.
 * Keys are NEVER sent to the server in plaintext.
 *
 * Conventions:
 *  - AES-GCM uses 12-byte random IVs (NIST recommendation for GCM).
 *  - Strings are base64url-encoded (no padding, URL-safe).
 *  - DEK = Data Encryption Key (AES-256-GCM, for encrypting payloads)
 *  - KEK = Key Encryption Key (PBKDF2-derived from password/phrase, for wrapping DEK)
 */

const subtle = () => window.crypto.subtle;

// ─── Base64url helpers ────────────────────────────────────────────────────────

export function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function fromBase64url(s: string): Uint8Array {
  // Re-pad to multiple of 4
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Random bytes ─────────────────────────────────────────────────────────────

export function randomBytes(length: number): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(length));
}

// ─── DEK — AES-GCM-256 ──────────────────────────────────────────────────────

/** Generate a new Data Encryption Key (AES-GCM-256, extractable). */
export async function generateDEK(): Promise<CryptoKey> {
  return subtle().generateKey(
    { name: 'AES-GCM', length: 256 },
    true,      // extractable — needed so we can wrap/export
    ['encrypt', 'decrypt'],
  );
}

// ─── KEK — PBKDF2 → AES-GCM-256 ─────────────────────────────────────────────

/**
 * Derive a Key Encryption Key from a password (or recovery phrase) + salt.
 * Uses 600 000 PBKDF2-SHA-256 iterations (OWASP 2023 recommendation).
 */
export async function deriveKEK(
  password: string,
  salt: Uint8Array,
  iterations = 600_000,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await subtle().importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,     // not extractable — stays in-memory only
    ['encrypt', 'decrypt'],
  );
}

// ─── AES-GCM encrypt / decrypt ───────────────────────────────────────────────

/**
 * AES-GCM encrypt `data` with `key`.
 * Returns { ciphertext, iv } both base64url-encoded.
 * The auth tag (16 bytes) is appended to the ciphertext by SubtleCrypto.
 */
export async function encryptWithKey(
  data: ArrayBuffer,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(12);
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ciphertext: toBase64url(ciphertext), iv: toBase64url(iv) };
}

/**
 * AES-GCM decrypt.
 * `ciphertext` and `iv` must be base64url-encoded.
 */
export async function decryptWithKey(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  return subtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64url(iv) },
    key,
    fromBase64url(ciphertext),
  );
}

// ─── DEK export / import ─────────────────────────────────────────────────────

/** Export DEK as raw bytes (for wrapping with a KEK). */
export async function exportKeyRaw(key: CryptoKey): Promise<ArrayBuffer> {
  return subtle().exportKey('raw', key);
}

/** Import raw bytes as a DEK (AES-GCM-256, not extractable once imported for use). */
export async function importKeyRaw(raw: ArrayBuffer): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// ─── RSA-OAEP-2048 key pair ──────────────────────────────────────────────────

/** Generate an RSA-OAEP-2048 key pair for asymmetric DEK sharing. */
export async function generateRSAKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  const kp = await subtle().generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/** Export public key as a compact JSON string (JWK). */
export async function exportPublicKeyJWK(key: CryptoKey): Promise<string> {
  const jwk = await subtle().exportKey('jwk', key);
  return JSON.stringify(jwk);
}

/** Import a JWK-serialised RSA-OAEP public key. */
export async function importPublicKeyJWK(jwk: string): Promise<CryptoKey> {
  return subtle().importKey(
    'jwk',
    JSON.parse(jwk) as JsonWebKey,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt'],
  );
}

// ─── RSA private key — wrapped export / import ───────────────────────────────

/**
 * Export `privateKey` as PKCS#8, then AES-GCM encrypt with `wrapKey`.
 * Returns { ciphertext, iv } base64url-encoded.
 */
export async function exportPrivateKey(
  key: CryptoKey,
  wrapKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const pkcs8 = await subtle().exportKey('pkcs8', key);
  return encryptWithKey(pkcs8, wrapKey);
}

/**
 * AES-GCM decrypt then import as RSA-OAEP private key.
 */
export async function importPrivateKey(
  ciphertext: string,
  iv: string,
  wrapKey: CryptoKey,
): Promise<CryptoKey> {
  const pkcs8 = await decryptWithKey(ciphertext, iv, wrapKey);
  return subtle().importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt'],
  );
}

// ─── RSA-OAEP encrypt / decrypt ──────────────────────────────────────────────

/** RSA-OAEP encrypt `data` with `publicKey`. Returns base64url string. */
export async function rsaEncrypt(data: ArrayBuffer, publicKey: CryptoKey): Promise<string> {
  const ciphertext = await subtle().encrypt({ name: 'RSA-OAEP' }, publicKey, data);
  return toBase64url(ciphertext);
}

/** RSA-OAEP decrypt. `ciphertext` must be base64url-encoded. */
export async function rsaDecrypt(ciphertext: string, privateKey: CryptoKey): Promise<ArrayBuffer> {
  return subtle().decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64url(ciphertext));
}
