import { useEffect, useState } from 'react';
import { SheetPreview } from './SheetPreview';

interface Connection { id: string; provider: string; email?: string; }
interface Spreadsheet { id: string; name: string; }
interface Sheet { name: string; }

interface SheetPickerProps {
  value: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}

async function apiFetch(path: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function SheetPicker({ value, onChange }: SheetPickerProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const connectionId = value.connectionId ?? '';
  const spreadsheetId = value.spreadsheetId ?? '';
  const sheetName = value.sheetName ?? '';

  // Load connections once
  useEffect(() => {
    apiFetch('/api/connectors')
      .then((all: Connection[]) => setConnections(all.filter(c => c.provider === 'google')))
      .catch(e => setErr(e.message));
  }, []);

  // Load spreadsheets when connection changes
  useEffect(() => {
    if (!connectionId) return;
    setLoading('sheets');
    setSpreadsheets([]);
    setSheets([]);
    setPreview(null);
    apiFetch(`/api/connectors/google/spreadsheets?connectionId=${connectionId}`)
      .then(d => setSpreadsheets(d.files ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(null));
  }, [connectionId]);

  // Load sheet tabs when spreadsheet changes
  useEffect(() => {
    if (!connectionId || !spreadsheetId) return;
    setLoading('tabs');
    setSheets([]);
    setPreview(null);
    apiFetch(`/api/connectors/google/spreadsheets/${spreadsheetId}/sheets?connectionId=${connectionId}`)
      .then(d => { setSheets(d.sheets ?? []); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(null));
  }, [connectionId, spreadsheetId]);

  // Load preview when sheet changes
  useEffect(() => {
    if (!connectionId || !spreadsheetId || !sheetName) return;
    setLoading('preview');
    setPreview(null);
    apiFetch(`/api/connectors/google/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/preview?connectionId=${connectionId}`)
      .then(d => setPreview(d))
      .catch(() => { /* preview is optional */ })
      .finally(() => setLoading(null));
  }, [connectionId, spreadsheetId, sheetName]);

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
        onChange={e => { onChange({ connectionId: e.target.value, spreadsheetId: '', sheetName: '', range: '' }); }}>
        <option value="">— Select Google account —</option>
        {connections.map(c => <option key={c.id} value={c.id}>{c.email ?? c.id}</option>)}
      </select>

      {connectionId && (
        <select className="glass-select w-full text-xs"
          value={spreadsheetId}
          onChange={e => {
            const file = spreadsheets.find(s => s.id === e.target.value);
            onChange({ connectionId, spreadsheetId: e.target.value, spreadsheetName: file?.name ?? '', sheetName: '', range: '' });
          }}>
          <option value="">— {loading === 'sheets' ? 'Loading…' : 'Select spreadsheet'} —</option>
          {spreadsheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {spreadsheetId && (
        <select className="glass-select w-full text-xs"
          value={sheetName}
          onChange={e => onChange({ connectionId, spreadsheetId, sheetName: e.target.value, range: `${e.target.value}!A:Z` })}>
          <option value="">— {loading === 'tabs' ? 'Loading…' : 'Select sheet tab'} —</option>
          {sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      )}

      {sheetName && (
        <input className="glass-input w-full text-xs"
          placeholder="Range e.g. A:Z"
          value={value.range ?? ''}
          onChange={e => onChange({ connectionId, spreadsheetId, sheetName, range: e.target.value })} />
      )}

      {loading === 'preview' && <p className="text-[10px] text-white/40">Loading preview…</p>}
      {preview && <SheetPreview headers={preview.headers} rows={preview.rows} />}
    </div>
  );
}
