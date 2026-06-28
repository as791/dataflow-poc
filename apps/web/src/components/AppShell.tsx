import {
  BarChart3, Boxes, Cable, CreditCard, History, LogOut, Moon, Rocket, Sparkles, Sun, Users, Workflow,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { to: '/', label: 'Pipelines', icon: Workflow, end: true },
  { to: '/ai-builder', label: 'AI Builder', icon: Sparkles },
  { to: '/lifecycle', label: 'Lifecycle', icon: Rocket },
  { to: '/runs', label: 'Runs', icon: History },
  { to: '/connectors', label: 'Connectors', icon: Cable },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/billing', label: 'Billing', icon: CreditCard },
];

const pageMeta: Record<string, { title: string; eyebrow: string }> = {
  '/': { title: 'Pipeline Studio', eyebrow: 'Build & orchestrate' },
  '/ai-builder': { title: 'AI Builder', eyebrow: 'Generate with local AI' },
  '/lifecycle': { title: 'Lifecycle', eyebrow: 'Promote & gate' },
  '/runs': { title: 'Runs', eyebrow: 'History & observability' },
  '/connectors': { title: 'Connectors', eyebrow: 'Data sources' },
  '/analytics': { title: 'Analytics', eyebrow: 'Explore outcomes' },
  '/team': { title: 'Team', eyebrow: 'Workspace access' },
  '/billing': { title: 'Billing', eyebrow: 'Usage & plan' },
};

export function AppShell() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const meta = pageMeta[location.pathname] ?? pageMeta['/'];
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'DF';

  return (
    <div className="min-h-screen text-gray-900 dark:text-slate-100">
      <aside className="glass-shell fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col items-center border-y-0 border-l-0 md:flex">
        <Link
          to="/"
          aria-label="DataFlow home"
          className="mt-4 flex h-11 w-11 items-center justify-center rounded-[14px] border border-brand-300/20 bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/20">
          <Boxes size={20} strokeWidth={1.8} className="text-white" />
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                `group relative flex h-11 w-11 items-center justify-center rounded-[12px] border transition-all duration-200 ${
                  isActive
                    ? 'border-brand-300/20 bg-brand-500/15 text-brand-500 dark:text-brand-300 shadow-[0_0_24px_rgba(124,108,242,.12)]'
                    : 'border-transparent text-gray-400 dark:text-white/40 hover:border-gray-200 dark:hover:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.055] hover:text-gray-700 dark:hover:text-white/85'
                }`
              }>
              <Icon size={19} strokeWidth={1.75} />
              <span className="pointer-events-none absolute left-[52px] z-50 whitespace-nowrap rounded-lg border border-gray-200 dark:border-white/10 bg-gray-900/95 px-2.5 py-1.5 text-xs text-white/90 opacity-0 shadow-xl backdrop-blur-xl transition group-hover:opacity-100">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="mb-4 flex flex-col items-center gap-2">
          {/* Dark mode toggle */}
          <button
            onClick={toggle}
            className="group relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.06] text-gray-500 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.1] hover:text-gray-700 dark:hover:text-white transition-all"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.06] text-xs font-semibold text-gray-600 dark:text-white/70 hover:border-gray-300 dark:hover:border-white/20 hover:text-gray-900 dark:hover:text-white"
            title={user?.email}>
            {initials}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#0a0c12] bg-emerald-400" />
          </button>
          <button
            className="icon-button h-9 w-9 border-transparent bg-transparent"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="md:pl-[76px]">
        <header className="glass-shell sticky top-0 z-30 flex h-16 items-center border-x-0 border-t-0 px-4 md:px-6">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-white/30">{meta.eyebrow}</p>
            <h1 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white/90">{meta.title}</h1>
          </div>
          <div className="flex-1" />
          <div className="hidden items-center gap-3 text-xs text-gray-400 dark:text-white/40 sm:flex">
            <span>{user?.email}</span>
            <span className="glass-badge">{user?.role}</span>
          </div>
          {/* Mobile theme toggle */}
          <button
            onClick={toggle}
            className="ml-2 icon-button sm:hidden"
            title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <nav className="ml-3 flex gap-1 md:hidden">
            {navItems.slice(0, 4).map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={label}
                className={({ isActive }) => `icon-button border-transparent ${isActive ? 'bg-brand-500/15 text-brand-500 dark:text-brand-300' : 'bg-transparent'}`}>
                <Icon size={17} />
              </NavLink>
            ))}
          </nav>
        </header>
        <main><Outlet /></main>
      </div>
    </div>
  );
}
