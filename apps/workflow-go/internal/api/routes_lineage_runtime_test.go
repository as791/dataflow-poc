package api

import (
	"net/url"
	"testing"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/model"
)

func TestParseRuntimeWindowDefaultsToLastHour(t *testing.T) {
	from, to, err := parseRuntimeWindow(url.Values{})
	if err != nil {
		t.Fatal(err)
	}
	if got := to.Sub(from); got != time.Hour {
		t.Fatalf("default window = %s, want 1h", got)
	}
	if time.Since(to) > time.Minute {
		t.Fatalf("default to should be ~now, got %s", to)
	}
}

func TestParseRuntimeWindowValidation(t *testing.T) {
	now := time.Now().UTC()
	cases := []struct {
		name, from, to string
		wantErr        bool
	}{
		{"exact 7 days ok", now.Add(-7 * 24 * time.Hour).Format(time.RFC3339), now.Format(time.RFC3339), false},
		{"over 7 days rejected", now.Add(-7*24*time.Hour - 2*time.Minute).Format(time.RFC3339), now.Format(time.RFC3339), true},
		{"bounded but older window rejected", now.Add(-9 * 24 * time.Hour).Format(time.RFC3339), now.Add(-8 * 24 * time.Hour).Format(time.RFC3339), true},
		{"from after to rejected", now.Format(time.RFC3339), now.Add(-time.Hour).Format(time.RFC3339), true},
		{"bad from rejected", "yesterday", now.Format(time.RFC3339), true},
		{"bad to rejected", "", "later", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			q := url.Values{}
			if tc.from != "" {
				q.Set("from", tc.from)
			}
			if tc.to != "" {
				q.Set("to", tc.to)
			}
			_, _, err := parseRuntimeWindow(q)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err=%v wantErr=%v", err, tc.wantErr)
			}
			if tc.wantErr {
				httpErr, ok := err.(*HTTPError)
				if !ok || httpErr.Status != 400 {
					t.Fatalf("want HTTP 400, got %v", err)
				}
			}
		})
	}
}

func TestBuildRuntimeOverviewAttachesMetrics(t *testing.T) {
	definition := model.PipelineDefinition{
		ID: "orders", Name: "Orders", Trigger: model.Trigger{Type: "manual"},
		Nodes: []model.Node{
			{ID: "src", Type: "source", ActivityType: "s3.fetch", Config: map[string]interface{}{"bucket": "raw", "key": "orders.json", "layer": "bronze"}},
			{ID: "out", Type: "sink", ActivityType: "sink.s3", Config: map[string]interface{}{"bucket": "curated", "key": "orders.json", "layer": "silver"}},
		},
		Edges: []model.Edge{{ID: "e1", Source: "src", Target: "out"}},
	}
	topology := []map[string]interface{}{{
		"id": "row-1", "pipeline_key": "orders", "name": "Orders", "version": 2,
		"status": "active", "environment": "prod", "definition": definition,
	}}
	pipelineMetrics := []map[string]interface{}{{
		"pipeline_key": "orders", "environment": "prod",
		"runs": 10, "succeeded": 8, "failed": 1, "running": 1, "cancelled": 0,
		"p50_ms": int64(1200), "p95_ms": int64(4000), "last_run_at": time.Now().UTC(),
	}}
	nodeMetrics := []map[string]interface{}{
		{"pipeline_key": "orders", "environment": "prod", "node_id": "out", "runs": 9, "failed": 0, "records": int64(5000), "last_at": time.Now().UTC()},
		{"pipeline_key": "orders", "environment": "prod", "node_id": "src", "runs": 10, "failed": 1, "records": int64(5200), "last_at": time.Now().UTC()},
	}
	now := time.Now().UTC()
	overview := buildRuntimeOverview(runtimeFilters{from: now.Add(-time.Hour), to: now}, topology, pipelineMetrics, nodeMetrics)

	nodes := overview["nodes"].([]map[string]interface{})
	var pipelineNode, sinkAsset map[string]interface{}
	for _, node := range nodes {
		if node["kind"] == "pipeline" {
			pipelineNode = node
		}
		if node["kind"] == "asset" && node["id"] == "asset:s3://curated/orders.json" {
			sinkAsset = node
		}
	}
	if pipelineNode == nil || sinkAsset == nil {
		t.Fatalf("missing pipeline or sink asset node: %v", nodes)
	}
	metrics := pipelineNode["metrics"].(map[string]interface{})
	if metrics["runs"] != 10 || metrics["successRate"] != 80.0 || metrics["errorRate"] != 10.0 {
		t.Fatalf("unexpected pipeline metrics: %v", metrics)
	}
	if metrics["records"] != int64(5000) {
		t.Fatalf("pipeline records should come from sink edges only, got %v", metrics["records"])
	}
	assetMetric := sinkAsset["metrics"].(map[string]interface{})
	if assetMetric["records"] != int64(5000) {
		t.Fatalf("sink asset records = %v, want 5000", assetMetric["records"])
	}
	stats := overview["stats"].(map[string]interface{})
	if stats["runs"] != 10 || stats["failed"] != 1 || stats["activePipelines"] != 1 {
		t.Fatalf("unexpected stats: %v", stats)
	}
	edges := overview["edges"].([]map[string]interface{})
	for _, edge := range edges {
		if edge["metrics"] == nil {
			t.Fatalf("edge %v missing metrics", edge["id"])
		}
	}
}

func TestBuildRuntimeOverviewZeroRuns(t *testing.T) {
	definition := model.PipelineDefinition{
		ID: "idle", Name: "Idle", Trigger: model.Trigger{Type: "manual"},
		Nodes: []model.Node{{ID: "src", Type: "source", ActivityType: "s3.fetch", Config: map[string]interface{}{"bucket": "raw", "key": "idle.json", "layer": "bronze"}}},
	}
	topology := []map[string]interface{}{{
		"id": "row-9", "pipeline_key": "idle", "name": "Idle", "version": 1,
		"status": "active", "environment": "test", "definition": definition,
	}}
	now := time.Now().UTC()
	overview := buildRuntimeOverview(runtimeFilters{from: now.Add(-time.Hour), to: now}, topology, nil, nil)
	for _, node := range overview["nodes"].([]map[string]interface{}) {
		if node["kind"] == "pipeline" {
			metrics := node["metrics"].(map[string]interface{})
			if metrics["runs"] != 0 {
				t.Fatalf("idle pipeline should report zero runs, got %v", metrics)
			}
		}
	}
	stats := overview["stats"].(map[string]interface{})
	if stats["activePipelines"] != 0 || stats["runs"] != 0 {
		t.Fatalf("unexpected stats for idle topology: %v", stats)
	}
}
