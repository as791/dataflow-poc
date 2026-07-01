import SftpClient from 'ssh2-sftp-client';
import type { Handler, SourceFn } from '@dataflow/connector-sdk';
import { loadCredentialInstance } from './credentials';

async function connect(connectionId: string, tenantId: string) {
  const instance = await loadCredentialInstance(connectionId, tenantId);
  if (instance.provider !== 'sftp') throw new Error(`connector ${connectionId} is not SFTP`);
  const client = new SftpClient();
  await client.connect({
    host: instance.extra.host, port: Number(instance.extra.port) || 22,
    username: instance.extra.user, password: instance.secret.password || undefined,
    privateKey: instance.secret.privateKey || undefined,
    readyTimeout: 15_000,
  });
  return client;
}

function parse(text: string, format: string): any[] {
  const value = format === 'json' ? JSON.parse(text)
    : text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  return Array.isArray(value) ? value : [value];
}

export const sftpFetch: SourceFn = async ({ config, cursor, tenantId }) => {
  const connectionId = String(config.connectionId ?? ''), path = String(config.path ?? '');
  if (!connectionId || !path) throw new Error('sftp.fetch: connectionId and path are required');
  const client = await connect(connectionId, tenantId);
  try {
    const stat = await client.stat(path);
    if (cursor.mtime === stat.modifyTime) return { records: [], nextCursor: cursor, hasMore: false };
    if (stat.size > 25 * 1024 * 1024) throw new Error('sftp.fetch: file exceeds 25MB limit');
    const data = await client.get(path);
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    return { records: parse(text, String(config.format ?? 'jsonl')), nextCursor: { mtime: stat.modifyTime }, hasMore: false };
  } finally { await client.end(); }
};

export const sftpSink: Handler = async (input, config, ctx) => {
  const connectionId = String(config.connectionId ?? '');
  const path = String(config.path ?? '').replaceAll('{executionId}', ctx.executionId).replaceAll('{nodeId}', ctx.nodeId);
  if (!connectionId || !path) throw new Error('sink.sftp: connectionId and path are required');
  const format = String(config.format ?? 'jsonl');
  const body = format === 'json' ? JSON.stringify(input) : (input as any[]).map(row => JSON.stringify(row)).join('\n') + '\n';
  const client = await connect(connectionId, ctx.tenantId);
  try {
    const slash = path.lastIndexOf('/');
    if (slash > 0) await client.mkdir(path.slice(0, slash), true);
    await client.put(Buffer.from(body), path);
  } finally { await client.end(); }
  return null;
};
