FlowNode — the pipeline-canvas node card (source/transform/sink), the single most distinctive visual in the product. Left accent bar + icon tile use the connector's family color; a status dot appears once a node has run.

```jsx
<FlowNode label="Zendesk tickets" sublabel="Zendesk" color="var(--conn-source)" icon={<Ticket />} status="success" recordCount={1204} />
```

Used inside a `reactflow` canvas in production; here it's a plain card so it drops into any layout.
