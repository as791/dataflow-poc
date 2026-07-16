package api

import (
	"context"
	"regexp"
	"testing"
)

var hex32 = regexp.MustCompile(`^[0-9a-f]{32}$`)

func TestTraceIDFromContext(t *testing.T) {
	cases := []struct {
		name, header, want string
	}{
		{"valid traceparent reused", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "4bf92f3577b34da6a3ce929d0e0e4736"},
		{"uppercase normalized", "00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01", "4bf92f3577b34da6a3ce929d0e0e4736"},
		{"all-zero trace id rejected", "00-00000000000000000000000000000000-00f067aa0ba902b7-01", ""},
		{"garbage rejected", "not-a-traceparent", ""},
		{"short trace id rejected", "00-4bf92f-00f067aa0ba902b7-01", ""},
		{"missing header generates", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			if tc.header != "" {
				ctx = context.WithValue(ctx, traceParentKey, tc.header)
			}
			got := traceIDFromContext(ctx)
			if tc.want != "" && got != tc.want {
				t.Fatalf("want %s, got %s", tc.want, got)
			}
			if !hex32.MatchString(got) {
				t.Fatalf("trace id %q is not 32 lowercase hex chars", got)
			}
		})
	}
	if traceIDFromContext(context.Background()) == traceIDFromContext(context.Background()) {
		t.Fatal("generated trace ids must be unique")
	}
}
