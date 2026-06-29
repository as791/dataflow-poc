#!/usr/bin/env bash
# One-command dev startup. Kills stale processes, seeds a dev refresh token,
# starts API + web. Google OAuth works out of the box (reads .env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="/tmp/dataflow-dev"
mkdir -p "$LOG_DIR"

# ── Kill anything on dev ports ────────────────────────────────────────────────
for port in 3000 3001 3002 4000; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null && echo "killed :$port" || true
done
sleep 1

# ── Ensure Postgres container is up ──────────────────────────────────────────
if ! docker inspect dataflow-postgres-local &>/dev/null; then
  echo "Starting postgres..."
  docker run -d --name dataflow-postgres-local -p 5432:5432 \
    -e POSTGRES_USER=dataflow -e POSTGRES_PASSWORD=dataflow -e POSTGRES_DB=dataflow \
    postgres:16-alpine
  sleep 3
fi

# ── Ensure Redis is reachable ────────────────────────────────────────────────
if ! docker inspect dataflow-poc-redis-1 &>/dev/null || \
   ! redis-cli -h 127.0.0.1 -p 6379 ping &>/dev/null 2>&1; then
  # Try local redis, then docker
  if ! redis-cli ping &>/dev/null 2>&1; then
    echo "Starting redis via brew..."
    redis-server --daemonize yes
  fi
fi

# ── Seed a fresh dev refresh token ───────────────────────────────────────────
DEV_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
HASH=$(node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$DEV_TOKEN")
EXPIRES=$(date -u -v+30d '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -d '+30 days' '+%Y-%m-%d %H:%M:%S')
docker exec dataflow-postgres-local psql -U dataflow -d dataflow -q \
  -c "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','$HASH','$EXPIRES') ON CONFLICT DO NOTHING;" 2>/dev/null || true

# ── Start API ────────────────────────────────────────────────────────────────
echo "Starting API..."
(
  set -a; source "$ROOT/.env"; set +a
  DATABASE_URL=postgres://dataflow:dataflow@localhost:5432/dataflow \
  APP_DATABASE_URL=postgres://dataflow:dataflow@localhost:5432/dataflow \
  REDIS_URL=redis://127.0.0.1:6379 \
  JWT_ACCESS_SECRET=dev-access-secret-change-me \
  NODE_ENV=development \
  DEV_REFRESH_TOKEN="$DEV_TOKEN" \
  npm run dev --workspace=apps/api
) > "$LOG_DIR/api.log" 2>&1 &
API_PID=$!

# ── Wait for API ─────────────────────────────────────────────────────────────
for i in $(seq 1 20); do
  sleep 1
  curl -sf http://localhost:4000/health &>/dev/null && break
  [ $i -eq 20 ] && echo "API failed to start — check $LOG_DIR/api.log" && exit 1
done
echo "API up (pid $API_PID)"

# ── Start Web ─────────────────────────────────────────────────────────────────
echo "Starting web..."
npm run dev:web --workspace=apps/web > "$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
sleep 3

echo ""
echo "──────────────────────────────────────"
echo "  Web   → http://localhost:3002"
echo "  API   → http://localhost:4000"
echo "  Login → http://localhost:4000/dev/login  (no Google needed)"
echo "  Logs  → $LOG_DIR/"
echo "──────────────────────────────────────"
echo "  PID api=$API_PID  web=$WEB_PID"
