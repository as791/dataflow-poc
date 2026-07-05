#cloud-config
package_update: true
packages: [git, nodejs]

# 2G swap: parallel Go builds spike past 8 GB; swap beats an OOM-killed build.
swap:
  filename: /swapfile
  size: "2G"

runcmd:
  - curl -fsSL https://get.docker.com | sh
  - curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x kubectl && mv kubectl /usr/local/bin/
  - curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-linux-amd64 && chmod +x ./kind && mv ./kind /usr/local/bin/kind
  - curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  - git clone --branch ${branch} ${repo} /opt/dataflow
  - cd /opt/dataflow && export GCP_SECRET_MANAGER_NAME="dataflow-secrets" && ./scripts/bootstrap.sh > /var/log/dataflow-bootstrap.log 2>&1
