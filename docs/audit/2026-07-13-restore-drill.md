# Restore drill — 2026-07-13

Performed against the production GCE box (dataflow, asia-south1-a), in-cluster
Postgres pod, restoring into an isolated scratch database (`dataflow_drill`)
on the same instance. Executed remotely via ssh + kubectl exec.

## Logical PostgreSQL backup/restore

| Measure | Result |
|---|---|
| Backup (pg_dump + gzip) | 11 s |
| Restore (gunzip + psql into `dataflow_drill`) | 13 s |
| End-to-end RTO (logical, excluding operator time) | ~24 s |
| Validation | Row counts identical source vs. drill: pipelines 616, executions 535, users 7, connector_instances 10 |
| Cleanup | `dataflow_drill` dropped, dump removed |

## Data-loss window (RPO)

- **Disk snapshots:** daily schedule at 03:00 with 14-day retention was applied
  via Terraform on 2026-07-13 (`google_compute_resource_policy.data_snapshots`).
  Worst-case RPO once snapshots exist: **24 h**.
- **Logical backups:** `scripts/db-backup.sh` exists but is not scheduled
  (manual invocation only). Until a cron/scheduled job is added, the standing
  RPO is the snapshot schedule above.

## Outstanding

- **Disk-snapshot restore half:** the snapshot policy was created today; the
  first snapshot lands at 03:00. Restore-from-snapshot into a fresh VM/disk is
  still to be drilled once one exists — the ROADMAP Gate 0 checkbox stays
  unchecked until then.
- Schedule `scripts/db-backup.sh` (cron/K8s CronJob) with S3 upload to tighten
  logical RPO below 24 h.
- `scripts/db-restore.sh` caveats found during review: DB name parsing breaks
  on URLs with query params; no forced drop of active connections. This drill
  used direct psql in the pod instead.
