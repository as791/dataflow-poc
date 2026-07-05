# Release B Loop State

- Goal: Complete direct streaming worker, PostgreSQL CDC to ClickHouse slice, lifecycle/monitoring, and failure recovery.
- Done when: `stream-direct` is realtime-entitled and validated, Temporal consumes bounded Kafka pages, commits offsets only after sink success, supports pause/resume/cancel and ContinueAsNew, exposes stream metrics, and checks pass.
- Scope: Current repository; no deploy or production mutation.
- Budget: Four deliverable iterations plus one verification pass.
- Status: done
- Current item: Release B implementation and verification complete.
- Evidence: Existing Kafka/CDC/sink paths reused; direct workflow consumes bounded pages, reports heartbeat/lag/throughput/errors, commits offsets after sink success only, retries failures without advancing offsets, continues as new, and handles pause/resume/cancel. PostgreSQL Debezium-to-ClickHouse example, realtime validation, lifecycle UI, success/failure tests added. All Go tests (20), shared tests/build, web tests/build, and diff check pass.
- Attempts: 4 deliverable passes plus 1 verification pass.
- Next action: None for Release B.
- Last run: 2026-07-05
