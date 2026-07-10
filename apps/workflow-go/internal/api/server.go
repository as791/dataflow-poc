package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/dataflow-poc/workflow-go/internal/activities"
	"github.com/dataflow-poc/workflow-go/internal/codec"
	"github.com/dataflow-poc/workflow-go/internal/config"
	"github.com/dataflow-poc/workflow-go/internal/connectors"
	"github.com/dataflow-poc/workflow-go/internal/database"
	"github.com/dataflow-poc/workflow-go/internal/objectstore"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.temporal.io/sdk/client"
)

type Server struct {
	Config     config.Config
	DB         *database.DB
	Redis      *redis.Client
	Temporal   map[string]client.Client
	HTTP       *http.Client
	Registry   *prometheus.Registry
	Payloads   *activities.Payloads
	Connectors *connectors.Registry
	Requests   *prometheus.CounterVec
	Durations  *prometheus.HistogramVec
}

func New(ctx context.Context, cfg config.Config) (*Server, error) {
	db, err := database.Open(ctx, cfg.AppDatabaseURL)
	if err != nil {
		return nil, err
	}
	redisOptions, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		db.Close()
		return nil, err
	}
	dataConverter, err := codec.NewDataConverterFromEnv()
	if err != nil {
		db.Close()
		return nil, err
	}
	temporalClients := map[string]client.Client{}
	for _, namespace := range []string{"test", "prod"} {
		value, dialErr := client.Dial(client.Options{HostPort: cfg.TemporalAddress, Namespace: namespace, DataConverter: dataConverter})
		if dialErr != nil {
			for _, opened := range temporalClients {
				opened.Close()
			}
			db.Close()
			return nil, dialErr
		}
		temporalClients[namespace] = value
	}
	store, err := objectstore.New(ctx, objectstore.Config{Bucket: cfg.PayloadBucket, Region: cfg.PayloadRegion, Endpoint: cfg.PayloadEndpoint, ForcePathStyle: cfg.PayloadForcePathStyle, AccessKeyID: cfg.PayloadAccessKeyID, SecretAccessKey: cfg.PayloadSecretAccessKey})
	if err != nil {
		for _, opened := range temporalClients {
			opened.Close()
		}
		db.Close()
		return nil, err
	}
	platformKey, err := activities.DecodePlatformKey(cfg.TemporalPayloadEncryptionKey)
	if err != nil {
		for _, opened := range temporalClients {
			opened.Close()
		}
		db.Close()
		return nil, err
	}
	registry := prometheus.NewRegistry()
	requests := prometheus.NewCounterVec(prometheus.CounterOpts{Name: "dataflow_http_requests_total", Help: "HTTP requests handled by the API."}, []string{"method", "status"})
	durations := prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "dataflow_http_request_duration_seconds", Help: "API request latency.", Buckets: prometheus.DefBuckets}, []string{"method"})
	registry.MustRegister(requests, durations)
	return &Server{
		Config: cfg, DB: db, Redis: redis.NewClient(redisOptions), Temporal: temporalClients,
		HTTP: &http.Client{Timeout: 30 * time.Second}, Registry: registry, Requests: requests, Durations: durations,
		Payloads:   &activities.Payloads{DB: db, Store: store, PlatformKey: platformKey},
		Connectors: connectors.Load(cfg.ConnectorsDir),
	}, nil
}

func (s *Server) Close() {
	for _, temporalClient := range s.Temporal {
		temporalClient.Close()
	}
	_ = s.Redis.Close()
	s.DB.Close()
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		jsonResponse(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.Handle("GET /metrics", promhttp.HandlerFor(s.Registry, promhttp.HandlerOpts{}))

	s.registerAuth(mux)
	s.registerTriggers(mux)
	s.registerBillingWebhook(mux)
	mux.HandleFunc("GET /api/analytics/shared/{token}", handle(s.analyticsShared))
	// OAuth providers redirect without an API bearer token. The single-use state
	// nonce carries and validates the tenant/user identity for these callbacks.
	mux.HandleFunc("GET /api/connectors/google/callback", handle(s.googleConnectorCallback))
	mux.HandleFunc("GET /api/connectors/microsoft/callback", handle(s.microsoftConnectorCallback))
	mux.HandleFunc("GET /api/connectors/zendesk/callback", handle(s.zendeskCallback))

	private := http.NewServeMux()
	s.registerEdition(private)
	s.registerAlerts(private)
	s.registerTeam(private)
	s.registerPipelines(private)
	s.registerExecutions(private)
	s.registerConnectors(private)
	s.registerAnalytics(private)
	s.registerAI(private)
	s.registerBilling(private)
	mux.Handle("/api/", s.protected(private))
	return s.metrics(middleware(mux))
}

func (s *Server) metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writer := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		started := time.Now()
		next.ServeHTTP(writer, r)
		s.Requests.WithLabelValues(r.Method, fmt.Sprint(writer.status)).Inc()
		s.Durations.WithLabelValues(r.Method).Observe(time.Since(started).Seconds())
	})
}

func (s *Server) StartBackground(ctx context.Context) {
	go s.auditRetention(ctx)
	go s.backfillDispatcher(ctx)
	go s.assetEventSubscriber(ctx)
}

func (s *Server) auditRetention(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM audit_log WHERE created_at < now() - ($1 || ' days')::interval`, s.Config.AuditRetentionDays); err != nil {
				slog.Error("audit_log purge failed", "error", err)
			}
		}
	}
}
