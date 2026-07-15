// Package security provides shared SSRF (server-side request forgery)
// protection for outbound HTTP requests to user/tenant-supplied endpoints:
// HTTP connectors, webhooks, alert destinations, and connector
// test-connection checks.
package security

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxRedirects = 10

// deniedNetworks are the private/reserved ranges outbound requests to
// user-supplied URLs must never reach: RFC1918 space, loopback, and
// link-local (including the 169.254.169.254 cloud metadata address), plus
// their IPv6 equivalents.
var deniedNetworks = mustParseCIDRs(
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"127.0.0.0/8",
	"169.254.0.0/16", // includes the 169.254.169.254 cloud metadata address
	"::1/128",
	"fc00::/7",
	"fe80::/10", // IPv6 link-local; metadata endpoint on some clouds
)

func mustParseCIDRs(cidrs ...string) []*net.IPNet {
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, parsed, err := net.ParseCIDR(cidr)
		if err != nil {
			panic(fmt.Sprintf("security: invalid CIDR %q: %v", cidr, err))
		}
		nets = append(nets, parsed)
	}
	return nets
}

// IsDenied reports whether ip falls in a private/reserved range that
// outbound requests to user-supplied URLs must not reach.
func IsDenied(ip net.IP) bool {
	for _, network := range deniedNetworks {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// ValidateURL enforces the outbound egress policy for user/tenant-supplied
// endpoints: HTTPS only, with a host present. Callers should still rely on
// dialContext (wired in via NewHTTPClient) to catch private/metadata
// addresses, since a hostname can resolve to a denied IP even when the URL
// itself looks fine, and can be re-pointed after this check (DNS rebinding).
func ValidateURL(raw string) (*url.URL, error) {
	if raw == "" {
		return nil, fmt.Errorf("URL is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}
	if parsed.Scheme != "https" {
		return nil, fmt.Errorf("URL must use https")
	}
	if parsed.Hostname() == "" {
		return nil, fmt.Errorf("URL must have a host")
	}
	return parsed, nil
}

// dialContext resolves the target host, rejects it if any resolved address
// is in a private/reserved range, and dials the validated IP directly
// instead of the hostname. Dialing the already-checked IP (rather than
// letting the dialer re-resolve the host) is what closes the DNS-rebinding
// gap: an attacker who points DNS at a public IP during config-save/check
// time and a private/metadata IP at connect time cannot get through,
// because resolution and the denylist check happen right before connect.
func dialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	var resolver net.Resolver
	ips, err := resolver.LookupIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	var dialer net.Dialer
	var lastErr error
	for _, ip := range ips {
		if IsDenied(ip) {
			lastErr = fmt.Errorf("target address %s is not allowed", ip)
			continue
		}
		conn, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if dialErr == nil {
			return conn, nil
		}
		lastErr = dialErr
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no addresses found for %s", host)
	}
	return nil, lastErr
}

// NewHTTPClient returns an http.Client for outbound requests to
// user/tenant-supplied URLs. Every connection is re-validated against the
// private/metadata denylist at dial time (not just when the URL is first
// saved), so this is the client every such call site should share rather
// than constructing its own http.Client.
func NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext: dialContext,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return fmt.Errorf("stopped after %d redirects", maxRedirects)
			}
			if _, err := ValidateURL(req.URL.String()); err != nil {
				return fmt.Errorf("redirect target: %w", err)
			}
			if len(via) > 0 && !sameOrigin(via[0].URL, req.URL) {
				return fmt.Errorf("redirect target must remain on the original origin")
			}
			return nil
		},
	}
}

func sameOrigin(left, right *url.URL) bool {
	return strings.EqualFold(left.Scheme, right.Scheme) &&
		strings.EqualFold(left.Hostname(), right.Hostname()) &&
		effectivePort(left) == effectivePort(right)
}

func effectivePort(value *url.URL) string {
	if port := value.Port(); port != "" {
		return port
	}
	if strings.EqualFold(value.Scheme, "https") {
		return "443"
	}
	if strings.EqualFold(value.Scheme, "http") {
		return "80"
	}
	return ""
}
