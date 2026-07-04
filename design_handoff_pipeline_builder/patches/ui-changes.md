# UI changes → dataflow-poc/apps/web

Three changes from the pipeline-builder UI kit, as exact patches.

---

## 1. New file: `src/components/AtomMark.tsx`

Brand mark = nucleus (proton + neutron) with two orbit rings.

```tsx
export function AtomMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="12" rx="9.5" ry="4" stroke="rgba(255,255,255,.85)" strokeWidth="1.4" transform="rotate(-28 12 12)" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4" stroke="rgba(255,255,255,.55)" strokeWidth="1.4" transform="rotate(28 12 12)" />
      <circle cx="10.6" cy="12.6" r="2.1" fill="#fff" />
      <circle cx="13.5" cy="11.2" r="2.1" fill="rgba(255,255,255,.65)" />
    </svg>
  );
}
```

---

## 2. `src/components/AppShell.tsx`

**a) Lifecycle nav icon: `Milestone` → `Orbit`**

```diff
- import { BarChart3, Cable, CreditCard, History, LogOut, Menu, Milestone, Moon, Network, Settings, Sparkles, Sun, Users, Workflow, Gauge, X } from 'lucide-react';
+ import { BarChart3, Cable, CreditCard, History, LogOut, Menu, Moon, Network, Orbit, Settings, Sparkles, Sun, Users, Workflow, Gauge, X } from 'lucide-react';
```
```diff
- { to: '/lifecycle',  label: 'Lifecycle',  icon: Milestone },
+ { to: '/lifecycle',  label: 'Lifecycle',  icon: Orbit },
```

**b) Brand mark: `Workflow` icon → `AtomMark`** (~line 77)

```diff
+ import { AtomMark } from './AtomMark';
```
```diff
  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px]
    bg-gradient-to-br from-brand-400 to-brand-600 shadow-md shadow-brand-500/20">
-   <Workflow size={16} className="text-white" strokeWidth={2} />
+   <AtomMark size={22} />
  </div>
```
(`Workflow` is still used by the Pipelines nav item — keep the import.)

---

## 3. `src/pages/PipelineCanvasPage.tsx` (~line 493)

Toolbar brand mark: `Zap` → `AtomMark`.

```diff
+ import { AtomMark } from '../components/AtomMark';
```
```diff
  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-md shadow-brand-500/20">
-   <Zap size={16} className="text-white" strokeWidth={2.5} />
+   <AtomMark size={20} />
  </div>
```
(Drop the `Zap` import if unused elsewhere.)

---

## 4. `src/pages/PipelinesPage.tsx` — drawer header (~lines 149–160)

Stage badge moves beside the pipeline name (smaller, info-chip style); close button joins the same row; the standalone badge row is removed.

**Replace:**

```tsx
<div className="flex items-center gap-2 mb-2.5">
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
  <button onClick={onClose}
    className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-[6px]
      bg-gray-100 border border-gray-200 text-gray-400 hover:bg-gray-200 hover:text-gray-700
      dark:bg-white/[0.04] dark:border-white/[0.07] dark:text-white/40
      dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
    <X size={13} />
  </button>
</div>
<div className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white/90 mb-1 min-w-0 truncate">{pipeline.name}</div>
```

**With:**

```tsx
<div className="flex items-center gap-2 mb-1 min-w-0">
  <span className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white/90 min-w-0 truncate">{pipeline.name}</span>
  <span className={`text-[9px] font-semibold px-1.5 py-px rounded-full border shrink-0 ${cfg.badge}`}>{cfg.label}</span>
  <button onClick={onClose}
    className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-[6px] shrink-0
      bg-gray-100 border border-gray-200 text-gray-400 hover:bg-gray-200 hover:text-gray-700
      dark:bg-white/[0.04] dark:border-white/[0.07] dark:text-white/40
      dark:hover:bg-white/[0.08] dark:hover:text-white transition-all">
    <X size={13} />
  </button>
</div>
```
