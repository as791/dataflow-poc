# Release C Loop State

- Goal: Complete S3/Iceberg input, Spark SQL transform, Iceberg/ClickHouse output, Spark Operator lifecycle, and incremental snapshots.
- Done when: `spark-sql` is entitled and validated; safe SELECT generates a SparkApplication; Temporal submits, monitors, cancels, verifies output, and advances input snapshot only after success; checks pass.
- Scope: Current repository and Kubernetes Spark Operator API; no deployment performed.
- Budget: Four deliverable passes plus one verification pass.
- Status: done
- Current item: Release C implementation and verification complete.
- Evidence: Safe SQL/spec generation, Kubernetes submit/status/delete activities, Temporal monitoring/cancel workflow, Spark/Flink entitlement migration and locked UI engines, RBAC, S3 example, Iceberg output-snapshot verification, no-op incremental detection, and post-success snapshot advancement implemented. Go tests, shared tests/build, web tests/build, and diff check pass.
- Attempts: 4 deliverable passes plus 1 verification pass.
- Next action: None for Release C.
- Last run: 2026-07-05
