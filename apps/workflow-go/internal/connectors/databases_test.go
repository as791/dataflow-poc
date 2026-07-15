package connectors

import "testing"

func TestEnvInt32(t *testing.T) {
	const name = "TEST_DB_POOL_MAX_CONNS"
	tests := []struct {
		name  string
		value string
		want  int32
	}{
		{name: "valid", value: "25", want: 25},
		{name: "maximum int32", value: "2147483647", want: 2147483647},
		{name: "empty", value: "", want: 5},
		{name: "zero", value: "0", want: 5},
		{name: "negative", value: "-1", want: 5},
		{name: "not a number", value: "many", want: 5},
		{name: "above int32", value: "2147483648", want: 5},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv(name, test.value)
			if got := envInt32(name, 5); got != test.want {
				t.Fatalf("envInt32(%q) = %d, want %d", test.value, got, test.want)
			}
		})
	}
}

func TestPostgresBatchRows(t *testing.T) {
	tests := []struct {
		name      string
		columns   int
		want      int
		wantError bool
	}{
		{name: "narrow records use default batch", columns: 1, want: dbBatchSize},
		{name: "parameter boundary uses default batch", columns: 131, want: dbBatchSize},
		{name: "wide records reduce batch", columns: 132, want: 496},
		{name: "one row at parameter boundary", columns: postgresMaxBindParams, want: 1},
		{name: "empty records rejected", columns: 0, wantError: true},
		{name: "single row over limit rejected", columns: postgresMaxBindParams + 1, wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := postgresBatchRows(test.columns)
			if test.wantError {
				if err == nil {
					t.Fatalf("postgresBatchRows(%d) expected error, got %d", test.columns, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("postgresBatchRows(%d): %v", test.columns, err)
			}
			if got != test.want {
				t.Fatalf("postgresBatchRows(%d) = %d, want %d", test.columns, got, test.want)
			}
		})
	}
}
