import http from 'node:http';
import https from 'node:https';

const secret = process.argv[2] ?? 'dataflow-secrets';

function get(url, headers = {}) {
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(url, { headers, timeout: 3000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) resolve(body);
        else reject(new Error(`GET ${url} returned ${response.statusCode}`));
      });
    });
    request.on('timeout', () => request.destroy(new Error(`GET ${url} timed out`)));
    request.on('error', reject);
  });
}

const metadataHeaders = { 'Metadata-Flavor': 'Google' };
const metadata = 'http://metadata.google.internal/computeMetadata/v1';
const project = await get(`${metadata}/project/project-id`, metadataHeaders);
const token = JSON.parse(await get(`${metadata}/instance/service-accounts/default/token`, metadataHeaders)).access_token;
const resource = encodeURIComponent(secret);
const version = JSON.parse(await get(
  `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(project)}/secrets/${resource}/versions/latest:access`,
  { Authorization: `Bearer ${token}` },
));
if (!version.payload?.data) throw new Error(`secret ${secret} has no payload`);
process.stdout.write(Buffer.from(version.payload.data, 'base64').toString('utf8'));
