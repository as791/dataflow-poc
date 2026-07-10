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

func TestSQLLiteralMatchesSchemaType(t *testing.T) {
	cases := []struct {
		name  string
		kind  string
		value interface{}
		want  string
	}{
		{name: "number from JSON float", kind: "number", value: 42.5, want: "42.5"},
		{name: "number from form string", kind: "number", value: "42", want: "42"},
		{name: "boolean from JSON bool", kind: "boolean", value: true, want: "true"},
		{name: "boolean from form string", kind: "boolean", value: "false", want: "false"},
		{name: "date", kind: "date", value: "2026-07-05T00:00:00Z", want: "parseDateTimeBestEffort('2026-07-05T00:00:00Z')"},
		{name: "string escapes quotes", kind: "string", value: "O'Reilly", want: "'O''Reilly'"},
		{name: "invalid number falls back to string", kind: "number", value: "12x", want: "'12x'"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := sqlLiteral(tc.kind, tc.value); got != tc.want {
				t.Fatalf("sqlLiteral(%q, %#v) = %q, want %q", tc.kind, tc.value, got, tc.want)
			}
		})
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
