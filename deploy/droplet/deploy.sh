#!/usr/bin/env bash
# DigitalOcean Droplet deployment for DataFlow.
#
#   deploy.sh create --domain dataflow.example.com --ssh-key <doctl-key-id> \
#             [--name dataflow] [--region blr1] [--size s-4vcpu-8gb] \
#             [--repo <url>] [--ref main]
#       Renders cloud-init.yml and creates a droplet with it. Requires an
#       authenticated doctl (https://docs.digitalocean.com/reference/doctl/).
#
#   deploy.sh update --host <ip-or-hostname> [--ref main] [--user root]
#       SSHes into an existing droplet, fetches the ref, and rebuilds the
#       stack in place.
#
# After `create`, point the domain's A record at the droplet IP printed at the
# end — Caddy needs it to obtain the TLS certificate.
set -euo pipefail
cd "$(dirname "$0")"

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

MODE="${1:-}"; shift || usage
DOMAIN="" SSH_KEY="" NAME="dataflow" REGION="blr1" SIZE="s-4vcpu-8gb"
REPO="https://github.com/as791/dataflow-poc.git" REF="main" HOST="" SSH_USER="root"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)  DOMAIN="$2";   shift 2;;
    --ssh-key) SSH_KEY="$2";  shift 2;;
    --name)    NAME="$2";     shift 2;;
    --region)  REGION="$2";   shift 2;;
    --size)    SIZE="$2";     shift 2;;
    --repo)    REPO="$2";     shift 2;;
    --ref)     REF="$2";      shift 2;;
    --host)    HOST="$2";     shift 2;;
    --user)    SSH_USER="$2"; shift 2;;
    *) echo "unknown option: $1" >&2; usage;;
  esac
done

case "$MODE" in
  create)
    [ -n "$DOMAIN" ]  || { echo "--domain is required" >&2; usage; }
    [ -n "$SSH_KEY" ] || { echo "--ssh-key is required (doctl compute ssh-key list)" >&2; usage; }
    command -v doctl >/dev/null || { echo "doctl not found — install and run 'doctl auth init'" >&2; exit 1; }

    USER_DATA=$(mktemp)
    trap 'rm -f "$USER_DATA"' EXIT
    sed -e "s|__DATAFLOW_DOMAIN__|$DOMAIN|g" \
        -e "s|__REPO_URL__|$REPO|g" \
        -e "s|__GIT_REF__|$REF|g" cloud-init.yml > "$USER_DATA"

    echo "▶ creating droplet '$NAME' ($SIZE, $REGION) for https://$DOMAIN"
    doctl compute droplet create "$NAME" \
      --image ubuntu-24-04-x64 \
      --size "$SIZE" \
      --region "$REGION" \
      --ssh-keys "$SSH_KEY" \
      --user-data-file "$USER_DATA" \
      --tag-name dataflow \
      --wait \
      --format ID,Name,PublicIPv4

    echo
    echo "✓ droplet created. Next steps:"
    echo "  1. Point an A record for $DOMAIN at the IP above."
    echo "  2. Provisioning takes ~10 min:  ssh root@<ip> tail -f /var/log/cloud-init-output.log"
    echo "  3. Then open https://$DOMAIN"
    ;;

  update)
    [ -n "$HOST" ] || { echo "--host is required" >&2; usage; }
    echo "▶ updating $SSH_USER@$HOST to $REF"
    ssh -o StrictHostKeyChecking=accept-new "$SSH_USER@$HOST" \
      "set -euo pipefail
       cd /opt/dataflow
       git fetch origin '$REF'
       git checkout --detach FETCH_HEAD
       docker compose -f docker-compose.yml -f deploy/droplet/docker-compose.droplet.yml up -d --build
       docker image prune -f"
    echo "✓ deployed $REF"
    ;;

  *) usage;;
esac
