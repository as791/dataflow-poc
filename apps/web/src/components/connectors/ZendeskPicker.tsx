import { useEffect, useState } from 'react';

interface Connection { id: string; provider: string; email?: string; subdomain?: string; }
interface Resource { type: string; label: string; count?: number; }

interface ZendeskPickerProps {
  value: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}

async function apiFetch(path: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function ZendeskPicker({ value, onChange }: ZendeskPickerProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connectionId = value.connectionId ?? '';
  const resource = value.resource ?? '';

  useEffect(() => {
    apiFetch('/api/connectors')
      .then((all: Connection[]) => setConnections(all.filter(c => c.provider === 'zendesk')))
      .catch(e => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    setLoading(true);
    setResources([]);
    apiFetch(`/api/connectors/zendesk/resources?connectionId=${connectionId}`)
      .then(d => setResources(d.resources ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [connectionId]);

  if (connections.length === 0 && !err) {
    return (
      <div className="text-[11px] text-white/50 mt-1">
        No Zendesk account connected.{' '}
        <a href="/connectors" className="text-brand-400 underline">Connect Zendesk →</a>
      </div>
    );
  }

  const selected = connections.find(c => c.id === connectionId);

  return (
    <div className="space-y-1.5 mt-1">
      {err && <p className="text-[10px] text-danger/80">{err}</p>}

      <select className="glass-select w-full text-xs" value={connectionId}
        onChange={e => {
          const conn = connections.find(c => c.id === e.target.value);
          onChange({ connectionId: e.target.value, subdomain: conn?.subdomain ?? '', resource: '' });
        }}>
        <option value="">— Select Zendesk account —</option>
        {connections.map(c => (
          <option key={c.id} value={c.id}>
            {c.subdomain ? `${c.subdomain}.zendesk.com` : c.email ?? c.id}
          </option>
        ))}
      </select>

      {connectionId && (
        <select className="glass-select w-full text-xs" value={resource}
          onChange={e => onChange({ connectionId, subdomain: selected?.subdomain ?? '', resource: e.target.value })}>
          <option value="">— {loading ? 'Loading…' : 'Select resource type'} —</option>
          {resources.map(r => (
            <option key={r.type} value={r.type}>
              {r.label}{r.count != null ? ` (${r.count.toLocaleString()})` : ''}
            </option>
          ))}
        </select>
      )}

      {connectionId && !resources.length && !loading && (
        <p className="text-[10px] text-white/40">
          Common types: <span
            className="text-brand-400 cursor-pointer underline"
            onClick={() => onChange({ connectionId, subdomain: selected?.subdomain ?? '', resource: 'tickets' })}
          >tickets</span>, <span
            className="text-brand-400 cursor-pointer underline"
            onClick={() => onChange({ connectionId, subdomain: selected?.subdomain ?? '', resource: 'users' })}
          >users</span>, <span
            className="text-brand-400 cursor-pointer underline"
            onClick={() => onChange({ connectionId, subdomain: selected?.subdomain ?? '', resource: 'organizations' })}
          >organizations</span>
        </p>
      )}
    </div>
  );
}
