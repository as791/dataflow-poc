# DataFlow documentation

Updated: 2026-07-10

This directory is the current documentation source. Completed execution plans,
loop state, and pre-Go audits were removed; Git history is their archive.

## Start here

| Document | Purpose |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Current runtime, module boundaries, data ownership, and scale seams |
| [Self-hosting](SETUP.md) | Docker, Kubernetes/Helm, and optional GCP/Terraform deployment |
| [Security and compliance](SECURITY_COMPLIANCE.md) | Security baseline, release controls, and certification evidence plan |
| [Roadmap](ROADMAP.md) | Pending work only, ordered from demo gate to one-million-DAG scale |
| [Pre-release audit](audit/2026-07-10-pre-release-audit.md) | Full engineering, product, UX, security, and Ponytail findings |

## Product and implementation references

| Document | Status |
| --- | --- |
| [Backend contracts](BACKEND_CONTRACTS.md) | Current public HTTP and Temporal compatibility surface |
| [Connectors](CONNECTORS.md) | Supported sources and sinks, saved connections, and API usage |
| [AI builder](AI_BUILDER.md) | Current local Ollama authoring flow |
| [Medallion architecture](MEDALLION_ARCHITECTURE.md) | Current modeling guidance |
| [ADR-002: Go backend](ADR-002-GO-BACKEND.md) | Accepted |
| [ADR-001: mixed runtime](ADR-001-TEMPORAL-RUNTIME.md) | Superseded; decision history only |

Rules for new docs:

- Put current operational truth in the documents above.
- Put only unexecuted work in `ROADMAP.md`.
- Record material decisions as ADRs; never use an implementation plan as an ADR.
- Date audit snapshots under `docs/audit/`; do not edit an old snapshot to describe a new system.
- Do not commit loop logs, credentials, generated handoff bundles, DB dumps, or deployment state.
