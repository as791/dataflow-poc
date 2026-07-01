# ADR-002: Go Owns the Backend

**Status:** Accepted
**Date:** 2026-07-01
**Supersedes:** ADR-001's TypeScript API and activity-worker decisions

## Context

The POC had three backend implementation units: an Express API, a TypeScript
Temporal activity worker, and a Go Temporal workflow worker. Shared contracts
crossed package and SDK boundaries, and deploying the backend required both
Node.js and Go runtimes. There is no production traffic or production data, so
a coexistence rollout would add machinery without reducing user risk.

## Decision

`apps/workflow-go` is the backend's single Go module and produces three
binaries: `api`, `activity-worker`, and `workflow-worker`. Go owns HTTP routes,
authentication, tenant-scoped PostgreSQL access, Temporal clients and
activities, connector execution, encrypted `DataRef` storage, and outbox
dispatch. React/Vite and frontend-focused shared TypeScript remain unchanged.

The migration preserves REST contracts, PostgreSQL and ClickHouse schemas,
environment variables, Temporal namespaces, task queues, activity/workflow
names, JSON payloads, connector manifests, and AES-256-GCM wire formats. The
cutover is direct: there is no proxy, dual queue, feature flag, API version, or
schema migration.

The implementation uses the Go standard library for HTTP, JSON, logging, and
cryptography; pgx and the Temporal SDK for core protocols; maintained clients
for Kafka, S3, MongoDB, Snowflake, and Apache Iceberg; and direct HTTP for the
small OAuth, Graph, Sheets, Zendesk, Ollama, Razorpay, and OpenLineage surfaces.

## Consequences

- Backend models and compatibility fixtures are now Go-owned.
- The backend container contains no Node.js runtime.
- One Go dependency graph is larger because Snowflake and Iceberg support
  complex storage and columnar formats.
- Changes to public HTTP, activity, manifest, or encryption contracts require
  fixture updates and compatibility review.
- Compose continues using separate worker processes and environment-specific
  Temporal queues, but all are built from one Dockerfile.
