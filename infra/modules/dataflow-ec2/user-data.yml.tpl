#cloud-config
package_update: true
packages: [git, nodejs]

# 2G swap: parallel Go builds spike past 8 GB; swap beats an OOM-killed build.
swap:
  filename: /swapfile
  size: "2G"

runcmd:
  - curl -fsSL https://get.docker.com | sh
  - git clone --branch ${branch} ${repo} /opt/dataflow
  - cd /opt/dataflow && ./scripts/bootstrap.sh > /var/log/dataflow-bootstrap.log 2>&1
