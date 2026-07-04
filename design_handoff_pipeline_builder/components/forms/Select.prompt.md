Select — dropdown matching `.glass-select`, used for sync modes, merge strategies, data layers.

```jsx
<Select value={mode} onChange={e => setMode(e.target.value)} options={['cursor', 'cdc']} />
```
