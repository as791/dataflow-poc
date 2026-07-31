# Deploy DataFlow on GCP with Terraform

For the public GCP deployment path, use the Terraform configuration in `infra/`
as a starting point. This guide intentionally describes the supported user flow
without documenting Cohestra's internal hosted deployment.

## Prerequisites

- A GCP project with billing enabled.
- Terraform 1.5+ and authenticated `gcloud` credentials.
- An administrator public IP expressed as `/32`.
- Runtime secrets stored outside the repository and outside Terraform state.

## Plan and apply

```bash
cd infra
terraform init
terraform plan \
  -var='project_id=YOUR_PROJECT' \
  -var='admin_cidr=YOUR_PUBLIC_IP/32'
terraform apply \
  -var='project_id=YOUR_PROJECT' \
  -var='admin_cidr=YOUR_PUBLIC_IP/32'
```

Review the plan before applying it. Use the Terraform outputs to find the
deployed application endpoint.

## Secrets

Store JWT, OAuth, Temporal payload-encryption, database, SMTP, and connector
credentials in GCP Secret Manager or your organization's secret manager. Inject
them during deployment; do not put secret values in `*.tfvars`, committed Helm
values, shell history, CI logs, or issue attachments.

## Production checklist

- Use managed or highly available PostgreSQL, Redis, Temporal, and ClickHouse
  services appropriate to your SLOs.
- Keep databases and internal service ports private; expose only the web ingress.
- Configure TLS, least-privilege IAM, backups, retention, monitoring, and tested
  restores.
- Separate development and production projects or networks.
- Review every Terraform and Helm change before rollout.

The checked-in Terraform is a reference deployment, not a universal production
architecture. Adapt networking, managed services, availability, and disaster
recovery to your organization's standards.
