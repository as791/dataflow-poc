import {
  BarChart3, Cable, CreditCard, History, LogOut, Menu, Moon, Network, Rocket, Sparkles, Sun, Users, Workflow, Gauge, X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV = [
  { to: '/pipelines',  label: 'Pipelines',  icon: Workflow,  end: false },
  { to: '/ai-builder', label: 'AI Builder', icon: Sparkles },
  { to: '/lifecycle',  label: 'Lifecycle',  icon: Rocket },
  { to: '/runs',       label: 'Runs',       icon: History },
  { to: '/monitoring', label: 'Monitoring', icon: Gauge },
  { to: '/lineage',    label: 'Lineage',    icon: Network },
  { to: '/connectors', label: 'Connectors', icon: Cable },
  { to: '/analytics',  label: 'Analytics',  icon: BarChart3 },
  { to: '/team',       label: 'Team',       icon: Users },
  { to: '/billing',    label: 'Billing',    icon: CreditCard },
];

const PAGE_META: Record<string, { title: string; eyebrow: string }> = {
  '/pipelines':  { title: 'Pipelines',   eyebrow: 'Build & orchestrate' },
  '/ai-builder': { title: 'AI Builder',  eyebrow: 'Generate with local AI' },
  '/lifecycle':  { title: 'Lifecycle',   eyebrow: 'Promote & gate' },
  '/runs':       { title: 'Runs',        eyebrow: 'History & observability' },
  '/monitoring': { title: 'Monitoring',  eyebrow: 'Reliability & health' },
  '/lineage':    { title: 'Lineage',     eyebrow: 'Workspace architecture' },
  '/connectors': { title: 'Connectors',  eyebrow: 'Data sources' },
  '/analytics':  { title: 'Analytics',   eyebrow: 'Explore outcomes' },
  '/team':       { title: 'Team',        eyebrow: 'Workspace access' },
  '/billing':    { title: 'Billing',     eyebrow: 'Usage & plan' },
};

export function AppShell() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const meta = PAGE_META[pathname] ?? PAGE_META[Object.keys(PAGE_META).find(k => pathname.startsWith(k + '/')) ?? ''] ?? PAGE_META['/pipelines'];
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'DF';

  return (
    <div className="canvas-root flex h-screen overflow-hidden">
      {/* ── mobile nav overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 flex w-[200px] flex-col items-center gap-1 py-3
            border-r border-gray-200 dark:border-white/[0.08]
            bg-white/98 dark:bg-[#0d0f17]/98 backdrop-blur-lg">
            <button className="self-end mr-2 mb-2 flex h-8 w-8 items-center justify-center rounded-[10px] text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]" onClick={() => setSidebarOpen(false)}><X size={15} /></button>
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `flex w-[180px] items-center gap-3 px-3 h-9 rounded-[10px] border transition-all ${
                  isActive ? 'border-brand-300/20 bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'border-transparent text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/[0.055]'
                }`}>
                <Icon size={17} strokeWidth={1.75} />
                <span className="text-sm font-medium">{label}</span>
              </NavLink>
            ))}
          </aside>
        </div>
      )}

      {/* ── sidebar: 52px compact glass, matches canvas ── */}
      <aside className="hidden sm:flex w-[52px] flex-none flex-col items-center gap-1 py-3
        border-r border-gray-200 dark:border-white/[0.08]
        bg-white/95 dark:bg-[#0d0f17]/95 backdrop-blur-lg shrink-0">

        {/* brand mark */}
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px]
          bg-gradient-to-br from-brand-400 to-brand-600 shadow-md shadow-brand-500/20">
          <Workflow size={16} className="text-white" strokeWidth={2} />
        </div>
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />

        {/* nav */}
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} aria-label={label} title={label}
              className={({ isActive }) =>
                `group relative flex h-9 w-9 items-center justify-center rounded-[10px] border transition-all ${
                  isActive
                    ? 'border-brand-300/20 bg-brand-500/15 text-brand-500 dark:text-brand-300 shadow-[0_0_24px_rgba(124,108,242,.12)]'
                    : 'border-transparent text-gray-400 dark:text-white/40 hover:border-gray-200 dark:hover:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.055] hover:text-gray-700 dark:hover:text-white/85'
                }`
              }>
              <Icon size={17} strokeWidth={1.75} />
              <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2 py-1 text-[11px] text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />
        <div className="my-1 h-px w-8 bg-gray-200 dark:bg-white/[0.08]" />

        {/* bottom */}
        <button onClick={toggle} title={dark ? 'Light mode' : 'Dark mode'}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-gray-200 dark:border-white/[0.08]
            bg-gray-50 dark:bg-white/[0.04] text-gray-400 dark:text-white/40
            hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-white transition-all">
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button title={user?.email}
          onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-white/[0.1]
            bg-gray-50 dark:bg-white/[0.06] text-[11px] font-semibold text-gray-600 dark:text-white/70
            hover:border-gray-300 dark:hover:border-white/20 hover:text-gray-900 dark:hover:text-white">
          {initials}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#0a0c12] bg-emerald-400" />
        </button>
        <button onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
          title="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border-transparent
            text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white transition-all">
          <LogOut size={15} />
        </button>
      </aside>

      {/* ── content ── */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        <header className="flex items-center px-4 sm:px-6 h-14 border-b border-gray-200 dark:border-white/[0.06]
          bg-white/90 dark:bg-black/20 backdrop-blur-lg shrink-0">
          <button className="flex sm:hidden h-8 w-8 items-center justify-center rounded-[10px] text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] mr-2" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <Menu size={18} />
          </button>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[.18em] text-gray-400 dark:text-white/30">{meta.eyebrow}</p>
            <h1 className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white/90">{meta.title}</h1>
          </div>
          <div className="flex-1" />
          <div className="hidden items-center gap-2.5 text-[11px] text-gray-400 dark:text-white/40 sm:flex">
            <span>{user?.email}</span>
            <span className="glass-badge">{user?.role}</span>
          </div>
          <button onClick={toggle} className="ml-2 icon-button sm:hidden" title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  );
}
