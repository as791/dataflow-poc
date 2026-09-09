# Ollama model assessment and evaluation record

Status: investigation; no production model promotion or default change.
Research date: 2026-09-09 UTC (continuing into 2026-09-10 IST).
Application baseline: `857f36f51d9d58c05b32a4d2941448b1eeebbcbd`.

## Latest recorded Dataflow accuracy

The latest relevant Notion page found was **DataFlow AI Pipeline Builder —
M0–M4 & Ollama Bake-off**, last edited 2026-08-12. Its retained full-suite
measurements are dated August 7, against main `f4a4d824...` on an NVIDIA L4.
A separate search for few-shot results returned that same page, not a newer
completed experiment. This is the latest evidence located, not proof that no
unconnected or differently named report exists.

| Historical model | Passed, two 31-case runs | Warm p95 | Interpretation |
| --- | --- | --- | --- |
| gpt-oss:20b, thinking on | 10 / 10 | 47.41s | Safety-first reference; only 1/8 generation cases, 16 HTTP failures after repair. |
| qwen3:8b, thinking off | 6 / 6 | 23.90s | Faster generation baseline; poor overall task coverage. |
| llama3.1:8b, thinking off | 8 / 9 | 19.04s | Mostly clarification/rejection; no passing generation cases. |

All three failed every refinement and engine/trigger case. None met promotion
gates. Conditional 100% structure/grounding on scoreable responses must not be
presented as 100% end-to-end accuracy. Raw historical reports referenced by the
runbook live under `docs/evals/gcp-main-f4a4d824/` in the prior experiment checkout;
they are not assumed present on this clean main branch.

The current branch and original experiment checkout differ. New measurements
must compare candidates on the same current build; historical cloud latency
is not directly comparable to local laptop latency. Few-shot prompting and
fine-tuning are separate experiments and are not silently enabled here.

## Current official candidates

Registry information is a reason to test, not proof of Dataflow accuracy.
Artifact sizes exclude runtime, KV cache, the application and operating system.

| Model | Published artifact | Fit and next action |
| --- | --- | --- |
| granite4.2:8b | 5.3 GB | Newly listed text model with tools/structured JSON support; primary new local challenger at roughly the existing 8B footprint. |
| qwen3.5:9b | 6.6 GB | Practical second local challenger; compare with qwen3 using the same context and thinking controls. |
| gemma4:12b | 7.6 GB | Conditional local candidate; validate runtime/template support and memory pressure before a sustained run. |
| qwen3.6:27b / 35b | 18 / 23 GB | Exceeds practical headroom on this 18 GiB host. Separate larger-memory machine required for representative testing. |
| qwen3:8b | Installed, digest prefix 500a1f067a9f | Current local comparison baseline, not a promoted production model. |

As of this check the official Qwen3.6 library lists 27B/35B, not a 9B tag;
choose verified registry tags rather than a guessed newer version. Gemma E2B/E4B
names describe effective parameters; their default artifacts are 7.2/9.6 GB,
so they are not automatically smaller downloads than the 12B quantized tag.
Do not extrapolate the largest family model's published benchmark to a small variant.

Sources: [Granite registry](https://ollama.com/library/granite4.2),
[IBM model card](https://huggingface.co/ibm-granite/granite-4.2-8b),
[Qwen3.5 registry](https://ollama.com/library/qwen3.5),
[Gemma4 registry](https://ollama.com/library/gemma4),
[Qwen3.6 registry](https://ollama.com/library/qwen3.6).

## Local protocol

Host inventory: 18 GiB unified/system memory, approximately 64 GiB available disk,
Ollama 0.30.10. Existing developer services remain running; memory pressure and
concurrent workloads therefore limit production latency conclusions. Native
Ollama, one request/model at a time; no new cloud instances or paid inference.

Use unchanged main generate/refine handlers through a temporary loopback test
harness, with disposable fixture-only PostgreSQL and the coded catalog. This
avoids the tracked automatic Compose model override and unrelated background
services. The unchanged Python evaluator supplies/scorers the 31 v1 requests.
The harness injects a synthetic authenticated tenant: it does not test login,
RLS policy installation, full API startup, real connector execution, Temporal
workers, agent tool calling or approvals. Those remain separate sandbox gates.

Record source/binary/corpus/prompt/schema hashes, model digest, Ollama version,
actual serving model, context4096, seed42, temperature0, thinking mode, repair
limit, request timeout and serial execution. Capture original failed responses,
not only final scores. A runtime compatibility failure is not an accuracy score.

The first comparison is a measured checkpoint. Model promotion requires two
full runs per candidate, the expanded promotion suite, intended-hardware latency,
and separate agent tool-use tests. Model switch and planner-contract changes
must be reviewed separately so attribution remains clear.

## Promotion gates

Schema >=99%, structure >=95%, activities/direction >=95%, grounding >=90%,
refinement preservation >=90%, correct clarification/rejection >=95%, at most
one repair per case, no invented secrets/connector IDs, no OOM or sustained swap.
Warm p95 <30 seconds is evaluated on intended deployment hardware. Always report
all-case pass count, HTTP failures and category coverage beside applicable rates.

## Current experiment status

The official Granite4.2 8B pull is underway. Results will be added after the
model is available and the controlled API comparison completes. Download progress
and setup checks are not inference results; no new model is selected yet.
