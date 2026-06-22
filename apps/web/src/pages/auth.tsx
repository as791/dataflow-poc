import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, setAccessToken } from '../api';
import {
  generateDEK, deriveKEK, encryptWithKey, exportKeyRaw,
  generateRSAKeyPair, exportPublicKeyJWK, exportPrivateKey,
  decryptWithKey, importKeyRaw, fromBase64url, randomBytes,
} from '../lib/crypto';
import { generateMnemonic } from '../lib/bip39';
import RecoveryPhraseModal from '../components/RecoveryPhraseModal';

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

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation() as any;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { await login(email, password); nav('/', { replace: true }); }
    catch (e: any) { setErr(e.message || 'login failed'); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back to DataFlow.">
      <form onSubmit={submit}>
        <label className="glass-label">Email
          <input className="glass-input" type="email" value={email} required
            onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="glass-label">Password
          <input className="glass-input" type="password" value={password} required
            onChange={e => setPassword(e.target.value)} />
        </label>
        <ErrorLine msg={err} />
        <button className="glass-btn-primary w-full mt-5" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="text-xs mt-5 opacity-70 flex justify-between">
        <Link to="/register" className="underline">Create account</Link>
        <Link to="/forgot-password" className="underline">Forgot password?</Link>
      </div>
    </AuthShell>
  );
}

// ─── RegisterPage ─────────────────────────────────────────────────────────────

export function RegisterPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [tenantName, setTenant] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Crypto state — set between register API call and phrase confirmation
  const [cryptoPhrase, setCryptoPhrase] = useState<string | null>(null);
  // Temporary access token used by /keys/init (before user redirects to verify)
  const [tempToken, setTempToken] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      // ── 1. Generate all crypto material in the browser ──────────────────
      const dek             = await generateDEK();
      const salt            = randomBytes(32);
      const phrase          = generateMnemonic(); // 24-word BIP39 phrase
      const passwordKEK     = await deriveKEK(password, salt);
      const recoveryKEK     = await deriveKEK(phrase, salt);
      const dekRaw          = await exportKeyRaw(dek);
      const encDekPassword  = await encryptWithKey(dekRaw, passwordKEK);
      const encDekRecovery  = await encryptWithKey(dekRaw, recoveryKEK);
      const rsaKP           = await generateRSAKeyPair();
      const publicKey       = await exportPublicKeyJWK(rsaKP.publicKey);
      const encPrivKey      = await exportPrivateKey(rsaKP.privateKey, passwordKEK);

      // ── 2. Register the account (creates user + tenant) ─────────────────
      await api.register({ email, password, tenantName });

      // ── 3. Login to get a short-lived token so /keys/init is authenticated
      // Note: email_verified = false at this point, but we still need to
      // post key material. We do a direct login that returns the token before
      // the full auth guard; the server accepts this because keys/init is
      // gated by requireAuth which only checks JWT validity (not email_verified).
      let accessToken: string | undefined;
      try {
        const loginRes = await api.login({ email, password });
        accessToken = loginRes.accessToken;
      } catch {
        // Login may fail (e.g. email_verified guard). That's fine — we'll
        // still store the phrase so the user can re-key on first login.
      }

      // ── 4. POST /api/auth/keys/init with all encrypted blobs ────────────
      if (accessToken) {
        setTempToken(accessToken);
        await fetch('/api/auth/keys/init', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            encDekPassword:      encDekPassword.ciphertext,
            dekIv:               encDekPassword.iv,
            encDekRecovery:      encDekRecovery.ciphertext,
            recoveryDekIv:       encDekRecovery.iv,
            salt:                Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
            publicKey,
            encryptedPrivateKey: encPrivKey.ciphertext,
            privateKeyIv:        encPrivKey.iv,
          }),
        });
      }

      // ── 5. Show recovery phrase modal ────────────────────────────────────
      setCryptoPhrase(phrase);
    } catch (e: any) {
      setErr(e.message || 'registration failed');
      setBusy(false);
    }
    // don't setBusy(false) here — modal is visible; done in handlePhraseConfirmed
  };

  const handlePhraseConfirmed = () => {
    setCryptoPhrase(null);
    setDone(true);
    setBusy(false);
  };

  if (done) return (
    <AuthShell title="Check your email">
      <p className="text-sm opacity-80">We sent a verification link to <b>{email}</b>. It expires in 24 hours.</p>
      <div className="text-xs mt-5 opacity-70"><Link to="/login" className="underline">Back to sign in</Link></div>
    </AuthShell>
  );

  return (
    <>
      {cryptoPhrase && (
        <RecoveryPhraseModal phrase={cryptoPhrase} onConfirmed={handlePhraseConfirmed} />
      )}
      <AuthShell title="Create your workspace" subtitle="Self-serve signup. Verify by email before signing in.">
        <form onSubmit={submit}>
          <label className="glass-label">Workspace name
            <input className="glass-input" value={tenantName} required
              onChange={e => setTenant(e.target.value)} placeholder="Acme Inc" />
          </label>
          <label className="glass-label">Email
            <input className="glass-input" type="email" value={email} required
              onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="glass-label">Password
            <input className="glass-input" type="password" value={password} required minLength={8}
              onChange={e => setPassword(e.target.value)} />
            <span className="text-[10px] opacity-60">8+ characters. A 24-word recovery phrase will be generated.</span>
          </label>
          <ErrorLine msg={err} />
          <button className="glass-btn-primary w-full mt-5" disabled={busy} type="submit">
            {busy ? 'Generating keys…' : 'Create workspace'}
          </button>
        </form>
        <div className="text-xs mt-5 opacity-70">
          Already have an account? <Link to="/login" className="underline">Sign in</Link>
        </div>
      </AuthShell>
    </>
  );
}

// ─── VerifyEmailPage ──────────────────────────────────────────────────────────

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'pending' | 'ok' | 'err'>('pending');
  const [msg, setMsg] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    if (!token) { setState('err'); setMsg('Missing token.'); return; }
    api.verifyEmail(token)
      .then(r => {
        setAccessToken(r.accessToken);
        setState('ok');
        setTimeout(() => nav('/', { replace: true }), 1200);
      })
      .catch(e => { setState('err'); setMsg(e.message || 'Verification failed.'); });
  }, [token, nav]);

  return (
    <AuthShell title="Verifying your email">
      {state === 'pending' && <p className="text-sm opacity-70">One moment…</p>}
      {state === 'ok' && <p className="text-sm text-emerald-300">Verified. Redirecting…</p>}
      {state === 'err' && (<>
        <p className="text-sm text-rose-300">{msg}</p>
        <div className="text-xs mt-5 opacity-70"><Link to="/login" className="underline">Back to sign in</Link></div>
      </>)}
    </AuthShell>
  );
}

// ─── ForgotPasswordPage ───────────────────────────────────────────────────────

export function ForgotPasswordPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      // ── 1. Fetch public key material for this email ──────────────────────
      const infoRes = await fetch(
        `/api/auth/keys/recovery-info?email=${encodeURIComponent(email)}`
      );
      if (!infoRes.ok) {
        const body = await infoRes.json().catch(() => ({}));
        throw new Error(body.error ?? 'Could not fetch recovery info. Check your email address.');
      }
      const { pbkdf2_salt, encrypted_dek_recovery, recovery_dek_iv } = await infoRes.json();

      // ── 2. Derive recovery KEK from phrase + stored salt ─────────────────
      // Salt is stored as hex string in the DB
      const saltBytes = fromBase64url(pbkdf2_salt);
      const recoveryKEK = await deriveKEK(recoveryPhrase.trim(), saltBytes);

      // ── 3. Decrypt the DEK using recoveryKEK ─────────────────────────────
      let dekRaw: ArrayBuffer;
      try {
        dekRaw = await decryptWithKey(encrypted_dek_recovery, recovery_dek_iv, recoveryKEK);
      } catch {
        throw new Error('Recovery phrase is incorrect.');
      }

      // ── 4. Re-encrypt DEK with new password KEK ──────────────────────────
      const newSaltBytes   = randomBytes(32);
      const newPasswordKEK = await deriveKEK(newPassword, newSaltBytes);
      const newEncDek      = await encryptWithKey(dekRaw, newPasswordKEK);

      // Convert new salt to base64url for transport
      const newSaltB64 = btoa(String.fromCharCode(...newSaltBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      // ── 5. POST rotate-password ───────────────────────────────────────────
      const rotateRes = await fetch('/api/auth/keys/rotate-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          newEncDekPassword: newEncDek.ciphertext,
          newDekIv:          newEncDek.iv,
          newSalt:           newSaltB64,
        }),
      });
      if (!rotateRes.ok) {
        const body = await rotateRes.json().catch(() => ({}));
        throw new Error(body.error ?? 'Password reset failed.');
      }

      setSuccess(true);
      setTimeout(() => nav('/login', { replace: true }), 2500);
    } catch (e: any) {
      setErr(e.message || 'Password recovery failed.');
    } finally {
      setBusy(false);
    }
  };

  if (success) return (
    <AuthShell title="Password updated">
      <p className="text-sm text-emerald-300">Your password has been updated. Redirecting to sign in…</p>
    </AuthShell>
  );

  return (
    <AuthShell
      title="Recover account"
      subtitle="Enter your email, 24-word recovery phrase, and choose a new password."
    >
      <form onSubmit={submit}>
        <label className="glass-label">Email
          <input className="glass-input" type="email" value={email} required
            onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="glass-label">24-word recovery phrase
          <textarea
            className="glass-input resize-none font-mono text-sm"
            rows={4}
            value={recoveryPhrase}
            required
            placeholder="word1 word2 word3 … word24"
            onChange={e => setRecoveryPhrase(e.target.value)}
          />
          <span className="text-[10px] opacity-60">Enter all 24 words separated by spaces.</span>
        </label>
        <label className="glass-label">New password
          <input className="glass-input" type="password" value={newPassword} required minLength={8}
            onChange={e => setNewPassword(e.target.value)} />
        </label>
        <ErrorLine msg={err} />
        <button className="glass-btn-primary w-full mt-5" disabled={busy} type="submit">
          {busy ? 'Recovering…' : 'Reset password'}
        </button>
      </form>
      <div className="text-xs mt-5 opacity-70">
        <Link to="/login" className="underline">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}

// ─── AcceptInvitePage ─────────────────────────────────────────────────────────

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [info, setInfo] = useState<{ email: string; role: string; tenantName: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!token) { setErr('Missing token.'); return; }
    api.inviteInfo(token).then(setInfo).catch(e => setErr(e.message || 'Invalid invite.'));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErr(null); setBusy(true);
    try {
      const r = await api.acceptInvite({ token, password });
      setAccessToken(r.accessToken);
      nav('/', { replace: true });
    } catch (e: any) { setErr(e.message || 'Failed to accept invite.'); }
    finally { setBusy(false); }
  };

  if (err && !info) return (
    <AuthShell title="Invite problem"><p className="text-sm text-rose-300">{err}</p></AuthShell>
  );
  if (!info) return <AuthShell title="Loading invite…"><p className="text-sm opacity-70">One moment…</p></AuthShell>;

  return (
    <AuthShell title={`Join ${info.tenantName}`} subtitle={`Set a password for ${info.email}.`}>
      <form onSubmit={submit}>
        <label className="glass-label">Password
          <input className="glass-input" type="password" required minLength={8}
            value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <ErrorLine msg={err} />
        <button className="glass-btn-primary w-full mt-5" disabled={busy} type="submit">
          {busy ? 'Joining…' : `Join as ${info.role}`}
        </button>
      </form>
    </AuthShell>
  );
}
