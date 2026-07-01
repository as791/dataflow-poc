# Staff Engineer Audit — dataflow-poc frontend/backend integration

> Archived pre-ADR-002 audit; referenced TypeScript backend paths were removed.

Scope: `apps/web/src/pages/**`, `apps/web/src/components/**`, matched against `apps/api/src/routes/**`. Read-only audit, no code changes.

## Bugs Found

### P0 — Analytics widget query spec is silently ignored (wrong data shown)
`apps/web/src/components/analytics/types.ts:11-15` defines the frontend `QuerySpec` as:
```ts
export interface QuerySpec {
  x_column: string; y_column: string; agg: 'count'|'sum'|'avg'|'min'|'max'|'none'; limit?: number;
}
```
`apps/web/src/components/analytics/AddWidgetModal.tsx:39` builds widgets with `spec: { x_column, y_column, agg, limit: 50 }` and `AnalyticsPage.tsx:95` POSTs it verbatim as `{ dataset, spec }` to `/api/analytics/query`.

The backend's `QuerySpec` (`apps/api/src/lib/queryBuilder.ts:19-34`) is a completely different shape: `{ dataset, select?, where?, groupBy?, aggregate?: {field, fn}, orderBy?, limit? }`. Since the frontend never sends `select`/`groupBy`/`aggregate`, `buildQuery` (`apps/api/src/lib/queryBuilder.ts:111-140`) hits none of its branches and falls through to `selectParts.push('record')` — it returns the raw, unaggregated record for every row instead of grouping by `x_column` / aggregating `y_column`. Every chart in Analytics renders the wrong data with no error surfaced (HTTP 200, just garbage rows). `ChartRenderer` then has to consume rows shaped nothing like what `QuerySpec` promised.

### P0 — Analytics dataset list fields mismatch (sidebar shows blank dataset names/counts)
`apps/api/src/routes/analytics.ts:58` returns `res.json(rows.map(r => ({ name: r.collection, rowCount: Number(r.row_count) })))` — i.e. `{name, rowCount}`.
Frontend `Dataset` type (`apps/web/src/components/analytics/types.ts:1-4`) and all consumers (`AnalyticsPage.tsx:172-174`, `AddWidgetModal.tsx:13,66-67`) expect `{collection, row_count}`. Every dataset in the sidebar renders `undefined` for the name and `undefined.toLocaleString()` throws (or shows blank, depending on optional chaining — there is none here, so `d.row_count.toLocaleString()` at `AnalyticsPage.tsx:174` will throw a runtime `TypeError` since `row_count` is `undefined`). This makes the entire Analytics dataset list page crash when datasets exist.

### P1 — AnalyticsPage and ConnectorsPage bypass the shared auth-refresh fetch wrapper
`apps/web/src/pages/AnalyticsPage.tsx:13-22` defines its own local `apiFetch` (raw `fetch` + `credentials: 'include'`), duplicating `apps/web/src/api.ts:11-21`'s `request()` but **without** the 401-retry/token-refresh logic (`onUnauthorized` callback wired in `AuthContext`). Same pattern in `apps/web/src/components/ConnectorsPage.tsx:25-44` (`startOAuth`, `startZendeskOAuth` use raw `fetch`). Result: when the access token expires mid-session, every other page transparently refreshes and retries; Analytics and Connectors OAuth-start calls will hard-fail with a stale 401 instead of refreshing, forcing a manual page reload.

### P1 — `PipelinesPage` "Edit" and "Backfill" buttons navigate to dead query params
`apps/web/src/pages/PipelinesPage.tsx:187` (`Edit` → `navigate(/?pipeline=${pipeline.id})`) and `:189` (`Backfill` → `navigate(/?pipeline=${pipeline.id}&backfill=1)`) both rely on `PipelineCanvasPage` reading a `?pipeline=` query param to load that pipeline. `PipelineCanvasPage.tsx` never calls `useSearchParams()` or reads `location.search` anywhere (only `location.state?.definition`, set by `AIBuilderPage`'s "Open in canvas" flow at `AIBuilderPage.tsx:50-53`). Clicking "Edit" or "Backfill" from the Pipelines list just opens a blank new-pipeline canvas — the existing pipeline is never loaded, and the `backfill=1` flag is read nowhere in the codebase.

### P1 — AppShell page header goes stale on client-side navigation
`apps/web/src/components/AppShell.tsx:38` reads `window.location.pathname` directly instead of `useLocation()`. `AppShell` is the route `element` for the entire AppShell route group (`apps/web/src/App.tsx:36`) — it is mounted once and only the nested `<Outlet/>` content swaps on navigation between `/pipelines`, `/monitoring`, `/lineage`, etc. Since `pathname` is read at render time via the DOM API (not a reactive hook) and nothing forces `AppShell` to re-render on those navigations, `meta.title` / `meta.eyebrow` (`AppShell.tsx:39,106-107`) freeze at whichever page first mounted the shell and never update again for the rest of the session (left-rail active-state styling is fine because `NavLink` uses its own `useLocation` internally, but the header text is wrong).

### P2 — No type safety net on `apps/web` — backend/frontend contracts drift silently
`apps/web` has no `tsconfig.json` (only the root `tsconfig.base.json`) and `apps/web/package.json`'s `build` script is just `vite build`, which uses esbuild and does **not** typecheck. Compare to `apps/api` and `apps/worker`, both of which have their own `tsconfig.json` and a `build: tsc -p .` that fails on type errors. This is exactly how the two P0 Analytics contract mismatches above shipped undetected — `npx tsc --noEmit` was not runnable against `apps/web` because no tsconfig exists for it. (Ran `npm -w apps/web run build` directly: it succeeds despite the bugs above, since esbuild only transpiles.)

### P2 — Duplicated `ActivityIcon` logic
`apps/web/src/components/canvas/FlowNode.tsx:9-28` (`ActivityIcon` component) and `apps/web/src/pages/PipelinesPage.tsx:57-75` (`activityIcon()` function) implement the identical activityType → lucide-icon if/else chain, copy-pasted rather than shared. Any new connector type added to the catalog needs this mapping updated in two places; it's already easy to miss (e.g. `transform.dedupe`/`transform.flatten` added in `ai.ts`'s system prompt aren't reflected in either icon map, both fall through to the generic `Braces` icon, but only because both copies are equally stale).

### P3 — `RunsPage`/`MonitoringPage`/`LifecyclePage` each implement their own fetch+useState+useEffect data-loading boilerplate
No shared `useApi`/`useQuery`-style hook exists anywhere in `apps/web/src`. Every page (`PipelinesPage.tsx:321-328`, `LifecyclePage.tsx:157-163`, `RunsPage.tsx:27-46`, `MonitoringPage.tsx:63-79`, `LineagePage.tsx:136-154`, `TeamPage.tsx:18-24`) hand-rolls `loading`/`error`/`refresh` state with near-identical `try { setX(await api.y()) } catch { setError(...) } finally { setLoading(false) }` bodies. Not a bug, but a maintainability/consistency gap — see Recommendations.

## Duplication Analysis (Frontend + Backend)

### PipelineCanvasPage (`/`) vs AIBuilderPage (`/ai-builder`) vs PipelinesPage (`/pipelines`)
These are **not** duplicates of each other — they are genuinely different concerns wired together correctly:
- `PipelinesPage.tsx` is a read-only list/browse view (`api.listPipelines()`, `GET /api/pipelines`).
- `AIBuilderPage.tsx` is a standalone prompt → Mermaid → definition generator (`api.generatePipeline`/`api.refinePipeline`, `POST /api/ai/generate` / `/api/ai/refine`) that hands its result to the canvas via `nav('/', { state: { definition } })` (`AIBuilderPage.tsx:50-53`), consumed by `PipelineCanvasPage.tsx:101-119`.
- `PipelineCanvasPage.tsx` is the actual editor/save/run surface (`api.savePipeline` → `POST /api/pipelines`).

However, `PipelineCanvasPage` **also embeds its own inline AI generation bar** (`showAI`/`aiPrompt`/`runAI()` at `PipelineCanvasPage.tsx:78-81,299-315,712-736`) that calls the same `api.generatePipeline` as `AIBuilderPage`. This is a legitimate UX duplication: there are now two independent "describe a pipeline in English" entry points (the dedicated `/ai-builder` page and the canvas's inline Sparkles bar) with separately-maintained prompt state, loading state, and error handling, rather than one shared `useAiGenerate()` hook/component used in both places. They can drift (e.g. `AIBuilderPage` shows `Refine` and warnings from `mermaidToDefinition`; the canvas inline bar has neither).

### Backend pipeline routes — no duplication found
`apps/api/src/routes/pipelines.ts` is the single source of truth for create (`POST /`), list (`GET /`), activate/promote/stage transitions, and lineage. There is no second "pipelines-lite" or shadow route file — `apps/api/src/routes/pipelines.stage.selfcheck.ts` is a pure-function self-check script (no Express routes), not a duplicate handler. `apps/web/src/api.ts:33-54` maps 1:1 onto `pipelines.ts`'s routes. No backend route-level duplication for pipeline CRUD.

### `apps/web/src/pages/stubs.tsx` — confirmed dead/vestigial file
```ts
// All pages have shipped — stubs no longer needed.
// - Phase 2 ConnectorsPage → ./ConnectorsPage.tsx
// - Phase 3 BillingPage    → ./BillingPage.tsx
// - Phase 4 AnalyticsPage  → ./AnalyticsPage.tsx
export {};
```
Not imported anywhere (`App.tsx` imports the real `ConnectorsPage`, `BillingPage`, `AnalyticsPage` directly). Safe to delete — it's a self-documented leftover, not active duplication, but it is dead code sitting in `pages/`.

### `ActivityIcon` (FlowNode.tsx) vs `activityIcon()` (PipelinesPage.tsx)
Already covered under Bugs/P2 — identical icon-resolution logic duplicated in two files.

### Two independent raw-fetch clients
`apps/web/src/api.ts` (the canonical client, used by 9 of 11 pages) vs the ad-hoc `apiFetch` in `AnalyticsPage.tsx` and the inline `fetch` calls in `ConnectorsPage.tsx`. Functionally near-identical (`credentials: 'include'`, JSON content-type, error-on-non-2xx) but reimplemented twice without the 401-refresh behavior — see P1 bug above.

## Engineering Recommendations

1. **Fix the Analytics contract end-to-end.** Either change `apps/web/src/components/analytics/types.ts`'s `QuerySpec` to match the backend's `{dataset, select, where, groupBy, aggregate, orderBy, limit}` and update `AddWidgetModal.tsx:39` to build `{ groupBy: [xCol], aggregate: { field: yCol, fn: agg }, select: chartType === 'table' ? [xCol, yCol] : undefined }`, or change the backend to accept `{x_column, y_column, agg}` and translate internally. Pick one; right now neither side has ever talked to the other correctly. Also align `apps/api/src/routes/analytics.ts:58`'s dataset response (`{name, rowCount}`) with the frontend `Dataset` type (`{collection, row_count}`) — cheapest fix is renaming the backend's `res.json` mapping to match the existing frontend type, since 3 frontend files already reference `.collection`/`.row_count`.

2. **Give `apps/web` a `tsconfig.json` and wire `tsc --noEmit` into its build/CI step**, matching `apps/api`/`apps/worker`. This is the actual root cause of the Analytics mismatches shipping — there's no compiler in the loop for the one app most likely to have shape drift against a backend it doesn't own.

3. **Collapse `AnalyticsPage`'s `apiFetch` and `ConnectorsPage`'s raw `fetch` calls into `apps/web/src/api.ts`.** Add `api.getAnalyticsDatasets()`, `api.queryAnalytics()`, etc., and `api.startConnectorOAuth(provider)` / `api.startZendeskOAuth(subdomain)` (the latter two can still do `window.location.href = url` after calling through `api.ts`'s `request()`, which gets them the 401-retry path for free).

4. **Fix `PipelinesPage`'s Edit/Backfill navigation.** Either make `PipelineCanvasPage` read `?pipeline=` via `useSearchParams()` and fetch+hydrate that pipeline on mount (mirroring the existing `location.state?.definition` hydration path at `PipelineCanvasPage.tsx:101-119`), or change `PipelinesPage.tsx:187,189` to pass `location.state` like `AIBuilderPage` already does, for consistency with the one hydration path that does work. The `backfill=1` flag needs an actual consumer — currently it's a no-op flag nobody reads; either remove it or open the lifecycle backfill panel when present.

5. **Replace `window.location.pathname` in `AppShell.tsx:38` with `useLocation().pathname`** from `react-router-dom` (already imported in this file's sibling pages). One-line fix; restores reactive header titles across navigation.

6. **De-duplicate `ActivityIcon`.** Delete the copy in `PipelinesPage.tsx:57-75` and import `ActivityIcon` from `components/canvas/FlowNode.tsx` instead (it's already exported there and `PipelinesPage` already imports several lucide icons directly, so this is a net deletion).

7. **Decide whether the canvas's inline AI bar and `/ai-builder` should be one component.** If both are intentional (quick-add vs. dedicated workspace), at minimum extract the shared `generate(prompt) → {mermaid, definition}` + loading/error state into one hook (`useAiGenerate()`) so warning-handling and refine-support don't silently diverge between the two surfaces.

8. **Optional, lower priority:** introduce one small `useApiResource(fetcher, deps)` hook to replace the ~6 hand-rolled `loading/error/refresh` triplets (Pipelines, Lifecycle, Runs, Monitoring, Lineage, Team). Not urgent — the current per-page pattern is at least consistent in *shape* even if duplicated — but it's the one structural cleanup that would pay for itself given how many pages now repeat it.

## Prioritized List (risk × effort)

| # | Issue | Severity | Effort | Why prioritized here |
|---|---|---|---|---|
| 1 | Analytics `QuerySpec` shape mismatch — charts show wrong/raw data silently | P0 | Small (align one type + one request builder) | Silent wrong-data bug in a paid-tier-adjacent feature; no error surfaces to the user, so it erodes trust invisibly |
| 2 | Analytics `Dataset` shape mismatch — sidebar throws/breaks | P0 | Trivial (rename 2 keys server-side) | Crashes the Analytics page entirely whenever datasets exist; trivial fix, ship immediately with #1 |
| 3 | `apps/web` has no tsconfig/typecheck | P2 (but root-causes #1/#2) | Small | Prevents this entire class of bug from recurring; do this *alongside* #1/#2 so the fix is verified by the compiler, not just by hand |
| 4 | `PipelinesPage` Edit/Backfill navigate to dead params | P1 | Small–Medium | User-facing dead-end on a primary workflow (editing an existing pipeline from the list) |
| 5 | AppShell stale header on navigation | P1 | Trivial (one-line hook swap) | Cosmetic but visible on every single page transition |
| 6 | AnalyticsPage/ConnectorsPage bypass auth-refresh fetch wrapper | P1 | Small | Causes confusing forced-logout-feeling failures once access tokens expire mid-session |
| 7 | Duplicated `ActivityIcon` logic | P2 | Trivial | Pure cleanup, zero behavior change, prevents future drift |
| 8 | No shared data-fetching hook | P3 | Medium | Quality-of-life refactor, not a bug; defer until touching multiple of these pages anyway |
