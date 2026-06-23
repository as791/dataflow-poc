import fs from 'fs';
import path from 'path';
import type { CatalogEntry } from '@dataflow/shared';
import { type ConnectorManifest, validateManifest, manifestToCatalogEntry } from './manifest';
import { makeManifestSource } from './executor';
import type { ConnectorPlugin } from './plugin';
import type { SourceFn, Handler } from './runtime-types';

// One registry feeds the worker dispatch (getSources/getHandlers) AND the UI/AI
// catalog (getCatalog). Manifests are declarative connectors; plugins are coded.
export class ConnectorRegistry {
  private manifests = new Map<string, ConnectorManifest>();
  private plugins = new Map<string, ConnectorPlugin>();

  registerManifest(m: unknown): void {
    validateManifest(m);
    this.manifests.set(m.activityType, m);
  }

  registerPlugin(p: ConnectorPlugin): void {
    validateManifest(p.manifest);
    this.plugins.set(p.manifest.activityType, p);
  }

  // Loads every *.manifest.json in `dir`. Returns what loaded and any per-file
  // errors so a bad file fails loudly without taking down the whole registry.
  loadManifestsFromDir(dir: string): { loaded: string[]; errors: string[] } {
    const loaded: string[] = [];
    const errors: string[] = [];
    if (!fs.existsSync(dir)) return { loaded, errors };
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.manifest.json')) continue;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        this.registerManifest(m);
        loaded.push(m.activityType);
      } catch (e: any) {
        errors.push(`${file}: ${e.message}`);
      }
    }
    return { loaded, errors };
  }

  // activityType → source fn. Coded plugins win over manifests on conflict.
  getSources(): Record<string, SourceFn> {
    const out: Record<string, SourceFn> = {};
    for (const m of this.manifests.values()) {
      if (m.kind === 'source') out[m.activityType] = makeManifestSource(m);
    }
    for (const p of this.plugins.values()) {
      if (p.source) out[p.manifest.activityType] = p.source;
    }
    return out;
  }

  // activityType → handler (sinks / transforms exposed by plugins).
  getHandlers(): Record<string, Handler> {
    const out: Record<string, Handler> = {};
    for (const p of this.plugins.values()) {
      if (p.handler) out[p.manifest.activityType] = p.handler;
    }
    return out;
  }

  // UI + AI catalog metadata for every registered connector.
  getCatalog(): CatalogEntry[] {
    const byType = new Map<string, CatalogEntry>();
    for (const m of this.manifests.values()) byType.set(m.activityType, manifestToCatalogEntry(m));
    for (const p of this.plugins.values()) byType.set(p.manifest.activityType, manifestToCatalogEntry(p.manifest));
    return [...byType.values()];
  }

  list(): ConnectorManifest[] {
    return [...this.manifests.values(), ...[...this.plugins.values()].map(p => p.manifest)];
  }
}

// Process-wide registry, pre-loaded with the manifests bundled in this package
// plus an optional user-supplied directory (mount a volume, set CONNECTORS_DIR,
// restart — zero code). __dirname resolves to dist/ at runtime (manifests are
// copied there by the build) and to src/ under ts-node.
export const registry = new ConnectorRegistry();
registry.loadManifestsFromDir(path.join(__dirname, 'manifests'));
if (process.env.CONNECTORS_DIR) registry.loadManifestsFromDir(process.env.CONNECTORS_DIR);
