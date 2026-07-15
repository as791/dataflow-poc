package security

import (
	"context"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestIsDenied(t *testing.T) {
	cases := []struct {
		ip     string
		denied bool
	}{
		{"169.254.169.254", true}, // cloud metadata
		{"10.1.2.3", true},
		{"172.16.5.1", true},
		{"192.168.1.1", true},
		{"127.0.0.1", true},
		{"::1", true},
		{"fc00::1", true},
		{"8.8.8.8", false},
		{"93.184.216.34", false},
	}
	for _, c := range cases {
		if got := IsDenied(net.ParseIP(c.ip)); got != c.denied {
			t.Errorf("IsDenied(%s) = %v, want %v", c.ip, got, c.denied)
		}
	}
}

func TestValidateURLRejectsPlainHTTP(t *testing.T) {
	if _, err := ValidateURL("http://example.com/webhook"); err == nil {
		t.Fatal("expected plain http:// URL to be rejected")
	}
	if _, err := ValidateURL("https://example.com/webhook"); err != nil {
		t.Fatalf("expected https:// URL to be accepted, got %v", err)
	}
}

// TestNewHTTPClientRejectsMetadataAndPrivateTargets proves the shared client
// refuses to connect to the cloud metadata address and an RFC1918 target,
// while still reaching a normal public-looking host.
func TestNewHTTPClientRejectsMetadataAndPrivateTargets(t *testing.T) {
	client := NewHTTPClient(2 * time.Second)

	for _, addr := range []string{"169.254.169.254:80", "10.0.0.5:80"} {
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://"+addr, nil)
		_, err := client.Do(req)
		if err == nil {
			t.Fatalf("expected request to %s to be rejected", addr)
		}
		if !strings.Contains(err.Error(), "not allowed") {
			t.Fatalf("expected denylist error for %s, got %v", addr, err)
		}
	}
}

// TestNewHTTPClientAllowsPublicHost proves a public, non-denied target is
// never rejected by the SSRF denylist. The sandbox this runs in may have no
// outbound network access, so a connection/timeout error is fine; only a
// denylist rejection ("not allowed") is a failure.
func TestNewHTTPClientAllowsPublicHost(t *testing.T) {
	client := NewHTTPClient(2 * time.Second)
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://1.1.1.1:80", nil)
	_, err := client.Do(req)
	if err != nil && strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("expected public IP not to be rejected by the SSRF denylist, got %v", err)
	}
}
