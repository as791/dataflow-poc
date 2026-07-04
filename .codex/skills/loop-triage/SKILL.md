---
name: loop-triage
description: Triage recent changes, CI failures, issues, and engineering conversations into a concise actionable report. Use when a recurring loop needs prioritized work, watch items, ignored noise, and durable state updates.
---

# Loop Triage

Read available CI failures, issues, recent commits, engineering conversations, and the current state file. Do not create work from weak signals.

Produce:

```markdown
## High-Priority Items
- Problem, impact, next action, and rough effort

## Watch Items
- Lower-urgency signals to monitor

## Noise / Ignore
- Reviewed items that need no action

## State Updates
- Facts the next run should retain
```

Only mark an item high priority when a reasonable engineer needs to know about it today. Prefer Watch or Noise when uncertain. Do not propose architectural overhauls during triage. Respect project conventions and existing skills.

Source: https://github.com/cobusgreyling/loop-engineering/tree/main/skills/loop-triage
