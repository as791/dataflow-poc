#!/usr/bin/env bash
# One-command bootstrap for self-hosting DataFlow.
#
#   ./scripts/bootstrap.sh            # generate config + secrets, then start
#   ./scripts/bootstrap.sh --ai       # also start the Ollama AI builder profile
#   NO_UP=1 ./scripts/bootstrap.sh    # generate only, don't start the stack
#
# Idempotent: existing .env values and the worker keypair are preserved.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env
gen_hex()    { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
gen_base64() { node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"; }

# set_env KEY VALUE — update KEY in .env if present, else append.
set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    node -e '
      const fs=require("fs"); const [f,k,v]=process.argv.slice(1);
      const re=new RegExp("^"+k+"=.*$","m");
      fs.writeFileSync(f, fs.readFileSync(f,"utf8").replace(re, k+"="+v));
    ' "$ENV_FILE" "$key" "$val"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# Returns the current value of KEY in .env (empty if unset/placeholder).
get_env() { grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }

echo "▶ DataFlow bootstrap"

# 1. .env from the template.
if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  echo "  ✓ created .env from .env.example"
else
  echo "  • .env exists — keeping it, filling only empty secrets"
fi

# 2. Random secrets (only if empty or a placeholder).
for key in JWT_ACCESS_SECRET OAUTH_TOKEN_ENCRYPTION_KEY; do
  cur=$(get_env "$key")
  case "$cur" in ""|*change-me*) set_env "$key" "$(gen_hex)"; echo "  ✓ generated $key";; esac
done
cur=$(get_env TEMPORAL_PAYLOAD_ENCRYPTION_KEY)
[ -z "$cur" ] && { set_env TEMPORAL_PAYLOAD_ENCRYPTION_KEY "$(gen_base64)"; echo "  ✓ generated TEMPORAL_PAYLOAD_ENCRYPTION_KEY"; }

# 3. Worker RSA keypair + public key into .env.
if [ ! -f secrets/worker-keypair.pem ]; then
  node scripts/gen-worker-keypair.js >/dev/null
  echo "  ✓ generated secrets/worker-keypair.pem"
fi
PUB_ONELINE=$(node -e 'process.stdout.write(require("fs").readFileSync("secrets/worker-keypair.pub","utf8").replace(/\n/g,"\\n"))')
set_env WORKER_PUBLIC_KEY_PEM "\"$PUB_ONELINE\""
echo "  ✓ wired WORKER_PUBLIC_KEY_PEM"

# 4. Start the stack.
PROFILES=()
[ "${1:-}" = "--ai" ] && PROFILES=(--profile ai)
if [ -n "${NO_UP:-}" ]; then
  echo "▶ NO_UP set — skipping startup. Start later with:"
  echo "    docker compose ${PROFILES[*]} up -d --build"
  exit 0
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "▶ docker not found. Generated config is ready; install Docker then run:"
  echo "    docker compose ${PROFILES[*]} up -d --build"
  exit 0
fi
echo "▶ starting stack: docker compose ${PROFILES[*]} up -d --build"
docker compose "${PROFILES[@]}" up -d --build
echo "✓ DataFlow is starting. Web: http://localhost:3002  ·  Temporal UI: http://localhost:8082"
