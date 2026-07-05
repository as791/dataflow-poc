import { expect, type APIRequestContext } from '@playwright/test';

export type Connection = { id: string; provider: string; name?: string };
export type Node = { id: string; type: string; activityType: string; config: Record<string, unknown>; ingestion?: Record<string, unknown> };

export class DeployedAPI {
  private token = '';

  constructor(private readonly request: APIRequestContext) {}

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async login() {
    const login = await this.request.post('/api/auth/login', {
      data: { email: required('QA_EMAIL'), password: required('QA_PASSWORD') },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
    const refresh = await this.request.post('/api/auth/refresh');
    expect(refresh.ok(), await refresh.text()).toBeTruthy();
    this.token = (await refresh.json()).accessToken;
  }

  async connection(provider: string, name = process.env[`QA_${provider.toUpperCase()}_CONNECTION`]) {
    const response = await this.request.get('/api/connectors', { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
    const found = ((await response.json()) as Connection[]).find(c => c.provider === provider && (!name || c.name === name));
    expect(found, `Connect a ${provider} connector to the QA workspace first`).toBeTruthy();
    return found!.id;
  }

  async createExpecting(status: number, body: Record<string, unknown>) {
    const response = await this.request.post('/api/pipelines', { headers: this.headers(), data: body });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  }

  async get(path: string) {
    return this.request.get(path, { headers: this.headers() });
  }

  async create(body: Record<string, unknown>) {
    const response = await this.request.post('/api/pipelines', { headers: this.headers(), data: body });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ rowId: string }>;
  }

  async start(rowId: string) {
    const response = await this.request.post(`/api/pipelines/${rowId}/run`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ executionId: string }>;
  }

  async signal(executionId: string, action: 'pause' | 'resume' | 'cancel') {
    const response = await this.request.post(`/api/executions/${executionId}/${action}`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async retry(executionId: string) {
    const response = await this.request.post(`/api/executions/${executionId}/retry`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ executionId: string }>;
  }

  async testConnection(id: string) {
    const response = await this.request.post(`/api/connectors/${id}/test`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async refreshConnection(id: string) {
    const response = await this.request.post(`/api/connectors/${id}/refresh`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async googlePreview(connectionId: string, spreadsheetId: string, sheet: string) {
    const response = await this.request.get(`/api/connectors/google/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheet)}/preview?connectionId=${connectionId}`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ headers: string[]; rows: string[][] }>;
  }

  async run(name: string, nodes: Node[], edges: Array<{ id: string; source: string; target: string }>) {
    const created = await this.request.post('/api/pipelines', {
      headers: this.headers(),
      data: { name, trigger: { type: 'manual' }, nodes, edges },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const rowId = (await created.json()).rowId as string;
    const started = await this.request.post(`/api/pipelines/${rowId}/run`, { headers: this.headers() });
    expect(started.ok(), await started.text()).toBeTruthy();
    const executionId = (await started.json()).executionId as string;
    for (let i = 0; i < 60; i++) {
      const response = await this.request.get(`/api/executions/${executionId}/status`, { headers: this.headers() });
      expect(response.ok(), await response.text()).toBeTruthy();
      const status = await response.json();
      if (status.phase === 'completed') return { rowId, executionId, status };
      if (status.phase === 'failed') throw new Error(JSON.stringify(status));
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    throw new Error(`execution ${executionId} timed out`);
  }

  async runExpectingFailure(name: string, nodes: Node[], edges: Array<{ id: string; source: string; target: string }>) {
    const created = await this.request.post('/api/pipelines', {
      headers: this.headers(), data: { name, trigger: { type: 'manual' }, nodes, edges },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const rowId = (await created.json()).rowId as string;
    const started = await this.request.post(`/api/pipelines/${rowId}/run`, { headers: this.headers() });
    expect(started.ok(), await started.text()).toBeTruthy();
    const executionId = (await started.json()).executionId as string;
    for (let i = 0; i < 60; i++) {
      const response = await this.request.get(`/api/executions/${executionId}/status`, { headers: this.headers() });
      expect(response.ok(), await response.text()).toBeTruthy();
      const status = await response.json();
      if (status.phase === 'failed') return status;
      if (status.phase === 'completed') throw new Error(`execution ${executionId} unexpectedly completed`);
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    throw new Error(`execution ${executionId} timed out`);
  }
}

export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
