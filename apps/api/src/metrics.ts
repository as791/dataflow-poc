import client from 'prom-client';
client.collectDefaultMetrics();
export const registry = client.register;
export const httpRequests = new client.Counter({
  name: 'dataflow_api_requests_total', help: 'API requests',
  labelNames: ['route', 'method', 'status'],
});
export const executionsStarted = new client.Counter({
  name: 'dataflow_executions_total', help: 'Executions started',
  labelNames: ['trigger'],
});
