import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as backend from '../lib/backend';
import { GAME_MAP, isBetter, todayKey } from '../lib/games';
import {
  ACHIEVEMENTS,
  AVATARS,
  COLOR_COST,
  dailyChallenges,
  freshDaily,
  levelFromXp,
  loginStatus,
  mergeProgress,
  newUserData,
  type GameEvent,
} from '../lib/progression';
import { playSound, setSoundConfig } from '../lib/sound';
import type { AuthUser, Avatar, FinishMeta, GameId, Reward, SoundName, UserData } from '../lib/types';

/* ---------------- Settings ---------------- */
export interface Settings {
  theme: 'dark' | 'light';
  muted: boolean;
  volume: number;
  reducedMotion: boolean;
}
const SETTINGS_KEY = 'neonplay:settings';
const defaultSettings: Settings = { theme: 'dark', muted: false, volume: 0.6, reducedMotion: false };

/* ---------------- Toasts ---------------- */
export interface Toast {
  id: number;
  icon: string;
  title: string;
  desc?: string;
  tone?: 'default' | 'gold' | 'success' | 'error';
}

export interface FinishResult {
  reward: Reward;
  newBest: boolean;
  previousBest?: number;
  levelUp?: number;
  unlocked: string[];
}

interface Store {
  recoveryOpen: boolean;
  setRecoveryOpen: (o: boolean) => void;
  syncError: boolean;
  ready: boolean;
  user: AuthUser | null;
  data: UserData;
  settings: Settings;
  toasts: Toast[];
  syncing: boolean;
  updateSettings: (p: Partial<Settings>) => void;
  sound: (n: SoundName) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  finishGame: (game: GameId, score: number, meta?: FinishMeta) => FinishResult;
  reportScore: (game: GameId, score: number) => void;
  grant: (r: Reward, reason: string) => void;
  markOpened: (game: GameId) => void;
  toggleFavorite: (game: GameId) => void;
  saveGame: (game: GameId, save: unknown) => void;
  claimLogin: () => void;
  claimChallenge: (id: string) => void;
  setAvatar: (a: Avatar) => { ok: boolean; error?: string };
  setUsername: (name: string) => Promise<string | null>;
  register: typeof backend.register;
  login: typeof backend.login;
  logout: () => Promise<void>;
  resetProgress: () => void;
  authOpen: null | 'login' | 'register';
  openAuth: (m: null | 'login' | 'register') => void;
  settingsOpen: boolean;
  openSettings: (o: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

const ensureDaily = (d: UserData): UserData => (d.daily.date === todayKey() ? d : { ...d, daily: freshDaily() });

/** Unlock any achievements now satisfied; returns updated data + unlocked ids. Loops because rewards can unlock more. */
function applyAchievements(d: UserData, e?: GameEvent): { d: UserData; unlocked: string[] } {
  const unlocked: string[] = [];
  let cur = d;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (cur.achievements[a.id]) continue;
      if (a.check(cur, e)) {
        cur = {
          ...cur,
          achievements: { ...cur.achievements, [a.id]: Date.now() },
          xp: cur.xp + a.reward.xp,
          coins: cur.coins + a.reward.coins,
        };
        unlocked.push(a.id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { d: cur, unlocked };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...defaultSettings, ...(backend.storage.get<Settings>(SETTINGS_KEY) ?? {}) }));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setDataState] = useState<UserData>(() => backend.loadGuest());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [authOpen, openAuth] = useState<null | 'login' | 'register'>(null);
  const [settingsOpen, openSettings] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [syncError, setSyncError] = useState(false);

  const dataRef = useRef(data);
  const userRef = useRef(user);
  userRef.current = user;

  const setData = useCallback((next: UserData) => {
    const stamped = { ...next, updatedAt: Date.now() };
    dataRef.current = stamped;
    setDataState(stamped);
  }, []);

  /* ---- settings side effects ---- */
  useEffect(() => {
    backend.storage.set(SETTINGS_KEY, settings);
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#09090e' : '#f4f4fa');
    setSoundConfig({ muted: settings.muted, volume: settings.volume });
  }, [settings]);

  const updateSettings = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);
  const sound = useCallback((n: SoundName) => playSound(n), []);

  const toastId = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++toastId.current;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  /* ---- persistence ---- */
  const cloudTimer = useRef<number>();
  useEffect(() => {
    if (!ready) return;
    if (user) backend.saveCached(user.id, data);
    else backend.saveGuest(data);
    if (user?.provider === 'supabase') {
      window.clearTimeout(cloudTimer.current);
      cloudTimer.current = window.setTimeout(async () => {
        setSyncing(true);
        try {
          const ok = await backend.pushCloudData(user, dataRef.current);
          setSyncError(!ok);
        } catch {
          setSyncError(true);
        } finally {
          setSyncing(false);
        }
      }, 1500);
    }
  }, [data, user, ready]);

  /* ---- load an account's data ---- */
  const enterAccount = useCallback(
    async (uIn: AuthUser, opts: { isNew?: boolean; mergeGuest?: boolean } = {}) => {
      let u = uIn;
      const guest = backend.loadGuest();
      const cloud = await backend.fetchCloudData(u);
      const cached = backend.loadCached(u.id, u.username);
      // newest copy wins (the cache can be newer if the last cloud save didn't go through)
      const copies = [cloud?.data, cached].filter((x): x is UserData => !!x);
      let d: UserData = copies.length ? copies.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a)) : newUserData(u.username);
      const untouched = (x: UserData) => x.totalPlays === 0 && x.xp === 0 && x.coins === 0 && Object.keys(x.saves).length === 0;
      if ((opts.isNew || opts.mergeGuest) && guest.totalPlays > 0) {
        d = untouched(d) ? { ...guest, achievements: { ...guest.achievements } } : mergeProgress(d, guest);
        backend.saveGuest(newUserData('Guest')); // progress moved into the account
      }
      // the database is the source of truth for the username (it may have picked a free variant)
      const username = cloud?.username || (d.username && d.username !== 'Guest' ? d.username : u.username);
      d = ensureDaily({ ...d, username });
      u = { ...u, username };
      setUser(u);
      setData(d);
      if (u.provider === 'supabase') {
        void backend.pushCloudData(u, d);
        for (const [g, s] of Object.entries(d.highScores)) void backend.pushScore(u, d, g as GameId, s as number);
      }
    },
    [setData],
  );

  useEffect(() => {
    (async () => {
      try {
        const recovery = await backend.startRecoverySession();
        const u = recovery ?? (await backend.restoreSession());
        if (u) await enterAccount(u);
        else setData(ensureDaily(backend.loadGuest()));
        if (recovery) setRecoveryOpen(true);
      } catch {
        setData(ensureDaily(backend.loadGuest()));
      } finally {
        setReady(true);
      }
    })();
  }, [enterAccount, setData]);

  /* ---- game events ---- */
  const announce = useCallback(
    (unlocked: string[], prevLevel: number, newXp: number) => {
      for (const id of unlocked) {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        toast({ icon: a.icon, title: `Achievement: ${a.title}`, desc: `${a.desc} · +${a.reward.coins} coins`, tone: 'gold' });
      }
      const lvl = levelFromXp(newXp);
      if (lvl > prevLevel) {
        playSound('level');
        toast({ icon: '⬆️', title: `Level up! You're now level ${lvl}`, tone: 'success' });
      } else if (unlocked.length) playSound('coin');
    },
    [toast],
  );

  const finishGame = useCallback(
    (game: GameId, score: number, meta?: FinishMeta): FinishResult => {
      const meta0 = GAME_MAP[game];
      let d = ensureDaily(dataRef.current);
      const prevLevel = levelFromXp(d.xp);
      const prevBest = d.highScores[game];
      const newBest = Number.isFinite(score) && isBetter(meta0, score, prevBest);
      const reward = meta0.reward(score, meta);
      const gamesPlayed = d.daily.gamesPlayed.includes(game) ? d.daily.gamesPlayed : [...d.daily.gamesPlayed, game];
      d = {
        ...d,
        highScores: newBest ? { ...d.highScores, [game]: score } : d.highScores,
        plays: { ...d.plays, [game]: (d.plays[game] ?? 0) + 1 },
        totalPlays: d.totalPlays + 1,
        xp: d.xp + reward.xp,
        coins: d.coins + reward.coins,
        daily: { ...d.daily, gamesPlayed, plays: d.daily.plays + 1 },
      };
      // daily challenges
      const evt: GameEvent = { game, score, meta };
      const progress = { ...d.daily.progress };
      for (const c of dailyChallenges(d.daily.date)) {
        const before = progress[c.id] ?? 0;
        const after = c.update(before, evt, d);
        progress[c.id] = after;
        if (!c.done(before) && c.done(after)) {
          toast({ icon: c.icon, title: 'Daily challenge complete!', desc: `${c.title} — claim your reward`, tone: 'success' });
        }
      }
      d = { ...d, daily: { ...d.daily, progress } };
      const ach = applyAchievements(d, evt);
      d = ach.d;
      setData(d);
      announce(ach.unlocked, prevLevel, d.xp);
      if (newBest && userRef.current) void backend.pushScore(userRef.current, d, game, score);
      const lvl = levelFromXp(d.xp);
      return { reward, newBest, previousBest: prevBest, levelUp: lvl > prevLevel ? lvl : undefined, unlocked: ach.unlocked };
    },
    [announce, setData, toast],
  );

  const reportScore = useCallback(
    (game: GameId, score: number) => {
      const d0 = dataRef.current;
      if (!isBetter(GAME_MAP[game], score, d0.highScores[game])) return;
      const prevLevel = levelFromXp(d0.xp);
      const ach = applyAchievements({ ...d0, highScores: { ...d0.highScores, [game]: score } });
      setData(ach.d);
      announce(ach.unlocked, prevLevel, ach.d.xp);
      if (userRef.current) void backend.pushScore(userRef.current, ach.d, game, score);
    },
    [announce, setData],
  );

  const grant = useCallback(
    (r: Reward, reason: string) => {
      const d0 = ensureDaily(dataRef.current);
      const prevLevel = levelFromXp(d0.xp);
      const ach = applyAchievements({ ...d0, xp: d0.xp + r.xp, coins: d0.coins + r.coins });
      setData(ach.d);
      toast({ icon: '🪙', title: reason, desc: `+${r.xp} XP · +${r.coins} coins`, tone: 'gold' });
      playSound('coin');
      announce(ach.unlocked, prevLevel, ach.d.xp);
    },
    [announce, setData, toast],
  );

  const markOpened = useCallback(
    (game: GameId) => {
      const d = dataRef.current;
      if (d.recent[0] === game) return;
      setData({ ...d, recent: [game, ...d.recent.filter((g) => g !== game)].slice(0, 12) });
    },
    [setData],
  );

  const toggleFavorite = useCallback(
    (game: GameId) => {
      const d = dataRef.current;
      const has = d.favorites.includes(game);
      const next = { ...d, favorites: has ? d.favorites.filter((g) => g !== game) : [...d.favorites, game] };
      const ach = applyAchievements(next);
      setData(ach.d);
      announce(ach.unlocked, levelFromXp(d.xp), ach.d.xp);
      playSound(has ? 'click' : 'point');
      toast({ icon: has ? '💔' : '❤️', title: has ? 'Removed from favorites' : 'Added to favorites', desc: GAME_MAP[game].title });
    },
    [announce, setData, toast],
  );

  const saveGame = useCallback(
    (game: GameId, save: unknown) => {
      const d = dataRef.current;
      setData({ ...d, saves: { ...d.saves, [game]: save } });
    },
    [setData],
  );

  const claimLogin = useCallback(() => {
    const d0 = dataRef.current;
    const st = loginStatus(d0);
    if (st.claimedToday) return;
    const prevLevel = levelFromXp(d0.xp);
    const ach = applyAchievements({
      ...d0,
      xp: d0.xp + st.reward.xp,
      coins: d0.coins + st.reward.coins,
      login: { lastClaim: todayKey(), streak: st.nextStreak },
    });
    setData(ach.d);
    playSound('coin');
    toast({ icon: '🎁', title: `Day ${st.nextStreak} reward claimed`, desc: `+${st.reward.coins} coins · +${st.reward.xp} XP`, tone: 'gold' });
    announce(ach.unlocked, prevLevel, ach.d.xp);
  }, [announce, setData, toast]);

  const claimChallenge = useCallback(
    (id: string) => {
      const d0 = ensureDaily(dataRef.current);
      const c = dailyChallenges(d0.daily.date).find((x) => x.id === id);
      if (!c || d0.daily.claimed.includes(id) || !c.done(d0.daily.progress[id] ?? 0)) return;
      const prevLevel = levelFromXp(d0.xp);
      const ach = applyAchievements({
        ...d0,
        xp: d0.xp + c.reward.xp,
        coins: d0.coins + c.reward.coins,
        daily: { ...d0.daily, claimed: [...d0.daily.claimed, id] },
      });
      setData(ach.d);
      playSound('coin');
      toast({ icon: c.icon, title: 'Challenge reward claimed', desc: `+${c.reward.coins} coins · +${c.reward.xp} XP`, tone: 'gold' });
      announce(ach.unlocked, prevLevel, ach.d.xp);
    },
    [announce, setData, toast],
  );

  const setAvatar = useCallback(
    (a: Avatar) => {
      const d = dataRef.current;
      const emojiCost = AVATARS.find((x) => x.emoji === a.emoji)?.cost ?? 0;
      const colorCost = COLOR_COST[a.color] ?? 0;
      const needEmoji = emojiCost > 0 && !d.unlocks.includes(`emoji:${a.emoji}`);
      const needColor = colorCost > 0 && !d.unlocks.includes(`color:${a.color}`);
      const cost = (needEmoji ? emojiCost : 0) + (needColor ? colorCost : 0);
      if (cost > d.coins) return { ok: false, error: `You need ${cost - d.coins} more coins` };
      const unlocks = [...d.unlocks];
      if (needEmoji) unlocks.push(`emoji:${a.emoji}`);
      if (needColor) unlocks.push(`color:${a.color}`);
      setData({ ...d, avatar: a, coins: d.coins - cost, unlocks });
      playSound(cost ? 'coin' : 'click');
      if (cost) toast({ icon: a.emoji, title: 'Unlocked!', desc: `Spent ${cost} coins`, tone: 'gold' });
      return { ok: true };
    },
    [setData, toast],
  );

  const setUsername = useCallback(
    async (name: string) => {
      const n = name.trim();
      const err = await backend.checkUsernameAvailable(userRef.current, n);
      if (err) return err;
      setData({ ...dataRef.current, username: n });
      if (userRef.current) setUser({ ...userRef.current, username: n });
      return null;
    },
    [setData],
  );

  const register = useCallback<typeof backend.register>(
    async (opts) => {
      const res = await backend.register(opts);
      if (res.user) {
        await enterAccount(res.user, { isNew: true });
        toast({ icon: '🎉', title: `Welcome, ${res.user.username}!`, desc: 'Your progress is now saved to your account.', tone: 'success' });
      }
      return res;
    },
    [enterAccount, toast],
  );

  const login = useCallback<typeof backend.login>(
    async (opts) => {
      const res = await backend.login(opts);
      if (res.user) {
        await enterAccount(res.user, { mergeGuest: true });
        toast({ icon: '👋', title: `Welcome back, ${res.user.username}!`, tone: 'success' });
      }
      return res;
    },
    [enterAccount, toast],
  );

  const loggingOut = useRef(false);
  const logout = useCallback(async () => {
    loggingOut.current = true;
    try {
      await backend.logout();
    } finally {
      loggingOut.current = false;
    }
    setUser(null);
    setData(ensureDaily(backend.loadGuest()));
    toast({ icon: '👋', title: 'Logged out', desc: 'Playing as guest' });
  }, [setData, toast]);

  // the cloud session ended somewhere else (logged out in another tab, or the session was revoked)
  useEffect(
    () =>
      backend.onCloudSignOut(() => {
        if (loggingOut.current || userRef.current?.provider !== 'supabase') return;
        setUser(null);
        setData(ensureDaily(backend.loadGuest()));
        toast({ icon: '🔒', title: 'You were logged out', desc: 'Log in again to keep saving progress online.' });
      }),
    [setData, toast],
  );

  const resetProgress = useCallback(() => {
    const d = newUserData(dataRef.current.username);
    d.avatar = dataRef.current.avatar;
    setData(d);
    toast({ icon: '🧹', title: 'Progress reset' });
  }, [setData, toast]);

  const value = useMemo<Store>(
    () => ({
      ready, user, data, settings, toasts, syncing,
      updateSettings, sound, toast, dismissToast,
      finishGame, reportScore, grant, markOpened, toggleFavorite, saveGame,
      claimLogin, claimChallenge, setAvatar, setUsername,
      register, login, logout, resetProgress,
      authOpen, openAuth, settingsOpen, openSettings, recoveryOpen, setRecoveryOpen, syncError,
    }),
    [recoveryOpen, syncError, ready, user, data, settings, toasts, syncing, updateSettings, sound, toast, dismissToast, finishGame, reportScore, grant, markOpened, toggleFavorite, saveGame, claimLogin, claimChallenge, setAvatar, setUsername, register, login, logout, resetProgress, authOpen, settingsOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
