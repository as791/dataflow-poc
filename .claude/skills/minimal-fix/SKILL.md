---
name: minimal-fix
description: Produce the smallest code change that fixes one explicit, well-scoped issue such as a CI failure, reviewer comment, or typo. Use only when the target is concrete; never refactor unrelated code.
---

# Minimal Fix

Fix one specific problem with the smallest defensible diff.

1. Read project instructions and the exact failure, comment, or issue.
2. Reproduce or confirm the failure when possible.
3. Find the shared root cause, including all callers of code being changed.
4. Change only what is required. Respect denylisted and sensitive paths.
5. Run the narrowest relevant tests or lint checks.
6. Report the target, changed files, verification command and result, and remaining risk.

Do not combine unrelated failures. Do not disable tests or weaken assertions. Prefer an isolated worktree for unattended changes. The verifier, not the implementer, decides whether the change is complete.

Source: https://github.com/cobusgreyling/loop-engineering/tree/main/skills/minimal-fix
