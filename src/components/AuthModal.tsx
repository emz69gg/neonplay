import { useEffect, useState } from 'react';
import { isCloud } from '../lib/backend';
import { useStore } from '../store/AppStore';
import { Modal } from './ui';

export default function AuthModal() {
  const { authOpen, openAuth, register, login, data } = useStore();
  const mode = authOpen ?? 'login';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    setInfo(null);
    setPassword('');
  }, [authOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res =
        mode === 'register'
          ? await register({ username, password, email })
          : await login({ identifier: isCloud ? email : username, password });
      if (res.error) setError(res.error);
      else if (res.info) setInfo(res.info);
      else openAuth(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const showUsername = mode === 'register' || !isCloud;
  const showEmail = isCloud;

  return (
    <Modal open={!!authOpen} onClose={() => openAuth(null)} title={mode === 'register' ? 'Create your account' : 'Welcome back'}>
      <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
        {(['login', 'register'] as const).map((m) => (
          <button key={m} onClick={() => openAuth(m)} className={`rounded-lg py-2 transition ${mode === m ? 'bg-surface shadow text-fg' : 'text-muted'}`}>
            {m === 'login' ? 'Log in' : 'Sign up'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3.5">
        {showUsername && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Username</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="NeonNinja" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}" title="3–16 letters, numbers or _" />
          </label>
        )}
        {showEmail && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="At least 6 characters" required minLength={6} />
        </label>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{error}</p>}
        {info && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{info}</p>}
        <button className="btn-primary w-full !py-3" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-muted">
        {mode === 'register' && data.totalPlays > 0
          ? `Your guest progress (${data.xp} XP, ${data.coins} coins) will move into your new account.`
          : mode === 'login' && data.totalPlays > 0
            ? 'Your guest high scores will be merged into your account.'
            : isCloud
              ? 'Your progress syncs across devices.'
              : 'Accounts are stored in this browser. Connect Supabase for cloud accounts.'}
      </p>
    </Modal>
  );
}
