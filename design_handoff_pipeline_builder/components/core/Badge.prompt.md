Badge — small pill label for status: connector "Active/Not connected", pipeline lifecycle stage, run outcome.

```jsx
<Badge tone="success" dot>Active</Badge>
<Badge tone="warning">Draft</Badge>
```

Four tones only: `neutral` (default/inactive), `success` (emerald — active, production, passed), `warning` (amber — draft, degraded), `danger` (red — failed, critical). Add `dot` for a small status indicator when the badge represents a live/ongoing state (connection health, run phase).
