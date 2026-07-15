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
	"github.com/dataflow-poc/workflow-go/internal/security"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.temporal.io/sdk/client"
)

type Server struct {
	Config   config.Config
	DB       *database.DB
	Redis    *redis.Client
	Temporal map[string]client.Client
	HTTP     *http.Client
	// SafeHTTP is the shared client for outbound requests to tenant-supplied
	// endpoints (currently: the HTTP connector-instance test-connection
	// check). It enforces HTTPS and re-validates the resolved IP against the
	// private/metadata denylist at dial time.
	SafeHTTP   *http.Client
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
		HTTP: &http.Client{Timeout: 30 * time.Second}, SafeHTTP: security.NewHTTPClient(30 * time.Second), Registry: registry, Requests: requests, Durations: durations,
		Payloads:   &activities.Payloads{DB: db, Store: store, PlatformKey: platformKey, MaxPayloadBytes: cfg.MaxPayloadBytes},
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
	go s.dataRetention(ctx)
	go s.backfillDispatcher(ctx)
	go s.assetEventSubscriber(ctx)
}

// dataRetention purges rows and stream entries past their configured
// retention window. Every statement is a bounded-age DELETE (or XTRIM), so
// re-running it on the next tick is a no-op if nothing new has aged out.
func (s *Server) dataRetention(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.purgeAgedData(ctx)
		}
	}
}

func (s *Server) purgeAgedData(ctx context.Context) {
	if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM audit_log WHERE created_at < now() - ($1 || ' days')::interval`, s.Config.AuditRetentionDays); err != nil {
		slog.Error("audit_log purge failed", "error", err)
	}
	// Executions past retention; node_runs/node_payloads have no FK to
	// executions so each is purged independently by its own age column.
	if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM executions WHERE completed_at IS NOT NULL AND completed_at < now() - ($1 || ' days')::interval`, s.Config.ExecutionRetentionDays); err != nil {
		slog.Error("executions purge failed", "error", err)
	}
	if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM node_runs WHERE finished_at < now() - ($1 || ' days')::interval`, s.Config.NodeRunRetentionDays); err != nil {
		slog.Error("node_runs purge failed", "error", err)
	}
	// node_payloads only holds the "pg" DataRef type (payload stored inline
	// in Postgres). S3-backed payloads ("s3" type) carry no age index in the
	// app; expire those via a bucket lifecycle rule on PAYLOAD_S3_BUCKET
	// instead of app code.
	if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM node_payloads WHERE created_at < now() - ($1 || ' days')::interval`, s.Config.PayloadRetentionDays); err != nil {
		slog.Error("node_payloads purge failed", "error", err)
	}
	if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM openlineage_outbox WHERE sent_at IS NOT NULL AND sent_at < now() - ($1 || ' days')::interval`, s.Config.OutboxRetentionDays); err != nil {
		slog.Error("openlineage_outbox purge failed", "error", err)
	}
	if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM pipeline_event_outbox WHERE published_at IS NOT NULL AND published_at < now() - ($1 || ' days')::interval`, s.Config.OutboxRetentionDays); err != nil {
		slog.Error("pipeline_event_outbox purge failed", "error", err)
	}
	if _, err := s.DB.Pool.Exec(ctx, `DELETE FROM pipeline_alert_notification_outbox WHERE sent_at IS NOT NULL AND sent_at < now() - ($1 || ' days')::interval`, s.Config.OutboxRetentionDays); err != nil {
		slog.Error("pipeline_alert_notification_outbox purge failed", "error", err)
	}
	// Safety cap on the pipeline-events stream: entries are XAck+XDel'd on
	// successful delivery already, so this only trims a stuck/backlogged
	// stream rather than doing routine cleanup.
	if err := s.Redis.XTrimMaxLenApprox(ctx, "dataflow:pipeline-events", s.Config.RedisStreamMaxLen, 0).Err(); err != nil {
		slog.Error("pipeline-events stream trim failed", "error", err)
	}
}
