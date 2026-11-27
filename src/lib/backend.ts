import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GAME_MAP } from './games';
import { levelFromXp, newUserData, normalizeUserData } from './progression';
import type { AuthUser, Avatar, GameId, UserData } from './types';

/* =========================================================================
 * Backend abstraction.
 *  - If VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set → Supabase auth,
 *    cloud-saved profiles and a real global leaderboard.
 *  - Otherwise → local accounts stored in this browser (still fully playable).
 * Guest progress always lives in localStorage.
 * ========================================================================= */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/* Password-reset links come back as "#access_token=…&type=recovery". The site uses
 * hash routing, so read those tokens here (before the router sees them) and clean the URL. */
export const pendingRecovery: { access_token: string; refresh_token: string } | null = (() => {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash;
  if (!/access_token=|error_description=/.test(h)) return null;
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/');
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  return access_token && refresh_token && p.get('type') === 'recovery' ? { access_token, refresh_token } : null;
})();

export const supabase: SupabaseClient | null =
  URL_ && KEY_ ? createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
export const isCloud = !!supabase;

/** Turn Supabase / network errors into plain-language messages. */
export function friendlyAuthError(raw: string | undefined): string {
  const m = (raw ?? '').toLowerCase();
  if (!m) return 'Something went wrong — please try again.';
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) return 'An account with this email already exists — log in instead.';
  if (m.includes('email not confirmed')) return 'This account’s email isn’t confirmed yet. (Site owner: run supabase/schema.sql to switch email confirmation off.)';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts right now — please wait a minute and try again.';
  if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short'))) return 'That password is too weak — use at least 6 characters.';
  if (m.includes('invalid') && m.includes('email')) return 'That email address doesn’t look right.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'New sign-ups are switched off on this server.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Can’t reach the server — check your internet connection.';
  if (m.includes('database error saving new user')) return 'The server couldn’t create your account. (Site owner: run supabase/schema.sql.)';
  return raw!;
}

/* ---------------- localStorage helpers ---------------- */
const LS = {
  get<T>(k: string): T | undefined {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage full or blocked */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
export const storage = LS;

const K = {
  guest: 'neonplay:data:guest',
  data: (id: string) => `neonplay:data:${id}`,
  accounts: 'neonplay:accounts',
  session: 'neonplay:session',
};

export const loadGuest = () => normalizeUserData(LS.get(K.guest), 'Guest');
export const saveGuest = (d: UserData) => LS.set(K.guest, d);
export const loadCached = (id: string, name: string) => {
  const raw = LS.get(K.data(id));
  return raw ? normalizeUserData(raw, name) : undefined;
};
export const saveCached = (id: string, d: UserData) => LS.set(K.data(id), d);

/* ---------------- Local accounts ---------------- */
interface LocalAccount {
  id: string;
  username: string;
  salt: string;
  hash: string;
  createdAt: number;
}

async function hashPassword(password: string, salt: string) {
  const enc = new TextEncoder().encode(`${salt}:${password}`);
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (const b of enc) h = (Math.imul(31, h) + b) | 0;
  return String(h);
}

const randomId = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const accounts = () => LS.get<Record<string, LocalAccount>>(K.accounts) ?? {};

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

export interface AuthResult {
  user?: AuthUser;
  data?: UserData;
  error?: string;
  info?: string;
  isNew?: boolean;
}

export async function register(opts: { username: string; password: string; email?: string }): Promise<AuthResult> {
  const username = opts.username.trim();
  if (!USERNAME_RE.test(username)) return { error: 'Username must be 3–16 letters, numbers or _' };
  if (opts.password.length < 6) return { error: 'Password must be at least 6 characters' };

  if (supabase) {
    const email = (opts.email ?? '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address' };
    const taken = await usernameTaken(username);
    if (taken) return { error: 'That username is taken — try another one.' };
    try {
      const { data, error } = await supabase.auth.signUp({ email, password: opts.password, options: { data: { username } } });
      if (error) return { error: friendlyAuthError(error.message) };
      // With "confirm email" on, Supabase hides existing accounts behind a user with no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
        return { error: 'An account with this email already exists — log in instead.' };
      let session = data.session;
      if (!session) {
        // email confirmation is handled by the database (auto-confirm), so just log straight in
        const res = await supabase.auth.signInWithPassword({ email, password: opts.password });
        if (res.error) return { error: friendlyAuthError(res.error.message) };
        session = res.data.session;
      }
      if (!session) return { error: 'Your account was created — please log in.' };
      const user: AuthUser = { id: session.user.id, username, email, provider: 'supabase' };
      return { user, isNew: true };
    } catch (e) {
      return { error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    }
  }

  const all = accounts();
  if (all[username.toLowerCase()]) return { error: 'That username is taken on this device' };
  const salt = randomId();
  const acc: LocalAccount = { id: randomId(), username, salt, hash: await hashPassword(opts.password, salt), createdAt: Date.now() };
  all[username.toLowerCase()] = acc;
  LS.set(K.accounts, all);
  LS.set(K.session, { id: acc.id, username, provider: 'local' });
  return { user: { id: acc.id, username, provider: 'local' }, isNew: true };
}

export async function login(opts: { identifier: string; password: string }): Promise<AuthResult> {
  if (supabase) {
    const email = opts.identifier.trim();
    if (!email.includes('@')) return { error: 'Log in with the email address you signed up with.' };
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: opts.password });
      if (error || !data.user) return { error: friendlyAuthError(error?.message ?? 'Login failed') };
      const username = (data.user.user_metadata?.username as string) ?? data.user.email?.split('@')[0] ?? 'Player';
      return { user: { id: data.user.id, username, email: data.user.email, provider: 'supabase' } };
    } catch (e) {
      return { error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    }
  }
  const acc = accounts()[opts.identifier.trim().toLowerCase()];
  if (!acc || (await hashPassword(opts.password, acc.salt)) !== acc.hash) return { error: 'Wrong username or password' };
  LS.set(K.session, { id: acc.id, username: acc.username, provider: 'local' });
  return { user: { id: acc.id, username: acc.username, provider: 'local' } };
}

export async function logout() {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // offline: still forget the session locally
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
  }
  LS.del(K.session);
}

async function usernameTaken(name: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.from('profiles').select('id').ilike('username', name).limit(1);
    return !!data && data.length > 0;
  } catch {
    return false; // can't check — the database trigger will pick a free name anyway
  }
}

/** Live username check for the sign-up form. null = unknown. */
export async function isUsernameAvailable(name: string): Promise<boolean | null> {
  if (!USERNAME_RE.test(name)) return false;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('profiles').select('id').ilike('username', name).limit(1);
      if (error) return null;
      return !data || data.length === 0;
    } catch {
      return null;
    }
  }
  return !accounts()[name.toLowerCase()];
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return 'Password reset needs the online server.';
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter the email address you signed up with.';
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
    return error ? friendlyAuthError(error.message) : null;
  } catch (e) {
    return friendlyAuthError(e instanceof Error ? e.message : String(e));
  }
}

export async function updatePassword(password: string): Promise<string | null> {
  if (!supabase) return 'Not available';
  if (password.length < 6) return 'Password must be at least 6 characters';
  const { error } = await supabase.auth.updateUser({ password });
  return error ? friendlyAuthError(error.message) : null;
}

/** Use the tokens from a password-reset link to sign in. */
export async function startRecoverySession(): Promise<AuthUser | null> {
  if (!supabase || !pendingRecovery) return null;
  const { data, error } = await supabase.auth.setSession(pendingRecovery);
  const u = data.session?.user;
  if (error || !u) return null;
  return { id: u.id, username: (u.user_metadata?.username as string) ?? u.email?.split('@')[0] ?? 'Player', email: u.email, provider: 'supabase' };
}

/** Notifies when the cloud session ends elsewhere (another tab logs out, token revoked). */
export function onCloudSignOut(cb: () => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') cb();
  });
  return () => data.subscription.unsubscribe();
}

export async function restoreSession(): Promise<AuthUser | null> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    return { id: u.id, username: (u.user_metadata?.username as string) ?? u.email?.split('@')[0] ?? 'Player', email: u.email, provider: 'supabase' };
  }
  const s = LS.get<AuthUser>(K.session);
  if (!s) return null;
  const exists = Object.values(accounts()).some((a) => a.id === s.id);
  return exists ? s : null;
}

/* ---------------- Cloud profile sync ---------------- */
/** The account's saved progress (null if it has never been saved) and its username from the database. */
export async function fetchCloudData(user: AuthUser): Promise<{ data: UserData | null; username: string | null } | null> {
  if (!supabase || user.provider !== 'supabase') return null;
  try {
    const { data, error } = await supabase.from('profiles').select('data, username, avatar').eq('id', user.id).maybeSingle();
    if (error || !data) return null;
    const raw = data.data as Record<string, unknown> | null;
    const saved = raw && typeof raw === 'object' && Object.keys(raw).length > 0 ? normalizeUserData(raw, data.username ?? user.username) : null;
    if (saved && data.username) saved.username = data.username;
    return { data: saved, username: data.username ?? null };
  } catch {
    return null;
  }
}

export async function pushCloudData(user: AuthUser, d: UserData): Promise<boolean> {
  if (!supabase || user.provider !== 'supabase') return true;
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    username: d.username,
    avatar: d.avatar,
    xp: d.xp,
    level: levelFromXp(d.xp),
    data: d,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

export async function pushScore(user: AuthUser, d: UserData, game: GameId, score: number) {
  if (!supabase || user.provider !== 'supabase') return;
  await supabase.from('scores').upsert(
    { user_id: user.id, game_id: game, score, username: d.username, avatar: d.avatar, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,game_id' },
  );
}

/** Returns an error message if the name is not available. */
export async function checkUsernameAvailable(user: AuthUser | null, name: string): Promise<string | null> {
  if (!USERNAME_RE.test(name)) return 'Username must be 3–16 letters, numbers or _';
  if (supabase && user?.provider === 'supabase') {
    const { data } = await supabase.from('profiles').select('id').ilike('username', name).neq('id', user.id).maybeSingle();
    if (data) return 'That username is taken';
  } else if (user) {
    const all = accounts();
    const hit = all[name.toLowerCase()];
    if (hit && hit.id !== user.id) return 'That username is taken on this device';
    // rename local account key
    const mine = Object.entries(all).find(([, a]) => a.id === user.id);
    if (mine) {
      delete all[mine[0]];
      all[name.toLowerCase()] = { ...mine[1], username: name };
      LS.set(K.accounts, all);
      LS.set(K.session, { id: user.id, username: name, provider: 'local' });
    }
  }
  return null;
}

/* ---------------- Leaderboards ---------------- */
export interface LeaderRow {
  id: string;
  username: string;
  avatar: Avatar;
  value: number;
  level?: number;
}

function localProfiles(): { id: string; data: UserData }[] {
  const out: { id: string; data: UserData }[] = [];
  const guest = LS.get<UserData>(K.guest);
  if (guest && guest.totalPlays > 0) out.push({ id: 'guest', data: normalizeUserData(guest) });
  for (const acc of Object.values(accounts())) {
    const d = loadCached(acc.id, acc.username);
    if (d) out.push({ id: acc.id, data: d });
  }
  return out;
}

export async function gameLeaderboard(game: GameId, limit = 50): Promise<LeaderRow[]> {
  const meta = GAME_MAP[game];
  if (supabase) {
    const { data, error } = await supabase
      .from('scores')
      .select('user_id, username, avatar, score')
      .eq('game_id', game)
      .order('score', { ascending: !!meta.lowerIsBetter })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.user_id, username: r.username, avatar: r.avatar ?? newUserData().avatar, value: Number(r.score) }));
  }
  return localProfiles()
    .filter((p) => p.data.highScores[game] !== undefined)
    .map((p) => ({ id: p.id, username: p.data.username, avatar: p.data.avatar, value: p.data.highScores[game]! }))
    .sort((a, b) => (meta.lowerIsBetter ? a.value - b.value : b.value - a.value))
    .slice(0, limit);
}

export async function xpLeaderboard(limit = 50): Promise<LeaderRow[]> {
  if (supabase) {
    const { data, error } = await supabase.from('profiles').select('id, username, avatar, xp, level').order('xp', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, username: r.username, avatar: r.avatar ?? newUserData().avatar, value: r.xp ?? 0, level: r.level ?? levelFromXp(r.xp ?? 0) }));
  }
  return localProfiles()
    .map((p) => ({ id: p.id, username: p.data.username, avatar: p.data.avatar, value: p.data.xp, level: levelFromXp(p.data.xp) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function clearAllLocalData() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('neonplay:'))
    .forEach((k) => localStorage.removeItem(k));
}
