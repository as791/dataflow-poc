import { useState } from 'react';
import type { Dashboard } from './types';

interface Props {
  existing: Dashboard[];
  onClose: () => void;
  onSave: (name: string, existingId?: string) => Promise<void>;
}

export function SaveDashboardModal({ existing, onClose, onSave }: Props) {
  const [name, setName] = useState('My Dashboard');
  const [selectedId, setSelectedId] = useState<string | 'new'>('new');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onSave(name, selectedId === 'new' ? undefined : selectedId);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-modal-backdrop" onClick={onClose}>
      <div className="glass-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Save Dashboard</h2>
          <button className="glass-btn-ghost w-8 h-8 flex items-center justify-center text-lg" onClick={onClose}>×</button>
        </div>

        <div className="space-y-4">
          {existing.length > 0 && (
            <div>
              <label className="glass-label">Save as</label>
              <select className="glass-select w-full" value={selectedId}
                onChange={e => {
                  setSelectedId(e.target.value);
                  if (e.target.value !== 'new') {
                    const d = existing.find(x => x.id === e.target.value);
                    if (d) setName(d.name);
                  }
                }}>
                <option value="new">New dashboard</option>
                {existing.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="glass-label">Dashboard name</label>
            <input className="glass-input w-full" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {err && (
            <p className="text-xs text-danger/90 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{err}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="glass-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="glass-btn-primary" disabled={busy || !name.trim()} onClick={handleSave}>
            {busy ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
