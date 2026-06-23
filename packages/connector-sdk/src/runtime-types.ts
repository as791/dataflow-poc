import type { IngestionConfig } from '@dataflow/shared';

// The runtime contracts a connector implements. These mirror the worker's
// activity dispatch (apps/worker/src/activities/index.ts): a source returns one
// page per call and advances a durable cursor; a handler transforms/sinks a
// payload. Defined here so the worker, the manifest executor, and coded plugins
// all agree on one shape — the worker re-exports these for its connectors.

export interface SourceFetchParams {
  config: Record<string, unknown>;
  cursor: Record<string, any>;       // loaded from connector_state
  ingestion?: IngestionConfig;
  tenantId: string;
}

export interface SourceFetchResult {
  records: any[];
  nextCursor: Record<string, any>;
  hasMore: boolean;                  // drives the backfill loop in the workflow
}

export type SourceFn = (p: SourceFetchParams) => Promise<SourceFetchResult>;

export interface HandlerCtx { tenantId: string; executionId: string; nodeId: string }
export type Handler = (input: any, config: Record<string, unknown>, ctx: HandlerCtx) => Promise<any>;
