# Self-host DataFlow

These deployment paths use repository configuration and do not require changes
to application source code.

## Docker Compose

Requirements: Docker Desktop or Docker Engine with Compose and at least 8 GB of
memory.

```bash
git clone https://github.com/Cohestra/cohestra-dataflow.git
cd cohestra-dataflow
cp .env.example .env
node scripts/gen-worker-keypair.js
docker compose up -d
```

Open `http://localhost:3002`, then verify the API:

```bash
docker compose ps
curl --fail http://localhost:3002/api/health
```

Stop without deleting stored data with `docker compose down`.

## Local Kubernetes

Install Docker, Kind, `kubectl`, and Helm, then run:

```bash
git clone https://github.com/Cohestra/cohestra-dataflow.git
cd cohestra-dataflow
./scripts/bootstrap.sh
./scripts/smoke-test.sh
```

Bootstrap creates the local configuration, builds images, creates the Kind
cluster, and installs the Helm chart. Open `http://localhost:3002`.

Delete the local cluster and its data with:

```bash
kind delete cluster --name dataflow
```

## Existing Kubernetes cluster

Supply image references, a public application URL, storage classes, and secrets
through your normal Helm values and secret-management workflow:

```bash
helm upgrade --install dataflow deploy/helm/dataflow \
  --namespace dataflow \
  --create-namespace \
  --values my-dataflow-values.yaml

kubectl rollout status deployment/api -n dataflow
kubectl rollout status deployment/web -n dataflow
```

For production, use persistent storage and highly available backing services
appropriate to your SLOs. Expose only the web ingress; keep databases, workers,
and internal service ports private.

## GCP with Terraform

The `infra/` directory is a Terraform starting point for GCP. Review the plan
in your own project and keep runtime secrets out of Terraform state.

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

Treat the checked-in Terraform as a reference, not a universal production
blueprint. Adapt networking, managed services, backups, availability, and
ingress to your organization's standards. Use GCP Secret Manager or your
existing secret manager for runtime credentials.

## After deployment

1. Create the first workspace owner.
2. Add and test connector credentials in **Connectors**.
3. Run a small source-to-sink pipeline.
4. Confirm run history, lineage, and destination records.
5. Configure TLS, monitoring, backups, and credential rotation before using
   production data.
