# Reconciled UI/Engineering Feedback — dataflow-poc apps/web

Inputs: [`pm-ui-audit.md`](./pm-ui-audit.md) (live UI walkthrough, product lens) and
[`staff-eng-audit.md`](./staff-eng-audit.md) (source-level audit, engineering lens), produced
independently by two agents with no shared context. This doc merges them.

---

## 1. Overlapping findings (both agents flagged independently — fix these first)

### 1a. AI Builder is duplicated: canvas inline bar vs. dedicated `/ai-builder` page
- **PM lens:** Canvas sidebar icon literally titled "AI Builder" (`PipelineCanvasPage.tsx:449`)
  and the empty-state "Generate with AI" CTA both open the same inline prompt bar — same name,
  same backend call, as the dedicated `/ai-builder` three-pane page, with no link between them.
  Biggest "didn't I just do this?" moment in the app.
- **Eng lens:** Confirmed at the code level — `PipelineCanvasPage.tsx:78-81,299-315,712-736`
  (`showAI`/`aiPrompt`/`runAI()`) calls the same `api.generatePipeline` as `AIBuilderPage.tsx`,
  but with separately-maintained prompt/loading/error state, no `Refine` support, and no
  mermaid-warning handling that `/ai-builder` has. Two surfaces that can silently drift.
- **Verdict:** Real product + engineering duplication. Not a false positive from either side.

### 1b. Canvas (`/`) is hard to navigate into and out of
- **PM lens:** `/` has zero nav chrome (not in `AppShell`'s `NAV` array), so a freshly-logged-in
  user lands on a single-pipeline editor with no visible path back to `/pipelines`, `/runs`, etc.
- **Eng lens:** `PipelinesPage.tsx:187,189` "Edit"/"Backfill" buttons navigate to
  `/?pipeline=<id>` and `/?pipeline=<id>&backfill=1`, but `PipelineCanvasPage` never reads
  `useSearchParams()`/`location.search` — only `location.state?.definition`. Clicking Edit from
  the list opens a **blank** new-pipeline canvas; the existing pipeline never loads.
- **Verdict:** Two faces of the same root problem — the canvas page is structurally disconnected
  from the rest of the app's navigation, both in chrome (PM) and in the actual edit-entry
  contract (eng). This is higher severity than either report scores it alone: it's not just
  "confusing," it's a broken edit flow.

### 1c. Inconsistent / duplicated API-call and error-handling patterns across pages
- **PM lens:** Three pages (AI Builder, RunDetail, Connectors) dump raw API error bodies
  (`422 {"error":"..."}`, bare `401`) straight into the UI — recommends one shared
  `<ApiError>` component.
- **Eng lens:** `AnalyticsPage.tsx` and `ConnectorsPage.tsx` each hand-roll their own `fetch`
  wrapper instead of using `apps/web/src/api.ts`, losing the shared 401-refresh-and-retry
  behavior that 9 of 11 other pages get for free.
- **Verdict:** Same underlying cause — no single client-side API layer that owns both request
  dispatch (auth refresh) and error presentation. Fixing the client consolidation (1c-eng) is
  the natural place to also fix the error-display gap (1c-PM): one `api.ts` call site, one error
  shape, one `<ApiError>` renderer.

---

## 2. PM-only findings (product/UX, not independently re-verified by code audit)

| Severity | Finding |
|---|---|
| P1 | No non-Google login path — `/login` is Google-OAuth-only; only bypass is an undocumented backend `/dev/login` route. Hard wall for any non-Google-Workspace evaluator of an open-core product. |
| P2 | Mobile (≤390px) layout broken on `/` and `/pipelines` — fixed sidebar doesn't collapse, toolbar clips, list rows overlap. Tablet (768px) is fine. |
| P3 | Pipeline-drawer Lineage/Config/Access tabs are static "Coming soon" stubs with no visual cue they're unimplemented (`PipelinesPage.tsx:261-263`). |
| P3 | Pipeline names truncate prematurely in the list even when space is available; seeded data has 3 pipelines all named "QA-E2E", making them indistinguishable. |
| P3 (needs eng confirm) | Monitoring shows "Runs: 0" alongside "SLO breaches: 6" for the same window — may be correct semantics but reads as contradictory with no explainer. |

## 3. Staff-eng-only findings (correctness/maintainability, not visible from UI walkthrough)

| Severity | Finding |
|---|---|
| P0 | Analytics `QuerySpec` shape mismatch (`types.ts:11-15` vs `queryBuilder.ts:19-34`) — every chart silently returns raw unaggregated rows instead of the requested aggregation. No error, HTTP 200, just wrong data. |
| P0 | Analytics `Dataset` shape mismatch — backend returns `{name, rowCount}` (`analytics.ts:58`), frontend expects `{collection, row_count}` — throws a runtime `TypeError`, crashing the Analytics page whenever datasets exist. |
| P1 | `AppShell.tsx:38` reads `window.location.pathname` instead of `useLocation()` — page header title/eyebrow freezes after the first route since `AppShell` itself never remounts on child navigation. |
| P2 | `apps/web` has no `tsconfig.json` and its build script (`vite build`) doesn't typecheck, unlike `apps/api`/`apps/worker`. Root cause of the two Analytics contract bugs shipping undetected. |
| P2 | `ActivityIcon` logic duplicated byte-for-byte between `FlowNode.tsx:9-28` and `PipelinesPage.tsx:57-75`; both copies are already stale against newer activity types. |
| P3 | No shared data-fetching hook — 6 pages (Pipelines, Lifecycle, Runs, Monitoring, Lineage, Team) each hand-roll identical `loading/error/refresh` boilerplate. |
| Confirmed non-issue | `apps/web/src/pages/stubs.tsx` is dead, unimported leftover code — safe to delete, not active duplication. |
| Confirmed non-issue | No backend route-level duplication for pipelines — `apps/api/src/routes/pipelines.ts` is the single source of truth. |

---

## 4. Combined prioritized backlog

| # | Item | Severity | Source | Notes |
|---|---|---|---|---|
| 1 | Analytics `QuerySpec` + `Dataset` shape mismatches | P0 | eng | Silent wrong data + page crash. Fix both contracts together. |
| 2 | Canvas Edit/Backfill navigation is dead (blank canvas instead of loading the pipeline) | P0 (escalated from P1) | overlap 1b | PM found the symptom (no chrome), eng found the cause (no query-param hydration). Combined severity is higher than either alone — it's a broken core workflow, not just a UX gap. |
| 3 | Unify the two AI Builder surfaces (canvas inline bar + `/ai-builder`) | P1 | overlap 1a | Decide: one canonical flow, or two clearly-differentiated ones sharing a `useAiGenerate()` hook. |
| 4 | Consolidate API client + shared error UI (Analytics/Connectors raw `fetch` + raw error strings) | P1 | overlap 1c | One `api.ts` call site per page, one `<ApiError>` component. |
| 5 | No non-Google login path | P1 | PM | Product/business decision needed (env-gated dev login vs. real password/magic-link). |
| 6 | `AppShell` stale header on navigation | P1 | eng | One-line fix (`useLocation()`), high visibility (every page transition). |
| 7 | Give `apps/web` a `tsconfig.json` + wire `tsc --noEmit` into build/CI | P2 | eng | Prevents the next Analytics-style contract bug from shipping silently. |
| 8 | Mobile layout broken on `/` and `/pipelines` (≤390px) | P2 | PM | Needs a design pass, not just a bug fix. |
| 9 | De-duplicate `ActivityIcon` | P2 | eng | Trivial, zero behavior change. |
| 10 | Ship or hide drawer fake-door tabs (Lineage/Config/Access) | P3 | PM | |
| 11 | Pipeline name truncation / scanability | P3 | PM | |
| 12 | Monitoring SLO/run-count discrepancy — confirm intent | P3 | PM | |
| 13 | Delete dead `stubs.tsx` | P3 | eng | One-line cleanup. |
| 14 | Shared data-fetching hook for 6 pages | P3 | eng | Defer — quality-of-life only, no bug. |

Items 1–6 (P0/P1) are the scope for the next design pass (HLD/LLD). Items 7+ are tracked but
not blocking.
