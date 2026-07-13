package api

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleDoesNotExposeInternalError(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	handle(func(http.ResponseWriter, *http.Request) error {
		return errors.New("database password=secret-value")
	})(recorder, request)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "secret-value") {
		t.Fatalf("internal error leaked: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"error":"internal error"`) {
		t.Fatalf("response = %s", recorder.Body.String())
	}
}

func TestRequestIPUsesTrustedProxyHeader(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "10.0.0.2:1234"
	request.Header.Set("X-Forwarded-For", "198.51.100.9")
	request.Header.Set("X-Real-IP", "203.0.113.7")
	if got := requestIP(request); got != "203.0.113.7" {
		t.Fatalf("requestIP = %q", got)
	}
}

func TestRequestIPIgnoresProxyHeaderFromPublicPeer(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "198.51.100.2:1234"
	request.Header.Set("X-Real-IP", "203.0.113.7")
	if got := requestIP(request); got != "198.51.100.2" {
		t.Fatalf("requestIP = %q", got)
	}
}
