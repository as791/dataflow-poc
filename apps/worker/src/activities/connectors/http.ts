import { runHttpSource, type HttpSourceConfig } from '@dataflow/connector-sdk';
import type { SourceFetchParams, SourceFetchResult } from '../catalog';

// Generic REST source. The pagination/incremental engine now lives in the
// connector SDK (runHttpSource) so the legacy `http.fetch` connector and every
// manifest-driven connector share one implementation. Node config maps 1:1 to
// HttpSourceConfig:
//   { url, method, headers, auth:{type:'bearer'|'basic'|'header', ...},
//     pagination:{style:'cursor'|'page'|'offset', cursorPath, param, limitParam, limit},
//     incremental:{ sinceParam, recordTimestampPath }, recordsPath }
export async function httpFetch(p: SourceFetchParams): Promise<SourceFetchResult> {
  return runHttpSource(p.config as unknown as HttpSourceConfig, p.cursor, p.ingestion);
}
