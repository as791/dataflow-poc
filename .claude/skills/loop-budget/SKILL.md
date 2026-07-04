---
name: loop-budget
description: Check token budget and run-log spend before and after an engineering loop. Use for recurring or unattended agent runs that must throttle, switch to report-only mode, or stop when there is no actionable work.
---

# Loop Budget Guard

Run at the start and end of every loop iteration.

## Start

1. Read `loop-budget.md` for daily caps and kill switches.
2. Read `loop-run-log.md` entries from the last 24 hours.
3. Sum `tokens_estimate` for the active pattern today.
4. At 80% of the daily cap, use report-only mode: no sub-agents and no automatic fixes.
5. At 100%, or when `loop-pause-all` is set, exit and add a one-line note to `STATE.md`.
6. When state contains no actionable items, exit without spawning sub-agents.

## Finish

Append one JSON object to `loop-run-log.md`:

```json
{
  "run_id": "",
  "pattern": "",
  "duration_s": 0,
  "items_found": 0,
  "actions_taken": 0,
  "escalations": 0,
  "tokens_estimate": 0,
  "outcome": "no-op | report-only | fix-proposed | escalated"
}
```

Never exceed `max sub-agent spawns/run` from `loop-budget.md`. High-cadence loops must exit early when nothing is actionable. Record self-throttling under **Alerts This Period** in `loop-budget.md`.

Source: https://github.com/cobusgreyling/loop-engineering/tree/main/skills/loop-budget
