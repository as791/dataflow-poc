#!/usr/bin/env bash
# Durable-execution demo: trigger a real pipeline run, kill the Temporal
# workflow-worker container mid-flight, restart it, and prove the run still
# reaches "completed" — Temporal replays workflow history from Cassandra, so
# killing the orchestrator process loses zero progress.
#
# Requires the stack already running (see preflight below) and a pipeline
# that already exists — this script does not create one. Easiest source of
# both: `./scripts/demo-seed.sh`, then pass its printed "pipeline (ok) <rowId>"
# as PIPELINE_ID.
#
# Env:
#   BASE_URL       API base                     (default: http://localhost:4000)
#   PIPELINE_ID    pipeline rowId to run         (required — no default, see above)
#   AUTH_EMAIL     account to run as             (default: demo@dataflow.dev, matches demo-seed.sh)
#   AUTH_PASSWORD  password for AUTH_EMAIL       (default: demo-dataflow-1)
#   KILL_DELAY     seconds to wait after trigger before killing the worker (default: 0 —
#                  a 3-node demo pipeline can finish in ~1-2s, so waiting any longer risks
#                  the run reaching a terminal phase before the kill)
#   POLL_INTERVAL  seconds between status polls  (default: 2)
#   MAX_ATTEMPTS   status polls before giving up (default: 90, i.e. ~3min at 2s)
#
# Exit code: 0 iff the execution reaches phase=completed after the kill+restart;
# 1 otherwise (with diagnostics printed to stderr).
#
# ponytail: the "killed worker at node X" line below reports a node-completed
# COUNT, not the specific node ID mid-flight — the Temporal "status" query
# handler (apps/workflow-go/internal/workflows/dynamic_dag.go) only records
# NodeResults for nodes that have *finished*, it has no notion of "currently
# running". Exact in-flight node would need a heartbeat/progress signal from
# each activity; add that if the GIF needs to call out a specific node by name.
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:4000}
PIPELINE_ID=${PIPELINE_ID:-}
AUTH_EMAIL=${AUTH_EMAIL:-demo@dataflow.dev}
AUTH_PASSWORD=${AUTH_PASSWORD:-demo-dataflow-1}
KILL_DELAY=${KILL_DELAY:-0}
POLL_INTERVAL=${POLL_INTERVAL:-2}
MAX_ATTEMPTS=${MAX_ATTEMPTS:-90}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose() { docker compose --project-directory "$ROOT_DIR" -f "$ROOT_DIR/docker-compose.yml" "$@"; }
ts() { date -u +%H:%M:%S; }
log() { echo "[$(ts)] $*"; }

for bin in docker curl jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "✗ $bin is required on PATH" >&2; exit 1; }
done

if [ -z "$PIPELINE_ID" ]; then
  echo "✗ PIPELINE_ID is required — it's the pipeline *rowId* (UUID), not the pipeline key." >&2
  echo "  Run ./scripts/demo-seed.sh first, then re-run with:" >&2
  echo "    PIPELINE_ID=<rowId printed as 'pipeline (ok) <rowId>'> ./scripts/crash-recovery-demo.sh" >&2
  exit 1
fi

# ── preflight ────────────────────────────────────────────────────────────
log "preflight: checking $BASE_URL/health"
if ! curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
  echo "✗ API not reachable at $BASE_URL" >&2
  if compose ps --services --status running 2>/dev/null | grep -qx api; then
    echo "  api container is running but not answering health checks — check: docker compose logs api" >&2
  else
    echo "  stack isn't running. Start it with:" >&2
    echo "    (cd \"$ROOT_DIR\" && docker compose up -d)" >&2
  fi
  exit 1
fi
log "preflight: API reachable"

# ── auth (register-or-login, same dance as scripts/demo-seed.sh) ──────────
COOKIE=$(mktemp)
trap 'rm -f "$COOKIE"' EXIT
if ! curl -fsS -c "$COOKIE" -X POST "$BASE_URL/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\",\"tenantName\":\"Demo\"}" >/dev/null 2>&1; then
  curl -fsS -c "$COOKIE" -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" >/dev/null
fi
TOKEN=$(curl -fsS -b "$COOKIE" -c "$COOKIE" -X POST "$BASE_URL/api/auth/refresh" | jq -r '.accessToken')
[ -n "$TOKEN" ] && [ "$TOKEN" != null ] || { echo "✗ authentication failed for $AUTH_EMAIL" >&2; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
log "authenticated as $AUTH_EMAIL"

# ── trigger the run: POST /api/pipelines/{rowId}/run ──────────────────────
RUN_JSON=$(curl -fsS -X POST "$BASE_URL/api/pipelines/$PIPELINE_ID/run" -H "$AUTH" -H 'Content-Type: application/json' -d '{}') \
  || { echo "✗ failed to trigger run for pipeline $PIPELINE_ID — check it exists and $AUTH_EMAIL can edit it" >&2; exit 1; }
EXEC_ID=$(jq -r '.executionId' <<<"$RUN_JSON")
ENVIRONMENT=$(jq -r '.environment' <<<"$RUN_JSON")
[ -n "$EXEC_ID" ] && [ "$EXEC_ID" != null ] || { echo "✗ unexpected trigger response: $RUN_JSON" >&2; exit 1; }
log "started execution $EXEC_ID (environment=$ENVIRONMENT)"

TOTAL_NODES=$(curl -fsS "$BASE_URL/api/executions/$EXEC_ID" -H "$AUTH" | jq -r '.definition.nodes | length' 2>/dev/null || echo "?")

progress() { # progress <status_json> -> prints "N/TOTAL"
  local n
  n=$(jq -r '(.nodeResults // {} | length) as $a | (.nodeRuns // [] | length) as $b | if $a>0 then $a else $b end' <<<"$1")
  echo "$n/$TOTAL_NODES"
}

# ── wait for it to actually be in-progress, then kill the workflow worker ─
sleep "$KILL_DELAY"
STATUS_JSON=$(curl -fsS "$BASE_URL/api/executions/$EXEC_ID/status" -H "$AUTH")
PHASE=$(jq -r '.phase' <<<"$STATUS_JSON")
if [[ "$PHASE" != "running" && "$PHASE" != "paused" ]]; then
  echo "✗ execution already reached terminal phase=$PHASE before KILL_DELAY=${KILL_DELAY}s elapsed —" >&2
  echo "  the pipeline finishes too fast to demo a mid-run kill. Lower KILL_DELAY or use a slower pipeline." >&2
  exit 1
fi
NODES_DONE=$(progress "$STATUS_JSON")
log "pre-kill: phase=$PHASE nodesCompleted=$NODES_DONE"

CONTAINER=$(compose ps -q "workflow-$ENVIRONMENT")
[ -n "$CONTAINER" ] || { echo "✗ could not resolve a container for compose service workflow-$ENVIRONMENT" >&2; exit 1; }

log "killed worker at node checkpoint $NODES_DONE (docker kill $CONTAINER, service workflow-$ENVIRONMENT)"
docker kill "$CONTAINER" >/dev/null

# ponytail: workflow-test/workflow-prod carry no `restart:` policy in
# docker-compose.yml (verified — only the one-shot init containers do), so a
# dead worker stays dead until something starts it. `docker start` here is
# unconditional: if a restart policy is ever added, starting an
# already-running container is a harmless no-op, so this keeps working either way.
docker start "$CONTAINER" >/dev/null
log "worker container restarted"

# ── poll until terminal ────────────────────────────────────────────────────
RESUMED_LOGGED=false
ATTEMPT=0
while true; do
  ATTEMPT=$((ATTEMPT + 1))
  STATUS_JSON=$(curl -fsS "$BASE_URL/api/executions/$EXEC_ID/status" -H "$AUTH")
  PHASE=$(jq -r '.phase' <<<"$STATUS_JSON")
  NODES_DONE=$(progress "$STATUS_JSON")
  log "poll #$ATTEMPT phase=$PHASE nodesCompleted=$NODES_DONE"

  if [ "$RESUMED_LOGGED" = false ] && [ "$PHASE" = "running" ] && jq -e 'has("nodeResults")' <<<"$STATUS_JSON" >/dev/null 2>&1; then
    log "resumed — a workflow worker is answering the Temporal status query again"
    RESUMED_LOGGED=true
  fi

  case "$PHASE" in
    completed) log "completed"; break ;;
    failed|cancelled) log "terminal phase=$PHASE (not completed)"; break ;;
  esac
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    log "timed out after $((ATTEMPT * POLL_INTERVAL))s waiting for a terminal phase"
    break
  fi
  sleep "$POLL_INTERVAL"
done

if [ "$PHASE" = "completed" ]; then
  echo "✓ crash-recovery demo passed — execution $EXEC_ID completed after killing+restarting $CONTAINER"
  exit 0
fi

echo "✗ crash-recovery demo failed — final phase=$PHASE" >&2
echo "--- last status ---" >&2
jq . <<<"$STATUS_JSON" >&2
echo "--- worker logs (tail) ---" >&2
docker logs --tail 50 "$CONTAINER" >&2 || true
exit 1
