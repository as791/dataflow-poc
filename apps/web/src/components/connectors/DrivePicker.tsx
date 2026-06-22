import { useEffect, useState } from 'react';

interface Connection { id: string; provider: string; email?: string; }
interface Folder { id: string; name: string; }

interface DrivePickerProps {
  value: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}

async function apiFetch(path: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function DrivePicker({ value, onChange }: DrivePickerProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const connectionId = value.connectionId ?? '';
  const folderId = value.folderId ?? '';

  useEffect(() => {
    apiFetch('/api/connectors')
      .then((all: Connection[]) => setConnections(all.filter(c => c.provider === 'google')))
      .catch(e => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    setLoading(true);
    setFolders([]);
    apiFetch(`/api/connectors/google/drive/folders?connectionId=${connectionId}`)
      .then(d => setFolders(d.folders ?? d.files ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [connectionId]);

  if (connections.length === 0 && !err) {
    return (
      <div className="text-[11px] text-white/50 mt-1">
        No Google account connected.{' '}
        <a href="/connectors" className="text-brand-400 underline">Connect Google →</a>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 mt-1">
      {err && <p className="text-[10px] text-danger/80">{err}</p>}

      <select className="glass-select w-full text-xs"
        value={connectionId}
        onChange={e => onChange({ connectionId: e.target.value, folderId: '', folderName: '' })}>
        <option value="">— Select Google account —</option>
        {connections.map(c => <option key={c.id} value={c.id}>{c.email ?? c.id}</option>)}
      </select>

      {connectionId && (
        <>
          <select className="glass-select w-full text-xs"
            value={folderId}
            onChange={e => {
              const folder = folders.find(f => f.id === e.target.value);
              onChange({ connectionId, folderId: e.target.value, folderName: folder?.name ?? '' });
            }}>
            <option value="">— {loading ? 'Loading…' : 'Select folder (or leave blank for root)'} —</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          <input className="glass-input w-full text-xs"
            placeholder="Query filter (optional, e.g. mimeType='text/csv')"
            value={value.query ?? ''}
            onChange={e => onChange({ connectionId, folderId, query: e.target.value })} />
        </>
      )}
    </div>
  );
}
