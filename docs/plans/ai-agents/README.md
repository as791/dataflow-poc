# AI agents and mixed data pipelines: planning stack

Status: draft architecture for review. Reconstructed and revalidated against
main `857f36f51d9d58c05b32a4d2941448b1eeebbcbd` on 2026-09-09 UTC.
This stack contains documentation only. Existing application code and production
model defaults are unchanged. Implementation begins only after plan review.

## Read and review in order

| Stack PR | Branch / base | Review focus |
| --- | --- | --- |
| 1 — Product gaps and sandbox gates | codex/plan-product-gaps / main | PRODUCT_GAPS.md, SANDBOX_AND_CI.md, MODEL_EVALUATION.md |
| 2 — Backend architecture | codex/plan-agent-backend / codex/plan-product-gaps | BACKEND_ARCHITECTURE.md; B1–B6 future implementation sequence |
| 3 — Frontend architecture | codex/plan-agent-frontend / codex/plan-agent-backend | FRONTEND_ARCHITECTURE.md; F1–F6 future implementation sequence |

Published draft PRs: [#38](https://github.com/Cohestra/cohestra-dataflow/pull/38),
[#39](https://github.com/Cohestra/cohestra-dataflow/pull/39), and
[#40](https://github.com/Cohestra/cohestra-dataflow/pull/40).

The architecture files arrive in their respective stacked PRs; they are not
missing implementations on the first branch. Review each incremental diff.
After a predecessor merges, retarget/reconcile the next PR before merging it.
No PR in this stack merges implementation or deploys infrastructure.

## Intended outcome

Deliver data source → agent → human-approved HTTP/MCP tool action → typed output
→ data sink within existing Dataflow execution, monitoring, audit and lineage.
Use native Temporal child workflows first. Keep workflow-only bounded batches,
run-scoped memory, immutable versions and explicit approval for mutations in v1.
LangGraph and scoped persistent memory follow demonstrated native recovery.

Existing AI proposal review is reused. Planner quality and agent runtime are
separate capabilities: changing an authoring model does not create an agent loop.
No candidate is production-promoted from marketing benchmarks or a small smoke run.

## Dependencies and completion

GAP-* work packages map to B1 foundations, F1 canvas preservation, shared CI and
small developer-experience changes; they are not a duplicate implementation stack.
B4/F4 is the first full functional flow. B5/F5 recovery and operations evidence
is required for release; mandatory safety tests ship with B3/B4 themselves.
S01–S18 in the sandbox plan define cross-stack acceptance.

Review must settle supported manifest sinks, cancellation semantics, permissions,
OSS feature availability, tool/approval/budget behavior and retention. Resolve
license wording with maintainers; this stack does not change license terms.

## Validation scope

Source inspection and reference checks support the stated gaps. Existing shared
and web tests, frontend build, and the Python evaluator offline self-tests were
run. Base Compose validation and remote community/enterprise builds, race tests and
vet passed. Existing history/dependency scans remain failing and require separate
triage; see PR notes. Live model characterization is recorded in its report. Future agent integration scenarios are plans,
not tests claimed to exist today. Tests of planner handlers do not prove runtime,
authentication, browser or durable tool/approval integration.
