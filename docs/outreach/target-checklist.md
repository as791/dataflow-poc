# Outreach target checklist

Track every person contacted. One row per person. Keep pain quotes verbatim (for honest, specific follow-up) — don't paraphrase.

| Name/handle | Source (HN/Reddit/Slack/Twitter) | Pain quote | Date contacted | Variant used | Response | Call booked |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |

---

## Where to find 20 targets

Goal: find people who are *already* complaining about the specific pains DataFlow addresses — crash/retry pain, DAG babysitting, no platform team, lineage/monitoring sprawl. Don't cold-DM people who haven't signaled the pain.

### HN Algolia queries

Use https://hn.algolia.com/ (search comments, not just stories, sort by date):

- `Airflow retry` — comments mentioning retry pain
- `Airflow crash restart`
- `Airflow DAG babysitting`
- `self-hosted Airflow`
- `Airflow alternative`
- `Airflow lineage`
- `Airflow monitoring` combined with "no platform team" or "small team"
- Also check comment threads under any past "Show HN" for Dagster, Prefect, Temporal, or dbt — competitor threads surface people actively unhappy with Airflow

### Subreddits

- r/dataengineering — search "Airflow" sorted by new/top, filter for complaint-shaped posts ("Airflow keeps failing", "sick of Airflow", "Airflow vs X")
- r/devops — occasional Airflow-as-infra-burden posts
- r/ExperiencedDevs — smaller hit rate but sometimes platform-team-less complaints surface here
- r/dataengineering weekly "What are you working on" / "rant" threads — good source of unfiltered pain

### Airflow Slack / community channels

- Official Apache Airflow Slack (join via https://airflow.apache.org/community/ → Slack invite): channels `#troubleshooting`, `#new-installations`, `#task-sdk`, `#random` — watch for recurring crash/retry/DAG-ops complaints
- dbt Slack `#tools-airflow` or similar cross-posted channel — dbt users running Airflow orchestration often hit the exact same pain
- Locally Optimistic Slack (data community) — has an Airflow/orchestration channel with practitioner venting

### Twitter/X search strings

Use X's search (search.x.com) with these queries, sorted by Latest:

- `Airflow crash restart`
- `Airflow retry hell`
- `Airflow DAG` `annoying` OR `sucks` OR `nightmare`
- `self-hosted Airflow` `no platform team` OR `solo`
- `Airflow` `lineage` `monitoring`
- `#dataengineering` `Airflow`

### Notes

- Prioritize people whose complaint text you can quote back in variant A/B DMs — specificity is what makes the honest-builder tone land.
- Skip anyone whose post reads like they work at a company with a dedicated platform/infra team already solving this — target persona is explicitly "no dedicated platform engineers."
- Space DMs out; don't mass-blast the same variant to everyone in one sitting.
