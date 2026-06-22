import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Pipelines', end: true },
  { to: '/connectors', label: 'Connectors' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/team', label: 'Team' },
  { to: '/billing', label: 'Billing' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen text-slate-100">
      <header className="glass-panel rounded-none border-x-0 border-t-0 px-5 h-14 flex items-center gap-6">
        <Link to="/" className="text-base font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">DataFlow</span>
        </Link>
        <nav className="flex gap-1">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm transition ${isActive ? 'bg-white/10 text-white' : 'opacity-70 hover:opacity-100 hover:bg-white/5'}`
              }>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        {user && (
          <div className="flex items-center gap-3 text-xs opacity-80">
            <span>{user.email}</span>
            <span className="glass-badge">{user.role}</span>
            <button className="glass-btn-ghost text-xs"
              onClick={async () => { await logout(); nav('/login', { replace: true }); }}>Sign out</button>
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
