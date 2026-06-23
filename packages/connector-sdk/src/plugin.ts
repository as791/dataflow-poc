import type { ConnectorManifest } from './manifest';
import type { SourceFn, Handler } from './runtime-types';

// Coded-plugin escape hatch for connectors a JSON manifest can't express
// (changes-feeds, GraphQL, SDK auth, etc.). A plugin pairs catalog metadata
// (its manifest) with a hand-written source and/or handler. Existing coded
// connectors can be adopted incrementally by wrapping them as plugins.
export interface ConnectorPlugin {
  manifest: ConnectorManifest;
  source?: SourceFn;   // for kind: 'source'
  handler?: Handler;   // for kind: 'sink' (transform/sink dispatch)
}
