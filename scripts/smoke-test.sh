#!/usr/bin/env bash
# End-to-end smoke test against the Compose stack (source fetch is external
# HTTPS — see note below — everything else stays in-stack).
set -e
API=${API:-http://localhost:4000}
COOKIE=$(mktemp)
trap 'rm -f "$COOKIE"' EXIT
EMAIL="smoke-$(date +%s)@example.test"

echo "0. Registering an isolated smoke-test workspace…"
curl -fsS -c "$COOKIE" -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"smoke-test-password\",\"tenantName\":\"Smoke\"}" >/dev/null
TOKEN=$(curl -fsS -b "$COOKIE" -c "$COOKIE" -X POST "$API/api/auth/refresh" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
AUTH="Authorization: Bearer $TOKEN"

# http.fetch enforces HTTPS on tenant-supplied URLs (security.ValidateURL);
# the in-stack API has no TLS listener, so this deliberately uses the same
# external HTTPS source demo-seed.sh uses rather than weakening that check.
SOURCE_URL=${SOURCE_URL:-https://jsonplaceholder.typicode.com/posts}

echo "1. Saving pipeline using an external HTTPS source…"
ROW=$(curl -fsS -X POST "$API/api/pipelines" -H "$AUTH" -H 'Content-Type: application/json' -d "{
  \"name\": \"smoke\",
  \"trigger\": { \"type\": \"manual\" },
  \"nodes\": [
    { \"id\": \"src\", \"type\": \"source\", \"activityType\": \"http.fetch\",
      \"config\": { \"url\": \"$SOURCE_URL\", \"recordsPath\": \"\" },
      \"ingestion\": { \"mode\": \"incremental\" } },
    { \"id\": \"fil\", \"type\": \"transform\", \"activityType\": \"transform.filter\",
      \"config\": { \"predicate\": \"r.id > 0\" } },
    { \"id\": \"snk\", \"type\": \"sink\", \"activityType\": \"sink.records\",
      \"config\": { \"collection\": \"smoke_health\" } }
  ],
  \"edges\": [
    { \"id\": \"e1\", \"source\": \"src\", \"target\": \"fil\" },
    { \"id\": \"e2\", \"source\": \"fil\", \"target\": \"snk\" }
  ]
}" | python3 -c "import sys,json; print(json.load(sys.stdin)['rowId'])")
echo "   rowId=$ROW"

echo "2. Running…"
EXEC=$(curl -fsS -X POST "$API/api/pipelines/$ROW/run" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['executionId'])")
echo "   executionId=$EXEC"

echo "3. Polling status…"
for i in $(seq 1 20); do
  PHASE=$(curl -fsS "$API/api/executions/$EXEC/status" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase','?'))")
  echo "   phase=$PHASE"
  [ "$PHASE" = "completed" ] && echo "✓ smoke test passed" && exit 0
  [ "$PHASE" = "failed" ] && echo "✗ pipeline failed" && exit 1
  sleep 2
done
echo "✗ timed out"; exit 1
