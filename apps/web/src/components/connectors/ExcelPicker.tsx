import { useEffect, useState } from 'react';
import { SheetPreview } from './SheetPreview';

interface Connection { id: string; provider: string; email?: string; }
interface Drive { id: string; name: string; driveType?: string; }
interface DriveItem { id: string; name: string; }
interface Sheet { id: string; name: string; }

interface ExcelPickerProps {
  value: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}

async function apiFetch(path: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function ExcelPicker({ value, onChange }: ExcelPickerProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const connectionId = value.connectionId ?? '';
  const driveId = value.driveId ?? '';
  const itemId = value.itemId ?? '';
  const sheetName = value.sheetName ?? '';

  useEffect(() => {
    apiFetch('/api/connectors')
      .then((all: Connection[]) => setConnections(all.filter(c => c.provider === 'microsoft')))
      .catch(e => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    setLoading('drives');
    setDrives([]); setItems([]); setSheets([]); setPreview(null);
    apiFetch(`/api/connectors/microsoft/drives?connectionId=${connectionId}`)
      .then(d => setDrives(d.drives ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(null));
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId || !driveId) return;
    setLoading('items');
    setItems([]); setSheets([]); setPreview(null);
    apiFetch(`/api/connectors/microsoft/drives/${driveId}/items?connectionId=${connectionId}`)
      .then(d => setItems(d.items ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(null));
  }, [connectionId, driveId]);

  useEffect(() => {
    if (!connectionId || !itemId) return;
    setLoading('sheets');
    setSheets([]); setPreview(null);
    apiFetch(`/api/connectors/microsoft/workbooks/${itemId}/sheets?connectionId=${connectionId}&driveId=${driveId}`)
      .then(d => setSheets(d.sheets ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(null));
  }, [connectionId, driveId, itemId]);

  useEffect(() => {
    if (!connectionId || !itemId || !sheetName) return;
    setLoading('preview');
    setPreview(null);
    apiFetch(`/api/connectors/microsoft/workbooks/${itemId}/sheets/${encodeURIComponent(sheetName)}/preview?connectionId=${connectionId}&driveId=${driveId}`)
      .then(d => setPreview(d))
      .catch(() => {})
      .finally(() => setLoading(null));
  }, [connectionId, driveId, itemId, sheetName]);

  if (connections.length === 0 && !err) {
    return (
      <div className="text-[11px] text-white/50 mt-1">
        No Microsoft account connected.{' '}
        <a href="/connectors" className="text-brand-400 underline">Connect Microsoft →</a>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 mt-1">
      {err && <p className="text-[10px] text-danger/80">{err}</p>}

      <select className="glass-select w-full text-xs" value={connectionId}
        onChange={e => onChange({ connectionId: e.target.value, driveId: '', itemId: '', sheetName: '' })}>
        <option value="">— Select Microsoft account —</option>
        {connections.map(c => <option key={c.id} value={c.id}>{c.email ?? c.id}</option>)}
      </select>

      {connectionId && (
        <select className="glass-select w-full text-xs" value={driveId}
          onChange={e => onChange({ connectionId, driveId: e.target.value, itemId: '', sheetName: '' })}>
          <option value="">— {loading === 'drives' ? 'Loading…' : 'Select drive'} —</option>
          {drives.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}

      {driveId && (
        <select className="glass-select w-full text-xs" value={itemId}
          onChange={e => {
            const item = items.find(i => i.id === e.target.value);
            onChange({ connectionId, driveId, itemId: e.target.value, itemName: item?.name ?? '', sheetName: '' });
          }}>
          <option value="">— {loading === 'items' ? 'Loading…' : 'Select workbook'} —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      )}

      {itemId && (
        <select className="glass-select w-full text-xs" value={sheetName}
          onChange={e => onChange({ connectionId, driveId, itemId, sheetName: e.target.value })}>
          <option value="">— {loading === 'sheets' ? 'Loading…' : 'Select sheet'} —</option>
          {sheets.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      )}

      {loading === 'preview' && <p className="text-[10px] text-white/40">Loading preview…</p>}
      {preview && <SheetPreview headers={preview.headers} rows={preview.rows} />}
    </div>
  );
}
