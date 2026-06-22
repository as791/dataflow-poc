/**
 * BIP39 helpers for DataFlow recovery phrase support.
 *
 * Uses the well-audited `bip39` npm package directly.
 * Provides a thin typed wrapper so the rest of the app
 * never has to import bip39 directly.
 */
import * as bip39Lib from 'bip39';

/**
 * Generate a random 24-word BIP39 mnemonic from 256 bits of entropy.
 * The phrase is shown ONCE to the user at signup; we never store it.
 */
export function generateMnemonic(): string {
  // 256 bits → 24 words
  return bip39Lib.generateMnemonic(256);
}

/**
 * Convert a mnemonic phrase into a 64-byte seed using PBKDF2.
 * Returns the raw Uint8Array (not the hex string the lib returns by default).
 */
export async function mnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
  const buf = await bip39Lib.mnemonicToSeed(mnemonic);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Validate a mnemonic string (word count, checksum).
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39Lib.validateMnemonic(mnemonic);
}

/**
 * Convert raw entropy bytes into a mnemonic string.
 * `entropy` should be 32 bytes (256 bits) for a 24-word phrase.
 */
export function entropyToMnemonic(entropy: Uint8Array): string {
  // bip39 expects a hex string or Buffer
  const hex = Array.from(entropy)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return bip39Lib.entropyToMnemonic(hex);
}
