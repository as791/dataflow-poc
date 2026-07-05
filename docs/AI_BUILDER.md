# AI Builder

Describe a pipeline in plain English and get an editable diagram + a live canvas,
drafted by a **local** LLM (Ollama — no API key, your data stays on your box).

## Local deployment

The Helm release includes Ollama and does not report ready until the configured
model is installed:

```bash
./scripts/bootstrap.sh
```

The local default is `llama3.2:3b`, stored on an 8 GiB persistent volume. Override
`ollamaModel` with a Helm value when a smaller or larger model is required.

## How it works

```
NL prompt ──▶ POST /api/ai/generate ──▶ Ollama (format: json)
                     │  catalog-aware system prompt (every installed connector)
                     │  validate as a DAG  ·  one repair retry
                     ▼
        { mermaid, definition }  ──▶  Mermaid editor ⇄ ReactFlow canvas
```

1. The API builds a system prompt that embeds the **live connector catalog**
   (so the model only uses connectors you actually have, including manifest
   connectors) and asks for strict JSON.
2. The output is validated as a well-formed DAG (`validatePipeline`); on failure
   the model gets one repair round-trip, then a `422`.
3. `nodes`/`edges` are authoritative — the Mermaid is regenerated from them, so
   the diagram and the definition never disagree.

## Mermaid round-trip

Mermaid is a first-class editing surface. `definitionToMermaid` /
`mermaidToDefinition` (in `@dataflow/shared`) keep the diagram and the canvas in
sync both ways. Mermaid carries **structure only** — node ids, labels,
`activityType`, edges, and edge conditions. Node *config* (field values) is not
expressible in Mermaid and is preserved by node id across edits; finish
configuring fields in the canvas.

## Tips

- Small local models can produce malformed output. The `format: json` + schema +
  server-side validation + repair retry + human-in-the-loop editor handle most of
  it; if a draft is off, edit the Mermaid or refine the prompt.
- Set `OLLAMA_MODEL` to trade quality for RAM/speed.
- Generation is free (not metered).
