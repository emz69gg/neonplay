import { useEffect, useRef, useState } from 'react';
import { isCloud, isUsernameAvailable, requestPasswordReset, updatePassword, USERNAME_RE } from '../lib/backend';
import { useStore } from '../store/AppStore';
import { Modal } from './ui';

type View = 'login' | 'register' | 'forgot';

function PasswordInput({ value, onChange, autoComplete, placeholder }: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className="input !pr-16"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        minLength={6}
        aria-label="Password"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:text-fg"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export default function AuthModal() {
  const { authOpen, openAuth, register, login, data } = useStore();
  const [view, setView] = useState<View>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameState, setNameState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle');
  const checkId = useRef(0);

  useEffect(() => {
    if (authOpen) setView(authOpen);
    setError(null);
    setInfo(null);
    setPassword('');
  }, [authOpen]);

  // live username availability (sign-up only)
  useEffect(() => {
    if (view !== 'register' || !username) {
      setNameState('idle');
      return;
    }
    if (!USERNAME_RE.test(username.trim())) {
      setNameState('invalid');
      return;
    }
    const id = ++checkId.current;
    setNameState('checking');
    const t = window.setTimeout(async () => {
      const ok = await isUsernameAvailable(username.trim());
      if (id === checkId.current) setNameState(ok === null ? 'idle' : ok ? 'free' : 'taken');
    }, 350);
    return () => window.clearTimeout(t);
  }, [username, view]);

  const switchView = (v: View) => {
    setView(v);
    setError(null);
    setInfo(null);
    if (v !== 'forgot') openAuth(v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (view === 'forgot') {
        const err = await requestPasswordReset(email);
        if (err) setError(err);
        else setInfo('If that email has an account, a reset link is on its way. Open it on this device.');
        return;
      }
      if (view === 'register' && nameState === 'taken') {
        setError('That username is taken — try another one.');
        return;
      }
      const res =
        view === 'register'
          ? await register({ username: username.trim(), password, email: email.trim() })
          : await login({ identifier: isCloud ? email.trim() : username.trim(), password });
      if (res.error) setError(res.error);
      else if (res.info) setInfo(res.info);
      else openAuth(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const showUsername = view === 'register' || (view === 'login' && !isCloud);
  const showEmail = isCloud;
  const showPassword = view !== 'forgot';
  const title = view === 'register' ? 'Create your account' : view === 'forgot' ? 'Reset your password' : 'Welcome back';

  const nameHint = {
    idle: '3–16 letters, numbers or _',
    checking: 'Checking…',
    free: '✓ Available',
    taken: '✗ Already taken',
    invalid: 'Use 3–16 letters, numbers or _',
  }[nameState];

  return (
    <Modal open={!!authOpen} onClose={() => openAuth(null)} title={title}>
      {view !== 'forgot' && (
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button" onClick={() => switchView(m)} className={`rounded-lg py-2 transition ${view === m ? 'bg-surface text-fg shadow' : 'text-muted'}`}>
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3.5" noValidate={false}>
        {showUsername && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              autoComplete="username"
              placeholder="NeonNinja"
              required
              minLength={3}
              maxLength={16}
              autoFocus={!isCloud || view === 'register'}
            />
            {view === 'register' && (
              <span className={`mt-1 block text-xs ${nameState === 'free' ? 'text-emerald-400' : nameState === 'taken' || nameState === 'invalid' ? 'text-red-400' : 'text-muted'}`}>{nameHint}</span>
            )}
          </label>
        )}
        {showEmail && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              autoFocus={view !== 'register'}
            />
            {view === 'register' && <span className="mt-1 block text-xs text-muted">No verification email — you can play straight away.</span>}
          </label>
        )}
        {showPassword && (
          <div className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted">
              Password
              {view === 'login' && isCloud && (
                <button type="button" className="font-semibold text-neon-purple hover:underline" onClick={() => switchView('forgot')}>
                  Forgot password?
                </button>
              )}
            </span>
            <PasswordInput value={password} onChange={setPassword} autoComplete={view === 'register' ? 'new-password' : 'current-password'} placeholder="At least 6 characters" />
          </div>
        )}
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{error}</p>}
        {info && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400" role="status">{info}</p>}
        <button className="btn-primary w-full !py-3" disabled={busy}>
          {busy ? 'Please wait…' : view === 'register' ? 'Create account' : view === 'forgot' ? 'Send reset link' : 'Log in'}
        </button>
        {view === 'forgot' && (
          <button type="button" className="w-full text-center text-sm font-semibold text-muted hover:text-fg" onClick={() => switchView('login')}>
            ← Back to log in
          </button>
        )}
      </form>
      <p className="mt-4 text-center text-xs text-muted">
        {view === 'register' && data.totalPlays > 0
          ? `Your guest progress (${data.xp} XP, ${data.coins} coins) will move into your new account.`
          : view === 'login' && data.totalPlays > 0
            ? 'Your guest progress will be added to your account.'
            : isCloud
              ? 'Your progress syncs across all your devices.'
              : 'Accounts are stored in this browser. Connect Supabase for cloud accounts.'}
      </p>
    </Modal>
  );
}

/** Shown after opening a password-reset link. */
export function SetPasswordModal() {
  const { recoveryOpen, setRecoveryOpen, toast } = useStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={recoveryOpen} onClose={() => setRecoveryOpen(false)} title="Choose a new password">
      <form
        className="space-y-3.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const err = await updatePassword(password);
          setBusy(false);
          if (err) setError(err);
          else {
            setRecoveryOpen(false);
            toast({ icon: '🔑', title: 'Password updated', tone: 'success' });
          }
        }}
      >
        <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" placeholder="New password (6+ characters)" />
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </Modal>
  );
}
