import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, setAccessToken, setUnauthorizedHandler } from '../api';
import {
  deriveKEK, decryptWithKey, importKeyRaw, fromBase64url,
  exportKeyRaw, rsaEncrypt, importPublicKeyJWK,
} from '../lib/crypto';

export interface AuthUser {
  id: string;
  tenant_id?: string;
  tenantId?: string;
  email: string;
  role: 'owner' | 'member';
  email_verified?: boolean;
  emailVerified?: boolean;
  tenant_name?: string;
  // Key material returned by /me (base64url-encoded blobs)
  pbkdf2_salt?: string;
  encrypted_dek_password?: string;
  password_dek_iv?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  dek: CryptoKey | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  /** RSA-OAEP wrap the in-memory DEK with the worker's public key. Returns null if no DEK. */
  wrapDekForWorker: () => Promise<string | null>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [dek, setDek] = useState<CryptoKey | null>(null);
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
    setDek(null);
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

  async function deriveDek(password: string, u: AuthUser): Promise<void> {
    if (!u.pbkdf2_salt || !u.encrypted_dek_password || !u.password_dek_iv) return;
    try {
      const salt = fromBase64url(u.pbkdf2_salt);
      const kek = await deriveKEK(password, salt);
      const dekRaw = await decryptWithKey(u.encrypted_dek_password, u.password_dek_iv, kek);
      const key = await importKeyRaw(dekRaw);
      setDek(key);
    } catch {
      // Key material present but decryption failed — wrong password or not yet initialised.
    }
  }

  async function login(email: string, password: string) {
    const r = await api.login({ email, password });
    applySession(r.accessToken, r.user);
    // Fetch full profile (includes key material) while password is still in scope.
    try {
      const me = await api.me();
      const fullUser: AuthUser = { ...r.user, ...me.user };
      setUser(fullUser);
      await deriveDek(password, fullUser);
    } catch { /* key derivation is best-effort; auth still succeeds */ }
  }

  async function logout() {
    try { await api.logout(); } catch { /* ignore */ }
    clearSession();
  }

  async function wrapDekForWorker(): Promise<string | null> {
    if (!dek) return null;
    try {
      const { publicKeyJwk } = await api.getWorkerPublicKey();
      const workerKey = await importPublicKeyJWK(publicKeyJwk);
      const dekRaw = await exportKeyRaw(dek);
      return await rsaEncrypt(dekRaw, workerKey);
    } catch {
      return null;
    }
  }

  // Bootstrap on mount: try refresh then fetch /me for full user profile.
  useEffect(() => {
    setUnauthorizedHandler(refresh);
    (async () => {
      const ok = await refresh();
      if (ok) {
        try {
          const m = await api.me();
          setUser(u => u ? { ...u, ...m.user } : m.user);
          // DEK cannot be derived here — we don't have the password. User must
          // re-enter password on the next login after a page reload.
        } catch { /* keep refresh result */ }
      }
      setLoading(false);
    })();
    return () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, dek, login, logout, refresh, wrapDekForWorker }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, dek],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
