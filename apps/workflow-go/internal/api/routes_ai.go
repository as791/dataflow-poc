package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

var codedCatalog = []model.CatalogEntry{
	{ActivityType: "zendesk.fetch", NodeType: "source", Label: "Zendesk"}, {ActivityType: "gsheets.fetch", NodeType: "source", Label: "Google Sheets"}, {ActivityType: "gdrive.fetch", NodeType: "source", Label: "Google Drive"}, {ActivityType: "excel.fetch", NodeType: "source", Label: "Microsoft Excel"}, {ActivityType: "http.fetch", NodeType: "source", Label: "Custom API"}, {ActivityType: "postgres.fetch", NodeType: "source", Label: "PostgreSQL"}, {ActivityType: "mysql.fetch", NodeType: "source", Label: "MySQL"}, {ActivityType: "mongodb.fetch", NodeType: "source", Label: "MongoDB"}, {ActivityType: "s3.fetch", NodeType: "source", Label: "Amazon S3"}, {ActivityType: "kafka.fetch", NodeType: "source", Label: "Kafka"}, {ActivityType: "sftp.fetch", NodeType: "source", Label: "SFTP"}, {ActivityType: "snowflake.fetch", NodeType: "source", Label: "Snowflake"}, {ActivityType: "iceberg.fetch", NodeType: "source", Label: "Apache Iceberg"},
	{ActivityType: "transform.map", NodeType: "transform", Label: "Map"}, {ActivityType: "transform.filter", NodeType: "transform", Label: "Filter"}, {ActivityType: "transform.formula", NodeType: "transform", Label: "Formula"}, {ActivityType: "transform.select", NodeType: "transform", Label: "JMESPath select"}, {ActivityType: "transform.rename", NodeType: "transform", Label: "Rename"}, {ActivityType: "transform.dedupe", NodeType: "transform", Label: "Dedupe"}, {ActivityType: "transform.flatten", NodeType: "transform", Label: "Flatten"}, {ActivityType: "transform.parse", NodeType: "transform", Label: "Parse JSON"}, {ActivityType: "transform.contract", NodeType: "transform", Label: "Data contract"},
	{ActivityType: "flow.fork", NodeType: "fork", Label: "Fork"}, {ActivityType: "flow.merge", NodeType: "merge", Label: "Merge"}, {ActivityType: "sink.postgres", NodeType: "sink", Label: "Postgres"}, {ActivityType: "sink.clickhouse", NodeType: "sink", Label: "ClickHouse"}, {ActivityType: "sink.mysql", NodeType: "sink", Label: "MySQL"}, {ActivityType: "sink.mongodb", NodeType: "sink", Label: "MongoDB"}, {ActivityType: "sink.s3", NodeType: "sink", Label: "Amazon S3"}, {ActivityType: "sink.kafka", NodeType: "sink", Label: "Kafka"}, {ActivityType: "sink.sftp", NodeType: "sink", Label: "SFTP"}, {ActivityType: "sink.snowflake", NodeType: "sink", Label: "Snowflake"}, {ActivityType: "sink.gsheets", NodeType: "sink", Label: "Google Sheets"}, {ActivityType: "sink.webhook", NodeType: "sink", Label: "Webhook"}, {ActivityType: "sink.records", NodeType: "sink", Label: "DataFlow store"},
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
	lines := []string{"You design data pipelines as a directed acyclic graph (DAG).", "Use only these activity types:"}
	byType := map[string]model.CatalogEntry{}
	for _, entry := range catalog {
		lines = append(lines, fmt.Sprintf("- %s (%s) %s", entry.ActivityType, entry.NodeType, entry.Label))
		byType[entry.ActivityType] = entry
	}
	lines = append(lines, `Respond with ONLY JSON: {"suggestedName":string,"trigger":object,"nodes":[{"id":string,"label":string,"activityType":string,"config":object}],"edges":[{"source":string,"target":string,"condition"?:string}]}`)
	var output struct {
		SuggestedName string        `json:"suggestedName"`
		Trigger       model.Trigger `json:"trigger"`
		Nodes         []struct {
			ID, Label, ActivityType string
			Config                  map[string]interface{}
		}
		Edges []struct{ Source, Target, Condition string }
	}
	if err := s.ollamaJSON(r, strings.Join(lines, "\n"), prompt, &output); err != nil {
		return nil, err
	}
	def := model.PipelineDefinition{Name: output.SuggestedName, Trigger: output.Trigger}
	for _, node := range output.Nodes {
		entry, ok := byType[node.ActivityType]
		if !ok {
			return nil, fmt.Errorf("unknown activityType %s", node.ActivityType)
		}
		def.Nodes = append(def.Nodes, model.Node{ID: node.ID, Label: node.Label, Type: entry.NodeType, ActivityType: node.ActivityType, Config: node.Config})
	}
	for i, edge := range output.Edges {
		def.Edges = append(def.Edges, model.Edge{ID: fmt.Sprintf("e%d", i+1), Source: edge.Source, Target: edge.Target, Condition: edge.Condition})
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
	return map[string]interface{}{"mermaid": strings.Join(mermaid, "\n"), "definition": map[string]interface{}{"nodes": def.Nodes, "edges": def.Edges, "trigger": def.Trigger, "suggestedName": def.Name}}, nil
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
	if err := s.doJSON(request, &response); err != nil {
		return fmt.Errorf("AI builder is unavailable")
	}
	return json.Unmarshal([]byte(response.Message.Content), target)
}
