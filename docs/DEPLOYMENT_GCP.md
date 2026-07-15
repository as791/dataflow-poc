# GCP deployment and persistence

Updated: 2026-07-10

## Supported topology

`infra/` provisions a pre-release demo topology: one GCE VM, a Kind cluster,
DataFlow Helm release, Caddy HTTPS, a static public IP, and a separate persistent
disk mounted at `/var/lib/docker`.

That disk holds Kind node data and therefore PostgreSQL, Redis, ClickHouse, and
Ollama PVC contents. It has `prevent_destroy` protection and a daily snapshot
policy with 14-day retention. Replacing the VM no longer intentionally deletes
the database disk.

This improves demo persistence; it does not make the system highly available.
One VM, one zone, one Kubernetes node, one database replica, and crash-consistent
disk snapshots remain shared failure domains.

## Prerequisites

- GCP project with billing enabled.
- Terraform 1.5+, `gcloud`, SSH key, Docker, Kind, `kubectl`, and Helm.
- Administrator public IP expressed as `/32`; `0.0.0.0/0` is rejected.
- Secret Manager JSON prepared outside the repository and outside Terraform state.

## Secret Manager payload

Terraform creates the `dataflow-secrets` container and grants only the dedicated
`dataflow-runtime` service account access. It deliberately does not create a
secret version because Terraform would persist the secret value in state.

Create a local file outside this repository with this shape:

```json
{
  "jwt": "64-or-more-random-hex-characters",
  "oauthKey": "64-random-hex-characters",
  "temporalPayloadKey": "base64-of-32-random-bytes",
  "databaseUrl": "postgres://migration-role:...@managed-host/dataflow?sslmode=require",
  "appDatabaseUrl": "postgres://dataflow_app:...@managed-host/dataflow?sslmode=require",
  "redisUrl": "rediss://managed-redis:6379",
  "smtpFrom": "verified@example.com",
  "smtpUser": "...",
  "smtpPass": "...",
  "googleClientId": "...",
  "googleClientSecret": "...",
  "azureClientId": "...",
  "azureClientSecret": "..."
}
```

GCE bootstrap derives `appUrl` from the reserved public IP and overrides the
Helm value. Non-GCE production installs must supply `secrets.appUrl` explicitly.

Bootstrap the secret container and runtime identity before creating the VM. This
one targeted apply is only for first deployment; normal changes use full plans:

```bash
cd infra
terraform init
terraform apply \
  -target=google_secret_manager_secret_iam_member.secret_accessor \
  -var='project_id=PROJECT' -var='admin_cidr=YOUR_PUBLIC_IP/32'
gcloud secrets versions add dataflow-secrets --data-file=/secure/path/dataflow-secrets.json
```

Never put this JSON in `*.tfvars`, Helm values committed to Git, shell history,
CI logs, or issue attachments. Rotate JWT/OAuth/Temporal keys with a documented
dual-read or workflow-drain plan; changing encryption keys without migration can
make existing ciphertext unreadable.

### Existing Terraform state migration

Older configuration stored `dataflow_secrets_json` and a Secret Manager version
in Terraform. Assume existing state and state backups contain those secret
values. Before the first plan with this revision:

1. Rotate affected credentials and restrict access to the current state backend.
2. Remove `dataflow_secrets_json` from local ignored `terraform.tfvars.json`.
3. Terraform 1.7+ applies the checked-in `removed` block and forgets the old
   secret-version resource without deleting its live GCP object. For an older
   workspace/tooling exception, detach it manually:

   ```bash
   terraform state rm google_secret_manager_secret_version.dataflow_secrets_version
   ```

4. Confirm `terraform plan` does not propose deleting the active secret version.
5. Expire or securely remove old local/remote state versions under the approved
   retention policy. Remember that `terraform state rm` may create a local backup
   that also contains the historical value.

Review the plan: it must say the old resource is forgotten, not destroyed.

## Fresh deployment

```bash
cd infra
terraform plan -var='project_id=PROJECT' -var='admin_cidr=YOUR_PUBLIC_IP/32'
terraform apply -var='project_id=PROJECT' -var='admin_cidr=YOUR_PUBLIC_IP/32'
```

The Secret Manager version must exist before the VM starts bootstrap. Production mode
requires JWT, OAuth, Temporal payload, app URL, PostgreSQL, and Redis values and
fails the Helm render when any are absent. Production mode also sets Secure auth
cookies and makes every Go Temporal client require the payload-encryption key.

Only ports 80/443 are public. SSH is restricted to `admin_cidr`. Temporal,
Cohestra, Flink, API, database, Redis, ClickHouse, and NodePort surfaces must be
reached through SSH tunneling or Kubernetes port-forwarding.

## Existing VM migration

Attaching a new disk does not move an existing `/var/lib/docker` automatically.
For the current demo host:

1. Schedule downtime and export logical PostgreSQL and ClickHouse backups.
2. Stop workloads and Docker.
3. Attach/format/mount the protected disk.
4. Copy existing Docker data while preserving ownership and extended attributes.
5. Mount the disk at `/var/lib/docker`, start Docker/Kind, and validate PVCs.
6. Restore from logical backup if any database fails consistency checks.
7. Run the full deployed smoke suite before reopening access.

Cloud-init runs once per VM. In-place Terraform attachment/metadata updates do
not rerun this migration. Replace/rebootstrap the VM deliberately after data is
copied and verified; do not assume a normal `terraform apply` remounts existing
Docker data.

Do not apply the mount change blindly to a live host; an empty mount over an
existing directory makes old data appear missing until unmounted.

## Backup and restore

Disk snapshots are infrastructure recovery, not a complete database strategy.
Before the external pilot, automate:

- PostgreSQL daily logical backup plus Cloud SQL PITR when migrated.
- ClickHouse native backup to GCS or managed-provider snapshots.
- GCS object versioning and lifecycle for encrypted DataRefs.
- Temporal Cloud backup/retention or documented self-hosted persistence backup.
- Secret Manager version retention and access-log review.
- Quarterly restore drill into an isolated project.

Record RPO, RTO, backup age, restore duration, row counts, checksum/sample
validation, and approver. A backup without a successful restore test is not a
release control.

## Production target

Move off Kind before claiming production readiness:

| Capability | Demo | Pilot/production target |
| --- | --- | --- |
| Kubernetes | Single-node Kind on GCE | Regional GKE or another managed runtime |
| Metadata PostgreSQL | PVC or external URL | Cloud SQL HA, PITR, private IP |
| Redis/events | Redis PVC + AOF | Memorystore with appropriate durability or Pub/Sub |
| Payload objects | Optional S3-compatible target | GCS, CMEK if required, lifecycle/versioning |
| ClickHouse | Single PVC | Managed ClickHouse or replicated StatefulSet with tested backup |
| Temporal | Single auto-setup deployment | Temporal Cloud or supported HA deployment |
| Secrets | Secret Manager JSON version | Secret Manager/CSI, rotation, per-secret IAM |
| Ingress | Caddy on VM | Managed load balancer, certificate policy, WAF/rate limiting |

Migration ordering: managed PostgreSQL and payload storage first, managed event
transport second, then managed orchestration/analytics. Preserve typed contracts
and test one store migration at a time.
