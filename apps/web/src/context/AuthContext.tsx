import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, setAccessToken, setUnauthorizedHandler } from '../api';

export interface AuthUser {
  id: string;
  tenant_id?: string;
  tenantId?: string;
  email: string;
  role: 'owner' | 'member';
  email_verified?: boolean;
  emailVerified?: boolean;
  tenant_name?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<number | null>(null);

  const scheduleRefresh = () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => { refresh().catch(() => {}); }, 14 * 60 * 1000);
  };

  const applySession = (accessToken: string, u: AuthUser) => {
    setAccessToken(accessToken);
    setUser(u);
    scheduleRefresh();
  };

  const clearSession = () => {
    setAccessToken(null);
    setUser(null);
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
  };

  async function refresh(): Promise<boolean> {
    try {
      const r = await api.refresh();
      applySession(r.accessToken, r.user);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }

  async function logout() {
    try { await api.logout(); } catch { /* ignore */ }
    clearSession();
  }

  // Bootstrap on mount: exchange the refresh cookie (set by the Google OAuth
  // callback) for an access token, then load the full user profile.
  useEffect(() => {
    setUnauthorizedHandler(refresh);
    (async () => {
      const ok = await refresh();
      if (ok) {
        try {
          const m = await api.me();
          setUser(u => u ? { ...u, ...m.user } : m.user);
        } catch { /* keep refresh result */ }
      }
      setLoading(false);
    })();
    return () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, logout, refresh }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
