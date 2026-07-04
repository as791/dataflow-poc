StageBadge — small colored pill for a pipeline's lifecycle stage, seen on every row of the Pipelines list and the run drawer header.

```jsx
<StageBadge stage="production" />
```

Stages: `draft` (amber) → `testing` = "Integration" (blue) → `production` (emerald) → `archived` (gray). Derived from `status` + `environment`, never a raw enum (see `docs/PRODUCTROADMAP.md` A1).
