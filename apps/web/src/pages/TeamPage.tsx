import { useEffect, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

interface Member { id: string; email: string; role: string; email_verified: boolean; created_at: string }
interface Invite { email: string; role: string; expires_at: string; created_at: string }

export function TeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'owner'>('member');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [m, i] = await Promise.all([api.listMembers(), api.listInvitations().catch(() => [])]);
      setMembers(m); setInvites(i);
    } catch (e: any) { setMsg(e.message); }
  };
  useEffect(() => { refresh(); }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setBusy(true);
    try {
      await api.invite({ email, role });
      setMsg(`Invited ${email}.`); setEmail('');
      refresh();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const revoke = async (email: string) => {
    setBusy(true);
    try { await api.revokeInvite(email); refresh(); }
    finally { setBusy(false); }
  };

  const isOwner = user?.role === 'owner';

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6">
        <h1 className="page-heading">Workspace team</h1>
        <p className="page-subtitle mt-1">Manage members and pending invitations.</p>
      </div>

      {isOwner && (
        <section className="glass-panel p-5 mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus size={16} className="text-brand-300" /> Invite teammate</h2>
          <form onSubmit={invite} className="flex flex-wrap gap-2 items-end">
            <label className="glass-label flex-1 min-w-[200px]">Email
              <input className="glass-input" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} placeholder="alice@example.com" />
            </label>
            <label className="glass-label">Role
              <select className="glass-select" value={role}
                onChange={e => setRole(e.target.value as any)}>
                <option value="member">member</option>
                <option value="owner">owner</option>
              </select>
            </label>
            <button className="glass-btn-primary" disabled={busy} type="submit"><UserPlus size={15} /> Send invite</button>
          </form>
          {msg && <div className="text-xs opacity-70 mt-3">{msg}</div>}
        </section>
      )}

      <section className="glass-panel p-5 mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users size={16} className="text-cyan" /> Members ({members.length})</h2>
        <ul className="text-sm divide-y divide-white/5">
          {members.map(m => (
            <li key={m.id} className="py-2 flex justify-between items-center">
              <span>{m.email}</span>
              <span className="flex gap-2 items-center">
                <span className="glass-badge">{m.role}</span>
                {!m.email_verified && <span className="text-[10px] text-amber-300">unverified</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isOwner && (
        <section className="glass-panel p-5">
          <h2 className="text-sm font-semibold mb-3">Pending invites ({invites.length})</h2>
          {invites.length === 0 ? (
            <p className="text-xs opacity-60">None.</p>
          ) : (
            <ul className="text-sm divide-y divide-white/5">
              {invites.map(i => (
                <li key={i.email} className="py-2 flex justify-between items-center">
                  <span>{i.email} <span className="glass-badge ml-2">{i.role}</span></span>
                  <button className="glass-btn-ghost text-xs" onClick={() => revoke(i.email)}>Revoke</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
