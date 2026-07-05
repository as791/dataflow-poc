package connectors

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRowDiff(t *testing.T) {
	values := [][]interface{}{
		{"id", "name", "email"},
		{1, "Alice", "alice@example.com"},
		{2, "Bob", "bob@example.com"},
	}
	
	cursor := map[string]interface{}{}
	records, nextCursor := rowDiff(values, "id", cursor)
	if len(records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(records))
	}
	
	// If we run it again with the new cursor and same data, there should be 0 records changed
	records2, _ := rowDiff(values, "id", nextCursor)
	if len(records2) != 0 {
		t.Fatalf("expected 0 records, got %d", len(records2))
	}
	
	// If we change Bob's email
	values3 := [][]interface{}{
		{"id", "name", "email"},
		{1, "Alice", "alice@example.com"},
		{2, "Bob", "bob2@example.com"},
	}
	records3, _ := rowDiff(values3, "id", nextCursor)
	if len(records3) != 1 {
		t.Fatalf("expected 1 record changed, got %d", len(records3))
	}
	if records3[0].(map[string]interface{})["email"] != "bob2@example.com" {
		t.Fatalf("expected bob2@example.com")
	}
}
