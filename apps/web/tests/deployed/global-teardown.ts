import { execFileSync } from 'node:child_process';
import { bucket } from './external';

export default function teardown() {
  // ponytail: the bucket is dedicated to QA; deleting its runs prefix is safer than per-test cleanup that is skipped on process crashes.
  execFileSync('aws', ['s3', 'rm', `s3://${bucket}/runs/`, '--recursive'], { stdio: 'inherit' });
}
