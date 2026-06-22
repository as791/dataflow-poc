import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';

export function initOtel(serviceName: string) {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'}/v1/traces`,
    }),
    metricReader: new PrometheusExporter({ port: 9464 }), // scraped by Prometheus
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown());
}

// ─── Domain metrics — every layer reports through these ───
const meter = metrics.getMeter('dataflow');
export const M = {
  executions:      meter.createCounter('dataflow_executions_total'),
  nodeDuration:    meter.createHistogram('dataflow_node_duration_ms'),
  nodeFailures:    meter.createCounter('dataflow_node_failures_total'),
  recordsIngested: meter.createCounter('dataflow_records_ingested_total'),
  cursorLag:       meter.createObservableGauge('dataflow_cursor_lag_seconds'),
};
