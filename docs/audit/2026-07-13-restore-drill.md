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

## Disk-snapshot restore (2026-07-14)

First scheduled snapshot (`dataflow-data-...-20260714031530`, 03:15 UTC,
READY) drilled end-to-end via the compute API:

| Measure | Result |
|---|---|
| New disk from snapshot (`disks.insert` → READY) | 23 s |
| Attach read-only + visible in VM (`lsblk`) | 12 s |
| Mount + verify | ext4 mounts clean; contents empty apart from lost+found — expected, cluster storage has not been migrated onto the data disk yet |
| Cleanup | detached, disk deleted (GET returns 404) |
| Credential rotation side-check | old Supabase DB password rejected (`password authentication failed`) over IPv6 direct connection |

Standing RPO: daily snapshot at ~03:15 UTC → ≤ 24 h.

## Outstanding

- Migrate cluster data (Postgres/ClickHouse PVs) onto the persistent data disk
  so snapshots actually capture state — today they capture an empty filesystem.
- Schedule `scripts/db-backup.sh` (cron/K8s CronJob) with S3 upload to tighten
  logical RPO below 24 h.
- `scripts/db-restore.sh` caveats found during review: DB name parsing breaks
  on URLs with query params; no forced drop of active connections. This drill
  used direct psql in the pod instead.
