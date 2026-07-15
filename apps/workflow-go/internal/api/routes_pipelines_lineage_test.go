package api

import (
	"encoding/json"
	"testing"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

func TestBuildWorkspaceLineageMatchesSharedContract(t *testing.T) {
	freshness, failureRate, duration := 15.0, 2.5, 30000.0
	definition := model.PipelineDefinition{
		ID: "orders", Name: "Orders", Trigger: model.Trigger{Type: "manual"},
		Metadata: &model.PipelineMetadata{Owner: "data-platform", Domain: "sales", Tags: []string{"orders"}},
		SLO:      &model.PipelineSLO{FreshnessMinutes: &freshness, MaxFailureRatePercent: &failureRate, MaxDurationMS: &duration},
		Nodes: []model.Node{
			{ID: "source", Type: "source", ActivityType: "s3.fetch", Config: map[string]interface{}{"bucket": "raw", "key": "orders/input.json", "layer": "bronze"}},
			{ID: "contract", Type: "transform", ActivityType: "transform.contract", Config: map[string]interface{}{"schemaJson": map[string]interface{}{"id": "number", "amount": "number?"}}},
			{ID: "map", Type: "transform", ActivityType: "transform.map", Config: map[string]interface{}{"expression": "{ order_id: r.id, total: r.amount }"}},
			{ID: "sink", Type: "sink", ActivityType: "sink.s3", Config: map[string]interface{}{"bucket": "curated", "key": "orders/silver.json", "layer": "silver"}},
		},
		Edges: []model.Edge{
			{ID: "e1", Source: "source", Target: "contract"},
			{ID: "e2", Source: "contract", Target: "map"},
			{ID: "e3", Source: "map", Target: "sink"},
		},
	}
	rows := []map[string]interface{}{{
		"id": "row-1", "pipeline_key": "orders", "name": "Orders", "version": 3,
		"status": "active", "environment": "test", "definition": definition,
	}}

	raw, err := json.Marshal(buildWorkspaceLineage(rows))
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}

	nodes := payload["nodes"].([]interface{})
	assets := 0
	expectedAssets := map[string]map[string]string{
		"s3://raw/orders/input.json":      {"namespace": "raw", "name": "orders/input.json", "layer": "bronze"},
		"s3://curated/orders/silver.json": {"namespace": "curated", "name": "orders/silver.json", "layer": "silver"},
	}
	for _, item := range nodes {
		node := item.(map[string]interface{})
		switch node["kind"] {
		case "asset":
			assets++
			asset := node["asset"].(map[string]interface{})
			for _, field := range []string{"urn", "platform", "namespace", "name", "type", "layer"} {
				if value, ok := asset[field].(string); !ok || value == "" {
					t.Fatalf("asset %v has empty %s", asset, field)
				}
			}
			if asset["platform"] != "s3" || asset["type"] != "file" {
				t.Fatalf("unexpected S3 asset contract: %v", asset)
			}
			expected, ok := expectedAssets[asset["urn"].(string)]
			if !ok || asset["namespace"] != expected["namespace"] || asset["name"] != expected["name"] || asset["layer"] != expected["layer"] {
				t.Fatalf("unexpected S3 asset identity: %v", asset)
			}
			if asset["urn"] == "s3://curated/orders/silver.json" {
				schema, ok := asset["schema"].(map[string]interface{})
				if !ok {
					t.Fatalf("sink asset schema missing: %v", asset)
				}
				fieldTypes := map[string]string{}
				for _, rawField := range schema["fields"].([]interface{}) {
					field := rawField.(map[string]interface{})
					name, nameOK := field["name"].(string)
					fieldType, typeOK := field["type"].(string)
					if !nameOK || name == "" || !typeOK || fieldType == "" {
						t.Fatalf("asset schema field is incomplete: %v", field)
					}
					fieldTypes[name] = fieldType
					if name == "total" && field["nullable"] != true {
						t.Fatalf("nullable contract field was not propagated: %v", field)
					}
				}
				if fieldTypes["order_id"] != "number" || fieldTypes["total"] != "number" {
					t.Fatalf("renamed contract field types missing: %v", fieldTypes)
				}
			}
			delete(expectedAssets, asset["urn"].(string))
		case "pipeline":
			pipeline := node["pipeline"].(map[string]interface{})
			if pipeline["metadata"].(map[string]interface{})["domain"] != "sales" {
				t.Fatalf("pipeline metadata missing: %v", pipeline)
			}
			if pipeline["slo"].(map[string]interface{})["freshnessMinutes"] != 15.0 {
				t.Fatalf("pipeline SLO missing: %v", pipeline)
			}
		}
	}
	if assets != 2 || len(expectedAssets) != 0 {
		t.Fatalf("expected two S3 assets, got %d; missing %v", assets, expectedAssets)
	}

	edges := payload["edges"].([]interface{})
	seen := map[string]bool{}
	expectedEdgeNodes := map[string]string{"edge:row-1:source:source": "source", "edge:row-1:sink:sink": "sink"}
	for _, item := range edges {
		edge := item.(map[string]interface{})
		for _, field := range []string{"id", "pipelineRowId", "nodeId"} {
			if value, ok := edge[field].(string); !ok || value == "" {
				t.Fatalf("edge %v has empty %s", edge, field)
			}
		}
		id := edge["id"].(string)
		if seen[id] {
			t.Fatalf("duplicate edge id %q", id)
		}
		if edge["pipelineRowId"] != "row-1" || edge["nodeId"] != expectedEdgeNodes[id] {
			t.Fatalf("edge provenance does not match id: %v", edge)
		}
		seen[id] = true
	}
	for _, id := range []string{"edge:row-1:source:source", "edge:row-1:sink:sink"} {
		if !seen[id] {
			t.Fatalf("missing deterministic edge id %q in %v", id, seen)
		}
	}

	columnEdges := payload["columnEdges"].([]interface{})
	if len(columnEdges) != 2 {
		t.Fatalf("expected two column edges, got %d", len(columnEdges))
	}
	columnIDs := map[string]bool{}
	expectedColumns := map[string]map[string]string{
		"column:row-1:sink:id:order_id":  {"sourceField": "id", "targetField": "order_id"},
		"column:row-1:sink:amount:total": {"sourceField": "amount", "targetField": "total"},
	}
	for _, item := range columnEdges {
		edge := item.(map[string]interface{})
		for _, field := range []string{"id", "pipelineRowId", "sourceAssetUrn", "sourceField", "targetAssetUrn", "targetField"} {
			if value, ok := edge[field].(string); !ok || value == "" {
				t.Fatalf("column edge %v has empty %s", edge, field)
			}
		}
		if edge["transformNodeId"] != "map" {
			t.Fatalf("column edge transform provenance missing: %v", edge)
		}
		id := edge["id"].(string)
		expected, ok := expectedColumns[id]
		if !ok || edge["pipelineRowId"] != "row-1" || edge["sourceAssetUrn"] != "s3://raw/orders/input.json" || edge["sourceField"] != expected["sourceField"] || edge["targetAssetUrn"] != "s3://curated/orders/silver.json" || edge["targetField"] != expected["targetField"] {
			t.Fatalf("unexpected column edge contract: %v", edge)
		}
		if columnIDs[id] {
			t.Fatalf("duplicate column edge id %q", id)
		}
		columnIDs[id] = true
	}
	for _, id := range []string{"column:row-1:sink:id:order_id", "column:row-1:sink:amount:total"} {
		if !columnIDs[id] {
			t.Fatalf("missing deterministic column edge id %q in %v", id, columnIDs)
		}
	}
}
