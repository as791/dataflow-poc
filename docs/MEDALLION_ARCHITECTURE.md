# Medallion pipelines in DataFlow

Use one pipeline per materialized data contract, not one giant workflow:

1. **Bronze** pipelines ingest source events with minimal transformation and write replayable raw tables.
2. **Silver** pipelines read bronze assets, validate/deduplicate/standardize records, and write clean domain tables.
3. **Gold** pipelines read silver assets and publish aggregates or serving models to analytics sinks.

Set `layer` on each source and sink. DataFlow derives a stable asset URN from connector instance plus table, collection, or object key. When one pipeline writes the same URN another pipeline reads, `/lineage` merges them through that shared asset automatically. Environment filters keep Integration and Production architectures separate.

Column lineage is inferred conservatively for one-input/one-output pipelines from safe `Map` projections, `Rename` mappings, and published data contracts. Click an asset in `/lineage` to inspect transitive upstream/downstream impact and field mappings. Multi-input merges intentionally remain asset-level until explicit field provenance is supplied.

Assign each pipeline an owner, domain, tags, and optional freshness/failure-rate/duration SLO from Workspace settings. These values are versioned with the pipeline and evaluated on `/monitoring`; promotion therefore preserves the exact operating contract. Add a **Data contract** transform before a materialized sink to enforce required/optional field types. Its schema is attached to the sink asset in lineage so consumers can inspect the published contract.

For external incident delivery, create an HTTP credential whose base URL is the alert receiver and select it under **Ownership & SLO**. Only its connector ID is stored in the pipeline version; bearer credentials remain encrypted in the connector vault. Notification attempts use a durable outbox with exponential retry and expose failed deliveries for manual retry in `/monitoring`.

The three `examples/medallion-*-orders.json` definitions form one connected architecture when their placeholder connector IDs resolve to the same `warehouse` and `analytics` instances. Prefer CDC for bronze ingestion and cursor micro-batches for downstream materializations until continuous stream-to-stream execution is required.

For medallion ordering, select **Asset materialized** as the downstream trigger.
Successful output materializations and their durable outbox event commit in one
transaction; the control plane starts matching consumers only in the same tenant
and environment. Because the trigger uses a stable asset URN, replacing or
splitting the producer does not require rewiring consumers. Use **Upstream
pipeline** instead when completion/failure/cancellation of a specific pipeline,
rather than availability of a data product, is the actual contract.

Operationally, `/monitoring` shows workspace reliability and `/runs/:id` remains the node-level diagnostic view. Production promotion should require a green Integration run; failed CDC runs do not commit source offsets, so an idempotent `apply-cdc` sink can replay safely.

`/lineage` overlays that same live SLO health on pipeline nodes and edges. Filter
to critical or warning pipelines, then click any asset to see transitive blast
radius and the number of downstream critical pipelines.

Large workspace graphs can be narrowed by environment, SLO health, data domain,
and medallion layer. Search retains one-hop context around matching pipelines or
assets. After selecting a node, switch to one- or two-hop focus to isolate its
local architecture while transitive impact counts remain available in the
side panel. These views filter the same merged graph; they do not create a
second lineage model.

Kafka topics participate like materialized assets. Give producer and consumer
nodes the same lineage cluster name and topic; independent pipelines then merge
through `kafka://cluster/topic`, including cross-domain boundaries.

Every successful output asset also records a materialization event with its
producing pipeline, execution, node, timestamp, and row count. Asset cards show
the latest event and link back to the producing run; failed or skipped sinks do
not publish materializations.

Production promotion compares published output contracts against the active
production version. Removed assets/contracts/fields, type changes, and making a
required field nullable are blocked. Additive fields pass. Owners can explicitly
override a breaking change; the issue list and override are written to audit log.

Contract transforms support `fail`, `drop`, and `quarantine`. Quarantine keeps
valid rows flowing and writes rejected rows plus their reasons to an encrypted
DataRef. Only counts and redacted error messages enter `data_quality_results`.
Monitoring shows quality trends and recent violations; lineage assets show their
latest quality state and link to the producing run.

OpenLineage extends the workspace graph beyond DataFlow. Runtime START and
terminal events use standard Job/Run/Dataset entities and a durable HTTP outbox.
Authenticated imported RunEvents create external-job nodes; datasets merge with
native assets when their OpenLineage name is the same stable asset URN. Importers
use a revocable tenant key stored only as SHA-256; a security-definer lookup maps
the key to its tenant without exposing cross-tenant key records.

The lineage Changes panel derives architecture history directly from immutable
pipeline versions. It highlights asset, medallion layer, contract field, trigger,
owner, and domain changes, and classifies compatibility risk without a second
snapshot store.
