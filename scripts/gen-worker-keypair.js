#!/usr/bin/env node
/**
 * gen-worker-keypair.js
 *
 * Generates the worker's RSA-2048 key pair for the DataFlow KMS.
 *
 * Usage:
 *   node scripts/gen-worker-keypair.js
 *
 * Output:
 *   secrets/worker-keypair.pem   — PKCS#8 private key (mode 0o600)
 *   secrets/worker-keypair.pub   — SPKI public key
 *
 * The .pem file is mounted read-only into the worker container via
 * docker-compose.yml:
 *   volumes:
 *     - ./secrets/worker-keypair.pem:/secrets/worker-keypair.pem:ro
 *
 * The .pub content goes into your .env as:
 *   WORKER_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
 *
 * NEVER commit the .pem to git — it is in .gitignore.
 */

'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'secrets');
fs.mkdirSync(dir, { recursive: true });

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const privPath = path.join(dir, 'worker-keypair.pem');
const pubPath  = path.join(dir, 'worker-keypair.pub');

fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
fs.writeFileSync(pubPath,  publicKey);

console.log('✓ Generated secrets/worker-keypair.pem  (private — mode 600, never commit)');
console.log('✓ Generated secrets/worker-keypair.pub  (public)');
console.log('');
console.log('Paste this into your .env:');
console.log('');
console.log(`WORKER_PUBLIC_KEY_PEM="${publicKey.replace(/\n/g, '\\n')}"`);
