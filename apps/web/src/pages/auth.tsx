import { useEffect, useState } from 'react';
import { Boxes, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden px-4"
      style={{ background: 'linear-gradient(145deg, #080a10 0%, #0b0e17 48%, #080a10 100%)' }}>
      <div className="absolute left-[12%] top-[-12%] h-[420px] w-[420px] rounded-full bg-brand-500/15 blur-[110px]" />
      <div className="absolute bottom-[-15%] right-[8%] h-[360px] w-[360px] rounded-full bg-cyan/10 blur-[120px]" />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md rounded-[24px] border border-white/[0.1] bg-[#10131c]/78 p-8 shadow-glass-glow backdrop-blur-2xl">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/20">
              <Boxes size={20} />
            </span>
            <div><p className="text-sm font-semibold">DataFlow</p><p className="text-[10px] uppercase tracking-[.16em] text-white/30">Orchestration cloud</p></div>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-white/40">{subtitle}</p>}
          {children}
          <div className="mt-7 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-[10px] text-white/30">
            <ShieldCheck size={13} /> Secure OAuth · tenant-isolated workspace
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorLine({ msg }: { msg: string | null }) {
  return msg ? <div className="text-xs text-rose-300 mt-3">{msg}</div> : null;
}

function GoogleButton({ label }: { label: string }) {
  return (
    <a className="glass-btn-primary mt-6 w-full"
       href="/api/auth/google">
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"/>
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
      </svg>
      {label}
    </a>
  );
}

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: 'Sign-in session expired. Please try again.',
  oauth_token: 'Could not complete sign-in. Please try again.',
  oauth_profile: 'Your account did not return a verified email.',
  oauth_failed: 'Sign-in failed. Please try again.',
  oidc_token: 'Could not complete SSO sign-in. Please try again.',
  oidc_userinfo: 'Could not retrieve your SSO profile. Please try again.',
  oidc_profile: 'Your SSO account did not return a verified email.',
  oidc_failed: 'SSO sign-in failed. Please try again.',
};

// Show SSO button only when the API is configured with an OIDC provider.
// We detect this by checking if VITE_OIDC_ENABLED=true is set at build time.
const OIDC_ENABLED = import.meta.env.VITE_OIDC_ENABLED === 'true';

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation() as any;
  const [params] = useSearchParams();
  const errorCode = params.get('error');

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  return (
    <AuthShell title="Sign in" subtitle="Welcome to DataFlow.">
      <GoogleButton label="Continue with Google" />
      {OIDC_ENABLED && (
        <a className="glass-btn-ghost mt-2 w-full" href="/api/auth/oidc">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Continue with SSO
        </a>
      )}
      <ErrorLine msg={errorCode ? (OAUTH_ERRORS[errorCode] ?? 'Sign-in failed.') : null} />
      <p className="text-xs mt-5 opacity-60">
        New here? Signing in creates your workspace automatically.
      </p>
    </AuthShell>
  );
}

// ─── AcceptInvitePage ─────────────────────────────────────────────────────────

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [info, setInfo] = useState<{ email: string; role: string; tenantName: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setErr('Missing token.'); return; }
    api.inviteInfo(token).then(setInfo).catch(e => setErr(e.message || 'Invalid invite.'));
  }, [token]);

  if (err && !info) return (
    <AuthShell title="Invite problem"><p className="text-sm text-rose-300">{err}</p></AuthShell>
  );
  if (!info) return <AuthShell title="Loading invite…"><p className="text-sm opacity-70">One moment…</p></AuthShell>;

  return (
    <AuthShell title={`Join ${info.tenantName}`}
      subtitle={`You've been invited as ${info.role}. Sign in with the Google account for ${info.email}.`}>
      <GoogleButton label="Continue with Google" />
    </AuthShell>
  );
}
