StatTile — a single centered metric (value + uppercase label), used three-across in the pipeline detail drawer (success rate, recent runs, last run).

```jsx
<div style={{display:'flex'}}>
  <StatTile value="92%" label="Success rate" highlight />
  <StatTile value="30" label="Runs (recent)" />
  <StatTile value="4m ago" label="Last run" />
</div>
```
