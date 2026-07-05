package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

var codedCatalog = []model.CatalogEntry{
	{ActivityType: "zendesk.fetch", NodeType: "source", Label: "Zendesk"}, {ActivityType: "gsheets.fetch", NodeType: "source", Label: "Google Sheets"}, {ActivityType: "gdrive.fetch", NodeType: "source", Label: "Google Drive"}, {ActivityType: "excel.fetch", NodeType: "source", Label: "Microsoft Excel"}, {ActivityType: "http.fetch", NodeType: "source", Label: "Custom API"}, {ActivityType: "postgres.fetch", NodeType: "source", Label: "PostgreSQL"}, {ActivityType: "mysql.fetch", NodeType: "source", Label: "MySQL"}, {ActivityType: "mongodb.fetch", NodeType: "source", Label: "MongoDB"}, {ActivityType: "s3.fetch", NodeType: "source", Label: "Amazon S3"}, {ActivityType: "kafka.fetch", NodeType: "source", Label: "Kafka"}, {ActivityType: "sftp.fetch", NodeType: "source", Label: "SFTP"}, {ActivityType: "snowflake.fetch", NodeType: "source", Label: "Snowflake"}, {ActivityType: "iceberg.fetch", NodeType: "source", Label: "Apache Iceberg"},
	{ActivityType: "transform.map", NodeType: "transform", Label: "Map"}, {ActivityType: "transform.filter", NodeType: "transform", Label: "Filter"}, {ActivityType: "transform.formula", NodeType: "transform", Label: "Formula"}, {ActivityType: "transform.select", NodeType: "transform", Label: "JMESPath select"}, {ActivityType: "transform.rename", NodeType: "transform", Label: "Rename"}, {ActivityType: "transform.dedupe", NodeType: "transform", Label: "Dedupe"}, {ActivityType: "transform.flatten", NodeType: "transform", Label: "Flatten"}, {ActivityType: "transform.parse", NodeType: "transform", Label: "Parse JSON"}, {ActivityType: "transform.contract", NodeType: "transform", Label: "Data contract"},
	{ActivityType: "flow.fork", NodeType: "fork", Label: "Fork"}, {ActivityType: "flow.merge", NodeType: "merge", Label: "Merge"}, {ActivityType: "sink.postgres", NodeType: "sink", Label: "Postgres"}, {ActivityType: "sink.clickhouse", NodeType: "sink", Label: "ClickHouse"}, {ActivityType: "sink.mysql", NodeType: "sink", Label: "MySQL"}, {ActivityType: "sink.mongodb", NodeType: "sink", Label: "MongoDB"}, {ActivityType: "sink.s3", NodeType: "sink", Label: "Amazon S3"}, {ActivityType: "sink.kafka", NodeType: "sink", Label: "Kafka"}, {ActivityType: "sink.sftp", NodeType: "sink", Label: "SFTP"}, {ActivityType: "sink.snowflake", NodeType: "sink", Label: "Snowflake"}, {ActivityType: "sink.iceberg", NodeType: "sink", Label: "Apache Iceberg"}, {ActivityType: "sink.gsheets", NodeType: "sink", Label: "Google Sheets"}, {ActivityType: "sink.webhook", NodeType: "sink", Label: "Webhook"}, {ActivityType: "sink.records", NodeType: "sink", Label: "DataFlow store"},
}

func (s *Server) registerAI(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/ai/generate", handle(s.aiGenerate))
	mux.HandleFunc("POST /api/ai/refine", handle(s.aiRefine))
}
func (s *Server) aiGenerate(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Prompt string `json:"prompt"`
	}
	if !decodeJSON(w, r, &body) {
		return nil
	}
	if strings.TrimSpace(body.Prompt) == "" {
		return badRequest("prompt required")
	}
	result, err := s.buildPipeline(r, body.Prompt)
	if err != nil {
		return &HTTPError{Status: http.StatusUnprocessableEntity, Message: "could not generate a valid pipeline: " + err.Error()}
	}
	jsonResponse(w, http.StatusOK, result)
	return nil
}
func (s *Server) aiRefine(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Prompt     string      `json:"prompt"`
		Definition interface{} `json:"definition"`
	}
	if !decodeJSON(w, r, &body) {
		return nil
	}
	if strings.TrimSpace(body.Prompt) == "" {
		return badRequest("prompt required")
	}
	prompt := body.Prompt
	if body.Definition != nil {
		seed, _ := json.MarshalIndent(body.Definition, "", "  ")
		prompt = "Current pipeline JSON:\n" + string(seed) + "\n\nApply this change: " + prompt
	}
	result, err := s.buildPipeline(r, prompt)
	if err != nil {
		return &HTTPError{Status: http.StatusUnprocessableEntity, Message: "could not refine pipeline: " + err.Error()}
	}
	jsonResponse(w, http.StatusOK, result)
	return nil
}
func (s *Server) buildPipeline(r *http.Request, prompt string) (map[string]interface{}, error) {
	catalog := append([]model.CatalogEntry{}, codedCatalog...)
	catalog = append(catalog, s.Connectors.Catalog()...)
	lines := []string{
		"You design data pipelines as a directed acyclic graph (DAG).",
		"Use only these activity types:",
	}
	byType := map[string]model.CatalogEntry{}
	for _, entry := range catalog {
		lines = append(lines, fmt.Sprintf("- %s (%s) %s", entry.ActivityType, entry.NodeType, entry.Label))
		byType[entry.ActivityType] = entry
	}
	lines = append(lines,
		`RULES:`,
		`- Node "id" must be a short lowercase alphanumeric string like n1, n2, n3.`,
		`- Every edge "source" and "target" MUST exactly match one of the node "id" values you defined above.`,
		`- Always include a "trigger" with at least {"type":"manual"}.`,
		`Respond with ONLY valid JSON (no markdown, no explanation):`,
		`{"suggestedName":string,"trigger":{"type":string},"nodes":[{"id":string,"label":string,"activityType":string,"config":{}}],"edges":[{"source":string,"target":string}]}`,
	)
	// rawToString converts a json.RawMessage that is either a JSON string or a
	// JSON number into a plain Go string — tolerating models that emit integer IDs.
	rawToString := func(r json.RawMessage) string {
		if len(r) == 0 {
			return ""
		}
		if r[0] == '"' {
			var s string
			if json.Unmarshal(r, &s) == nil {
				return s
			}
		}
		// numeric or other — just strip whitespace and use raw bytes as string
		return strings.TrimSpace(string(r))
	}
	var output struct {
		SuggestedName string        `json:"suggestedName"`
		Trigger       model.Trigger `json:"trigger"`
		Nodes         []struct {
			ID           json.RawMessage `json:"id"`
			Label        string          `json:"label"`
			ActivityType string          `json:"activityType"`
			Config       map[string]interface{}
		}
		Edges []json.RawMessage `json:"edges"`
	}
	if err := s.ollamaJSON(r, strings.Join(lines, "\n"), prompt, &output); err != nil {
		return nil, err
	}
	def := model.PipelineDefinition{Name: output.SuggestedName, Trigger: output.Trigger}
	// Build a case-insensitive node ID index to tolerate model casing drift.
	nodeIDSet := map[string]string{} // lower(id) → canonical id
	for _, node := range output.Nodes {
		nodeID := rawToString(node.ID)
		if nodeID == "" {
			continue
		}
		entry, ok := byType[node.ActivityType]
		if !ok {
			return nil, fmt.Errorf("unknown activityType %s", node.ActivityType)
		}
		def.Nodes = append(def.Nodes, model.Node{ID: nodeID, Label: node.Label, Type: entry.NodeType, ActivityType: node.ActivityType, Config: node.Config})
		nodeIDSet[strings.ToLower(nodeID)] = nodeID
	}
	// Sanitize edges: accept both object {source,target} and string "src->tgt" forms.
	var warnings []string
	for i, rawEdge := range output.Edges {
		var src, tgt, condition string
		// Try object form first.
		var obj struct {
			Source    json.RawMessage `json:"source"`
			Target    json.RawMessage `json:"target"`
			Condition string          `json:"condition"`
		}
		if err := json.Unmarshal(rawEdge, &obj); err == nil && len(obj.Source) > 0 {
			src = rawToString(obj.Source)
			tgt = rawToString(obj.Target)
			condition = obj.Condition
		} else {
			// Fall back: string form like "n1->n2", "n1 -> n2", "n1→n2", "n1,n2"
			var s string
			if json.Unmarshal(rawEdge, &s) != nil {
				warnings = append(warnings, fmt.Sprintf("dropped edge %d: unrecognised format", i+1))
				continue
			}
			// Normalise separators to a single split point.
			s = strings.ReplaceAll(s, "→", "->")
			s = strings.ReplaceAll(s, " ", "")
			parts := strings.SplitN(s, "->", 2)
			if len(parts) != 2 {
				parts = strings.SplitN(s, ",", 2)
			}
			if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
				warnings = append(warnings, fmt.Sprintf("dropped edge %d: cannot parse %q", i+1, s))
				continue
			}
			src, tgt = parts[0], parts[1]
		}
		// Normalise casing.
		if canonical, ok := nodeIDSet[strings.ToLower(src)]; ok {
			src = canonical
		}
		if canonical, ok := nodeIDSet[strings.ToLower(tgt)]; ok {
			tgt = canonical
		}
		// Check endpoints are known.
		srcKnown, tgtKnown := false, false
		for _, n := range def.Nodes {
			if n.ID == src { srcKnown = true }
			if n.ID == tgt { tgtKnown = true }
		}
		if !srcKnown || !tgtKnown {
			warnings = append(warnings, fmt.Sprintf("dropped edge %d: %s→%s (unknown node)", i+1, src, tgt))
			continue
		}
		def.Edges = append(def.Edges, model.Edge{ID: fmt.Sprintf("e%d", i+1), Source: src, Target: tgt, Condition: condition})
	}
	if err := validatePipeline(def); err != nil {
		return nil, err
	}
	mermaid := []string{"flowchart TD"}
	for _, node := range def.Nodes {
		mermaid = append(mermaid, fmt.Sprintf("  %s[%q]", node.ID, node.Label))
	}
	for _, edge := range def.Edges {
		mermaid = append(mermaid, fmt.Sprintf("  %s --> %s", edge.Source, edge.Target))
	}
	return map[string]interface{}{"mermaid": strings.Join(mermaid, "\n"), "definition": map[string]interface{}{"nodes": def.Nodes, "edges": def.Edges, "trigger": def.Trigger, "suggestedName": def.Name}, "warnings": warnings}, nil
}
func (s *Server) ollamaJSON(r *http.Request, system, user string, target interface{}) error {
	payload, _ := json.Marshal(map[string]interface{}{"model": env("OLLAMA_MODEL", "llama3.1:8b"), "stream": false, "format": "json", "messages": []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": user}}})
	request, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, strings.TrimSuffix(env("OLLAMA_URL", "http://ollama:11434"), "/")+"/api/chat", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	var response struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	client := *s.HTTP
	client.Timeout = 2 * time.Minute
	if err := doJSON(&client, request, &response); err != nil {
		return fmt.Errorf("AI builder is unavailable")
	}
	return json.Unmarshal([]byte(response.Message.Content), target)
}
