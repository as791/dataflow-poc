#!/usr/bin/env bash
# Seed a credible demo workspace end-to-end via the public API (Gate 0).
# Creates: demo tenant/user, HTTP connector, pipeline (source→transform→sink),
# one successful run, one failed run, an OpenLineage event, and verifies the
# analytics dataset. Idempotent-enough: safe to re-run against the same env.
#
# Env:
#   BASE_URL       API base (default: http://localhost:4000, same as smoke-test.sh)
#   DEMO_EMAIL     demo user email      (default: demo@dataflow.dev)
#   DEMO_PASSWORD  demo user password   (default: demo-dataflow-1)
#   SOURCE_URL     JSON URL reachable FROM THE WORKER (default: http://api:4000/health)
#   BAD_SOURCE_URL URL that 404s, to force a failed run (default: $SOURCE_URL/nope)
set -euo pipefail

BASE_URL=${BASE_URL:-${API:-http://localhost:4000}}
DEMO_EMAIL=${DEMO_EMAIL:-demo@dataflow.dev}
DEMO_PASSWORD=${DEMO_PASSWORD:-demo-dataflow-1}
# http.fetch enforces HTTPS; a plain-http default would fail at the source step.
SOURCE_URL=${SOURCE_URL:-https://jsonplaceholder.typicode.com/posts}
BAD_SOURCE_URL=${BAD_SOURCE_URL:-${SOURCE_URL}/nope}
CONN_NAME="Demo HTTP API"
COLLECTION="demo_health_checks"
# Stable pipeline keys so re-runs create new versions, not new pipelines.
OK_PIPELINE_ID="0d3adf10-0000-4000-8000-000000000001"
FAIL_PIPELINE_ID="0d3adf10-0000-4000-8000-000000000002"

COOKIE=$(mktemp)
trap 'rm -f "$COOKIE"' EXIT

field() { # field <dotted.path>  — extract a value from JSON on stdin ("" on bad/empty JSON)
  python3 -c '
import json,sys
try: value=json.load(sys.stdin)
except Exception: value=None
for key in sys.argv[1].split("."):
    value=value.get(key) if isinstance(value,dict) else None
print("" if value is None else value)' "$1"
}

echo "0. Registering (or logging into) the Demo workspace at $BASE_URL…"
if ! curl -fsS -c "$COOKIE" -X POST "$BASE_URL/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\",\"tenantName\":\"Demo\"}" >/dev/null 2>&1; then
  echo "   register failed (already exists?), logging in…"
  curl -fsS -c "$COOKIE" -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}" >/dev/null
fi
TOKEN=$(curl -fsS -b "$COOKIE" -c "$COOKIE" -X POST "$BASE_URL/api/auth/refresh" | field accessToken)
AUTH="Authorization: Bearer $TOKEN"
echo "   authenticated as $DEMO_EMAIL"

echo "1. Creating HTTP connector \"$CONN_NAME\"…"
CONNECTOR_ID=$(curl -fsS -X POST "$BASE_URL/api/connectors" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"provider\":\"http\",\"name\":\"$CONN_NAME\",\"config\":{\"baseUrl\":\"$SOURCE_URL\"},\"secret\":{}}" 2>/dev/null \
  | field id || true)
if [ -z "$CONNECTOR_ID" ]; then
  echo "   create failed (already exists?), reusing existing connector…"
  CONNECTOR_ID=$(curl -fsS "$BASE_URL/api/connectors" -H "$AUTH" | python3 -c '
import json,sys
rows=json.load(sys.stdin)
print(next((r["id"] for r in rows if r.get("name")==sys.argv[1]), ""))' "$CONN_NAME")
fi
[ -n "$CONNECTOR_ID" ] || { echo "✗ could not create or find connector"; exit 1; }
echo "   connectorId=$CONNECTOR_ID"

echo "2. Saving demo pipeline (source → filter → managed-store sink)…"
OK_ROW=$(curl -fsS -X POST "$BASE_URL/api/pipelines" -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"id\": \"$OK_PIPELINE_ID\",
  \"name\": \"Demo — API health to analytics\",
  \"trigger\": { \"type\": \"manual\" },
  \"nodes\": [
    { \"id\": \"src\", \"type\": \"source\", \"activityType\": \"http.fetch\",
      \"config\": { \"url\": \"$SOURCE_URL\", \"recordsPath\": \"\" },
      \"ingestion\": { \"mode\": \"incremental\" } },
    { \"id\": \"fil\", \"type\": \"transform\", \"activityType\": \"transform.filter\",
      \"config\": { \"predicate\": \"r.ok === true\" } },
    { \"id\": \"snk\", \"type\": \"sink\", \"activityType\": \"sink.records\",
      \"config\": { \"collection\": \"$COLLECTION\" } }
  ],
  \"edges\": [
    { \"id\": \"e1\", \"source\": \"src\", \"target\": \"fil\" },
    { \"id\": \"e2\", \"source\": \"fil\", \"target\": \"snk\" }
  ]
}" | field rowId)
echo "   rowId=$OK_ROW"
curl -fsS -X POST "$BASE_URL/api/pipelines/$OK_ROW/activate" -H "$AUTH" >/dev/null
echo "   activated"

echo "3. Saving deliberately failing pipeline (404 source)…"
FAIL_ROW=$(curl -fsS -X POST "$BASE_URL/api/pipelines" -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"id\": \"$FAIL_PIPELINE_ID\",
  \"name\": \"Demo — Failing ingest (broken endpoint)\",
  \"trigger\": { \"type\": \"manual\" },
  \"nodes\": [
    { \"id\": \"src\", \"type\": \"source\", \"activityType\": \"http.fetch\",
      \"config\": { \"url\": \"$BAD_SOURCE_URL\", \"recordsPath\": \"\" },
      \"ingestion\": { \"mode\": \"incremental\" } },
    { \"id\": \"fil\", \"type\": \"transform\", \"activityType\": \"transform.filter\",
      \"config\": { \"predicate\": \"r.ok === true\" } },
    { \"id\": \"snk\", \"type\": \"sink\", \"activityType\": \"sink.records\",
      \"config\": { \"collection\": \"demo_failing_ingest\" } }
  ],
  \"edges\": [
    { \"id\": \"e1\", \"source\": \"src\", \"target\": \"fil\" },
    { \"id\": \"e2\", \"source\": \"fil\", \"target\": \"snk\" }
  ]
}" | field rowId)
echo "   rowId=$FAIL_ROW"

wait_for_phase() { # wait_for_phase <executionId> <wantedPhase> <attempts>
  local exec_id=$1 wanted=$2 attempts=$3 phase i
  for i in $(seq 1 "$attempts"); do
    phase=$(curl -fsS "$BASE_URL/api/executions/$exec_id/status" -H "$AUTH" | field phase)
    echo "   phase=$phase"
    [ "$phase" = "$wanted" ] && return 0
    case "$phase" in completed|failed|cancelled) echo "✗ terminal phase $phase (wanted $wanted)"; return 1 ;; esac
    sleep 3
  done
  echo "✗ timed out waiting for $wanted"
  return 1
}

echo "4. Triggering successful run…"
OK_EXEC=$(curl -fsS -X POST "$BASE_URL/api/pipelines/$OK_ROW/run" -H "$AUTH" | field executionId)
echo "   executionId=$OK_EXEC"
wait_for_phase "$OK_EXEC" completed 40

echo "5. Triggering failing run (worker retries ~30s before giving up)…"
FAIL_EXEC=$(curl -fsS -X POST "$BASE_URL/api/pipelines/$FAIL_ROW/run" -H "$AUTH" | field executionId)
echo "   executionId=$FAIL_EXEC"
wait_for_phase "$FAIL_EXEC" failed 60

echo "6. Posting OpenLineage event…"
OL_TOKEN=$(curl -fsS -X POST "$BASE_URL/api/pipelines/lineage/openlineage-key" -H "$AUTH" | field token)
OL_RUN_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -fsS -X POST "$BASE_URL/api/openlineage" \
  -H "Authorization: Bearer $OL_TOKEN" -H 'Content-Type: application/json' -d "{
  \"eventType\": \"COMPLETE\",
  \"eventTime\": \"$NOW\",
  \"producer\": \"https://github.com/Cohestra/cohestra-dataflow\",
  \"run\": { \"runId\": \"$OL_RUN_ID\" },
  \"job\": { \"namespace\": \"demo-warehouse\", \"name\": \"nightly_orders_rollup\" },
  \"inputs\": [ { \"namespace\": \"demo-warehouse\", \"name\": \"raw.orders\" } ],
  \"outputs\": [ { \"namespace\": \"demo-warehouse\", \"name\": \"analytics.daily_orders\" } ]
}" >/dev/null
echo "   lineage runId=$OL_RUN_ID"

echo "7. Checking monitoring incident…"
FAILED_COUNT=$(curl -fsS "$BASE_URL/api/executions/monitoring/overview" -H "$AUTH" | field summary.failed)
echo "   monitoring overview reports failed runs: ${FAILED_COUNT:-0}"
ALERT_COUNT=$(curl -fsS "$BASE_URL/api/alerts" -H "$AUTH" | python3 -c 'import json,sys; print(len(json.load(sys.stdin) or []))')
echo "   open/acknowledged alerts: $ALERT_COUNT"
if [ "$ALERT_COUNT" = "0" ]; then
  echo "   TODO: no pipeline_alerts row could be seeded — the Go backend only exposes"
  echo "   GET/acknowledge/resolve on /api/alerts and nothing in apps/workflow-go writes"
  echo "   pipeline_alerts on failure (a create/evaluate route is missing). The failed run"
  echo "   above still surfaces as an incident in /api/executions/monitoring/overview."
fi

echo "8. Verifying analytics dataset \"$COLLECTION\"…"
ROW_COUNT=""
for i in $(seq 1 5); do
  ROW_COUNT=$(curl -fsS "$BASE_URL/api/analytics/datasets" -H "$AUTH" 2>/dev/null | python3 -c '
import json,sys
try: rows=json.load(sys.stdin)
except Exception: rows=[]
print(next((r["row_count"] for r in rows if isinstance(r,dict) and r.get("collection")==sys.argv[1]), ""))' "$COLLECTION" || true)
  [ -n "$ROW_COUNT" ] && break
  sleep 3
done
if [ -n "$ROW_COUNT" ]; then
  echo "   dataset $COLLECTION has $ROW_COUNT row(s)"
else
  echo "   TODO: dataset \"$COLLECTION\" not visible via /api/analytics/datasets —"
  echo "   check that ClickHouse is running and CLICKHOUSE_URL is configured on the API."
fi

echo ""
echo "=== Demo seed summary ==="
echo "workspace        Demo ($DEMO_EMAIL)"
echo "connector        $CONNECTOR_ID ($CONN_NAME → $SOURCE_URL)"
echo "pipeline (ok)    $OK_ROW (key $OK_PIPELINE_ID, active)"
echo "pipeline (fail)  $FAIL_ROW (key $FAIL_PIPELINE_ID)"
echo "run (completed)  $OK_EXEC"
echo "run (failed)     $FAIL_EXEC"
echo "lineage event    job demo-warehouse/nightly_orders_rollup run $OL_RUN_ID"
echo "analytics        $COLLECTION row_count=${ROW_COUNT:-unverified}"
echo "✓ demo seed done"
