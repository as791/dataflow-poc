# DataFlow GCP demo infrastructure

Terraform provisions one hardened GCE demo host:

- static regional public IP;
- ports 80/443 public, SSH restricted to an explicit administrator CIDR;
- dedicated `dataflow-runtime` service account;
- Secret Manager container with runtime-only access;
- 50 GiB boot disk plus protected persistent data disk for `/var/lib/docker`;
- daily data-disk snapshots retained for 14 days;
- cloud-init bootstrap of Docker, Kind, Helm, DataFlow, and HTTPS.

This is a single-zone pre-release topology, not HA production architecture.
See [GCP deployment and persistence](../docs/DEPLOYMENT_GCP.md) before applying.
Existing state may contain the old `dataflow_secrets_json`; follow that guide's
state-migration steps before any full plan/apply.

## Deploy

First deployment is two-stage so the secret exists before cloud-init starts the VM:

```bash
cd infra
terraform init
terraform apply \
  -target=google_secret_manager_secret_iam_member.secret_accessor \
  -var='project_id=YOUR_PROJECT' \
  -var='admin_cidr=YOUR_PUBLIC_IP/32'
gcloud secrets versions add dataflow-secrets --data-file=/secure/path/dataflow-secrets.json

terraform plan \
  -var='project_id=YOUR_PROJECT' \
  -var='admin_cidr=YOUR_PUBLIC_IP/32'
terraform apply \
  -var='project_id=YOUR_PROJECT' \
  -var='admin_cidr=YOUR_PUBLIC_IP/32'
```

Terraform creates the Secret Manager container but no secret version. The
out-of-band version above keeps secret material out of Terraform state. Later
rotations need only `gcloud secrets versions add` plus a controlled rollout.

Then follow first-boot progress:

```bash
ssh ubuntu@$(terraform output -raw public_ip) \
  sudo tail -f /var/log/dataflow-bootstrap.log
```

The web URL is the `web_url` output. Internal UIs require an SSH tunnel or
`kubectl port-forward`; their ports are not public.

## Persistence warning

`dataflow-data` has Terraform `prevent_destroy`. Normal instance replacement
preserves it. A full `terraform destroy` intentionally stops at this disk; data
destruction requires an explicit, separately reviewed lifecycle change.

Snapshots are crash-consistent. Maintain logical PostgreSQL/ClickHouse backups
and perform restore drills as documented in `docs/DEPLOYMENT_GCP.md`.
