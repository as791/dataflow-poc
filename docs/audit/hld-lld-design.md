# HLD/LLD — Backlog Items #1–6 (P0/P1)

Scope: `docs/audit/reconciled-feedback.md` section 4, items 1–6 only. Items 7–14 are out of
scope (see Non-goals). This doc assumes the reader has read the three audit docs; it does not
re-derive findings, only designs the fix.

---

## High-Level Design

### 1. Analytics `QuerySpec` + `Dataset` shape mismatches (P0)

**Approach:** Change the frontend to speak the backend's existing contract. The backend
`QuerySpec` (`apps/api/src/lib/queryBuilder.ts:19-34`) is the security-load-bearing side — it
whitelists fields, validates aggregate functions, and parameterizes SQL. Reshaping the backend
to accept `{x_column, y_column, agg}` would mean either weakening that validation surface or
adding a translation layer the backend doesn't need for any other caller. The frontend has
exactly one caller of this contract (`AddWidgetModal.tsx`) and zero persisted data in the old
shape that needs migrating (dashboards store `WidgetDef.spec` as opaque JSON — old dashboards
get fixed for free once the type changes, no migration required). So: fix the frontend's
`QuerySpec` type and the one call site that builds it; fix the backend's dataset response key
names to match the (already-correct, 3-call-site) frontend `Dataset` type, since renaming 2
keys server-side is cheaper than touching 3 frontend files.

**Out of scope:** No backend `QuerySpec` changes. No new validation. No widget-spec migration
tooling for existing saved dashboards (none exist in the wild yet per the audit — this is a P0
because it's broken for *every* dashboard going forward, not because of existing data).

**Why minimal:** Two small, independently-shippable diffs (one type + one request builder on
the frontend; one `res.json` mapping on the backend), zero new abstractions, reuses the
backend's existing validated `QuerySpec` instead of inventing a translation shim.

### 2. Canvas Edit/Backfill navigation is dead (P0)

**Approach:** `PipelineCanvasPage` already has one working hydration path —
`location.state?.definition`, written by `AIBuilderPage`'s `nav('/', { state: { definition } })`.
The backend already has the route the frontend needs: `GET /api/pipelines/:rowId`
(`apps/api/src/routes/pipelines.ts:497-501`), which returns the full row including
`definition`. So: add `api.getPipeline(rowId)` to `apps/web/src/api.ts`, make
`PipelinesPage`'s Edit/Backfill buttons navigate with `state` (matching the AIBuilder pattern)
instead of a `?pipeline=` query param, and have `PipelineCanvasPage` fall back to fetching by
`?pipeline=` query param on direct/refreshed loads (e.g. a bookmarked URL) for robustness. The
existing `hydrated` ref + `useEffect` keyed on `location.state` is reused, not replaced.
`backfill=1` gets one concrete consumer: it pre-opens the existing Lifecycle drawer tab instead
of being a no-op flag.

**Out of scope:** No new `/pipelines/:id` route, no moving the canvas into `AppShell`, no
rewriting canvas navigation chrome (PM recommendation 2a/2b in `pm-ui-audit.md` — that's a
bigger product decision the audit explicitly flags as "two options," not a blocking bug fix).
This design only makes Edit/Backfill load the correct pipeline; it does not redesign canvas
navigation chrome.

**Why minimal:** No new backend route (one already exists and is unused by the frontend — this
was a wiring gap, not a missing-API gap). Reuses the exact hydration mechanism that already
works for the AI Builder → canvas flow instead of inventing a second one.

### 3. Unify the two AI Builder surfaces (P1)

**Approach:** Per the reconciled doc's own framing ("Decide: one canonical flow, or two
clearly-differentiated ones sharing a `useAiGenerate()` hook"), the lazy-correct choice is the
second option, not a deletion. Removing the canvas inline bar is a bigger product call (it's a
genuinely faster path for "add a few more nodes" mid-edit, per the PM audit's own framing of
"quick-add"); a generic-purpose write-up isn't positioned to make that product trade-off
unilaterally. What *is* unambiguous: the two surfaces must stop being able to silently drift,
and the canvas surface must stop calling itself "AI Builder" when a different, more capable
page already owns that name. So: extract one `useAiGenerate()` hook (prompt/loading/error/
warnings state + the `generatePipeline`/`refinePipeline` calls), use it in both
`PipelineCanvasPage` and `AIBuilderPage`, rename the canvas toolbar button/tooltip from "AI
Builder" to "Quick AI add" (or similar), and add a single "Open full AI Builder →" link from
the canvas's inline bar to `/ai-builder`.

**Out of scope:** Not deciding to delete the canvas inline bar. Not adding mermaid-warning
display or Refine support to the canvas inline bar (that would just be re-building
`AIBuilderPage` inside the canvas — if that's wanted later, the answer is "use the link to
`/ai-builder`," not "duplicate more of it inline").

**Why minimal:** One hook extraction, one rename, one link. No new routing, no new page, no
deleting a feature without a product call.

### 4. Consolidate API client + shared error UI (P1)

**Approach:** Delete `AnalyticsPage.tsx`'s local `apiFetch` and `ConnectorsPage.tsx`'s raw
`fetch` calls; route everything through `apps/web/src/api.ts`'s existing `request()`/`j()`
pair, which already has the 401-retry/refresh wiring every other page gets via
`AuthContext.setUnauthorizedHandler`. This is additive to `api.ts` only — same object, same
`request(...).then(j)` pattern already used by all 9 other call sites in that file. For the
error-display gap (PM finding 1c), add one small `<ApiError>` component that renders `j()`'s
thrown `Error` (message is already `${status} ${body}`) as a readable banner with an optional
retry callback, and use it in AI Builder, RunDetail, Connectors, and Analytics — the four
places currently dumping raw error strings.

**Out of scope:** No generic "API layer" abstraction (no axios adoption, no React Query, no
request-caching layer) — `api.ts`'s existing flat function-per-endpoint object is the
established pattern and item #4 is explicitly "use what's already there," not "replace it."
No shared `useApiResource` data-fetching hook (that's backlog item #14, explicitly deferred).

**Why minimal:** Reuses `api.ts` verbatim — this item is pure deletion of two duplicate fetch
wrappers, not a new client. `<ApiError>` is one ~20-line component, not a design system.

### 5. No non-Google login path (P1)

**Approach — concrete, not a menu:** Promote the existing `/dev/login` mechanism
(`apps/api/src/index.ts:46-53`) into a real, env-gated email/password login. This repo already
has every primitive needed: `users` table, `pool.query` access, `signAccessToken`,
`issueRefreshToken`/`setRefreshCookie` (`apps/api/src/routes/auth.ts`), and a `bcrypt`-style
password column is the only schema addition required. Building a magic-link flow would require
standing up transactional email (not present anywhere in this codebase); building real SSO
(SAML or a hosted OIDC broker) is already partially modeled via the existing generic OIDC
routes (`auth.ts:230-357`, gated behind `VITE_OIDC_ENABLED` + `OIDC_*` env vars) and works
today for self-hosters who *do* want to wire up Okta/Auth0 — it just isn't a path for someone
with zero IdP. Email/password is the only option that requires no external service and unblocks
the literal "I just cloned this and want to log in" case the PM audit describes. So: add a
`password_hash` column to `users`, add `POST /api/auth/register` and `POST /api/auth/login`
routes gated by `AUTH_PASSWORD_ENABLED=true` (mirrors the existing `VITE_OIDC_ENABLED` /
`OIDC_*` gating pattern already in this codebase), and add an email/password form to
`LoginPage` shown only when the API reports the feature is enabled. Delete `/dev/login` in the
same change — it becomes redundant once a real non-prod login path exists, and it was always a
QA-only backdoor, not a feature.

**Out of scope:** No magic-link email flow (no email infra exists). No SAML/enterprise SSO
broker (the existing generic OIDC route already covers "bring your own IdP" for tenants that
have one — that's a separate, already-shipped capability, not part of this fix). No
self-service password reset flow in this pass (out of scope — flag as a fast-follow, not silently
dropped: login + registration only, matching the size of "give self-hosters a way in").

**Why minimal:** No new infrastructure (no email service, no third-party SSO broker). Reuses
the exact session-issuance code (`issueRefreshToken`, `setRefreshCookie`, `signAccessToken`)
that Google OAuth and OIDC already call — password login is a third way to reach the same
"resolve a user id, mint a session" choke point, not a parallel auth system.

### 6. `AppShell` stale header on navigation (P1)

**Approach:** Replace `window.location.pathname` (`AppShell.tsx:38`) with
`useLocation().pathname` from `react-router-dom`, already imported in sibling files in this
codebase (e.g. `PipelineCanvasPage.tsx`). One-line fix, as the audit itself states.

**Out of scope:** Not adding a `PAGE_META` entry for `/runs/:id` in this pass (the PM audit's
Bug 3 header mislabel is a side effect of the *same* missing-route-meta problem, but
`reconciled-feedback.md` scopes item #6 to the `useLocation()` bug specifically — adding the
`/runs/:id` entry is a one-line follow-up worth doing in the same PR since it's trivial, noted
in LLD below, but is not the core fix).

**Why minimal:** Literally a one-line hook swap.

---

## Low-Level Design

### Item 1 — Analytics `QuerySpec` + `Dataset` contracts

**Before/after shapes:**

```ts
// apps/web/src/components/analytics/types.ts — BEFORE
export interface QuerySpec {
  x_column: string; y_column: string;
  agg: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none';
  limit?: number;
}

// apps/web/src/components/analytics/types.ts — AFTER
// Mirrors apps/api/src/lib/queryBuilder.ts's QuerySpec exactly (minus `dataset`,
// which AnalyticsPage already sends as a sibling field in the POST body).
export interface QuerySpec {
  select?: string[];
  where?: Array<{ field: string; op: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN'; value: unknown }>;
  groupBy?: string[];
  aggregate?: { field: string; fn: 'count' | 'sum' | 'avg' | 'min' | 'max' };
  orderBy?: { field: string; dir: 'ASC' | 'DESC' };
  limit?: number;
}
```

```ts
// apps/web/src/components/analytics/types.ts — Dataset, BEFORE (frontend type;
// it was already correct — the bug is the backend response not matching it)
export interface Dataset { collection: string; row_count: number; }
// AFTER: unchanged. Only the backend response mapping changes (below).
```

```ts
// apps/api/src/routes/analytics.ts:58 — BEFORE
res.json(rows.map((r) => ({ name: r.collection, rowCount: Number(r.row_count) })));

// apps/api/src/routes/analytics.ts:58 — AFTER
res.json(rows.map((r) => ({ collection: r.collection, row_count: Number(r.row_count) })));
```

**File-by-file changes:**

1. **`apps/api/src/routes/analytics.ts:58`** — rename the two response keys
   (`name`→`collection`, `rowCount`→`row_count`). No other line in this file changes; `/query`
   already accepts the real `QuerySpec` shape correctly (it's `buildQuery` that the frontend
   has never actually exercised beyond the `selectParts.push('record')` fallback). Land first
   — it's a pure rename with no frontend dependency, and unblocks visually verifying #2 below.

2. **`apps/web/src/components/analytics/types.ts:11-16`** — replace `QuerySpec` with the
   backend-mirrored shape above.

3. **`apps/web/src/components/analytics/AddWidgetModal.tsx:32-41`** — change `handleAdd` to
   build the new spec shape:
   ```ts
   const handleAdd = () => {
     const spec: QuerySpec = chartType === 'table'
       ? { select: [xCol, ...(yCol ? [yCol] : [])], limit: 50 }
       : agg === 'none'
         ? { select: [xCol, yCol], limit: 50 }
         : { groupBy: [xCol], aggregate: { field: yCol, fn: agg }, limit: 50 };
     onAdd({
       id: `w_${Date.now()}`,
       layout: { x: 0, y: Infinity, w: 4, h: 4 },
       type: chartType, dataset, title, spec,
     });
     onClose();
   };
   ```
   Note: backend `buildQuery` already auto-includes `groupBy` columns in `SELECT`
   (`queryBuilder.ts:121-129`, keyed by the column's own name, e.g. `xCol`) and aliases the
   aggregate as `aggregate_value` (`queryBuilder.ts:134`).

4. **`apps/web/src/components/analytics/ChartRenderer.tsx:24-25,65,80,84,95,99`** — confirmed:
   this file reads `widget.spec.x_column`/`widget.spec.y_column` directly (`const xKey =
   widget.spec.x_column; const yKey = widget.spec.y_column;` at lines 24-25, then used as
   `dataKey`/`nameKey` props throughout). These fields no longer exist on the new `QuerySpec`.
   Change to derive the keys from the row data + widget shape instead of the old spec fields:
   ```ts
   const xKey = widget.spec.groupBy?.[0] ?? widget.spec.select?.[0] ?? '';
   const yKey = widget.spec.aggregate ? 'aggregate_value' : (widget.spec.select?.[1] ?? widget.spec.select?.[0] ?? '');
   ```
   This must land in the same PR as #2/#3 above — a widget that builds a correct query but
   renders against fields that no longer exist is a guaranteed regression, not a hypothetical.

5. **`apps/web/src/pages/AnalyticsPage.tsx:172-174`** — no code change needed; `d.collection`
   / `d.row_count` already match the (unchanged) `Dataset` type once #1 lands. This is the file
   that currently throws — fixed purely by the backend rename.

**Sequencing:** Backend rename (#1) can land standalone (it's additive-safe — old frontend
code reading `.name`/`.rowCount` was already broken, so there's no working caller to regress).
Frontend `QuerySpec` type + `AddWidgetModal` builder + `ChartRenderer` (#2, #3, #4) must land
together as one PR — the type change alone doesn't fix anything without the new builder, and
the new builder produces rows `ChartRenderer` can't read without its own fix.

### Item 2 — Canvas Edit/Backfill navigation

**No new backend route** — `GET /api/pipelines/:rowId` already exists
(`apps/api/src/routes/pipelines.ts:497-501`), gated by `requirePipelineAccess('viewer')`,
returns `SELECT * FROM pipelines WHERE id=$1` (includes `definition`, `name`, `pipeline_key`,
`version`, `status`, `environment`).

**File-by-file changes:**

1. **`apps/web/src/api.ts`** — add one function, following the existing pattern at line 42:
   ```ts
   getPipeline: (rowId: string) => request(`/api/pipelines/${rowId}`).then(j),
   ```
   Place it next to `listPipelines` (after line 42).

2. **`apps/web/src/pages/PipelinesPage.tsx:187,189`** — change Edit/Backfill actions from
   query-param navigation to state-based navigation (mirrors `AIBuilderPage.tsx:50-53`'s
   working pattern), passing the *row id* so the canvas can fetch it:
   ```ts
   { label: 'Edit',     icon: <ChevronRight size={12}/>, action: () => navigate('/', { state: { pipelineId: pipeline.id } }) },
   { label: 'Run now',  icon: <Play size={11}/>,         action: () => api.run(pipeline.id).catch(() => {}) },
   { label: 'Backfill', icon: <RotateCcw size={11}/>,    action: () => navigate('/', { state: { pipelineId: pipeline.id, openBackfill: true } }) },
   ```
   Also keep the `?pipeline=<id>` query-param form as a fallback URL shape for direct links /
   bookmarks (see step 3) — but the primary in-app navigation uses `state`, consistent with how
   AI Builder already hands off to the canvas.

3. **`apps/web/src/pages/PipelineCanvasPage.tsx`** — extend the existing hydration `useEffect`
   (lines 101-119) to handle three sources, in priority order: `location.state.definition`
   (existing AI Builder path, unchanged), `location.state.pipelineId` (new — fetch then
   hydrate), and a `?pipeline=` query param (new — fallback for direct navigation/bookmarks,
   also fetch-then-hydrate). Concretely:
   ```ts
   useEffect(() => {
     const def = (location.state as any)?.definition;
     const pipelineId = (location.state as any)?.pipelineId ?? searchParams.get('pipeline');
     const openBackfill = (location.state as any)?.openBackfill === true || searchParams.get('backfill') === '1';
     if (hydrated.current) return;

     if (def) {
       hydrated.current = true;
       hydrateFromDefinition(def, 'Loaded from AI builder — review and Save');
       return;
     }
     if (pipelineId) {
       hydrated.current = true;
       api.getPipeline(pipelineId).then(row => {
         hydrateFromDefinition(row.definition, `Loaded ${row.name}`);
         setSavedRowId(row.id);
         setPipelineStage(deriveStage(row.status, row.environment));
         if (openBackfill) { setShowLifecycle(true); openDrawer('lifecycle'); }
       }).catch(e => setMsg(`Failed to load pipeline: ${e.message}`));
     }
   }, [location.state]);
   ```
   Factor the body currently inside the effect (lines 105-118: `definitionToFlow` call + the
   `setName`/`setPipelineKey`/`setTrigger`/`setPolicy` block) into a local helper
   `hydrateFromDefinition(def: any, message: string)` so both the `definition`-state path and
   the new `pipelineId` path share it instead of duplicating the field-mapping logic.
   `useSearchParams` needs importing from `react-router-dom` (already imported in this file
   from the same package, just add `useSearchParams` to the existing import).

4. **`backfill=1` consumer** — handled above via `openBackfill`: it opens the existing
   `lifecycle` bottom-drawer tab (already implemented, `openDrawer('lifecycle')` at
   `PipelineCanvasPage.tsx:473`/`openDrawer` defined at line 317) rather than introducing a new
   panel. No new UI — this just routes the existing lifecycle view into view on load,
   consistent with "Backfill" meaning "show me promotion/lifecycle status for this pipeline."

**Sequencing:** `api.ts` addition (step 1) has no dependents and can land first/standalone.
Steps 2 and 3 must land together — a `PipelinesPage` that passes `state.pipelineId` with no
canvas-side consumer is a no-op; a canvas that reads `state.pipelineId` with no caller is dead
code. No backend changes required for this item at all.

### Item 3 — Unify AI Builder surfaces

**File-by-file changes:**

1. **New file: `apps/web/src/hooks/useAiGenerate.ts`** — extracted from
   `PipelineCanvasPage.tsx:299-315` (`runAI`) and `AIBuilderPage.tsx:25-37` (`generate`).
   ```ts
   export interface AiGenerateResult { mermaid: string; definition: any }
   export function useAiGenerate() {
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);
     const generate = async (prompt: string): Promise<AiGenerateResult | null> => {
       setLoading(true); setError(null);
       try {
         const r = await api.generatePipeline(prompt);
         return { mermaid: r.mermaid, definition: r.definition ?? r };
       } catch (e: any) { setError(e.message); return null; }
       finally { setLoading(false); }
     };
     const refine = async (definition: any, prompt: string): Promise<AiGenerateResult | null> => {
       setLoading(true); setError(null);
       try {
         const r = await api.refinePipeline(definition, prompt);
         return { mermaid: r.mermaid, definition: r.definition ?? r };
       } catch (e: any) { setError(e.message); return null; }
       finally { setLoading(false); }
     };
     return { generate, refine, loading, error };
   }
   ```
   `AIBuilderPage.tsx` already has `Refine` support; the hook carries both so the canvas surface
   *could* add Refine later without re-deriving the API calls, even though this pass doesn't
   wire Refine into the canvas UI.

2. **`apps/web/src/pages/AIBuilderPage.tsx`** — replace the inline `generate` function (lines
   25-37) and `busy`/`msg` state with `useAiGenerate()`; keep all existing UI (warnings panel,
   mermaid editor, review pane) unchanged.

3. **`apps/web/src/pages/PipelineCanvasPage.tsx`** — replace `runAI` (lines 299-315) and
   `aiLoading`/`aiState` with `useAiGenerate()`. Rename the toolbar button at line 449 from
   title `"AI Builder"` to `"Quick AI add"` (icon unchanged — `Sparkles`). Add a single link in
   the inline AI bar (around line 728, next to the close button) to the full page:
   ```tsx
   <button className="glass-btn-ghost text-xs flex-none" onClick={() => navigate('/ai-builder')}>
     Open full AI Builder →
   </button>
   ```

**Sequencing:** Hook (step 1) lands first — it's net-new, no dependents yet. Steps 2 and 3 are
independent of each other once the hook exists and can land in either order or together.

### Item 4 — API client consolidation + `<ApiError>`

**File-by-file changes:**

1. **`apps/web/src/api.ts`** — add to the existing `api` object (after the `billing` block,
   following the established `request(...).then(j)` pattern):
   ```ts
   // Analytics
   getAnalyticsDatasets: (): Promise<Dataset[]> => request('/api/analytics/datasets').then(j),
   getAnalyticsSchema: (name: string) => request(`/api/analytics/datasets/${encodeURIComponent(name)}/schema`).then(j),
   queryAnalytics: (body: { dataset: string; spec: QuerySpec }) =>
     request('/api/analytics/query', { method: 'POST', body: JSON.stringify(body) }).then(j),
   listDashboards: () => request('/api/analytics/dashboards').then(j),
   createDashboard: (body: { name: string; definition: any }) =>
     request('/api/analytics/dashboards', { method: 'POST', body: JSON.stringify(body) }).then(j),
   updateDashboard: (id: string, body: { name?: string; definition?: any }) =>
     request(`/api/analytics/dashboards/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then(j),

   // Connector OAuth start (still does window.location.href after request() resolves,
   // so 401s get the existing refresh-and-retry path for free)
   startConnectorOAuth: (provider: 'google' | 'microsoft') =>
     request(`/api/connectors/${provider}/auth`).then(j),
   startZendeskOAuth: (subdomain: string) =>
     request('/api/connectors/zendesk/auth', { method: 'POST', body: JSON.stringify({ subdomain }) }).then(j),
   ```
   `Dataset`/`QuerySpec` types import from `apps/web/src/components/analytics/types.ts`.

2. **`apps/web/src/pages/AnalyticsPage.tsx:13-34`** — delete the local `apiFetch` function and
   `analyticsApi` object entirely; replace the 6 call sites (`analyticsApi.datasets()` →
   `api.getAnalyticsDatasets()`, `analyticsApi.schema` → `api.getAnalyticsSchema`,
   `analyticsApi.query` → `api.queryAnalytics`, `analyticsApi.listDashboards` →
   `api.listDashboards`, `analyticsApi.createDashboard` → `api.createDashboard`,
   `analyticsApi.updateDashboard` → `api.updateDashboard`) with the new `api.ts` methods. Add
   `import { api } from '../api';`.

3. **`apps/web/src/pages/ConnectorsPage.tsx:25-44`** — delete the local `startOAuth`/
   `startZendeskOAuth` functions; change `handleConnectGoogle`/`handleConnectMicrosoft` to call
   `api.startConnectorOAuth(provider)` and `handleConnectZendesk` to call
   `api.startZendeskOAuth(subdomain)`, then `window.location.href = res.url` on the resolved
   value (the `request()`/`j()` pair already throws on non-2xx, so the existing `try/catch`
   blocks in `ConnectorsPage` need no restructuring — only the call target changes).

4. **New file: `apps/web/src/components/ApiError.tsx`**:
   ```tsx
   import { AlertTriangle } from 'lucide-react';
   export function ApiError({ message, onRetry }: { message: string; onRetry?: () => void }) {
     // Strip the "{status} {raw body}" prefix api.ts's j() throws, if the body is JSON
     // with an `error` field — fall back to the raw message otherwise.
     let display = message;
     const spaceIdx = message.indexOf(' ');
     const body = spaceIdx >= 0 ? message.slice(spaceIdx + 1) : '';
     try { const parsed = JSON.parse(body); if (parsed?.error) display = parsed.error; } catch { /* not JSON */ }
     return (
       <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger/90">
         <AlertTriangle size={14} className="flex-none" />
         <span className="flex-1">{display}</span>
         {onRetry && <button className="glass-btn-ghost px-2 py-1 text-[11px]" onClick={onRetry}>Retry</button>}
       </div>
     );
   }
   ```

5. **`apps/web/src/pages/AIBuilderPage.tsx`** — replace the raw `<span>{msg}</span>` error
   display (currently shows `Failed: 422 {"error":"..."}` verbatim) with `<ApiError>` when
   `generate`/`refine` from `useAiGenerate()` (item #3) reports an error.

6. **`apps/web/src/pages/RunDetailPage.tsx`** — replace the raw error render (per
   `staff-eng-audit.md` Bug 3, "red box containing `404 {"error":"not found"}`") with
   `<ApiError message={...} />`.

7. **`apps/web/src/components/ConnectorsPage.tsx` / `apps/web/src/pages/ConnectorsPage.tsx`**
   — the actual file is `apps/web/src/pages/ConnectorsPage.tsx` (confirmed; there is no
   separate `components/ConnectorsPage.tsx`). Replace the current `error &&
   <div className="...">{error}</div>` block (around line 486-490) with `<ApiError
   message={error} onRetry={refresh} />`.

8. **`apps/web/src/pages/AnalyticsPage.tsx`** — replace the inline `{error && <span
   className="text-xs text-danger/80 ...">{error}</span>}` (line 211) with `<ApiError
   message={error} />`.

**Sequencing:** `api.ts` additions (step 1) land first — no dependents yet, additive only.
Steps 2–3 (Analytics/Connectors call-site swaps) depend on step 1 and should land together
with it logically but can be separate commits since they touch disjoint files. `<ApiError>`
(step 4) is independent of steps 1–3 (it's pure UI, doesn't touch `api.ts`) and can land any
time; steps 5–8 (wiring `<ApiError>` into the four pages) depend on step 4 existing. **Note the
cross-cutting dependency with item #1**: Analytics's `apiFetch` is being deleted here in favor
of `api.ts`, and item #1 also touches `AnalyticsPage.tsx`/`AddWidgetModal.tsx`. See Cross-
cutting sequencing below — land item #4's Analytics piece (steps 1–2 above) *before* item #1's
frontend changes, so item #1 is written against the final `api.ts`-based call sites instead of
the soon-to-be-deleted `apiFetch`/`analyticsApi`.

### Item 5 — Email/password login

**Backend — file-by-file:**

1. **New migration** (wherever this repo's existing migrations live — follow the existing
   migration file naming/location convention used for prior `users` table changes; not
   re-derived here since migration tooling wasn't in the read list for this pass — implementer
   should locate the existing migrations directory before writing this):
   ```sql
   ALTER TABLE users ADD COLUMN password_hash text;
   ```
   Nullable — Google/OIDC users never populate it; only password-registered users do.

2. **`apps/api/src/routes/auth.ts`** — add two routes, following the exact session-issuance
   pattern already used by `/google/callback` (lines 169-173) and `/oidc/callback` (lines
   350-352): resolve/create a user id, call `issueRefreshToken`, `setRefreshCookie`, then
   respond. Gate both behind `AUTH_PASSWORD_ENABLED`:
   ```ts
   import bcrypt from 'bcrypt'; // already an apps/api dependency (package.json:18, @types at :37) — no new package needed

   const PASSWORD_AUTH_ENABLED = process.env.AUTH_PASSWORD_ENABLED === 'true';

   auth.post('/register',
     rateLimit({ scope: 'password-register', keyFn: ipKey, limit: 10, windowSeconds: 60 }),
     async (req, res) => {
       if (!PASSWORD_AUTH_ENABLED) return res.status(404).json({ error: 'not found' });
       const { email, password, tenantName } = req.body ?? {};
       if (!email || typeof email !== 'string' || !password || password.length < 8) {
         return res.status(400).json({ error: 'email and a password of at least 8 characters are required' });
       }
       const normalizedEmail = email.toLowerCase();
       const existing = await pool.query(`SELECT id FROM users WHERE email=$1`, [normalizedEmail]);
       if (existing.rows.length) return res.status(409).json({ error: 'an account with this email already exists' });
       const hash = await bcrypt.hash(password, 12);
       const client = await pool.connect();
       try {
         await client.query('BEGIN');
         const t = await client.query(`INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
           [tenantName?.trim() || normalizedEmail.split('@')[0]]);
         const u = await client.query(
           `INSERT INTO users (tenant_id, email, password_hash, role, email_verified)
            VALUES ($1,$2,$3,'owner',true) RETURNING id`,
           [t.rows[0].id, normalizedEmail, hash]);
         await client.query('COMMIT');
         const userId = u.rows[0].id;
         auditAs(t.rows[0].id, userId, 'auth.register', req.ip ?? null, req.get('user-agent') ?? null, { provider: 'password' });
         const refresh = await issueRefreshToken(userId);
         setRefreshCookie(res, refresh);
         res.status(201).json({ ok: true });
       } catch (e) {
         await client.query('ROLLBACK').catch(() => {});
         throw e;
       } finally { client.release(); }
     });

   auth.post('/login',
     rateLimit({ scope: 'password-login', keyFn: ipKey, limit: 10, windowSeconds: 60 }),
     async (req, res) => {
       if (!PASSWORD_AUTH_ENABLED) return res.status(404).json({ error: 'not found' });
       const { email, password } = req.body ?? {};
       if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
       const { rows } = await pool.query(
         `SELECT id, tenant_id, password_hash FROM users WHERE email=$1`, [String(email).toLowerCase()]);
       const user = rows[0];
       if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
         return res.status(401).json({ error: 'invalid email or password' });
       }
       auditAs(user.tenant_id, user.id, 'auth.login', req.ip ?? null, req.get('user-agent') ?? null, { provider: 'password' });
       const refresh = await issueRefreshToken(user.id);
       setRefreshCookie(res, refresh);
       res.json({ ok: true });
     });
   ```
   Both routes set the refresh cookie the same way Google/OIDC do, so the existing frontend
   `AuthContext.refresh()` → `api.refresh()` → `api.me()` bootstrap flow (`AuthContext.tsx:46-55,64-78`)
   picks up the session with **zero frontend auth-state changes** — login just needs to redirect
   to `/` (or wherever) after the POST succeeds, same as the OAuth redirect today.

3. **`apps/api/src/index.ts:46-53`** — delete the `/dev/login` block entirely. Its purpose
   (non-Google access for QA/local dev) is now served by `/api/auth/register` +
   `/api/auth/login` when `AUTH_PASSWORD_ENABLED=true` is set in local/dev env files. Update
   any docker-compose / `.env.example` that currently sets `DEV_REFRESH_TOKEN` to instead set
   `AUTH_PASSWORD_ENABLED=true` (locate via grep on `DEV_REFRESH_TOKEN` — not in this pass's
   read list, flag for implementer).

4. **Expose feature flag to frontend** — add `passwordAuthEnabled: boolean` to whatever
   endpoint already reports build/runtime feature flags. Check `apps/api/src/routes/edition.ts`
   (`/api/edition`, already mounted and already authenticated — but login page is pre-auth, so
   this needs to be visible *before* login). Simplest approach matching this codebase's existing
   `VITE_OIDC_ENABLED` build-time pattern (`auth.tsx:65`): add a parallel
   `VITE_PASSWORD_AUTH_ENABLED` build-time env var read the same way, rather than a new runtime
   API call — this matches the existing OIDC toggle exactly and needs no new endpoint.

**Frontend — file-by-file:**

5. **`apps/web/src/api.ts`** — add:
   ```ts
   registerWithPassword: (body: { email: string; password: string; tenantName?: string }) =>
     request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }).then(j),
   loginWithPassword: (body: { email: string; password: string }) =>
     request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }).then(j),
   ```

6. **`apps/web/src/pages/auth.tsx`** — add a `PASSWORD_AUTH_ENABLED` constant mirroring
   `OIDC_ENABLED` (line 65): `const PASSWORD_AUTH_ENABLED = import.meta.env.VITE_PASSWORD_AUTH_ENABLED === 'true';`.
   In `LoginPage`, when enabled, render an email/password form below the Google/OIDC buttons
   with a toggle between "Sign in" and "Create account" modes, calling
   `api.loginWithPassword`/`api.registerWithPassword` then `window.location.href = '/'` (full
   reload, matching how the OAuth redirect flow already re-bootstraps `AuthContext` — simplest
   way to pick up the new refresh cookie without inventing a second session-bootstrap path in
   `AuthContext`).

**Sequencing:** Migration (1) → backend routes (2) → delete `/dev/login` (3) → flag plumbing
(4) must land in that order on the backend. Frontend (5, 6) depends on (2) existing (routes
must exist before the frontend calls them) and on (4)'s build-time flag convention being
decided, but can otherwise land as one PR alongside the backend change since this is a small,
self-contained feature.

### Item 6 — AppShell stale header

**File-by-file:**

1. **`apps/web/src/components/AppShell.tsx`** — line 4 import: add `useLocation` to the
   existing `react-router-dom` import. Line 38:
   ```ts
   // BEFORE
   const pathname = typeof window !== 'undefined' ? window.location.pathname : '/pipelines';
   // AFTER
   const { pathname } = useLocation();
   ```
2. **Same file, `PAGE_META` (lines 21-32)** — optional one-line addition while touching this
   file: add `'/runs/:id'`... actually `PAGE_META` is keyed by literal pathname, not a route
   pattern, so a dynamic `/runs/:id` can't be a static key. Leave `PAGE_META` lookup as a
   prefix-aware fallback instead: change `PAGE_META[pathname] ?? PAGE_META['/pipelines']` to
   `PAGE_META[pathname] ?? PAGE_META[Object.keys(PAGE_META).find(k => pathname.startsWith(k + '/'))] ?? PAGE_META['/pipelines']`,
   and add `'/runs': { title: 'Runs', eyebrow: 'History & observability' }` is already present
   — the prefix match against the existing `/runs` key now correctly covers `/runs/:id` too,
   with no new `PAGE_META` entries required. This is bundled into item #6 since it's the same
   file/same root cause (no reactive pathname) and is a 1-line addition once `useLocation` is
   already being used.

**Sequencing:** Single-file, single-commit change. No dependents, no dependencies.

---

## Cross-cutting sequencing

Dependency-checked order (not just severity order):

1. **Item 6 (AppShell)** — zero dependencies on anything else, trivial, do it first to get a
   quick win and de-risk nothing else.
2. **Item 4, steps 1–3 (api.ts additions + Analytics/Connectors call-site swap)** — lands
   before item 1's frontend changes. Confirmed dependency: item 1 touches
   `AnalyticsPage.tsx`/`AddWidgetModal.tsx`, and item 4 deletes `AnalyticsPage.tsx`'s local
   `apiFetch`/`analyticsApi` object that item 1's widget-building code currently calls through
   (`analyticsApi.query` at `AnalyticsPage.tsx:95`). Writing item 1 against `apiFetch` first and
   then immediately deleting `apiFetch` in item 4 means re-touching the same lines twice for no
   reason — land item 4's Analytics piece first so item 1 is written once, against the final
   `api.queryAnalytics`/`api.getAnalyticsDatasets` call sites.
3. **Item 1 (Analytics contracts)** — backend dataset-key rename can land anytime
   independently; frontend `QuerySpec`/`AddWidgetModal` changes land after step 2 above.
4. **Item 2 (Canvas Edit/Backfill)** — independent of 1/4 (touches `api.ts`,
   `PipelinesPage.tsx`, `PipelineCanvasPage.tsx` — no overlap). Can run in parallel with 1/4.
5. **Item 3 (AI Builder unification)** — independent of 1/2/4 (touches
   `PipelineCanvasPage.tsx` and `AIBuilderPage.tsx`, but different code regions than item 2's
   canvas changes — coordinate if implemented by the same person in the same PR window to avoid
   merge conflicts in `PipelineCanvasPage.tsx`, but no functional dependency).
6. **Item 4, steps 4–8 (`<ApiError>` component + wiring into 4 pages)** — depends on item 3
   landing first only for the AI Builder page specifically (step 5 wires `<ApiError>` into
   `AIBuilderPage`'s new `useAiGenerate()` error state) — do item 3 before item 4's step 5, or
   wire `<ApiError>` against the pre-hook `msg` state and it still works either order (the prop
   is just a string either way). Not a hard blocker; sequence as convenient.
7. **Item 5 (password login)** — fully independent of 1–4 and 6 (different files entirely:
   `auth.ts`, `auth.tsx`, `index.ts`, migration). Can be built in parallel with everything else
   by a different engineer.

Suggested PR grouping for a single engineer working serially:
`6 → 4(api.ts+Analytics/Connectors) → 1 → 2 → 3 → 4(ApiError) → 5`.
If parallelized across engineers: `{6, 2, 5}` can start immediately; `{4, then 1}` is one
engineer's track; `3` after `2`'s canvas changes land to avoid conflicting edits to
`PipelineCanvasPage.tsx`.

---

## Explicit non-goals

Not designed in this pass (tracked in `reconciled-feedback.md` items #7–14, all deferred,
no work here):

- **#7 — `apps/web` tsconfig.json + `tsc --noEmit` in CI.** Would have caught items #1's type
  mismatches automatically; still out of scope for *this* design, which fixes the bugs the
  missing typecheck allowed through, not the missing typecheck itself.
- **#8 — Mobile layout (≤390px) on `/` and `/pipelines`.** Needs a design pass per the PM
  audit, not a code-level fix; explicitly P2 and deferred.
- **#9 — De-duplicate `ActivityIcon`/`activityIcon()`.** Trivial cleanup, zero behavior change,
  not touched by any of items 1–6's file changes, so no forced overlap either.
- **#10 — Ship or hide Lineage/Config/Access drawer tabs.** Untouched; `PipelineDrawer`'s tab
  switcher (`PipelinesPage.tsx:217-228`) is read but not modified by item #2's Edit/Backfill
  fix (which only changes the action handlers, not the tab UI).
- **#11 — Pipeline name truncation.** Cosmetic, not touched.
- **#12 — Monitoring SLO/run-count discrepancy.** Needs eng confirmation of intent before any
  design; not actionable yet.
- **#13 — Delete dead `stubs.tsx`.** One-line cleanup, unrelated to items 1–6, can be done
  trivially any time but isn't bundled here to keep this PR set scoped.
- **No new abstractions beyond what's listed above**: no generic plugin/connector framework,
  no new state-management library, no GraphQL/tRPC layer, no design-system component library
  beyond the one `<ApiError>` component. Every new file in this design (`useAiGenerate.ts`,
  `ApiError.tsx`) is justified by an immediate, named caller in items 1–6, not by anticipated
  future use.

---

## P2/P3 Items — Design Appendix

Items 7–14 from `reconciled-feedback.md`. Simpler than items 1–6; LLD is kept brief since each
is a small, self-contained change.

### Item 7 — `apps/web` tsconfig.json + `tsc --noEmit` in build

**Why:** Root cause of both P0 Analytics bugs shipping undetected. Fix the compiler gap, not
just the bugs.

**LLD:**
1. **New file: `apps/web/tsconfig.json`** — mirrors `apps/api/tsconfig.json` structure:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "target": "ES2020",
       "useDefineForClassFields": true,
       "lib": ["ES2020", "DOM", "DOM.Iterable"],
       "module": "ESNext",
       "moduleResolution": "bundler",
       "jsx": "react-jsx",
       "strict": true,
       "noEmit": true,
       "paths": {}
     },
     "include": ["src"],
     "references": [{ "path": "./tsconfig.node.json" }]
   }
   ```
   Check if `tsconfig.base.json` and `tsconfig.node.json` already exist at repo root (Vite
   projects typically have `tsconfig.node.json` for the vite config itself — create it if not).
2. **`apps/web/package.json` `scripts`** — add `"typecheck": "tsc --noEmit"` and change
   `"build": "vite build"` to `"build": "tsc --noEmit && vite build"`. This mirrors
   `apps/api/package.json`'s pattern.
3. **Verify** the new typecheck catches the (now-fixed) Analytics mismatches by running it after
   landing items 1 and 4 — expect zero errors. If pre-existing type errors surface beyond the
   Analytics bugs, fix them in the same PR (don't use `// @ts-ignore` or `any`-widening as a
   silencer).

### Item 8 — Mobile layout (≤390px) on `/` and `/pipelines`

**Approach:** Minimal Tailwind breakpoint treatment — sidebar collapses to hamburger, toolbar
wraps, list rows prevent overlap. No new component library, no layout engine. Use Tailwind `sm:`
(640px) breakpoint since that's where both pages break (confirmed by PM audit: 375px broken,
768px fine).

**LLD — `apps/web/src/components/AppShell.tsx`:**
- Add `const [sidebarOpen, setSidebarOpen] = useState(false)` state.
- The icon rail (`<nav className="...w-[52px]...">`) gets `hidden sm:flex` so it's invisible on
  mobile. Add a `<button>` in the top-bar (visible only on mobile via `flex sm:hidden`) that
  toggles a full-height overlay drawer containing the same nav items — or simplest: a single
  row of icon buttons along the top on mobile (inline the same `NAV` items horizontally).
- Add an overlay dismiss (`onClick={() => setSidebarOpen(false)}`) and close on nav.
- The `<main>` content area removes its `ml-[52px]` margin on mobile: `ml-0 sm:ml-[52px]`.

**LLD — `apps/web/src/pages/PipelinesPage.tsx`:**
- List rows: ensure each row is `flex flex-wrap` rather than `flex flex-nowrap`, so metadata
  (stage badge, run status, timestamp) wraps below the pipeline name on narrow viewports instead
  of colliding. Specific class changes depend on the current row structure (implementer reads the
  actual JSX before editing).
- Filter pills row: add `flex-wrap` so pills flow to a second line rather than overflowing.

**LLD — `apps/web/src/pages/PipelineCanvasPage.tsx` toolbar:**
- Toolbar (`<div className="...flex items-center gap-...">` at the top): add `flex-wrap` and
  ensure the pipeline name `<input>` has a `min-w-0 flex-shrink` so it compresses rather than
  overflowing the toolbar. Save/Activate/Run buttons can be `flex-none` to preserve their size.
- At `sm:` (640px) breakpoint and above, the current fixed-layout toolbar is acceptable per PM
  audit — no change needed there.

**Out of scope:** No bottom-nav redesign, no touch-specific gesture handling, no PWA manifest.
Ponytail note: if the PM's own audit says "tablet (768px) is fine," the fix ceiling is "make
375px not obviously broken," not "build a fully-responsive mobile-first redesign."

### Item 9 — De-duplicate `ActivityIcon`

**LLD:**
1. In `apps/web/src/components/canvas/FlowNode.tsx` — ensure `ActivityIcon` is exported:
   change `function ActivityIcon` to `export function ActivityIcon`.
2. In `apps/web/src/pages/PipelinesPage.tsx:57-75` — delete the `activityIcon()` function
   entirely; add `import { ActivityIcon } from '../components/canvas/FlowNode';` and replace all
   `activityIcon(node.type)` call sites with `<ActivityIcon type={node.type} />` (or whatever
   the actual prop name is — confirm by reading both files before editing).
3. Verify the icon signature matches between the two files (both take `activityType: string` per
   the audit — confirm). If the canvas version uses a React component and the Pipelines version
   uses a function-returning-JSX, normalize to the React component form.

### Item 10 — Hide pipeline drawer fake-door tabs

**Approach:** Remove Lineage/Config/Access tabs from the drawer until implemented. Don't badge
them "Soon" — a tab that only says "Soon" trains users to stop reading tabs.

**LLD — `apps/web/src/pages/PipelinesPage.tsx:261-263`:**
Delete the three tab-button JSX elements for Lineage, Config, and Access. The "Runs" tab
becomes the only tab. If having a single tab makes the tab bar itself redundant, remove the tab
bar too and render the runs panel directly inside the drawer — one less click for every user.
No other file changes; the tab content components for those three tabs can stay in the codebase
(they're inline JSX, not separate files — just gated by the removed tab buttons).

// ponytail: delete over badge; badge "Soon" is fake UI. Restore when the tab has real content.

### Item 11 — Pipeline name truncation / scanability

**LLD — `apps/web/src/pages/PipelinesPage.tsx`:**
- Find the pipeline-name `<span>` in the list row (per PM audit: it truncates to "Q…" at common
  widths because right-side metadata occupies fixed space). Give it `min-w-0 truncate flex-1`
  and ensure the metadata cluster (`stage badge + run status + timestamp`) is `flex-none`. This
  allows the name to use all available space and only truncates if truly necessary (no room at
  all), rather than truncating prematurely because it's not marked as the flex-growable item.
- No visual change at wide viewports; at narrow viewports the name gets more space before
  truncating than it does today.

### Item 12 — Monitoring SLO/run-count explainer

**Approach:** Per reconciled doc, this needs eng confirmation of intent before a code fix. If
the discrepancy is intentional (SLO breaches can be evaluated independently of windowed run
counts — e.g. "pipeline hasn't run in N hours" is a breach even when run count is 0), add a
short tooltip/explainer. If it's a bug, that's a backend fix not covered here.

**LLD (assumes intentional):**
- In `apps/web/src/pages/MonitoringPage.tsx`, find the "SLO breaches" metric card/cell.
- Add a `title="SLO breaches include availability SLOs (e.g. pipeline-not-run-in-N-hours) independent of the run count window"` attribute on the element, or a small `<span>` info icon with tooltip text. One-line addition.
- If eng confirms it's a bug instead, revisit and fix backend — defer until then.

### Item 13 — Delete dead `stubs.tsx`

**LLD:**
```
rm apps/web/src/pages/stubs.tsx
```
Confirmed unimported (`App.tsx` imports real pages directly; no other file references `stubs`).
Single delete, zero callers.

### Item 14 — Shared `useApiResource` data-fetching hook

**Approach:** Extract the hand-rolled `loading/error/refresh` boilerplate common to 6 pages
into one hook. Since items 1 and 4 already touch AnalyticsPage and ConnectorsPage, port all
6 affected pages in the same pass for consistency — a half-extracted hook (only some pages use
it) is worse than no hook.

**LLD — new file: `apps/web/src/hooks/useApiResource.ts`:**
```ts
import { useState, useEffect, useCallback, useRef } from 'react';

export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  const run = useCallback(async () => {
    const id = ++counter.current;
    setLoading(true); setError(null);
    try {
      const result = await fetcher();
      if (id === counter.current) setData(result);
    } catch (e: any) {
      if (id === counter.current) setError(e.message);
    } finally {
      if (id === counter.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refresh: run };
}
```
The `counter` ref cancels stale results from prior fetch attempts when `refresh()` is called
mid-flight — the one non-obvious correctness detail the per-page hand-rolled versions all
silently omit.

**Pages to migrate** (replace hand-rolled `loading`/`error`/`refresh` state + `useEffect`):
- `apps/web/src/pages/PipelinesPage.tsx:321-328`
- `apps/web/src/pages/LifecyclePage.tsx:157-163`
- `apps/web/src/pages/RunsPage.tsx:27-46`
- `apps/web/src/pages/MonitoringPage.tsx:63-79`
- `apps/web/src/pages/LineagePage.tsx:136-154`
- `apps/web/src/pages/TeamPage.tsx:18-24`
- `apps/web/src/pages/AnalyticsPage.tsx` (already being touched by item 4 — port here)

Pattern for each migration (shown for RunsPage as representative):
```ts
// BEFORE
const [runs, setRuns] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
useEffect(() => {
  setLoading(true);
  api.listRuns().then(r => { setRuns(r); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); });
}, []);

// AFTER
const { data: runs, loading, error, refresh } = useApiResource(() => api.listRuns(), []);
```
Each migration is mechanical — read the actual `useState`/`useEffect` block in each file
before editing to confirm the exact shape (some pages may load multiple resources; in that case
use multiple `useApiResource` calls, one per resource, rather than combining into one).

**Sequencing:** Hook file lands first (no callers yet). Pages can be migrated in any order
independently. Port AnalyticsPage as part of item 4's PR (same file already being touched) to
avoid a second PR touching the same file. Port the other 5 pages together in a separate
cleanup PR.

---

## Full implementation order (all 14 items)

```
1.  Item 13 — delete stubs.tsx            (trivial, no deps)
2.  Item 6  — AppShell useLocation fix    (trivial, no deps)
3.  Item 9  — ActivityIcon dedup          (trivial, no deps)
4.  Item 7  — apps/web tsconfig           (no deps, unblocks CI verification)
5.  Item 4a — api.ts additions            (Analytics/Connectors methods + getPipeline for item 2)
6.  Item 1  — Analytics contracts         (depends on 4a; backend rename first, then frontend)
7.  Item 2  — Canvas Edit/Backfill nav    (depends on 4a for getPipeline; independent of 1)
8.  Item 14 — useApiResource hook + port  (port AnalyticsPage in same PR as step 6)
9.  Item 4b — ApiError component + wiring (depends on item 3 for AIBuilderPage error state)
10. Item 3  — useAiGenerate hook          (independent; before 4b for AIBuilder page)
11. Item 10 — hide fake-door tabs         (trivial, touches PipelinesPage independent of others)
12. Item 11 — name truncation CSS         (trivial, touches PipelinesPage — bundle with 11)
13. Item 8  — mobile layout               (larger, independent, can be a separate PR)
14. Item 5  — email/password login        (fully independent, can be parallel track)
15. Item 12 — Monitoring SLO explainer    (gate on eng confirmation of intent)
```
