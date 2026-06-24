import { useEffect, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-panel p-8 w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">{title}</h1>
        {subtitle && <p className="text-xs opacity-60 mb-5">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function ErrorLine({ msg }: { msg: string | null }) {
  return msg ? <div className="text-xs text-rose-300 mt-3">{msg}</div> : null;
}

function GoogleButton({ label }: { label: string }) {
  return (
    <a className="glass-btn-primary w-full mt-5 flex items-center justify-center gap-2"
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
  oauth_token: 'Could not complete Google sign-in. Please try again.',
  oauth_profile: 'Your Google account did not return a verified email.',
  oauth_failed: 'Google sign-in failed. Please try again.',
};

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation() as any;
  const [params] = useSearchParams();
  const errorCode = params.get('error');

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  return (
    <AuthShell title="Sign in" subtitle="Welcome to DataFlow.">
      <GoogleButton label="Continue with Google" />
      <ErrorLine msg={errorCode ? (OAUTH_ERRORS[errorCode] ?? 'Sign-in failed.') : null} />
      <p className="text-xs mt-5 opacity-60">
        New here? Signing in with Google creates your workspace automatically.
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
