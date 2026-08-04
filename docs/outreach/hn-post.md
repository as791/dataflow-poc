# Show HN draft

## Title

Show HN: DataFlow – Airflow crashes mid-run and starts over. This picks up where it left off.

## Body

I run pipelines on self-hosted Airflow without a platform team backing me up, and the thing that finally broke me was a 40-minute DAG that OOM'd at minute 38 and had to restart from task zero. No checkpoint, no resume, just babysit the retry and hope.

DataFlow is an open-core visual data pipeline platform I built to fix that specific problem. It uses Temporal for durable execution, so a crash mid-run resumes from where it stopped instead of restarting the whole DAG. Pipelines are built on a visual canvas instead of Python DAG files. Lineage, SLA/SLO monitoring, and an audit trail are built in rather than bolted on with three extra tools.

Stack: Go backend, Temporal for orchestration/durability, self-hostable, AGPL-3.0.

What's early / not done: the connector library is small right now, the UI has rough edges, and I haven't run this at scale — this is a POC-to-real-thing transition, not a mature platform. I'm not going to claim benchmarks or customer counts because I don't have any yet that I'd stand behind. What I do have is the crash-recovery behavior working end to end, and I'd rather find out now whether that's actually the problem people want solved, versus something I assumed mattered.

If you're running Airflow solo or on a small team and have felt the "no platform engineer to fix this" pain, I'd genuinely like your take — does durable resume solve a real problem for you, or is retry hell something you've already worked around another way?

Repo/site: https://cohestra.dev

Happy to answer questions about the Temporal integration, the canvas model, or what's missing.
