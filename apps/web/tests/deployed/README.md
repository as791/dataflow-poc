# Deployed integration suite

Runs real pipelines against the deployed application, Google Sheets, public HTTP APIs, and AWS S3.

One-time fixtures:

- Source: https://docs.google.com/spreadsheets/d/101aHt7DhfCQ88K5icKB88DBwKujRAbWvvqq1LsLwHkk
- Destination: https://docs.google.com/spreadsheets/d/1wfJYweg3RP10IjOmrjjEkTarUp0Es3v7gAsGh58PdVQ
- S3: `s3://dataflow-integration-qa-726929246977/fixtures/`

Required environment:

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
npm -w apps/web run test:deployed
```

Before running, connect Google, S3, PostgreSQL, MySQL, MongoDB, ClickHouse and Kafka in the QA workspace. Add a second S3 connection named `qa-aws-s3-denied` whose IAM policy denies the fixture bucket. The suite discovers connections by provider and never stores secrets.

Google Drive fixture: https://drive.google.com/file/d/1gwQsrvnaGMY44g1WcitarJJ-Ri2xkPYP/view
