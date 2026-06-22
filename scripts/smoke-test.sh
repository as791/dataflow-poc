#!/usr/bin/env bash
# End-to-end smoke test against a local mock API source
set -e
API=${API:-http://localhost:3000}

echo "1. Saving pipeline using public JSON test API as a custom source…"
ROW=$(curl -s -X POST $API/api/pipelines -H 'Content-Type: application/json' -d '{
  "name": "smoke",
  "trigger": { "type": "manual" },
  "nodes": [
    { "id": "src", "type": "source", "activityType": "http.fetch",
      "config": { "url": "https://jsonplaceholder.typicode.com/todos", "recordsPath": "" },
      "ingestion": { "mode": "incremental" } },
    { "id": "fil", "type": "transform", "activityType": "transform.filter",
      "config": { "predicate": "r.completed === true" } },
    { "id": "snk", "type": "sink", "activityType": "sink.postgres",
      "config": { "collection": "todos_done", "dedupField": "id" } }
  ],
  "edges": [
    { "id": "e1", "source": "src", "target": "fil" },
    { "id": "e2", "source": "fil", "target": "snk" }
  ]
}' | python3 -c "import sys,json; print(json.load(sys.stdin)['rowId'])")
echo "   rowId=$ROW"

echo "2. Running…"
EXEC=$(curl -s -X POST $API/api/pipelines/$ROW/run | python3 -c "import sys,json; print(json.load(sys.stdin)['executionId'])")
echo "   executionId=$EXEC"

echo "3. Polling status…"
for i in $(seq 1 20); do
  PHASE=$(curl -s $API/api/executions/$EXEC/status | python3 -c "import sys,json; print(json.load(sys.stdin).get('phase','?'))")
  echo "   phase=$PHASE"
  [ "$PHASE" = "completed" ] && echo "✓ smoke test passed" && exit 0
  [ "$PHASE" = "failed" ] && echo "✗ pipeline failed" && exit 1
  sleep 2
done
echo "✗ timed out"; exit 1
