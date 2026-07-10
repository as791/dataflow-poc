import { expect, type APIRequestContext } from '@playwright/test';

export type Connection = { id: string; provider: string; name?: string };
export type Node = {
  id: string;
  type: string;
  activityType: string;
  config: Record<string, unknown>;
  ingestion?: Record<string, unknown>;
  timeoutSec?: number;
  retry?: { maximumAttempts?: number };
  mergeStrategy?: string;
  joinKey?: string;
};

// ponytail: login is rate-limited to 10/min per IP and Playwright restarts the
// worker process after every test failure, so an in-memory cache re-logins on
// each failed test. Persist the token to tmpdir instead; re-login only when it
// nears the 15-minute access-token TTL.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

function tokenCachePath(email: string) {
  return join(tmpdir(), `dataflow-qa-token-${createHash('sha256').update(email).digest('hex').slice(0, 12)}.json`);
}

// ponytail: password-login is rate-limited server-side (10/min per IP), shared
// with any other activity from this IP (manual curl, other test runs, other
// accounts). Retry with backoff instead of failing the test on a transient 429.
export async function postWithRateLimitRetry(request: APIRequestContext, path: string, data: Record<string, unknown>, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const response = await request.post(path, { data });
    if (response.status() !== 429) return response;
    const retryAfter = Number(response.headers()['retry-after']) || 15;
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  }
  return request.post(path, { data });
}

export class DeployedAPI {
  private token = '';

  constructor(private readonly request: APIRequestContext) {}

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async login() {
    const email = required('QA_EMAIL');
    const cachePath = tokenCachePath(email);
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as { token: string; at: number };
      if (Date.now() - cached.at < 10 * 60_000) {
        this.token = cached.token;
        return;
      }
    } catch {
      // no cache yet
    }
    const login = await postWithRateLimitRetry(this.request, '/api/auth/login', { email, password: required('QA_PASSWORD') });
    expect(login.ok(), await login.text()).toBeTruthy();
    const refresh = await this.request.post('/api/auth/refresh');
    expect(refresh.ok(), await refresh.text()).toBeTruthy();
    this.token = (await refresh.json()).accessToken as string;
    writeFileSync(cachePath, JSON.stringify({ token: this.token, at: Date.now() }));
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

  async post(path: string, data?: Record<string, unknown>, timeout?: number) {
    return this.request.post(path, { headers: this.headers(), data, timeout });
  }

  async put(path: string, data: Record<string, unknown>) {
    return this.request.put(path, { headers: this.headers(), data });
  }

  async delete(path: string) {
    return this.request.delete(path, { headers: this.headers() });
  }

  async create(body: Record<string, unknown>) {
    const response = await this.request.post('/api/pipelines', { headers: this.headers(), data: body });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ rowId: string; pipelineKey: string; version: number }>;
  }

  async start(rowId: string) {
    const response = await this.request.post(`/api/pipelines/${rowId}/run`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ executionId: string }>;
  }

  async status(executionId: string) {
    const response = await this.request.get(`/api/executions/${executionId}/status`, { headers: this.headers() });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }

  async wait(executionId: string, terminal: string[] = ['completed', 'failed', 'cancelled']) {
    for (let i = 0; i < 90; i++) {
      const status = await this.status(executionId);
      if (terminal.includes(status.phase)) return status;
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    throw new Error(`execution ${executionId} timed out`);
  }

  async runDefinition(body: Record<string, unknown>) {
    const { rowId } = await this.create(body);
    const { executionId } = await this.start(rowId);
    const status = await this.wait(executionId);
    if (status.phase !== 'completed') throw new Error(JSON.stringify(status));
    return { rowId, executionId, status };
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
