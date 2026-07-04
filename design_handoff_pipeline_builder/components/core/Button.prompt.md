Button — the primary clickable action across DataFlow: gradient-fill primary actions, neutral ghost actions, and destructive/success confirmations.

```jsx
<Button variant="primary">Run pipeline →</Button>
<Button variant="ghost" icon={<RefreshCw size={14}/>}>Refresh</Button>
<Button variant="danger">Delete node</Button>
```

Variants: `primary` (gradient brand, used for the main call-to-action per screen — "Connect Google", "+ New"), `ghost` (neutral bordered surface, used for secondary actions and toolbars), `danger` (red, destructive confirmations), `success` (emerald gradient, rare — positive confirmations like a successful payment). Sizes: `sm` (compact rows/toolbars), `md` (default), `lg` (auth screens). Pass `disabled` to gray it out; hover brightens+scales down slightly (`active:scale-[.98]`) rather than lifting.
