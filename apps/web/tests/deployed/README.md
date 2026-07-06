# Deployed integration suite

Runs real pipelines against the deployed application, Google Sheets/Drive, public HTTP APIs, AWS S3, database/streaming connectors, analytics, lineage, AI authoring, and resilience flows.

## One-time fixtures

- Source: https://docs.google.com/spreadsheets/d/101aHt7DhfCQ88K5icKB88DBwKujRAbWvvqq1LsLwHkk
- Destination: https://docs.google.com/spreadsheets/d/1wfJYweg3RP10IjOmrjjEkTarUp0Es3v7gAsGh58PdVQ
- S3: `s3://dataflow-integration-qa-726929246977/fixtures/`
- Google Drive fixture: https://drive.google.com/file/d/1gwQsrvnaGMY44g1WcitarJJ-Ri2xkPYP/view

Create/update fixtures before a full run:

```sh
aws s3 cp apps/web/tests/deployed/fixtures/orders.jsonl s3://$AWS_QA_BUCKET/fixtures/orders.jsonl
aws s3 cp apps/web/tests/deployed/fixtures/orders.json s3://$AWS_QA_BUCKET/fixtures/orders.json
aws s3 cp apps/web/tests/deployed/fixtures/duplicates.json s3://$AWS_QA_BUCKET/fixtures/duplicates.json
aws s3 cp apps/web/tests/deployed/fixtures/edge-cases.json s3://$AWS_QA_BUCKET/fixtures/edge-cases.json
```

## Required environment

```sh
export DEPLOYED_BASE_URL=https://34.14.212.157.nip.io
export QA_EMAIL=...
export QA_PASSWORD=...
export AWS_QA_BUCKET=dataflow-integration-qa-726929246977
export GOOGLE_QA_SOURCE_SPREADSHEET_ID=101aHt7DhfCQ88K5icKB88DBwKujRAbWvvqq1LsLwHkk
export GOOGLE_QA_DEST_SPREADSHEET_ID=1wfJYweg3RP10IjOmrjjEkTarUp0Es3v7gAsGh58PdVQ
export QA_SECONDARY_EMAIL=...
export QA_SECONDARY_PASSWORD=...
export QA_POSTGRES_TABLE=public.qa_orders
export QA_MYSQL_TABLE=qa_orders
export QA_MONGODB_COLLECTION=qa_orders
export QA_CLICKHOUSE_TABLE=qa_orders
export QA_KAFKA_TOPIC=dataflow.qa.orders
export QA_WEBHOOK_URL=https://your-qa-webhook-recorder.example/capture
export QA_SPARK_PARQUET_KEY=fixtures/orders.parquet
export QA_ICEBERG_NAMESPACE=qa
export QA_ICEBERG_TABLE=orders
export QA_FLINK_COLLECTION=qa_flink_orders
npm -w apps/web run test:deployed
```

Before running, connect Google, S3, PostgreSQL, MySQL, MongoDB, ClickHouse, Kafka, SFTP, Snowflake, Iceberg, and webhook where available in the QA workspace. Add a second S3 connection named `qa-aws-s3-denied` whose IAM policy denies the fixture bucket. The suite discovers connections by provider and never stores secrets.

## Run priorities

Run one priority independently:

```sh
npm -w apps/web run test:deployed -- --grep P0
npm -w apps/web run test:deployed -- --grep P1
npm -w apps/web run test:deployed -- --grep P2
npm -w apps/web run test:deployed -- --grep P3
```

Priority coverage:

- P0: real always-on source→transform→sink flows across public HTTP, Google Sheets, Google Drive, and AWS S3.
- P1: AI pipeline authoring/refine, analytics dashboards, connector variations, HTTP variations, auth validation, CDC, lifecycle, and core operations.
- P2: advanced transforms, Spark/Flink engines, lineage, and medallion architecture.
- P3: resilience paths: timeouts, failed sinks, concurrent runs, token refresh, schema drift, idempotency, and cancellation.

P2 Spark/Flink tests require their paid features and operators to be enabled in the QA workspace.

Run narrow suites:

```sh
npm -w apps/web run test:deployed -- p1-ai-authoring.spec.ts
npm -w apps/web run test:deployed -- p1-analytics.spec.ts
npm -w apps/web run test:deployed -- p2-lineage-medallion.spec.ts
npm -w apps/web run test:deployed -- p3-resilience.spec.ts
```

## AI authoring and Mermaid validation

`p1-ai-authoring.spec.ts` tests natural user prompts, not internal node IDs. It verifies:

- Generate from business-language prompts.
- Correct source/sink direction, including `from S3` versus `to S3`.
- User-supplied connector config is preserved.
- Refine can insert a node and update existing config without replacing unrelated nodes.
- Generated JSON is usable by the app and rendered as Mermaid.

Backend AI returns both:

- `definition`: validated pipeline JSON.
- `mermaid`: generated from the validated JSON by walking nodes and edges.

Frontend Mermaid rendering validates with `mermaid.parse()` before render and disables Apply while invalid.

## Analytics, lineage, and alerts

`p1-analytics.spec.ts` covers deployed analytics views and run metrics.

Lineage/medallion coverage lives in `p2-lineage-medallion.spec.ts`: real bronze→silver→gold S3 flows, shared-asset graph edges, field-level lineage, version-change history, and invalid-layer rejection. These tests intentionally require non-empty lineage assets/edges; the current Go lineage endpoint returns pipeline nodes only, so they expose that backend gap instead of accepting an empty graph.

For SLO/webhook alert testing, set `QA_WEBHOOK_URL` to a QA webhook recorder endpoint. P3 resilience tests use it to verify alert delivery/failure behavior where alerting is enabled.
