# DataFlow AWS infra

One EC2 instance (t4g.large ARM, 8 GB, ~$50/mo Mumbai) running the whole
compose stack via cloud-init + `scripts/bootstrap.sh`. Security group allows
only SSH and the web UI (3002) — the group, not ufw, is the firewall because
Docker-published ports bypass ufw.

## Prereqs

```bash
brew install terraform awscli
aws configure          # access key from IAM, region ap-south-1
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519
```

## Deploy

```bash
cd infra
terraform init
terraform apply        # ~2 min for infra, then ~10 min first build on the box
```

Outputs the IP. Watch first boot:

```bash
ssh ubuntu@<ip> sudo tail -f /var/log/dataflow-bootstrap.log
```

Web UI: `http://<ip>:3002`

## Common overrides

```bash
terraform apply -var instance_type=t4g.xlarge     # 16 GB if 8 is tight
terraform apply -var admin_cidr=$(curl -s ifconfig.me)/32   # lock SSH to your IP
terraform apply -var branch=feat/ai-pipeline-builder
```

## Costs

- t4g.large ~$50/mo + 50 GB gp3 ~$4/mo. Covered ~2 months by the $100 AWS
  signup credit.
- Stop when idle: `aws ec2 stop-instances --instance-ids $(terraform output -raw instance_id)`
  — billing pauses, Elastic IP keeps the address (EIP costs ~$3.6/mo while
  instance is stopped).

## Teardown

```bash
terraform destroy
```
