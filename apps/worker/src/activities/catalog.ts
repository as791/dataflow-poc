import { registry, type SourceFn, type Handler } from '@dataflow/connector-sdk';
import { zendeskFetch } from './connectors/zendesk';
import { gsheetsFetch } from './connectors/gsheets';
import { gdriveFetch } from './connectors/gdrive';
import { excelFetch } from './connectors/excel';
import { httpFetch } from './connectors/http';
import { pool } from './db';
import { writeRecords } from './clickhouse';
import axios from 'axios';
import crypto from 'crypto';

// Connector runtime contracts now live in the SDK; re-exported so the coded
// connectors (which import from '../catalog') keep working unchanged.
export type { SourceFetchParams, SourceFetchResult, Handler, HandlerCtx } from '@dataflow/connector-sdk';

// Safe-ish expression evaluator for map/filter (POC). Prod: isolated-vm.
function evalExpr(expr: string, record: any): any {
  const fn = new Function('r', `"use strict"; return (${expr});`);
  return fn(record);
}

// Coded source connectors (bespoke logic). Manifest-driven sources come from
// the registry and are merged in below — adding a REST source is then a single
// JSON file, no code here.
const codedSources: Record<string, SourceFn> = {
  'zendesk.fetch':  zendeskFetch,
  'gsheets.fetch':  gsheetsFetch,
  'gdrive.fetch':   gdriveFetch,
  'excel.fetch':    excelFetch,
  'http.fetch':     httpFetch,
};
export const sources: Record<string, SourceFn> = { ...codedSources, ...registry.getSources() };

const codedHandlers: Record<string, Handler> = {
  // ─── transforms ───
  'transform.map': async (input, config) =>
    (input as any[]).map(r => evalExpr(config.expression as string, r)),

  'transform.filter': async (input, config) =>
    (input as any[]).filter(r => !!evalExpr(config.predicate as string, r)),

  'transform.rename': async (input, config) => {
    const mapping = config.mapping as Record<string, string>;
    return (input as any[]).map(r => {
      const out: any = {};
      for (const [from, to] of Object.entries(mapping)) out[to] = r[from];
      return { ...r, ...out };
    });
  },

  'transform.dedupe': async (input, config) => {
    const key = config.key as string;
    const seen = new Set<string>();
    return (input as any[]).filter(r => {
      const k = String(r[key]);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  },

  // ─── sinks ───
  // Phase 4: records go to ClickHouse. `sink.postgres` is kept as an alias
  // so pipelines saved before the rename still work.
  'sink.records': async (input, config, ctx) => {
    const collection = config.collection as string;
    const dedupField = config.dedupField as string | undefined;
    await writeRecords(ctx.tenantId, collection, input as any[], dedupField);
    return null;
  },
  // backward-compat alias for pipelines saved before Phase 4 rename
  'sink.postgres': async (input, config, ctx) => {
    const collection = config.collection as string;
    const dedupField = config.dedupField as string | undefined;
    await writeRecords(ctx.tenantId, collection, input as any[], dedupField);
    return null;
  },

  'sink.webhook': async (input, config) => {
    const body = JSON.stringify({ records: input });
    const sig = config.secret
      ? crypto.createHmac('sha256', config.secret as string).update(body).digest('hex')
      : undefined;
    await axios.post(config.url as string, body, {
      headers: { 'Content-Type': 'application/json',
                 ...(sig ? { 'X-Signature-SHA256': sig } : {}) },
      timeout: 15_000,
    });
    return null;
  },
};
export const handlers: Record<string, Handler> = { ...codedHandlers, ...registry.getHandlers() };
