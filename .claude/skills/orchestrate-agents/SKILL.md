---
name: orchestrate-agents
description: Coordinate complex work from the main thread by decomposing it into bounded workstreams, spawning available child agents with the best suitable model or platform default, collecting structured reports, and verifying and synthesizing the result. Use for tasks with independent research, implementation, testing, or review lanes, and whenever the user asks for orchestration, delegation, subagents, child threads, a swarm, or parallel execution. Avoid it for trivial or strictly sequential work.
---

# Orchestrate Agents

Act as the accountable main-thread coordinator. Delegate focused work to child agents, keep useful critical-path work in the main thread, and integrate verified results into one answer.

Keep this skill in the main conversation. Do not run the orchestrator itself in a forked or isolated child context.

## Adapt to the host

1. Inspect the host's available delegation, messaging, waiting, resuming, interruption, concurrency, and model-selection capabilities.
2. Use the host's native child-agent mechanism. Do not invent tool names, agent types, model IDs, or a generic `best` model alias.
3. Respect the host's concurrency, nesting, sandbox, permission, and organization limits. A child receives no authority beyond the parent.
4. If child agents or per-child model selection are unavailable, continue locally with the same workstream plan. State the fallback only when it materially affects the result.

## Decide whether to delegate

Delegate when at least one of these is true:

- Two or more bounded workstreams can proceed independently.
- Repository exploration, external research, implementation, testing, or review can overlap.
- Context isolation will keep a large task manageable.
- An independent verifier will materially reduce correctness or safety risk.
- The user explicitly requests child agents or parallel execution.

Avoid delegation when the task is a quick atomic action, every step depends on the previous one, or multiple writers would contend for the same files. Do not create agents merely to restate the task.

## Build the work graph

1. Define the requested outcome, constraints, evidence needed, and completion criteria.
2. Split work by deliverable or evidence boundary, not by arbitrary file counts.
3. Mark dependencies and put independent lanes in the same wave.
4. Give each writable file or subsystem one owner per wave. Concurrent readers are safe; overlapping writers are not.
5. Keep integration and final accountability in the main thread.
6. Use one child level by default. Permit deeper delegation only when the host supports it and the extra coordination has a clear benefit.

## Select agents and models

- Prefer a built-in or custom specialist whose description matches the subtask.
- Use the strongest available reasoning option for ambiguous architecture, security, debugging, or reconciliation work.
- Use the fastest adequate option for bounded discovery, summarization, log inspection, and routine test execution.
- Use the parent, inherited, or scheduler default when the host does not expose model selection.
- Select only from models the host currently offers. Never guess model names or fail the task because a preferred model is unavailable.

## Dispatch complete assignments

Start the smallest useful set of children within the host limit, commonly two or three. Continue useful main-thread work while they run.

Give every child a self-contained assignment because it may not inherit the parent conversation:

```text
Goal: One concrete outcome.
Deliverable: The artifact, decision, patch, or evidence to return.
Scope: Files, systems, questions, and explicit exclusions.
Constraints: User instructions, permissions, compatibility, and safety limits.
Inputs: Relevant paths, facts, commands, links, or prior findings.
Write ownership: Read-only, or the exact files/subsystem it may modify.
Validation: Checks the child must run or evidence it must gather.
Return: Status, outcome, changes, evidence, risks, and blockers.
```

Require a concise report in this shape:

```text
Status: complete | partial | blocked
Outcome: What was established or produced.
Changes: Files or external state changed, or "none".
Evidence: Tests, commands, sources, or observations.
Risks: Remaining uncertainty, conflicts, or blockers.
Next: Recommended follow-up, if any.
```

Do not dump the whole conversation into a child prompt. Pass only the context needed to succeed, while preserving all relevant constraints. Tell children sharing a workspace to preserve user changes and avoid files outside their ownership.

## Supervise execution

- Track each child, assignment, dependency, and write scope.
- Set a proportionate progress checkpoint or timebox for long-running lanes; never wait indefinitely without new evidence.
- Collect independent results as they finish instead of blocking the whole wave on one child.
- Send a follow-up to the same child when continuity matters; spawn a fresh child for an intentionally independent check.
- If capacity is full, run the highest-value lanes first and queue or handle the rest locally.
- Rescope stalled work once, then interrupt or take it over if it still makes no progress. Interrupt repetitive, off-scope, or conflicting work promptly.
- Never let a child bypass an approval or broaden the user's authorized scope. Escalate required permission through the main thread.
- Before finishing, collect, cancel, or explicitly account for every active child.

## Integrate and verify

1. Treat child reports as claims to verify, not as automatically correct conclusions.
2. Inspect changed artifacts and diffs, run proportionate checks, and confirm that evidence addresses the original request.
3. Reconcile disagreements using primary evidence. Use an independent verifier when risk or uncertainty justifies the cost.
4. Integrate concurrent edits only after checking ownership and conflicts.
5. Fill gaps in the main thread or send a targeted follow-up; do not silently omit incomplete lanes.
6. Own the final decision and response. Never forward raw child reports as the answer.

Report the completed outcome, material changes, verification performed, and unresolved risks or blockers. Mention orchestration details only when they help the user understand confidence, limitations, or next steps.
