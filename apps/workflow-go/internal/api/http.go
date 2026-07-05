package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type contextKey string

const tenantKey contextKey = "tenant"

func tenantFrom(r *http.Request) model.TenantContext {
	value, _ := r.Context().Value(tenantKey).(model.TenantContext)
	return value
}

func withTenant(r *http.Request, tenant model.TenantContext) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), tenantKey, tenant))
}

func jsonResponse(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if value != nil {
		_ = json.NewEncoder(w).Encode(value)
	}
}

type APIErrorCode string

const (
	ErrInvalidRequest   APIErrorCode = "ERR_INVALID_REQUEST"
	ErrMissingField     APIErrorCode = "ERR_MISSING_FIELD"
	ErrNotFound         APIErrorCode = "ERR_NOT_FOUND"
	ErrRateLimit        APIErrorCode = "ERR_RATE_LIMIT_EXCEEDED"
	ErrInternal         APIErrorCode = "ERR_INTERNAL"
	ErrUnauthorized     APIErrorCode = "ERR_UNAUTHORIZED"
	ErrForbidden        APIErrorCode = "ERR_FORBIDDEN"
	ErrConflict         APIErrorCode = "ERR_CONFLICT"
	ErrValidation       APIErrorCode = "ERR_VALIDATION"
	ErrInvalidEnvironment APIErrorCode = "ERR_INVALID_ENVIRONMENT"
	ErrConnectorExists  APIErrorCode = "ERR_CONNECTOR_EXISTS"
	ErrOAuthRevoked     APIErrorCode = "ERR_OAUTH_REVOKED"
	ErrNotSupported     APIErrorCode = "ERR_NOT_SUPPORTED"
)

type ErrorResponse struct {
	Error   string            `json:"error"`
	Code    APIErrorCode      `json:"code,omitempty"`
	Details map[string]string `json:"details,omitempty"`
}

func jsonError(w http.ResponseWriter, status int, code APIErrorCode, message string, details map[string]string) {
	jsonResponse(w, status, ErrorResponse{Error: message, Code: code, Details: details})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target interface{}) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 5<<20)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		jsonError(w, http.StatusBadRequest, ErrInvalidRequest, "invalid JSON body", nil)
		return false
	}
	return true
}

func rowsToMaps(rows pgx.Rows) ([]map[string]interface{}, error) {
	defer rows.Close()
	fields := rows.FieldDescriptions()
	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		row := make(map[string]interface{}, len(values))
		for i, value := range values {
			if fields[i].DataTypeOID == pgtype.UUIDOID {
				switch raw := value.(type) {
				case [16]byte:
					value = uuid.UUID(raw).String()
				case []byte:
					if parsed, parseErr := uuid.FromBytes(raw); parseErr == nil {
						value = parsed.String()
					}
				}
			}
			row[string(fields[i].Name)] = value
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func oneMap(rows pgx.Rows) (map[string]interface{}, error) {
	values, err := rowsToMaps(rows)
	if err != nil || len(values) == 0 {
		return nil, err
	}
	return values[0], nil
}

func requestIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	return strings.Split(r.RemoteAddr, ":")[0]
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := env("APP_URL", "http://localhost:3000")
		if origin != "" && origin == allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writer := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		started := time.Now()
		defer func() {
			if recovered := recover(); recovered != nil {
				slog.Error("unhandled route panic", "error", recovered, "stack", string(debug.Stack()))
				if writer.status == http.StatusOK {
					jsonError(writer, http.StatusInternalServerError, ErrInternal, "internal error", nil)
				}
			}
			slog.Info("http request", "method", r.Method, "path", r.URL.Path, "status", writer.status, "duration_ms", time.Since(started).Milliseconds())
		}()
		next.ServeHTTP(writer, r)
	})
}

func (s *Server) rateLimit(scope string, limit int64, window time.Duration, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bucket := time.Now().Unix() / int64(window/time.Second)
		key := fmt.Sprintf("dataflow:rate:%s:%s:%d", scope, requestIP(r), bucket)
		count, err := s.Redis.Incr(r.Context(), key).Result()
		if err == nil {
			if count == 1 {
				_ = s.Redis.Expire(r.Context(), key, window).Err()
			}
			if count > limit {
				jsonError(w, http.StatusTooManyRequests, ErrRateLimit, "rate limit exceeded", nil)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func handle(fn func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			var clientErr *HTTPError
			if errors.As(err, &clientErr) {
				jsonError(w, clientErr.Status, clientErr.Code, clientErr.Message, clientErr.Details)
				return
			}
			slog.Error("route failed", "method", r.Method, "path", r.URL.Path, "error", err)
			jsonError(w, http.StatusInternalServerError, ErrInternal, err.Error(), nil)
		}
	}
}

type HTTPError struct {
	Status  int
	Code    APIErrorCode
	Message string
	Details map[string]string
}

func (e *HTTPError) Error() string { return e.Message }

func badRequest(code APIErrorCode, message string) error {
	return &HTTPError{Status: http.StatusBadRequest, Code: code, Message: message}
}

func badRequestWithDetails(code APIErrorCode, message string, details map[string]string) error {
	return &HTTPError{Status: http.StatusBadRequest, Code: code, Message: message, Details: details}
}

func notFound(code APIErrorCode, message string) error { 
	return &HTTPError{Status: http.StatusNotFound, Code: code, Message: message} 
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func requireString(body map[string]interface{}, key string) (string, error) {
	value, ok := body[key].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", badRequest(ErrMissingField, fmt.Sprintf("%s required", key))
	}
	return value, nil
}
