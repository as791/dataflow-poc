package api

import (
	"strings"
	"testing"
)

func TestAnalyticsTimeRangeClauses(t *testing.T) {
	clauses, err := analyticsTimeRangeClauses("2026-07-04T00:00:00+05:30", "2026-07-05T00:00:00+05:30")
	if err != nil || len(clauses) != 2 || !strings.Contains(clauses[0], "2026-07-03T18:30:00Z") {
		t.Fatalf("unexpected clauses: %v, %v", clauses, err)
	}
	if _, err := analyticsTimeRangeClauses("2026-07-05T00:00:00Z", "2026-07-04T00:00:00Z"); err == nil {
		t.Fatal("expected reversed range to fail")
	}
}

func TestJSONFieldUsesSchemaType(t *testing.T) {
	number, err := jsonField("amount", "number")
	if err != nil || !strings.Contains(number, "Float64") {
		t.Fatalf("expected numeric extraction, got %q, %v", number, err)
	}
	if _, err := jsonField("amount; DROP TABLE sink_records", "number"); err == nil {
		t.Fatal("expected unsafe field to fail")
	}
}
