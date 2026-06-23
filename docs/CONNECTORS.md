# Connectors

DataFlow connectors come in two flavors, both served by one registry
(`@dataflow/connector-sdk`) that feeds the worker dispatch, the API catalog
endpoint (`GET /api/connectors/catalog`), the canvas palette, and the AI
builder:

1. **Manifest connectors** — a single JSON file. No code. For REST/HTTP sources
   with cursor/page/offset pagination and optional incremental watermarking.
2. **Coded plugins** — hand-written TypeScript for anything a manifest can't
   express (OAuth, changes-feeds, GraphQL, SDK auth). The existing Google
   Sheets / Drive / Excel / Zendesk connectors are coded.

## Adding a REST source with zero code

Drop a `*.manifest.json` file into a directory the registry loads:

- **Bundled examples:** `packages/connector-sdk/src/manifests/` (shipped in the
  image).
- **Your own, no rebuild:** set `CONNECTORS_DIR` to a mounted directory and
  restart the worker + API.

It then appears in the catalog, the canvas palette, and the AI builder, and the
worker can run it — no code changes.

### Worked example

`jsonplaceholder.manifest.json` (a public, no-auth REST API):

```json
{
  "activityType": "rest.jsonplaceholder.fetch",
  "label": "JSONPlaceholder (demo REST)",
  "kind": "source",
  "url": "https://jsonplaceholder.typicode.com/posts",
  "method": "GET",
  "pagination": { "style": "page", "param": "_page", "limitParam": "_limit", "limit": 20 },
  "fields": [
    { "key": "userId", "label": "Filter by userId (optional)", "type": "text" }
  ]
}
```

### Manifest schema

| Field | Required | Notes |
|-------|----------|-------|
| `activityType` | yes | Unique catalog key, e.g. `rest.acme.fetch`. |
| `label` | yes | Display name in the palette/AI. |
| `kind` | yes | `source` or `sink`. |
| `url` | yes | May contain `{placeholders}` filled from node config. |
| `method` | no | Default `GET`. |
| `recordsPath` | no | Dotted path to the records array in the body (e.g. `data.items`). |
| `headers` | no | Static headers merged with per-node config. |
| `auth` | no | `{ "type": "bearer"|"header"|"basic", "tokenField": "<config key>", "headerName": "..." }`. The secret comes from node config (declare it in `fields`). |
| `pagination` | no | `{ "style": "cursor"|"page"|"offset", "param", "cursorPath", "limitParam", "limit" }`. |
| `incremental` | no | `{ "sinceParam": "updated_after", "recordTimestampPath": "updated_at" }`. |
| `fields` | no | Extra config inputs rendered on the node (same `FieldSpec` shape as the catalog). |

Pagination + incremental are driven by the generic executor
(`packages/connector-sdk/src/executor.ts`) — the same engine the legacy
`http.fetch` connector runs through.

## Adding a coded plugin

When a manifest isn't enough, implement a `ConnectorPlugin`:

```ts
import type { ConnectorPlugin } from '@dataflow/connector-sdk';

export const myPlugin: ConnectorPlugin = {
  manifest: { activityType: 'acme.fetch', label: 'Acme', kind: 'source', url: 'unused' },
  source: async ({ config, cursor, ingestion, tenantId }) => {
    // bespoke fetch logic → { records, nextCursor, hasMore }
    return { records: [], nextCursor: cursor, hasMore: false };
  },
};

// register it once at worker startup
registry.registerPlugin(myPlugin);
```

The plugin's `manifest` supplies the catalog metadata; `source`/`handler`
supply the runtime behavior.
