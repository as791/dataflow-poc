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
