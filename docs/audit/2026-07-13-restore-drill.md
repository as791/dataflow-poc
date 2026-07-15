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

## Storage migration onto the data disk (2026-07-14)

Docker root (and with it the kind cluster, all PVs) moved from the boot disk
onto the 200G persistent data disk:

| Step | Result |
|---|---|
| Stop docker, rsync 19G `/var/lib/docker` → data disk | 2 m 23 s |
| Remount `LABEL=dataflow-data` at `/var/lib/docker` (fstab) + restart | all 13 pods Running |
| Data integrity | row counts pipelines 618, executions 537, users 7, connector_instances 10 (drill baseline +2 organic) |
| Web check | `https://34.14.212.157.nip.io/` → 200 |
| Snapshot verify | manual snapshot `dataflow-data-postmigration-verify` → new disk → attach RO → contains Postgres 16 data dir (`PG_VERSION`) and ClickHouse data for both PVCs; drill disk deleted after |

The manual snapshot is kept as the first valid restore point; the daily 03:00
policy now captures real state. Total downtime ≈ 5 min. Rollback copy left at
`/var/lib/docker.pre-migration` on the boot disk (19G) — delete after 24–48 h
of stable operation to free the boot disk (78 % full).

Matches the cloud-init template on this branch (`user-data.yml.tpl` mounts the
data disk at `/var/lib/docker`), so a rebuilt VM lands in the same layout.

## Logical backups (2026-07-14)

`db-backup` CronJob added to the Helm chart: 6-hourly `pg_dump | gzip` into
`/var/backups/dataflow` inside the kind node (data-disk-backed), 7-day
retention. The daily disk snapshot therefore carries a ≤6 h-old logical dump
off-box.

## Outstanding

- Off-box upload for sub-24 h off-box RPO (user-only IAM op — runtime SA
  `dataflow-runtime@` deliberately has no storage role). To enable:
  `gcloud storage buckets create gs://dataflow-db-backups --location=asia-south1`,
  grant `roles/storage.objectCreator` on the bucket to the runtime SA, then add
  an upload step to the `db-backup` CronJob.
- `scripts/db-restore.sh` caveats found during review: DB name parsing breaks
  on URLs with query params; no forced drop of active connections. This drill
  used direct psql in the pod instead.
