# DataFlow Enterprise (`ee/`)

Everything in this directory is source-available under the
[Elastic License 2.0](LICENSE), **not** Apache-2.0. It implements the
commercial features: Flink SQL and Spark SQL execution, and realtime
stream-direct workflows.

- Enterprise builds link this code with `go build -tags ee ./...` (the default
  for released container images).
- Community builds (`go build ./...`) exclude it entirely and remain pure
  Apache-2.0; the API rejects pipelines that would need these features.

Everything outside `ee/` stays Apache-2.0.
