import type { Handler, SourceFn } from '@dataflow/connector-sdk';
import { loadCredentialInstance } from './credentials';

async function connect(connectionId: string, tenantId: string) {
  const inst = await loadCredentialInstance(connectionId, tenantId);
  if (inst.provider !== 's3') throw new Error(`connector ${connectionId} is not S3`);
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: inst.extra.region ?? 'us-east-1', endpoint: inst.extra.endpoint || undefined,
    forcePathStyle: !!inst.extra.forcePathStyle,
    credentials: { accessKeyId: inst.secret.accessKeyId, secretAccessKey: inst.secret.secretAccessKey },
  });
}

const bodyText = async (body: any) => body?.transformToString ? body.transformToString() : '';

export const s3Fetch: SourceFn = async ({ config, tenantId }) => {
  const connectionId = String(config.connectionId ?? '');
  const bucket = String(config.bucket ?? '');
  const key = String(config.key ?? '');
  const format = String(config.format ?? 'jsonl');
  if (!connectionId || !bucket || !key) throw new Error('s3.fetch: connectionId, bucket, and key are required');
  const client = await connect(connectionId, tenantId);
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    // ponytail: bounded single-object read; multipart streaming when customers need >25MB objects.
    if ((out.ContentLength ?? 0) > 25 * 1024 * 1024) throw new Error('s3.fetch: object exceeds MVP 25MB limit');
    const text = await bodyText(out.Body);
    const parsed = format === 'json'
      ? JSON.parse(text)
      : text.split(/\r?\n/).filter(Boolean).map((line: string) => JSON.parse(line));
    return { records: Array.isArray(parsed) ? parsed : [parsed], nextCursor: {}, hasMore: false };
  } finally { client.destroy(); }
};

export const s3Sink: Handler = async (input, config, ctx) => {
  const records = input as any[];
  const connectionId = String(config.connectionId ?? '');
  const bucket = String(config.bucket ?? '');
  const template = String(config.key ?? 'exports/{executionId}.jsonl');
  const format = String(config.format ?? 'jsonl');
  if (!connectionId || !bucket) throw new Error('sink.s3: connectionId and bucket are required');
  const key = template.replaceAll('{executionId}', ctx.executionId).replaceAll('{nodeId}', ctx.nodeId);
  const body = format === 'json' ? JSON.stringify(records) : records.map(r => JSON.stringify(r)).join('\n') + '\n';
  const client = await connect(connectionId, ctx.tenantId);
  try {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: format === 'json' ? 'application/json' : 'application/x-ndjson' }));
  } finally { client.destroy(); }
  return null;
};
