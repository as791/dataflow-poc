---
name: loop-engineering
description: Design or run a bounded engineering loop that discovers work, selects one actionable item, performs the smallest authorized change, verifies it independently, records durable state, and repeats until an explicit stop condition. Use for recurring repository maintenance, CI or issue triage, unattended coding-agent workflows, run-until-done engineering goals, or requests to build an agent loop from automations, worktrees, skills, connectors, sub-agents, and persistent state.
---

# Loop Engineering

Turn an engineering goal into a controlled `observe -> choose -> act -> verify -> remember` loop. Keep the engineer responsible for scope, risk, and final acceptance.

## Define the loop

Before acting, write down:

- **Goal:** one concrete outcome.
- **Done:** observable acceptance criteria and required checks.
- **Scope:** repository, sources, allowed paths, and authorized external actions.
- **Budget:** time or token cap, maximum items and iterations, and sub-agent limit.
- **State:** an existing issue tracker or one durable Markdown file.

If limits are missing, default to one item, one implementation pass, one verification pass, no sub-agents, and no external publishing. Ask only when a missing decision materially changes the result.

## Build only the needed pieces

Use the minimum loop that can satisfy the goal:

1. Use an automation only when the work must recur. Keep its prompt to invoking this skill plus the goal and stop condition.
2. Use a worktree for parallel or unattended writes. Stay in the current checkout for a single safe pass.
3. Load project skills and instructions instead of rediscovering conventions.
4. Use connectors only for authoritative inputs or explicitly authorized actions.
5. Separate maker and checker when risk justifies the extra cost and the user has authorized sub-agents.
6. Store state outside the conversation so the next run can resume without guessing.

## Run one iteration

1. **Guard:** Read the budget, pause switches, working-tree status, and prior state. Stop when paused, over budget, or already done.
2. **Observe:** Read only authoritative signals needed for the goal: failing checks, issues, recent changes, alerts, or review comments.
3. **Choose:** Rank by impact, evidence, urgency, effort, and risk. Select one concrete item. Exit cleanly when nothing is actionable.
4. **Act:** Reproduce the problem, locate the shared root cause, and make the smallest in-scope change. Do not bundle cleanup or speculative refactors.
5. **Verify:** Re-read the original acceptance criteria, inspect the diff, and run the narrowest relevant checks. The checker must not rely only on the maker's summary.
6. **Remember:** Record evidence, changed files, checks, decisions, remaining risk, and the next action in durable state.
7. **Decide:** Stop when done, blocked, over budget, or awaiting human judgment. Otherwise start the next bounded iteration.

Use sibling skills when available:

- `$loop-budget` for start/end budget checks.
- `$loop-triage` for discovery and prioritization.
- `$minimal-fix` for one concrete implementation.
- `$loop-verifier` for the independent verdict.

## State format

Reuse existing project state. Otherwise keep one small file:

```markdown
# Loop State
- Goal:
- Done when:
- Budget:
- Status: running | done | blocked | paused
- Current item:
- Evidence:
- Attempts:
- Next action:
- Last run:
```

Update it after each meaningful attempt. Keep facts and evidence; remove stale narration.

## Safety gates

- Never weaken tests, validation, security controls, or data protections to make the loop pass.
- Never merge, deploy, publish, message people, or mutate external systems without authorization.
- Escalate ambiguous requirements, sensitive paths, medium/high-risk changes, repeated failure, and unverifiable results.
- Treat an automated verdict as evidence, not proof. Require human review where project policy or risk demands it.
- Surface comprehension risk: summarize what changed and why so the engineer can still own the result.

## Report

Return the goal status, action taken, verification evidence, budget used, remaining risk, and next action. For recurring runs with no actionable work, produce a no-op result rather than inventing work.

Adapted from Addy Osmani's [Loop Engineering](https://addyosmani.com/blog/loop-engineering/): automations, worktrees, skills, connectors, sub-agents, and durable state, with explicit attention to verification, token cost, comprehension debt, and human judgment.
