#cloud-config
# Trigger recreation for HTTPS
package_update: true
packages: [git, nodejs]

# 2G swap: parallel Go builds spike past 8 GB; swap beats an OOM-killed build.
swap:
  filename: /swapfile
  size: "2G"

disk_setup:
  /dev/disk/by-id/google-dataflow-data:
    table_type: gpt
    layout: true
    overwrite: false

fs_setup:
  - label: dataflow-data
    filesystem: ext4
    device: /dev/disk/by-id/google-dataflow-data
    partition: auto

mounts:
  - [LABEL=dataflow-data, /var/lib/docker, ext4, "defaults", "0", "2"]

runcmd:
  - mountpoint -q /var/lib/docker || { echo 'persistent data disk is not mounted' >&2; exit 1; }
  - curl -fsSL https://get.docker.com | sh
  - curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x kubectl && mv kubectl /usr/local/bin/
  - curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-linux-amd64 && chmod +x ./kind && mv ./kind /usr/local/bin/kind
  - curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  - git clone --branch ${branch} ${repo} /opt/dataflow
  - cd /opt/dataflow && export GCP_SECRET_MANAGER_NAME="dataflow-secrets" && ./scripts/bootstrap.sh > /var/log/dataflow-bootstrap.log 2>&1
