# DataFlow Web — PM UI Audit

Conducted by driving the live app (apps/web on Vite :3000, apps/api on :4000, against the
existing `dataflow-postgres-local` dev database) through `/login`, all 14 routes in
`apps/web/src/App.tsx`, and the primary interactive flows on each. Auth was reached via the
backend's `/dev/login` QA-bypass mechanism (refresh-token cookie seeded directly into
`refresh_tokens`), since the product itself offers no non-Google login path — see Bug #1.

---

## Bugs Found

### Bug 1 — No login path without Google OAuth (onboarding blocker)
- **Page/route:** `/login` (`apps/web/src/pages/auth.tsx`)
- **Repro:** Load `/login` with no Google Workspace account, or in an environment where
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` aren't configured.
- **What I saw:** The only sign-in affordance is "Continue with Google" (`GoogleButton`). An
  OIDC/SSO button exists in code but is gated behind a **build-time** env flag
  (`VITE_OIDC_ENABLED`), so it can't even be toggled at runtime. There is no email/password
  fallback anywhere in the UI. The only other way into the app is the backend's
  `GET /dev/login` route (`apps/api/src/index.ts:47`), which isn't linked from any UI and
  requires knowing to set `DEV_REFRESH_TOKEN` and hit a raw API URL.
- **Severity:** P1 — this blocks any self-hosted/open-core user or fresh evaluator who
  doesn't use Google Workspace from ever getting in. For an n8n-style open-core product this
  is the literal front door.

### Bug 2 — AI Builder fails with a raw, unstyled API error string
- **Page/route:** `/ai-builder`
- **Repro:** Enter the pre-filled prompt ("Pull Zendesk tickets every 5 minutes...") and
  click **Generate**.
- **What I saw:** `POST /api/ai/generate` returns `422`, and the UI renders, verbatim, in the
  message line below the button:
  `Failed: 422 {"error":"could not generate a valid pipeline: Request failed with status code 404"}`
  This is because Ollama isn't running (it's an opt-in `--profile ai` Docker service per
  `docker-compose.yml`), but the user sees raw JSON and an Axios error message, not "AI
  generation is unavailable" or any actionable guidance.
- **Severity:** P2 — the feature is fully broken out of the box for anyone who hasn't
  separately stood up the `ai` Docker profile, and the failure mode actively confuses rather
  than informs.

### Bug 3 — RunDetailPage renders a bare JSON error, no styled error/empty state
- **Page/route:** `/runs/:id` (e.g. `/runs/nonexistent-id`)
- **Repro:** Navigate to a run ID that doesn't exist (or any run after it's been pruned).
- **What I saw:** The page shows only a red box containing `404 {"error":"not found"}` —
  the raw API response, not a designed "Run not found" state. Additionally, the page header
  (eyebrow/title) incorrectly reads "BUILD & ORCHESTRATE / Pipelines" instead of anything
  related to Runs, because `PAGE_META` in `AppShell.tsx` has no entry for `/runs/:id` and
  silently falls back to the `/pipelines` default.
- **Severity:** P2 — same raw-error pattern as Bug 2, plus a separate header/breadcrumb bug.

### Bug 4 — Connectors OAuth-connect failure shows just a number
- **Page/route:** `/connectors`
- **Repro:** Click "Connect Google" (or any provider) when OAuth client credentials aren't
  configured server-side.
- **What I saw:** `GET /api/connectors/google/auth` returns `401`, and the page renders a red
  box containing literally `401` — no message, no context, not even the JSON body.
- **Severity:** P2 — third occurrence of the same error-handling gap (raw/partial API errors
  surfaced with no UX treatment). This is a systemic pattern, not an isolated bug — one shared
  "API error banner" component would fix all three (Bugs 2–4) at once.

### Bug 5 — Pipeline drawer tabs (Lineage / Config / Access) are non-functional stubs
- **Page/route:** `/pipelines` → click any pipeline row → drawer opens → click "Lineage",
  "Config", or "Access" tab
- **Repro:** Open the drawer for any pipeline, click the non-"Runs" tabs.
- **What I saw:** Source confirms (`PipelinesPage.tsx:261-263`) these three tabs all render a
  static "Coming soon" placeholder. They're visually identical to the working "Runs" tab with
  no visual cue (badge, disabled state) that they're unimplemented until clicked.
- **Severity:** P3 — not broken, but it's a "fake door" that costs a click and a moment of
  confusion for every user who tries it; should either be hidden, badged "Soon", or built.

### Bug 6 — Pipeline name truncated even when horizontal space is available
- **Page/route:** `/pipelines`
- **Repro:** View the pipeline list with names like "QA-E2E-Manual"; resize narrower.
- **What I saw:** At common widths, multi-word pipeline names truncate to "Q…" inside the
  list row well before the row visually runs out of space (the row's right-hand metadata
  — stage badge, run status, relative time — eats the space first). Users can't tell pipelines
  apart at a glance when several share a prefix (the seeded data has 3 pipelines all literally
  named "QA-E2E").
- **Severity:** P3 — cosmetic but actively harms scanability of the one page whose whole job
  is "let me find my pipeline."

### Bug 7 — Mobile layout is unusable on the canvas and pipelines list (≤390px)
- **Page/route:** `/` (PipelineCanvasPage) and `/pipelines`, viewport resized to 375×812
- **Repro:** `preview_resize` to the "mobile" preset on either route.
- **What I saw:**
  - On `/pipelines`: the 52px icon sidebar stays fixed (no collapse/drawer), filter pills
    wrap into a second row that visually collides with the list below, and list rows overlap
    vertically — the "Manual" trigger-type label on one row sits on top of the row beneath it.
  - On `/`: the top toolbar (pipeline name input + Save/Activate/Run buttons) overflows and
    clips the pipeline name field; only "...pelin" of "My pipeline" is visible.
  - At 768px (tablet) both pages render acceptably, so this is specifically a phone-width
    failure, not a general responsive gap.
- **Severity:** P2 — there is no mobile breakpoint handling at all on the two highest-traffic
  pages; this isn't "needs polish," it's "unusable below ~600px."

### Bug 8 (data anomaly, lower confidence) — Monitoring shows SLO breaches with zero runs
- **Page/route:** `/monitoring`
- **What I saw:** "Runs: 0" and "Failures: 0" alongside "SLO breaches: 6" for the same
  7-day window. Possibly correct (breaches could be evaluated independently of the windowed
  run count, e.g. "pipeline hasn't run in N hours" SLOs), but it reads as contradictory on
  the page with no tooltip/explanation distinguishing the two metrics' semantics.
- **Severity:** P3 — flag for engineering to confirm whether this is intentional; if so, a
  one-line explainer would prevent it looking like a bug.

---

## Duplicate / Overlapping Pages

**`/` (PipelineCanvasPage), `/ai-builder` (AIBuilderPage), and `/pipelines` (PipelinesPage)
are not simply overlapping — `/` and `/ai-builder` overlap on AI generation specifically,
while `/` and `/pipelines` overlap on "where do I work with a pipeline."**

- **`/pipelines` vs `/` — list vs. editor, but the link between them is hidden.**
  `/pipelines` is a genuine, well-built list/management view (filters by stage, search, a
  detail drawer with run history). Its "+ New" button and each row's "Edit" action both
  navigate to `/` — the single-pipeline canvas editor. That's a sensible split (list page +
  editor page) **except** `/` has no entry in the `AppShell` sidebar (`AppShell.tsx` `NAV`
  array has no `/` item) and renders with zero chrome (no sidebar, no way back to
  `/pipelines` except a small "All pipelines" icon button buried in the canvas's own left
  rail). A user who lands on `/` directly (it's the app's literal root/index route) has no
  visible path to the pipeline list, Runs, Monitoring, or any other page — they're dropped
  into a single-purpose editor with no app context.

- **`/ai-builder` vs. the canvas's own inline AI bar — true functional duplication.**
  `PipelineCanvasPage` has its own self-contained "AI Builder" feature: a sidebar icon
  literally titled `"AI Builder"` (`PipelineCanvasPage.tsx:449`) that toggles an inline
  prompt bar, plus a second entry point via the empty-canvas "Generate with AI" CTA — both
  open the *exact same* inline command bar (single text input → "Generate" → nodes appear
  directly on the canvas). Meanwhh `/ai-builder` is a separate, full-page, three-pane
  experience (prompt panel + editable Mermaid source + live preview + "Open in canvas"
  review step) that is reachable from the `AppShell` sidebar's "AI Builder" nav item — but
  that nav item is only visible on `/pipelines`, `/runs`, etc., never from the canvas itself
  (since `/` has no `AppShell` chrome). So: two differently-scoped AI generation UIs, both
  named "AI Builder," neither one linking to the other, doing the same underlying job
  (`POST /api/ai/generate` / `/api/ai/refine`) with different levels of control. A new user
  has no way to know the dedicated `/ai-builder` page (with Mermaid editing, refine, and a
  review step) even exists unless they're already on a page with the full sidebar.

**Net effect:** a new user's most likely path is Login → lands on `/` (root) → sees "Add a
source" / "Generate with AI" → uses the inline AI bar → never discovers `/pipelines` (the
actual pipeline list) or `/ai-builder` (the more capable AI flow) because `/` has no
navigation chrome at all.

**Other pages:** no other route pair showed functional overlap. `/lifecycle` (promote
draft→integration→production) and `/runs` + `/monitoring` (execution history vs. aggregate
health) are distinct enough in source and in the live UI that they didn't cause confusion
during the walkthrough.

---

## Product Recommendations

1. **Add a real login path.** At minimum, surface the existing `/dev/login` mechanism as a
   proper (env-gated) email/password or magic-link option for self-hosted/community-edition
   users — Google-only OAuth is a hard wall for anyone evaluating the open-core product
   without a Google Workspace account.

2. **Give `/` real navigation chrome, or merge it into `/pipelines`.** Two options, both
   better than today:
   - (a) Put the canvas inside `AppShell` (or a lightweight variant of it) so users always
     have a way back to Pipelines/Runs/etc., and add a `/pipelines/:id` URL instead of a bare
     `/` for "editing pipeline X" — `/` as a global "open the editor with no context" route is
     confusing as an app's literal home page.
   - (b) If the chromeless full-bleed canvas is intentional (more screen real estate while
     building), at minimum add a persistent "back to Pipelines" affordance more prominent
     than the current small icon, and stop using bare `/` for it — reserve `/` for something
     that orients a new user (e.g. redirect to `/pipelines`).

3. **Pick one AI Builder, not two.** Recommend keeping the dedicated `/ai-builder` page for
   the "build a whole new pipeline from a prompt, review the Mermaid, then commit" flow
   (more deliberate, more reviewable), and either remove the canvas's inline AI bar or
   reframe it as a clearly-distinct lightweight action — e.g. rename the canvas toolbar
   button to "Add nodes with AI" or "Quick-add" instead of reusing the literal label
   "AI Builder," and link it through to `/ai-builder` when the user wants the full review
   flow. Two features sharing one name and one backend route, with no link between them, is
   the single biggest "wait, didn't I just do this?" moment in the app.

4. **Build a shared API-error UI component.** Bugs 2–4 are the same root cause in three
   places: raw fetch/axios error bodies get string-interpolated straight into the page.
   One `<ApiError>` component (icon + human message + optional retry) used by AI Builder,
   RunDetail, and Connectors would fix all three at once and prevent the next page from
   repeating it.

5. **Either ship or hide the Lineage/Config/Access pipeline-drawer tabs.** A tab that does
   nothing erodes trust in the surrounding (working) UI. Badge them "Soon" or remove until
   built.

6. **Give the pipeline list and canvas a real mobile breakpoint**, even a minimal
   "sidebar collapses to a hamburger, toolbar wraps" treatment — current behavior (icon rail
   fixed, content clipped) reads as broken, not "not optimized yet."

---

## Prioritized List

| # | Issue | Severity | Why it's ranked here |
|---|-------|----------|----------------------|
| 1 | No non-Google login path (Bug 1) | P1 | Blocks adoption entirely for non-Google-Workspace users; it's the front door |
| 2 | `/` has no nav chrome; AI Builder duplicated across `/` and `/ai-builder` (Duplicate Pages section) | P1 (product) | Root route disorients every new user immediately after login |
| 3 | Mobile layout broken on canvas + pipelines list (Bug 7) | P2 | Two highest-traffic pages unusable on phone widths |
| 4 | Raw API errors surfaced in AI Builder, RunDetail, Connectors (Bugs 2, 3, 4) | P2 | Same root cause, three places, easy single fix, high confusion cost |
| 5 | Pipeline drawer fake-door tabs (Bug 5) | P3 | Low-frequency but erodes trust |
| 6 | Pipeline name truncation (Bug 6) | P3 | Hurts scanability on the core "find my pipeline" page |
| 7 | Monitoring SLO/run-count discrepancy (Bug 8) | P3 (needs eng confirmation) | Possibly correct, but needs an explainer either way |
