# User connector manifests

Drop `*.manifest.json` files here. They are bind-mounted into the API and worker
containers (`CONNECTORS_DIR=/app/connectors/manifests`) and loaded on restart —
no rebuild, no code. See [`docs/CONNECTORS.md`](../../docs/CONNECTORS.md) for the
manifest schema and a worked example.
