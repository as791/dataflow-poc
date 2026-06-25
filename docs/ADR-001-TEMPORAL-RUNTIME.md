# ADR-001: Cassandra Persistence, Elasticsearch Visibility, and Go Workflows

**Status:** Accepted
**Date:** 2026-06-25

## Context

DataFlow currently runs Temporal with PostgreSQL persistence and implements both
workflow orchestration and activities in TypeScript. The target platform requires:

- Cassandra as Temporal's durable workflow-history store.
- Elasticsearch as Temporal's advanced visibility store and Temporal UI index.
- Go for deterministic Temporal workflow orchestration.
- Existing TypeScript connector and data-plane code to remain reusable.

The TypeScript activities contain the product-specific integrations with
Postgres, ClickHouse, OAuth providers, and connector manifests. Rewriting those
activities together with the workflows would increase migration risk without
improving workflow determinism.

## Decision

1. Temporal Server will use Cassandra for default persistence.
2. Temporal Server will use Elasticsearch for advanced visibility.
3. Go workers will register workflow implementations and poll:
   - `dynamic-dag-test`
   - `dynamic-dag-prod`
4. TypeScript workers will register activities only and poll:
   - `dynamic-activities-test`
   - `dynamic-activities-prod`
5. Go workflows will invoke TypeScript activities by stable string activity
   names. Activity request and response payloads remain JSON contracts.
6. The API remains TypeScript and starts workflows through the Temporal client.
7. The existing AES-256-GCM Temporal payload codec wire format will be
   implemented in Go so encrypted histories remain cross-SDK compatible.

## Options Considered

### Rewrite workflows and activities in Go

This gives a single worker language but requires rewriting every connector,
OAuth integration, ClickHouse writer, and Postgres activity. The migration
surface is too large and creates unnecessary product risk.

### Keep all Temporal code in TypeScript

This is the lowest-effort option but does not satisfy the Go workflow
requirement.

### Go workflows with TypeScript activities

Temporal supports language-independent activity invocation through serialized
payload contracts. Dedicated workflow and activity queues prevent Go and
TypeScript workers from receiving task types they do not register.

This option preserves the existing data plane while moving the deterministic
orchestration layer to Go.

## Consequences

- Workflow contracts become explicit cross-language APIs and require contract
  tests.
- Workflow and activity deployment versions can be released independently.
- Operators must run Cassandra and Elasticsearch in addition to application
  Postgres.
- Temporal UI search depends on Elasticsearch health, while workflow execution
  depends on Cassandra health.
- Changes to activity names or JSON shapes require backward-compatible rollout.

## Implementation Order

1. Correct execution accounting, scheduled runs, and DEK propagation.
2. Remove arbitrary JavaScript evaluation from worker activities.
3. Add contract and workflow tests.
4. Introduce Cassandra and Elasticsearch persistence.
5. Add Go workflow workers.
6. Convert TypeScript workers to activities-only workers.
7. Remove the TypeScript workflow implementation after compatibility tests pass.
