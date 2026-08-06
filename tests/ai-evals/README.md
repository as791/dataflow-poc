# AI pipeline evaluations

This is the versioned M0 baseline suite for `POST /api/ai/generate` and
`POST /api/ai/refine`. It uses only the Python standard library and keeps all
fixtures synthetic.

## One-command offline check

```bash
python3 tests/ai-evals/run.py --self-test --strict
```

This validates the corpus and exercises every scorer without credentials,
Ollama, or a running API.

## Run against a deployment

```bash
AI_EVAL_BASE_URL=http://localhost:4000 \
AI_EVAL_TOKEN='<bearer token if required>' \
AI_EVAL_MODEL=llama3.1:8b \
AI_EVAL_PROMPT_VERSION=m0-baseline \
python3 tests/ai-evals/run.py --output /tmp/dataflow-ai-eval.json
```

The token is read from the environment and is never written to the report.
`AI_EVAL_TOKEN` may be omitted for an unauthenticated local API. The default
request timeout is 300 seconds; override it with `AI_EVAL_TIMEOUT_SECONDS`.
Use `--token-file /path/to/auth.json` when the token should not appear in the
process command line; the file may contain either the token or an
`accessToken` JSON field.
Use `--limit N` for a smoke run and `--strict` in CI to fail when any case
misses an expectation. Without `--strict`, model misses are recorded but do
not fail the command; corpus, transport, and JSON errors are still visible in
the report.

Before a live bake-off, seed the evaluation tenant with every connector in
the suite's versioned `fixtures.connectors` manifest. The provider and display
name must match exactly so the planner can resolve each case's
`connectorFixtures` references to tenant-owned `connectionId` values. The
manifest intentionally contains no credentials; supply those through the
deployment's normal connector setup and never add them to this repository.

## Metrics

Each case records:

- response-schema validity;
- DAG structure and case-specific branch/merge constraints;
- required and forbidden activity types;
- connector resource/config grounding;
- rejection of activity types and config keys outside the suite's versioned catalog;
- unchanged-node and edge preservation during refinement;
- clarification or rejection behavior;
- observed request latency;
- repair count when the API exposes `repairCount`, `repairs`,
  `metrics.repairCount`, or `meta.repairCount`.

The JSON summary reports rates over applicable cases only. Results also carry
suite, prompt, schema, and model versions so separate runs remain comparable.

## Add cases

Append objects to [`cases/v1.json`](cases/v1.json); the runner discovers them
without code changes. Each case needs a unique `id`, a `category`, one of the
two supported endpoints, a request with `prompt`, and an `expect` object.
Existing cases demonstrate all supported expectations: `status`,
`activities`, `configs`, `nodes`, `trigger`, `execution`, `graph`, and `preserve`.
Update the file's versioned `catalog` when a supported activity or config key
is intentionally added; unlisted model output is scored as hallucinated.
Create `v2.json` rather than changing established expectations incompatibly.
