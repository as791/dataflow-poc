package connectors

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dataflow-poc/workflow-go/internal/config"
)

func TestHTTPFetch(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("User-Agent"); got != "DataFlow/1.0" {
			t.Fatalf("expected DataFlow User-Agent, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		// Mock response mimicking JSONPlaceholder
		json.NewEncoder(w).Encode([]map[string]interface{}{
			{"id": 1, "title": "hello"},
			{"id": 2, "title": "world"},
		})
	}))
	defer ts.Close()

	rt := &Runtime{HTTP: ts.Client(), Sources: map[string]Source{}, Handlers: map[string]Handler{}}
	rt.registerHTTP()

	sourceFn := rt.Sources["http.fetch"]
	if sourceFn == nil {
		t.Fatal("http.fetch not registered")
	}

	res, err := sourceFn(context.Background(), SourceParams{
		Config: map[string]interface{}{
			"url":    ts.URL,
			"method": "GET",
		},
		Cursor: map[string]interface{}{},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(res.Records))
	}

	record1 := res.Records[0].(map[string]interface{})
	if record1["title"] != "hello" {
		t.Fatalf("expected title 'hello', got %v", record1["title"])
	}
}

func TestRecordsSinkUsesDistinctDedupKeys(t *testing.T) {
	var rows []map[string]interface{}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scanner := bufio.NewScanner(r.Body)
		for scanner.Scan() {
			var row map[string]interface{}
			if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
				t.Fatal(err)
			}
			rows = append(rows, row)
		}
	}))
	defer ts.Close()
	rt := &Runtime{HTTP: ts.Client(), Config: config.Config{ClickHouseURL: ts.URL}}
	_, _, err := rt.recordsSink(context.Background(), []interface{}{map[string]interface{}{"id": 1}, map[string]interface{}{"id": 2}}, map[string]interface{}{"collection": "qa"}, HandlerContext{TenantID: "tenant"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0]["dedup_key"] == rows[1]["dedup_key"] {
		t.Fatalf("expected two distinct dedup keys: %#v", rows)
	}
}

func TestWebhookSink(t *testing.T) {
	var receivedBody map[string]interface{}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&receivedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	rt := &Runtime{HTTP: ts.Client(), Sources: map[string]Source{}, Handlers: map[string]Handler{}}
	rt.registerHTTP()

	sinkFn := rt.Handlers["sink.webhook"]
	if sinkFn == nil {
		t.Fatal("sink.webhook not registered")
	}

	inputRecords := []map[string]interface{}{
		{"amount": 100, "status": "paid"},
	}

	_, _, err := sinkFn(context.Background(), inputRecords, map[string]interface{}{
		"url": ts.URL,
	}, HandlerContext{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if receivedBody == nil {
		t.Fatal("no body received by webhook server")
	}
	recordsRaw, ok := receivedBody["records"].([]interface{})
	if !ok || len(recordsRaw) != 1 {
		t.Fatalf("expected 1 record in webhook payload, got %v", receivedBody["records"])
	}
	record := recordsRaw[0].(map[string]interface{})
	if record["status"] != "paid" {
		t.Fatalf("expected status 'paid', got %v", record["status"])
	}
}
