// Auth-aware fetch wrapper. Reads the access token from AuthContext
// (set via setAccessToken) and includes credentials so the refresh
// cookie travels on /api/auth/* calls.

let accessToken: string | null = null;
let onUnauthorized: () => Promise<boolean> = async () => false;

export function setAccessToken(t: string | null) { accessToken = t; }
export function setUnauthorizedHandler(fn: () => Promise<boolean>) { onUnauthorized = fn; }

async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && retry) {
    const recovered = await onUnauthorized();
    if (recovered) return request(path, init, false);
  }
  return res;
}

const j = async (r: Response) => {
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`${r.status} ${text}`);
  }
  return r.json();
};

export const api = {
  // Pipelines / executions
  savePipeline: (def: any) => request('/api/pipelines', { method: 'POST', body: JSON.stringify(def) }).then(j),
  activate:     (rowId: string) => request(`/api/pipelines/${rowId}/activate`, { method: 'POST' }).then(j),
  promote:      (rowId: string) => request(`/api/pipelines/${rowId}/promote`, { method: 'POST' }).then(j),
  setStage:     (rowId: string, to: 'testing' | 'production') =>
    request(`/api/pipelines/${rowId}/stage`, { method: 'POST', body: JSON.stringify({ to }) }).then(j),
  run:          (rowId: string) =>
    request(`/api/pipelines/${rowId}/run`, { method: 'POST', body: JSON.stringify({}) }).then(j),
  listPipelines: () => request('/api/pipelines').then(j),

  // Connector catalog (coded + manifest-driven). Returns { catalog }.
  getConnectorCatalog: () => request('/api/connectors/catalog').then(j),

  // Connector instances (A3): list, create credential instance, test-connection.
  listConnectors: () => request('/api/connectors').then(j),
  createConnector: (body: { provider: string; name: string; config?: Record<string, any>; secret?: Record<string, any> }) =>
    request('/api/connectors', { method: 'POST', body: JSON.stringify(body) }).then(j),
  testConnector: (id: string) => request(`/api/connectors/${id}/test`, { method: 'POST' }).then(j),
  deleteConnector: (id: string) => request(`/api/connectors/${id}`, { method: 'DELETE' }).then(j),

  // AI builder (Ollama). Returns { mermaid, definition }.
  generatePipeline: (prompt: string) =>
    request('/api/ai/generate', { method: 'POST', body: JSON.stringify({ prompt }) }).then(j),
  refinePipeline: (definition: any, prompt: string) =>
    request('/api/ai/refine', { method: 'POST', body: JSON.stringify({ definition, prompt }) }).then(j),

  listExecutions: (params?: Record<string, string>) => {
    const clean = Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][];
    const qs = clean.length ? '?' + new URLSearchParams(Object.fromEntries(clean)) : '';
    return request(`/api/executions${qs}`).then(j);
  },
  getExecution: (id: string) => request(`/api/executions/${id}`).then(j),
  executionStatus: (id: string) => request(`/api/executions/${id}/status`).then(j),
  signal: (id: string, action: string) => request(`/api/executions/${id}/${action}`, { method: 'POST' }).then(j),

  // Auth (Google SSO — sign-in happens via the /api/auth/google browser redirect)
  logout: () => request('/api/auth/logout', { method: 'POST' }).then(j),
  refresh: () => request('/api/auth/refresh', { method: 'POST' }, false).then(j),
  me: () => request('/api/auth/me').then(j),
  inviteInfo: (token: string) =>
    request(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`).then(j),

  // Team
  listMembers: () => request('/api/team/members').then(j),
  listInvitations: () => request('/api/team/invitations').then(j),
  invite: (body: { email: string; role: 'owner' | 'member' }) =>
    request('/api/team/invitations', { method: 'POST', body: JSON.stringify(body) }).then(j),
  revokeInvite: (email: string) =>
    request(`/api/team/invitations/${encodeURIComponent(email)}`, { method: 'DELETE' }).then(j),

  // Billing (Phase 3)
  getUsage: () => request('/api/billing/usage').then(j),
  createOrder: (units: number) =>
    request('/api/billing/orders', { method: 'POST', body: JSON.stringify({ units }) }).then(j),
  getBillingHistory: () => request('/api/billing/history').then(j),
};
