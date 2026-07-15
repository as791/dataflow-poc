import fs from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('usage: node scripts/render-helm-secrets.mjs <input.env> <output.yaml>');
}

const mapping = {
  JWT_ACCESS_SECRET: 'jwt',
  OAUTH_TOKEN_ENCRYPTION_KEY: 'oauthKey',
  TEMPORAL_PAYLOAD_ENCRYPTION_KEY: 'temporalPayloadKey',
  GOOGLE_CLIENT_ID: 'googleClientId',
  GOOGLE_CLIENT_SECRET: 'googleClientSecret',
  AZURE_CLIENT_ID: 'azureClientId',
  AZURE_CLIENT_SECRET: 'azureClientSecret',
  SMTP_FROM: 'smtpFrom',
  SMTP_USER: 'smtpUser',
  SMTP_PASS: 'smtpPass',
};

const values = new Map();
for (const rawLine of fs.readFileSync(inputPath, 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  let value = line.slice(separator + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
  }
  values.set(key, value);
}

const yaml = ['secrets:'];
for (const [envKey, helmKey] of Object.entries(mapping)) {
  const value = values.get(envKey);
  if (value && !value.includes('change-me')) yaml.push(`  ${helmKey}: ${JSON.stringify(value)}`);
}
fs.writeFileSync(outputPath, `${yaml.join('\n')}\n`, { mode: 0o600 });
