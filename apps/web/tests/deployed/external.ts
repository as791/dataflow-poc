import { execFileSync } from 'node:child_process';

export const bucket = process.env.AWS_QA_BUCKET ?? 'dataflow-integration-qa-726929246977';

export function aws(...args: string[]) {
  return execFileSync('aws', args, { encoding: 'utf8' });
}

export function readS3Json(key: string) {
  return JSON.parse(aws('s3', 'cp', `s3://${bucket}/${key}`, '-'));
}
