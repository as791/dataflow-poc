import { useCallback, useEffect, useState } from 'react';
import { BadgeHelp, Blocks, RefreshCw, Sheet, ShieldCheck, Plug } from 'lucide-react';
import { api } from '../api';
import { ApiError } from '../components/ApiError';

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = 'google' | 'microsoft' | 'zendesk';

interface Connection {
  id: string;
  kind?: 'oauth' | 'credential';
  provider: string;
  name?: string;
  email?: string;
  subdomain?: string;   // zendesk only
  host?: string;
  brokers?: string;
  baseUrl?: string;
  cdc?: { enabled?: boolean; resources?: string[]; state?: string; error?: string };
  connected_at?: string;
}

// ponytail: local startOAuth/startZendeskOAuth removed — use api.startConnectorOAuth / api.startZendeskOAuth

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Provider icon avatars ────────────────────────────────────────────────────

function ProviderIcon({ provider }: { provider: Provider }) {
  const cfg: Record<Provider, { icon: typeof Sheet; bg: string }> = {
    google:    { icon: Sheet, bg: 'from-emerald-500/80 to-green-600/80' },
    microsoft: { icon: Blocks, bg: 'from-blue-500/80 to-cyan-500/80' },
    zendesk:   { icon: BadgeHelp, bg: 'from-slate-700 to-emerald-700' },
  };
  const { icon: Icon, bg } = cfg[provider];
  return (
    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${bg} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
      <Icon size={18} strokeWidth={1.8} />
    </div>
  );
}

// ─── Zendesk connect modal ────────────────────────────────────────────────────

function ZendeskModal({ onClose, onConnect }: {
  onClose: () => void;
  onConnect: (subdomain: string) => Promise<void>;
}) {
  const [subdomain, setSubdomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = subdomain.trim().replace(/\.zendesk\.com\/?$/, '');
    if (!slug) return;
    setBusy(true);
    setErr(null);
    try {
      await onConnect(slug);
    } catch (ex: any) {
      setErr(ex.message ?? 'Failed to initiate OAuth');
      setBusy(false);
    }
  };

  return (
    <div className="glass-modal-backdrop" onClick={onClose}>
      <div className="glass-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Connect Zendesk subdomain</h2>
          <button
            className="glass-btn-ghost w-8 h-8 flex items-center justify-center text-lg leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="glass-label">Subdomain</label>
            <div className="flex items-center gap-2">
              <input
                className="glass-input flex-1"
                placeholder="acme"
                value={subdomain}
                onChange={e => setSubdomain(e.target.value)}
                autoFocus
                required
              />
              <span className="text-sm text-gray-400 dark:text-white/40 whitespace-nowrap">.zendesk.com</span>
            </div>
          </div>

          {err && (
            <p className="text-xs text-danger/90 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
              {err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="glass-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="glass-btn-primary" disabled={busy || !subdomain.trim()}>
              {busy ? 'Redirecting…' : 'Connect →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Credential instance modal (A3 — non-OAuth creds) ──────────────────────────

function CredentialModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [provider, setProvider] = useState<'postgres' | 'mysql' | 'mongodb' | 'clickhouse' | 's3' | 'kafka' | 'http'>('postgres');
  const [name, setName] = useState('');
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      let body: Record<string, unknown>;
      if (provider === 'postgres' || provider === 'mysql') {
        body = { provider, name, config: { host: f.host, port: f.port ? +f.port : provider === 'postgres' ? 5432 : 3306, database: f.database, user: f.user, sslMode: f.sslMode ?? 'disable' }, secret: { password: f.password } };
      } else if (provider === 'mongodb') {
        body = { provider, name, config: { host: f.host, port: f.port ? +f.port : 27017, database: f.database, user: f.user, authSource: f.authSource || 'admin', tls: f.tls === 'true' }, secret: { password: f.password } };
      } else if (provider === 'clickhouse') {
        body = { provider, name, config: { url: f.url, database: f.database || 'default', username: f.username || 'default' }, secret: { password: f.password } };
      } else if (provider === 's3') {
        body = { provider, name, config: { region: f.region || 'us-east-1', endpoint: f.endpoint, forcePathStyle: f.forcePathStyle === 'true' }, secret: { accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey } };
      } else if (provider === 'kafka') {
        body = { provider, name, config: { brokers: f.brokers, clientId: f.clientId || 'dataflow', tls: f.tls === 'true', saslMechanism: f.saslMechanism || 'none' }, secret: { username: f.username, password: f.password } };
      } else {
        body = { provider, name, config: { baseUrl: f.baseUrl }, secret: { apiKey: f.apiKey } };
      }
      await api.createConnector(body as { provider: string; name: string; config?: Record<string, any>; secret?: Record<string, any> });
      onSaved(); onClose();
    } catch (ex: any) { setErr(ex.message ?? 'Failed to save'); setBusy(false); }
  };

  return (
    <div className="glass-modal-backdrop" onClick={onClose}>
      <div className="glass-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Add credential</h2>
          <button className="glass-btn-ghost w-8 h-8 flex items-center justify-center text-lg leading-none" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="glass-label">Type
            <select className="glass-select" value={provider} onChange={e => setProvider(e.target.value as any)}>
              <option value="postgres">Postgres</option>
              <option value="mysql">MySQL</option>
              <option value="mongodb">MongoDB</option>
              <option value="clickhouse">ClickHouse</option>
              <option value="s3">Amazon S3</option>
              <option value="kafka">Kafka / Redpanda</option>
              <option value="http">HTTP API</option>
            </select>
          </label>
          <label className="glass-label">Name
            <input className="glass-input" value={name} onChange={e => setName(e.target.value)} placeholder="warehouse" required />
          </label>
          {provider === 'postgres' || provider === 'mysql' ? (
            <>
              <input className="glass-input" placeholder="host" value={f.host ?? ''} onChange={set('host')} />
              <input className="glass-input" placeholder={`port (${provider === 'postgres' ? 5432 : 3306})`} value={f.port ?? ''} onChange={set('port')} />
              <input className="glass-input" placeholder="database" value={f.database ?? ''} onChange={set('database')} />
              <input className="glass-input" placeholder="user" value={f.user ?? ''} onChange={set('user')} />
              <input className="glass-input" type="password" placeholder="password" value={f.password ?? ''} onChange={set('password')} />
              <select className="glass-select" value={f.sslMode ?? 'disable'} onChange={e => setF(s => ({ ...s, sslMode: e.target.value }))}>
                <option value="disable">SSL disabled</option>
                <option value="require">SSL required</option>
                <option value="verify-full">SSL verify certificate</option>
              </select>
            </>
          ) : provider === 'mongodb' ? (
            <>
              <input className="glass-input" placeholder="host" value={f.host ?? ''} onChange={set('host')} required />
              <input className="glass-input" placeholder="port (27017)" value={f.port ?? ''} onChange={set('port')} />
              <input className="glass-input" placeholder="database" value={f.database ?? ''} onChange={set('database')} required />
              <input className="glass-input" placeholder="user (optional)" value={f.user ?? ''} onChange={set('user')} />
              <input className="glass-input" type="password" placeholder="password" value={f.password ?? ''} onChange={set('password')} />
              <input className="glass-input" placeholder="auth source (admin)" value={f.authSource ?? ''} onChange={set('authSource')} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.tls === 'true'} onChange={e => setF(s => ({ ...s, tls: String(e.target.checked) }))} /> TLS / SRV</label>
            </>
          ) : provider === 'clickhouse' ? (
            <>
              <input className="glass-input" type="url" placeholder="https://clickhouse.example.com:8443" value={f.url ?? ''} onChange={set('url')} required />
              <input className="glass-input" placeholder="database (default)" value={f.database ?? ''} onChange={set('database')} />
              <input className="glass-input" placeholder="username (default)" value={f.username ?? ''} onChange={set('username')} />
              <input className="glass-input" type="password" placeholder="password" value={f.password ?? ''} onChange={set('password')} />
            </>
          ) : provider === 's3' ? (
            <>
              <input className="glass-input" placeholder="region (us-east-1)" value={f.region ?? ''} onChange={set('region')} />
              <input className="glass-input" placeholder="endpoint (optional)" value={f.endpoint ?? ''} onChange={set('endpoint')} />
              <input className="glass-input" placeholder="access key ID" value={f.accessKeyId ?? ''} onChange={set('accessKeyId')} required />
              <input className="glass-input" type="password" placeholder="secret access key" value={f.secretAccessKey ?? ''} onChange={set('secretAccessKey')} required />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.forcePathStyle === 'true'} onChange={e => setF(s => ({ ...s, forcePathStyle: String(e.target.checked) }))} /> Path-style URLs (MinIO/S3-compatible)</label>
            </>
          ) : provider === 'kafka' ? (
            <>
              <input className="glass-input" placeholder="brokers (kafka-1:9092,kafka-2:9092)" value={f.brokers ?? ''} onChange={set('brokers')} required />
              <input className="glass-input" placeholder="client ID (dataflow)" value={f.clientId ?? ''} onChange={set('clientId')} />
              <select className="glass-select" value={f.saslMechanism ?? 'none'} onChange={e => setF(s => ({ ...s, saslMechanism: e.target.value }))}>
                <option value="none">No SASL</option><option value="plain">SASL/PLAIN</option>
                <option value="scram-sha-256">SCRAM-SHA-256</option><option value="scram-sha-512">SCRAM-SHA-512</option>
              </select>
              {f.saslMechanism && f.saslMechanism !== 'none' && <>
                <input className="glass-input" placeholder="SASL username" value={f.username ?? ''} onChange={set('username')} required />
                <input className="glass-input" type="password" placeholder="SASL password" value={f.password ?? ''} onChange={set('password')} required />
              </>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.tls === 'true'} onChange={e => setF(s => ({ ...s, tls: String(e.target.checked) }))} /> TLS</label>
            </>
          ) : (
            <>
              <input className="glass-input" placeholder="base URL" value={f.baseUrl ?? ''} onChange={set('baseUrl')} />
              <input className="glass-input" type="password" placeholder="API key (optional)" value={f.apiKey ?? ''} onChange={set('apiKey')} />
            </>
          )}
          {err && <p className="text-xs text-danger/90 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="glass-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="glass-btn-primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Individual connector card ────────────────────────────────────────────────

interface CardProps {
  provider: Provider;
  label: string;
  connections: Connection[];
  onDisconnect: (id: string) => Promise<void>;
  onConnect: () => void;
}

function ConnectorCard({ provider, label, connections, onDisconnect, onConnect }: CardProps) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const handleDisconnect = async (id: string) => {
    setDisconnecting(id);
    try {
      await onDisconnect(id);
    } finally {
      setDisconnecting(null);
    }
  };

  const hasConnections = connections.length > 0;

  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ProviderIcon provider={provider} />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base">{label}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {provider === 'zendesk' ? 'Per-subdomain OAuth' : 'OAuth 2.0'}
          </p>
        </div>
        {hasConnections ? (
          <span className="glass-badge-success">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1" />
            Active
          </span>
        ) : (
          <span className="glass-badge">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-white/30 mr-1" />
            Not connected
          </span>
        )}
      </div>

      {/* Connected accounts */}
      {hasConnections && (
        <ul className="divide-y divide-gray-100 dark:divide-white/5">
          {connections.map(conn => (
            <li key={conn.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-gray-900 dark:text-white/90">
                  {conn.email ?? conn.subdomain ?? conn.id}
                  {conn.subdomain && (
                    <span className="text-gray-400 dark:text-white/40 ml-1">.zendesk.com</span>
                  )}
                </p>
                {conn.connected_at && (
                  <p className="text-xs text-gray-400 dark:text-white/40">Connected {timeAgo(conn.connected_at)}</p>
                )}
              </div>
              <button
                className="glass-btn-danger ml-3 px-2.5 py-1 text-xs flex-shrink-0"
                disabled={disconnecting === conn.id}
                onClick={() => handleDisconnect(conn.id)}
                title="Disconnect"
              >
                {disconnecting === conn.id ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Action row */}
      {!hasConnections && (
        <div className="pt-1">
          <button className="glass-btn-primary w-full" onClick={onConnect}>
            Connect {label} →
          </button>
        </div>
      )}

      {/* Zendesk extra: add another subdomain */}
      {provider === 'zendesk' && (
        <button
          className="glass-btn-ghost text-sm flex items-center gap-1.5 self-start"
          onClick={onConnect}
        >
          <span className="text-brand-400">+</span>
          Connect another Zendesk subdomain
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ConnectorsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zendeskModalOpen, setZendeskModalOpen] = useState(false);
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [cdcResources, setCdcResources] = useState<Record<string, string>>({});
  const [cdcStatus, setCdcStatus] = useState<Record<string, any>>({});
  const [cdcBusy, setCdcBusy] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const credentials = connections.filter(c => c.kind === 'credential');
  const testConn = async (id: string) => {
    setTestResult(r => ({ ...r, [id]: 'testing…' }));
    try {
      const res = await api.testConnector(id);
      setTestResult(r => ({ ...r, [id]: `${res.ok ? 'Passed' : 'Failed'}: ${res.message}` }));
    } catch (e: any) { setTestResult(r => ({ ...r, [id]: `Failed: ${e.message ?? 'failed'}` })); }
  };
  const removeCred = async (id: string) => { await api.deleteConnector(id); refresh(); };
  const refreshCdc = async (id: string) => {
    setCdcBusy(id);
    try { const status = await api.getConnectorCdc(id); setCdcStatus(s => ({ ...s, [id]: status })); }
    catch (e: any) { setCdcStatus(s => ({ ...s, [id]: { error: e.message ?? 'status failed' } })); }
    finally { setCdcBusy(null); }
  };
  const saveCdc = async (id: string) => {
    const resources = (cdcResources[id] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    setCdcBusy(id);
    try { const status = await api.saveConnectorCdc(id, resources); setCdcStatus(s => ({ ...s, [id]: status })); }
    catch (e: any) { setCdcStatus(s => ({ ...s, [id]: { error: e.message ?? 'CDC setup failed' } })); }
    finally { setCdcBusy(null); }
  };
  const disableCdc = async (id: string) => {
    setCdcBusy(id);
    try { await api.deleteConnectorCdc(id); setCdcStatus(s => ({ ...s, [id]: { enabled: false } })); }
    catch (e: any) { setCdcStatus(s => ({ ...s, [id]: { error: e.message ?? 'CDC disable failed' } })); }
    finally { setCdcBusy(null); }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listConnectors();
      setConnections(list);
      setCdcResources(current => Object.fromEntries(list.map((c: Connection) => [c.id, current[c.id] ?? c.cdc?.resources?.join(', ') ?? ''])));
      setCdcStatus(current => Object.fromEntries(list.map((c: Connection) => [c.id, current[c.id] ?? c.cdc ?? { enabled: false }])));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDisconnect = async (id: string) => {
    await api.deleteConnector(id);
    setConnections(prev => prev.filter(c => c.id !== id));
  };

  const handleConnectGoogle = async () => {
    setActionBusy('google');
    try { const res = await api.startConnectorOAuth('google'); window.location.href = res.url; }
    catch (e: any) { setError(e.message); setActionBusy(null); }
  };

  const handleConnectMicrosoft = async () => {
    setActionBusy('microsoft');
    try { const res = await api.startConnectorOAuth('microsoft'); window.location.href = res.url; }
    catch (e: any) { setError(e.message); setActionBusy(null); }
  };

  const handleConnectZendesk = async (subdomain: string) => {
    const res = await api.startZendeskOAuth(subdomain);
    window.location.href = res.url;
  };

  const byProvider = (p: Provider) => connections.filter(c => c.provider === p);

  const PROVIDERS: { key: Provider; label: string; onConnect: () => void }[] = [
    { key: 'google',    label: 'Google',    onConnect: handleConnectGoogle },
    { key: 'microsoft', label: 'Microsoft', onConnect: handleConnectMicrosoft },
    { key: 'zendesk',   label: 'Zendesk',   onConnect: () => setZendeskModalOpen(true) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      {/* Page header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-heading">Connect accounts</h1>
            <p className="page-subtitle mt-1">
              OAuth integrations — tokens are stored encrypted per-tenant.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="glass-btn-ghost text-sm flex items-center gap-1.5"
              onClick={refresh}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <div className="mt-4"><ApiError message={error} onRetry={refresh} /></div>}
      </div>

      {/* Connector cards */}
      {loading && connections.length === 0 ? (
        <div className="glass-panel p-10 text-center text-gray-400 dark:text-white/40 text-sm">
          Loading connectors…
        </div>
      ) : (
        <div className="grid gap-4">
          {PROVIDERS.map(({ key, label, onConnect }) => (
            <ConnectorCard
              key={key}
              provider={key}
              label={label}
              connections={byProvider(key)}
              onDisconnect={handleDisconnect}
              onConnect={
                key === 'google' && actionBusy === 'google' ? () => {} :
                key === 'microsoft' && actionBusy === 'microsoft' ? () => {} :
                onConnect
              }
            />
          ))}
        </div>
      )}

      {/* Credentials (non-OAuth instances) */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Plug size={16} className="text-brand-300" />
            <h3 className="font-semibold text-base">Credentials</h3>
          </div>
          <button className="glass-btn-ghost text-sm" onClick={() => setCredModalOpen(true)}>+ Add credential</button>
        </div>
        {credentials.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-white/40">No credentials yet. Add a database, object store, or HTTP connection for pipeline nodes.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {credentials.map(c => {
              const supportsCdc = ['postgres', 'mysql', 'mongodb'].includes(c.provider);
              const status = cdcStatus[c.id] ?? c.cdc ?? {};
              const prerequisite = c.provider === 'postgres' ? 'Requires logical replication and pgoutput.'
                : c.provider === 'mysql' ? 'Requires ROW binlog with a replication user.'
                : 'Requires a replica set with change streams enabled.';
              return (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-gray-900 dark:text-white/90">{c.name ?? c.id} <span className="text-gray-400 dark:text-white/40">· {c.provider}</span></p>
                      {testResult[c.id] && <p className="text-xs text-gray-500 dark:text-white/50">{testResult[c.id]}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="glass-btn-ghost px-2.5 py-1 text-xs" onClick={() => testConn(c.id)}>Test</button>
                      <button className="glass-btn-danger px-2.5 py-1 text-xs" onClick={() => removeCred(c.id)} aria-label={`Delete ${c.name ?? c.provider} credential`}>✕</button>
                    </div>
                  </div>
                  {supportsCdc && (
                    <div className="mt-2 rounded-lg border border-gray-200 p-2 dark:border-white/10">
                      <label className="glass-label">CDC tables / collections
                        <input className="glass-input" value={cdcResources[c.id] ?? ''}
                          onChange={e => setCdcResources(s => ({ ...s, [c.id]: e.target.value }))}
                          placeholder={c.provider === 'mongodb' ? 'database.collection' : 'schema.table'} />
                      </label>
                      <p className="mb-2 text-[11px] text-gray-500 dark:text-white/45">Comma-separated. {prerequisite}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button className="glass-btn-primary px-2.5 py-1 text-xs" disabled={cdcBusy === c.id || !cdcResources[c.id]?.trim()} onClick={() => saveCdc(c.id)}>
                          {status.enabled ? 'Update CDC' : 'Enable CDC'}
                        </button>
                        <button className="glass-btn-ghost px-2.5 py-1 text-xs" disabled={cdcBusy === c.id} onClick={() => refreshCdc(c.id)}>Refresh status</button>
                        {status.enabled && <button className="glass-btn-danger px-2.5 py-1 text-xs" disabled={cdcBusy === c.id} onClick={() => disableCdc(c.id)}>Disable</button>}
                        <span className="text-xs text-gray-500 dark:text-white/50" role="status">
                          {cdcBusy === c.id ? 'Working…' : status.error ? `Error: ${status.error}` : status.enabled ? status.state ?? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Info panel */}
      <div className="glass-panel flex gap-3 p-5 text-xs text-gray-500 dark:text-white/50">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
        <div className="space-y-1">
        <p>
          <span className="font-medium text-gray-700 dark:text-white/70">Security note:</span>{' '}
          OAuth tokens are AES-256 encrypted and stored per-tenant. Revoking a connection
          immediately invalidates the stored token.
        </p>
        <p>
          After connecting, you can reference these accounts in your pipeline nodes.
        </p>
        </div>
      </div>

      {/* Zendesk modal */}
      {zendeskModalOpen && (
        <ZendeskModal
          onClose={() => setZendeskModalOpen(false)}
          onConnect={handleConnectZendesk}
        />
      )}

      {/* Credential modal */}
      {credModalOpen && (
        <CredentialModal onClose={() => setCredModalOpen(false)} onSaved={refresh} />
      )}
    </div>
  );
}

export default ConnectorsPage;
