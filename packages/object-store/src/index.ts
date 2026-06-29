import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

export interface PayloadStoreConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function payloadStoreConfig(
  env: NodeJS.ProcessEnv = process.env,
  bucketOverride?: string,
): PayloadStoreConfig | null {
  const bucket = bucketOverride?.trim() || env.PAYLOAD_S3_BUCKET?.trim();
  if (!bucket) return null;
  const accessKeyId = env.PAYLOAD_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.PAYLOAD_S3_SECRET_ACCESS_KEY?.trim();
  if (!!accessKeyId !== !!secretAccessKey) throw new Error('PAYLOAD_S3_ACCESS_KEY_ID and PAYLOAD_S3_SECRET_ACCESS_KEY must be set together');
  return {
    bucket,
    region: env.PAYLOAD_S3_REGION?.trim() || 'us-east-1',
    endpoint: env.PAYLOAD_S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: env.PAYLOAD_S3_FORCE_PATH_STYLE === 'true',
    accessKeyId,
    secretAccessKey,
  };
}

export function payloadObjectKey(
  tenantId: string, executionId: string, nodeId: string, id: string = randomUUID(),
): string {
  const part = (value: string) => encodeURIComponent(value);
  return `payloads/${part(tenantId)}/${part(executionId)}/${part(nodeId)}/${part(id)}.json.enc`;
}

const clients = new Map<string, S3Client>();
function client(config: PayloadStoreConfig): S3Client {
  const key = JSON.stringify(config);
  let value = clients.get(key);
  if (!value) {
    const options: S3ClientConfig = {
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      ...(config.accessKeyId && config.secretAccessKey ? {
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      } : {}),
    };
    value = new S3Client(options); clients.set(key, value);
  }
  return value;
}

export async function putPayloadObject(config: PayloadStoreConfig, key: string, body: string): Promise<void> {
  await client(config).send(new PutObjectCommand({
    Bucket: config.bucket, Key: key, Body: body, ContentType: 'application/octet-stream',
  }));
}

export async function getPayloadObject(config: PayloadStoreConfig, key: string): Promise<string> {
  const result = await client(config).send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  if (!result.Body) throw new Error(`payload object ${key} has no body`);
  if ('transformToString' in result.Body) return result.Body.transformToString();
  const chunks: Buffer[] = [];
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}

export async function deletePayloadObject(config: PayloadStoreConfig, key: string): Promise<void> {
  await client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
