package api

import (
	"strings"
	"testing"
)

func TestAnalyticsTimeRangeClauses(t *testing.T) {
	clauses, err := analyticsTimeRangeClauses("2026-07-04T00:00:00+05:30", "2026-07-05T00:00:00+05:30")
	if err != nil || len(clauses) != 2 || !strings.Contains(string(clauses[0]), "2026-07-03T18:30:00Z") {
		t.Fatalf("unexpected clauses: %v, %v", clauses, err)
	}
	if _, err := analyticsTimeRangeClauses("2026-07-05T00:00:00Z", "2026-07-04T00:00:00Z"); err == nil {
		t.Fatal("expected reversed range to fail")
	}
}

// Literal/JSONField typing and injection coverage lives in internal/chsql tests.
