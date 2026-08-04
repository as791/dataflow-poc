# Cold DM variants

Use for devs publicly complaining about Airflow (HN comments, Reddit threads, Twitter/X, Airflow Slack). Pick the variant that matches what they actually complained about — don't guess.

---

## Variant A — Crash-recovery angle

Use when they specifically mention: crashed runs, restarts from scratch, retries, OOM/timeout mid-DAG.

> Saw your comment about [specific pain, e.g. "the retry from scratch after a mid-DAG crash"] — that's the exact thing that pushed me to build something. It's called DataFlow: Temporal-backed durable execution, so a crash mid-run resumes instead of restarting the whole DAG. Self-hosted, open-core, AGPL-3.0. Early days, not claiming it's battle-tested — but if that specific pain is real for you, I'd value 10 minutes to see if it actually helps or if I'm missing something. https://cohestra.dev

---

## Variant B — "No platform team" angle

Use when they mention: running Airflow solo, small team, no dedicated infra/platform person, DAG babysitting.

> Noticed you're running Airflow without a platform team backing you up — I'm in the same boat, which is why I built DataFlow: visual canvas instead of DAG files, lineage/SLA monitoring/audit trail built in instead of stitched together from five tools, durable execution via Temporal so crashes don't mean starting over. Self-hostable, AGPL-3.0, still early. Would love to know if this matches what you're missing, or if I've got the wrong problem. https://cohestra.dev

---

## Variant C — Ask-for-feedback-only (no pitch)

Use when you want a low-pressure open door, or when A/B feel too salesy for the context.

> Hey — building an open-source alternative to self-hosted Airflow (durable execution, visual pipelines) aimed at people running it without a platform team. Not pitching, genuinely trying to figure out if I'm solving a real problem. If you've got 2 minutes, what's the single worst part of running Airflow day-to-day for you right now? No obligation either way, just trying to learn from people actually doing this.
