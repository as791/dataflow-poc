SidebarNavItem — one icon in the 52px-wide compact nav rail (AppShell.tsx). Hovering reveals a dark tooltip with the route label to the right.

```jsx
<SidebarNavItem icon={<Workflow />} label="Pipelines" active />
```

The rail holds one item per top-level route: Pipelines, Lifecycle, Runs, Monitoring, Lineage, Connectors, Analytics, Team, Billing — plus theme toggle, Settings, Profile, and Sign out pinned to the bottom.
