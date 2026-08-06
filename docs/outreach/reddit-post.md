# r/dataengineering draft

**Flair:** Discussion (or "Open Source" if the sub has that flair)

## Title

Built an Airflow alternative that resumes crashed runs instead of restarting them — looking for self-hosted Airflow users to kick the tires

## Body

Long-time lurker, first post like this — mods, happy to adjust if this reads too promotional, that's not the intent.

I've been running Airflow self-hosted without a dedicated platform team, and the recurring pain was: a run crashes partway through, and the whole DAG restarts from scratch. No resume, no checkpoint, just re-run and hope it doesn't fail at the same spot again. Combined with DAG-file babysitting and stitching together lineage/monitoring myself, it got old.

So I built **DataFlow** — open-core, self-hosted, AGPL-3.0. The core idea: it uses Temporal for durable execution, so if a run crashes mid-pipeline, it picks up from where it left off instead of starting over. Pipelines are built on a visual canvas rather than DAG files, and lineage, SLA/SLO monitoring, and audit trail are built into the platform instead of assembled from separate tools.

Go backend, Temporal for orchestration. Repo/info: https://cohestra.dev

Being upfront about where it's at: this is early. Connector coverage is limited, I haven't run it at real scale, and I'm not claiming it's production-proven — because it isn't yet, for me or anyone else. I'm not here to pitch a finished product, I'm here because I think the crash-recovery problem is real for people in a similar spot (self-hosted Airflow, no platform eng headcount) and I want to know if I'm solving the right thing before I go further.

If you run Airflow solo/small-team and have hit this — genuinely curious whether durable resume would matter to you, or whether you've solved it a different way. Happy to answer questions about the Temporal piece or anything else.
