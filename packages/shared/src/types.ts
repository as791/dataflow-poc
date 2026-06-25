// ─── Pipeline definition: the contract between UI, API, and Temporal ───────

export type NodeType = 'source' | 'transform' | 'sink' | 'fork' | 'merge';

// M3: a pipeline version lives in exactly one environment. Each environment is
// a separate Temporal namespace + task queue (dynamic-dag-<env>).
export type Environment = 'test' | 'prod';
export const ENVIRONMENTS: Environment[] = ['test', 'prod'];

export interface PipelineDefinition {
  id: string;
  version: number;            // immutable; editing creates a new version
  name: string;
  tenantId: string;
  trigger: TriggerConfig;     // trigger lives in the definition itself
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  concurrency?: { maxParallelNodes?: number };
}

export type TriggerConfig =
  | { type: 'cron'; schedule: string }                       // Temporal Schedule
  | { type: 'webhook'; path: string; secret: string }        // HMAC verified
  | { type: 'event'; topic: string }                         // Redis pub/sub (POC)
  | { type: 'manual' };

export interface PipelineNode {
  id: string;
  type: NodeType;
  activityType: string;       // catalog key e.g. "zendesk.fetch"
  label?: string;
  config: Record<string, unknown>;
  ingestion?: IngestionConfig; // source nodes only
  timeoutSec?: number;
  retry?: { maximumAttempts?: number };
  mergeStrategy?: 'concat' | 'innerJoin';
  joinKey?: string;
}

export interface IngestionConfig {
  mode: 'incremental' | 'backfill' | 'realtime';
  backfillStart?: string;     // ISO date — page from here until caught up
  pageSize?: number;
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;         // expression evaluated against upstream output
}

// ─── DataRef: pointers flow through Temporal history, never payloads ───────

export interface DataRef {
  type: 'pg' | 'inline';
  key: string;                // pg row id, or base64 inline (<4KB)
  tenantId: string;
  sizeBytes: number;
  recordCount?: number;
  encrypted?: boolean;
  iv?: string;
}

export interface NodeResult {
  nodeId: string;
  status: 'success' | 'skipped' | 'failed';
  outputRef?: DataRef;
  meta: { durationMs: number; recordCount?: number };
  error?: string;
}

export interface ExecutionStatus {
  executionId: string;
  phase: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  nodeResults: Record<string, NodeResult>;
  startedAt: string;
  completedAt?: string;
}

export interface DynamicWorkflowInput {
  definition: PipelineDefinition;   // FULL frozen definition — never fetched inside workflow
  tenantId: string;
  executionId: string;
  pipelineRowId?: string;
  environment?: Environment;
  executionPrepared?: boolean;
  trigger: { type: string; payloadRef?: DataRef; firedAt: string };
  // Phase 6: DEK wrapped with worker's RSA public key. Worker decrypts once at workflow
  // start; downstream activities receive plaintext DEK in workflow context.
  encryptedDek?: string;
  dekIv?: string;
}

// ─── Tenant / auth context attached to every authenticated API request ─────

export type TenantRole = 'owner' | 'member';

export interface TenantContext {
  tenantId: string;
  userId: string | null;     // null only for stub middleware before Phase 1 lands
  email: string | null;
  role: TenantRole;
  emailVerified: boolean;
}

declare global {
  // Augment Express Request so req.tenant is typed everywhere
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant: TenantContext;
    }
  }
}
