# Handoff: DataFlow Pipeline Builder UI

## Overview
This package hands off the DataFlow design system and the Pipeline Builder UI prototype for implementation in the `dataflow-poc` codebase (`apps/web` — React + TypeScript + Tailwind + lucide-react). It covers the app shell, pipelines list + detail drawer, pipeline canvas, and connectors screens, plus three specific UI changes made during design review.

## About the Design Files
The files in this bundle are **design references created in HTML/JSX for a browser-based design tool** — they show intended look and behavior, and are NOT production code to copy directly. The task is to **recreate these designs in `apps/web`** using its existing patterns: Tailwind utility classes, the `glass-*` class family in `src/index.css`, lucide-react icons, and react-router. Component `.jsx` files here use inline styles; translate values to the codebase's Tailwind conventions.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and shadows are exact and were originally sourced FROM the codebase (`tailwind.config.js`, `src/index.css`), so most values already exist as Tailwind classes there. Recreate pixel-perfectly.

## Priority: three review changes (patches/ui-changes.md)
Exact diffs against current codebase files are in `patches/ui-changes.md`:
1. **AtomMark brand logo** — new `src/components/AtomMark.tsx` (nucleus + orbit-rings SVG) replacing the `Workflow` icon in `AppShell.tsx` and the `Zap` icon in `PipelineCanvasPage.tsx` brand tiles.
2. **Lifecycle nav icon** — `Milestone` → `Orbit` (lucide-react) in `AppShell.tsx` NAV.
3. **PipelineDrawer header** (`PipelinesPage.tsx`) — remove the standalone stage-badge row; single row: pipeline name (truncating) + small stage chip (~9px text, pill) + close button at `ml-auto`. No empty space above the title.

## Screens / Views
The full prototype is `prototype/index.html` + `prototype/app.jsx` (open index.html in a browser). Screen → codebase mapping:

- **App shell** (`AppShellChrome` in app.jsx → `src/components/AppShell.tsx`): 52px icon sidebar, brand tile 36×36 `rounded-[10px]` with `linear-gradient(135deg, brand-400, brand-600)` + AtomMark; nav items 36×36, active = brand tint pill; header 56px with eyebrow (10px/500/0.18em uppercase) over title (22px/700/-0.04em).
- **Pipelines list + drawer** (`PipelinesScreen`, `PipelineDrawer` → `src/pages/PipelinesPage.tsx`): filter pills, row list (name, stage badge, run status dot, ago); 380px right drawer with header (see change #3), ghost action buttons (Edit / Run now / Backfill), 3 stat tiles, recent-runs list.
- **Pipeline canvas** (`CanvasScreen` → `src/pages/PipelineCanvasPage.tsx`): Miro-style floating left toolbar with category flyouts, FlowNode cards (connector-colored icon tile, name, meta), AI command bar, output drawer.
- **Connectors** (`ConnectorsScreen` → `src/pages/ConnectorsPage.tsx`): provider cards with ConnectorAvatar, connected-state pill (emerald recipe).

Component specs (props, states, exact values) live in `components/<group>/<Name>.jsx` with usage notes in the sibling `<Name>.prompt.md`:
core: Button, IconButton, Badge · forms: Input, Select · feedback: Modal · navigation: SidebarNavItem · pipeline: StageBadge, FilterPill, StatTile, ConnectorAvatar, FlowNode.

## Interactions & Behavior
- List row click → opens drawer (380px, slides in border-left, shadow `-18px 0 50px`).
- Drawer close → deselect. Edit → navigate to canvas with pipelineId state.
- Stage badge on canvas is a button opening a stage menu (draft/testing/production/archived).
- Transitions: 150–200ms, `cubic-bezier(0.4, 0, 0.2, 1)`, applied to hover background/color changes.
- Hover states: ghost buttons darken bg one step (gray-100→200 light; white/[0.045]→[0.085] dark).
- Focus ring: `2px solid rgba(82,214,232,.72)`, offset 2px.

## State Management
Prototype-level only: selected pipeline (drawer open/close), route, stage filter, dark mode. All data fetching stays as-is in the codebase (`api.listExecutions` etc.) — designs show layout, not data contracts.

## Design Tokens
Complete token set in `tokens/*.css` (entry: `styles.css`), all sourced from `tailwind.config.js` / `src/index.css`. Key values:
- Brand: `#a89df8` (300) `#8c7cf4` (400) `#7c6cf2` (500) `#6757df` (600), canvas `#6965db`; accent cyan `#52d6e8`.
- Stage pills: draft `#f59e0b`, testing `#3b82f6`, production `#10b981`, archived `#9ca3af`.
- Dark surfaces: `#080a10`/`#0b0e17`/`#0d0f17`; glass overlays = white at 0.035–0.13 alpha.
- Radii: 10px buttons/inputs, 14px cards/nodes, 20px panels/modals, pill 999px.
- Type: Geist / Geist Mono; scale 10–22px (see tokens/typography.css for roles).
- Spacing: Tailwind 4px scale; sidebar 52px, header 56px, drawer 380px.

## Assets
No binary assets. The AtomMark logo is inline SVG (spec in patches/ui-changes.md). All icons are lucide-react. Fonts: Geist + Geist Mono via Google Fonts (already the codebase stack).

## Files
- `patches/ui-changes.md` — exact diffs for the three review changes (do these first)
- `prototype/index.html`, `prototype/app.jsx` — full interactive design reference
- `styles.css` + `tokens/` — design tokens (colors, typography, effects, spacing)
- `components/` — per-component source (`.jsx.txt`), types (`.d.ts.txt`), and usage notes (`.prompt.md`). The `.txt` suffix is only so this bundle stays inert; treat them as JSX/TS reference source.
- `screenshots/` — captures of each screen for quick visual reference
