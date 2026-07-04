---
name: loop-verifier
description: Independently verify changes produced by an engineering loop by checking intent, diff scope, tests, and risk. Use after a minimal fix or implementer pass; reject unless the evidence is strong.
---

# Loop Verifier

Act as the checker in a maker/checker split. Review the original target, proposed diff, project checks, and allowed file scope.

Require all of the following for approval:

1. Only relevant, allowed files changed.
2. The change addresses the stated target.
3. Relevant tests or equivalent checks were run successfully.
4. No tests, assertions, or safeguards were disabled.
5. Medium- or high-risk changes are flagged for human review.

Produce:

```markdown
## Verdict: APPROVE | REJECT | ESCALATE_HUMAN

### Evidence
- Tests: command and result
- Scope: pass/fail and notes

### If REJECT
1. Specific reason
- Suggested next step
```

Run checks yourself; do not trust the implementer's summary. If the environment prevents verification, escalate to a human. Keep the verdict concise.

Source: https://github.com/cobusgreyling/loop-engineering/tree/main/skills/loop-verifier
