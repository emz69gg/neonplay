import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarBubble } from '../../components/ui';
import { isCloud } from '../../lib/backend';
import { useStore } from '../../store/AppStore';
import type { GameApi } from '../../lib/types';
import { BoardNav, ChessBoard, material, MoveList, PlayerBar, replay, type PlainMove } from './ChessBoard';
import { PlayerName } from '../../components/Cosmetics';
import { useChessRating } from './rating';
import { cloneState, inCheck, kingSquare, legalMoves, make, outcome, positionKey, type Color, type Move } from './engine';
import { getOnlineBackend, type GameResult, type OnlineBackend, type OnlineGame } from './online';

/* Online 1v1 chess: quick match, invite links, server-side clocks, draw offers, rematches.
 * Stays in sync through realtime updates *and* polling, refetches when the tab wakes up or the
 * connection returns, retries moves on network errors, and resumes your game after a reload. */

const TIMES = [
  { ms: 180_000, label: '3 min', icon: '⚡' },
  { ms: 300_000, label: '5 min', icon: '🔥' },
  { ms: 600_000, label: '10 min', icon: '⏱' },
];
const REASON: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate — draw',
  insufficient: 'Draw — not enough pieces to mate',
  fifty: 'Draw — 50-move rule',
  repetition: 'Draw — threefold repetition',
  resign: 'Resignation',
  timeout: 'Time ran out',
  abandoned: 'No first move in time',
  agreement: 'Draw agreed',
};
const REPORTED_KEY = 'neonplay:chessOnlineReported';
const ACTIVE_KEY = 'neonplay:chessOnlineActive';
const FIRST_MOVE_MS = 60_000;

const fmtClock = (ms: number) => {
  const t = Math.max(0, ms);
  if (t < 20_000) return `${Math.floor(t / 1000)}.${Math.floor((t % 1000) / 100)}`;
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
};
/** Wait, but wake up early as soon as the browser reports the connection is back. */
const sleepOrOnline = (ms: number) =>
  new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(t);
      window.removeEventListener('online', done);
      resolve();
    };
    const t = window.setTimeout(done, ms);
    window.addEventListener('online', done);
  });
const isNetworkError = (msg: string) => /fetch|network|timeout|load failed|connection|reach the server/i.test(msg);
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
const reportedIds = (): string[] => {
  try {
    return JSON.parse(store.get(REPORTED_KEY) || '[]');
  } catch {
    return [];
  }
};

export default function ChessOnline({ api, initialJoin, onJoinHandled }: { api: GameApi; initialJoin?: string | null; onJoinHandled?: () => void }) {
  const { user, data, openAuth } = useStore();
  const [backend, setBackend] = useState<OnlineBackend | null | 'loading'>('loading');
  const [me, setMe] = useState<string | null>(null);
  const [game, setGameState] = useState<OnlineGame | null>(null);
  const [timeMs, setTimeMs] = useState(300_000);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myGames, setMyGames] = useState<OnlineGame[]>([]);
  const [oppOnline, setOppOnline] = useState(false);
  const [live, setLive] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [confirmResign, setConfirmResign] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const [rematchOf, setRematchOf] = useState<OnlineGame | null>(null);
  const [searchingSince, setSearchingSince] = useState<number | null>(null);
  const skew = useRef(0); // local clock − server clock (approx.)
  const lastClaim = useRef(0);
  const failures = useRef(0);
  const gameRef = useRef<OnlineGame | null>(null);
  gameRef.current = game;
  // re-read the rating whenever a game finishes
  const rating = useChessRating(game?.status === 'finished' ? game.id : 0);

  const mockMode = import.meta.env.DEV && store.get('neonplay:mockOnline') === '1';
  const loggedIn = mockMode || user?.provider === 'supabase';
  const b = backend && backend !== 'loading' ? backend : null;

  const setGame = useCallback((g: OnlineGame | null) => {
    setGameState(g);
    if (g && (g.status === 'waiting' || g.status === 'active')) store.set(ACTIVE_KEY, g.id);
  }, []);

  useEffect(() => {
    getOnlineBackend().then(setBackend);
  }, []);

  useEffect(() => {
    if (b && loggedIn) b.userId().then(setMe);
    else setMe(null);
  }, [b, loggedIn, user?.id]);

  /** Apply a game snapshot from the server, ignoring stale ones. */
  const accept = useCallback(
    (g: OnlineGame) => {
      failures.current = 0;
      setOffline(false);
      const prev = gameRef.current;
      if (prev && prev.id === g.id) {
        const older = Date.parse(g.updated_at) < Date.parse(prev.updated_at);
        if (older && g.moves.length <= prev.moves.length && g.status === prev.status && (g.rematch_id ?? null) === (prev.rematch_id ?? null)) return;
      }
      skew.current = Date.now() - Date.parse(g.updated_at);
      gameRef.current = g;
      setGame(g);
    },
    [setGame],
  );

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => {
    const g = gameRef.current;
    if (!b || !g) return;
    b.get(g.id)
      .then((x) => x && accept(x))
      .catch(() => {
        failures.current++;
        if (failures.current >= 2) setOffline(true);
      });
  }, [b, accept]);

  /* ---------- resume the game you were in (after a reload or coming back) ---------- */
  useEffect(() => {
    if (!b || !me || gameRef.current || initialJoin) return;
    const id = store.get(ACTIVE_KEY);
    if (!id) return;
    b.get(id)
      .then((g) => {
        if (g && (g.status === 'waiting' || g.status === 'active') && (g.white === me || g.black === me || g.created_by === me)) accept(g);
        else store.del(ACTIVE_KEY);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, me]);

  const refreshMyGames = useCallback(() => {
    if (b && loggedIn) b.myGames().then(setMyGames).catch(() => undefined);
  }, [b, loggedIn]);

  useEffect(() => {
    if (!game) refreshMyGames();
  }, [game, refreshMyGames]);

  /* ---------- invite link → join ---------- */
  useEffect(() => {
    if (!initialJoin || !b || !loggedIn || !me) return;
    onJoinHandled?.();
    void run(async () => accept(await b.join(initialJoin, data.username, data.avatar)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoin, b, loggedIn, me]);

  /* ---------- live updates + polling fallback ---------- */
  const gid = game?.id;
  const status = game?.status;
  const cancelled = status === 'cancelled';
  useEffect(() => {
    if (!b || !gid || cancelled) return;
    const unsub = b.subscribe(gid, accept, setOppOnline, setLive);
    return () => {
      unsub();
      setLive(false);
      setOppOnline(false);
    };
  }, [b, gid, cancelled, accept]);

  useEffect(() => {
    if (!b || !gid || cancelled) return;
    // poll fast when realtime isn't connected; slowly as a safety net when it is
    const ms = status === 'finished' ? 5000 : live ? 8000 : 1500;
    const t = window.setInterval(refresh, ms);
    return () => window.clearInterval(t);
  }, [b, gid, status, cancelled, live, refresh]);

  // refetch when the tab wakes up or the network comes back
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const off = () => setOffline(true);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', off);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  // keep a waiting game visible to matchmaking
  const waitingMine = !!game && game.status === 'waiting' && game.created_by === me;
  useEffect(() => {
    if (!b || !gid || !waitingMine) return;
    const beat = () => b.heartbeat(gid).then((g) => g && accept(g)).catch(() => undefined);
    beat();
    const t = window.setInterval(beat, 8000);
    return () => window.clearInterval(t);
  }, [b, gid, waitingMine, accept]);

  // clock tick
  useEffect(() => {
    if (status !== 'active' && status !== 'waiting') return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [status]);

  /* ---------------- derived ---------------- */
  const myColor: Color | null = game && me ? (game.white === me ? 'w' : game.black === me ? 'b' : null) : null;
  const oppColor: Color = myColor === 'b' ? 'w' : 'b';
  const rep = useMemo(() => replay(game?.moves ?? []), [game?.moves]);
  const { state, sans, keys, applied, positions, valid } = rep;
  const active = status === 'active';
  const turn = state.turn;
  const legal = useMemo(() => (active ? legalMoves(state) : []), [state, active]);
  const myTurn = active && myColor === turn && !sending;

  useEffect(() => setView(null), [game?.moves.length, gid]);

  const clocks = useMemo(() => {
    if (!game) return { w: 0, b: 0 };
    let used = 0;
    if (active && game.last_move_at && game.moves.length >= 2) used = Math.max(0, now - skew.current - Date.parse(game.last_move_at));
    return { w: game.white_ms - (turn === 'w' ? used : 0), b: game.black_ms - (turn === 'b' ? used : 0) };
  }, [game, now, active, turn]);

  const firstMoveLeft = game && active && game.moves.length < 2 && game.last_move_at ? FIRST_MOVE_MS - (now - skew.current - Date.parse(game.last_move_at)) : null;

  // ask the server to end the game when a clock hits zero (it double-checks the time itself)
  useEffect(() => {
    if (!game || !active || !b) return;
    const flagged = (game.moves.length >= 2 && clocks[turn] <= 0) || (firstMoveLeft !== null && firstMoveLeft <= -500);
    if (flagged && Date.now() - lastClaim.current > 1500) {
      lastClaim.current = Date.now();
      b.claimTimeout(game.id).then(accept).catch(() => undefined);
    }
  }, [clocks, turn, game, active, b, firstMoveLeft, accept]);

  // sound when the opponent moves
  const prevLen = useRef<{ id?: string; n: number }>({ n: 0 });
  useEffect(() => {
    const n = game?.moves.length ?? 0;
    const p = prevLen.current;
    if (p.id === gid && n > p.n && applied.length === n) {
      const last = applied[n - 1];
      const moverColor: Color = n % 2 === 1 ? 'w' : 'b';
      if (moverColor !== myColor) api.sound(last.captured ? 'point' : 'move');
      if (inCheck(state)) window.setTimeout(() => api.sound('flip'), 120);
    }
    prevLen.current = { id: gid, n };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.moves.length, gid]);

  // sound when a waiting game starts
  const prevStatus = useRef<{ id?: string; s?: string }>({});
  useEffect(() => {
    const p = prevStatus.current;
    if (p.id === gid && p.s === 'waiting' && status === 'active') {
      api.sound('level');
      setSearchingSince(null);
    }
    prevStatus.current = { id: gid, s: status };
  }, [gid, status, api]);

  // report finished games to the platform once (XP, coins, achievements)
  useEffect(() => {
    if (!game || game.status !== 'finished' || !myColor) return;
    if (store.get(ACTIVE_KEY) === game.id) store.del(ACTIVE_KEY);
    const done = reportedIds();
    if (done.includes(game.id)) return;
    store.set(REPORTED_KEY, JSON.stringify([...done, game.id].slice(-80)));
    const win = game.winner === myColor;
    const draw = game.winner === null;
    api.sound(win ? 'win' : draw ? 'flip' : 'lose');
    const aiStreak = api.load<{ streak?: number }>()?.streak ?? 0;
    api.finish(aiStreak, { online: true, win, draw, reason: game.result_reason ?? undefined, moves: Math.ceil(game.moves.length / 2) });
  }, [game, myColor, api]);

  /* ---------------- actions ---------------- */
  const sendMove = async (id: string, pm: PlainMove, result: GameResult | undefined, plyIndex: number) => {
    if (!b) return;
    setSending(true);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          accept(await b.move(id, pm, result));
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (isNetworkError(msg) && attempt < 10) {
            setOffline(true);
            await sleepOrOnline(Math.min(4000, 600 * (attempt + 1)));
            // the move may have reached the server before the connection dropped
            const fresh = await b.get(id).catch(() => null);
            const got = fresh?.moves[plyIndex];
            if (fresh && got && got.from === pm.from && got.to === pm.to) {
              accept(fresh);
              return;
            }
            continue;
          }
          setError(isNetworkError(msg) ? 'Couldn’t send your move — check your internet connection and try again.' : msg);
          const g = await b.get(id).catch(() => null);
          if (g) {
            gameRef.current = g;
            setGame(g);
          }
          return;
        }
      }
    } finally {
      setSending(false);
    }
  };

  const onMove = (m: Move) => {
    if (!game || !b || !myTurn) return;
    const after = cloneState(state);
    make(after, m);
    const res = outcome(after, [...keys, positionKey(after)]);
    const result: GameResult | undefined = res.over && res.reason !== 'resign' ? { reason: res.reason } : undefined;
    const pm: PlainMove = m.promo ? { from: m.from, to: m.to, promo: m.promo } : { from: m.from, to: m.to };
    // show the move immediately; the server confirms it
    const optimistic = { ...game, moves: [...game.moves, pm], draw_offer: null, updated_at: new Date(Date.now() - skew.current).toISOString() };
    gameRef.current = optimistic;
    setGameState(optimistic);
    api.sound(m.captured ? 'point' : 'move');
    void sendMove(game.id, pm, result, game.moves.length);
  };

  const quickMatch = (t = timeMs) =>
    b &&
    run(async () => {
      setSearchingSince(Date.now());
      accept(await b.findMatch(t, data.username, data.avatar));
    });
  const invite = () => b && run(async () => accept(await b.createPrivate(timeMs, data.username, data.avatar)));
  const joinCode = () => b && code.trim() && run(async () => accept(await b.join(code, data.username, data.avatar)));
  const leave = () => {
    gameRef.current = null;
    setGameState(null);
    setError(null);
    setRematchOf(null);
    setSearchingSince(null);
    store.del(ACTIVE_KEY);
  };
  const cancelWaiting = () =>
    b &&
    game &&
    run(async () => {
      await b.cancel(game.id);
      leave();
    });
  const resign = () => {
    if (!confirmResign) {
      setConfirmResign(true);
      window.setTimeout(() => setConfirmResign(false), 3000);
      return;
    }
    setConfirmResign(false);
    if (b && game) void run(async () => accept(await b.resign(game.id)));
  };
  const rematch = () => {
    if (!b || !game) return;
    const old = game;
    void run(async () => {
      const g = await b.rematch(old.id, data.username, data.avatar);
      setRematchOf(old);
      accept(g);
    });
  };

  const inviteLink = game ? `${location.origin}${location.pathname}#/game/chess?join=${game.code}` : '';
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy failed — select the link and copy it manually.');
    }
  };

  /* ---------------- render: not available ---------------- */
  if (backend === 'loading') return <div className="card p-6 text-center text-muted">Connecting…</div>;
  if (!backend)
    return (
      <div className="card mx-auto max-w-lg p-6 text-center">
        <div className="text-4xl">🌐</div>
        <h3 className="mt-2 font-display text-xl font-bold">Online play needs the server</h3>
        <p className="mt-1 text-sm text-muted">
          {isCloud ? 'Online chess could not start.' : 'This copy of the site is not connected to Supabase, so there is no one to play against.'} You can still play the AI or a friend on this device.
        </p>
      </div>
    );
  if (!loggedIn)
    return (
      <div className="card mx-auto max-w-lg p-6 text-center">
        <div className="text-4xl">♞</div>
        <h3 className="mt-2 font-display text-xl font-bold">Play chess against real people</h3>
        <p className="mt-1 text-sm text-muted">Log in or create a free account to find an opponent or invite a friend. No email verification needed.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-primary" onClick={() => openAuth('register')}>Sign up</button>
          <button className="btn-ghost" onClick={() => openAuth('login')}>Log in</button>
        </div>
      </div>
    );

  /* ---------------- render: lobby ---------------- */
  if (!game || game.status === 'cancelled')
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 md:grid-cols-2">
        <div className="card space-y-4 p-5">
          <div>
            <h3 className="font-display text-xl font-bold">🌐 Play online</h3>
            <p className="text-sm text-muted">Real opponents, live moves, chess clocks.</p>
          </div>
          {rating && (
            <Link to="/leaderboard?board=elo" className="flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-sm transition hover:bg-line/60">
              <span>
                ♞ Your rating <b className="ml-1 font-mono text-lg text-neon-purple">{rating.rating}</b>
                {rating.games === 0 && <span className="ml-1 text-xs text-muted">(provisional)</span>}
              </span>
              <span className="text-xs text-muted">
                {rating.games ? `${rating.wins}W ${rating.losses}L ${rating.draws}D · peak ${rating.peak}` : 'Play a quick match to get rated'} →
              </span>
            </Link>
          )}
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Time per player</div>
            <div className="grid grid-cols-3 rounded-xl bg-surface2 p-1 text-sm font-semibold">
              {TIMES.map((t) => (
                <button key={t.ms} onClick={() => setTimeMs(t.ms)} className={`rounded-lg px-2 py-1.5 transition ${timeMs === t.ms ? 'bg-surface shadow' : 'text-muted'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary w-full !py-3 !text-base" disabled={busy} onClick={() => quickMatch()}>
            {busy ? 'Please wait…' : '⚔️ Find an opponent'} <span className="text-xs font-normal opacity-80">· rated</span>
          </button>
          <button className="btn-ghost w-full" disabled={busy} onClick={invite}>🔗 Invite a friend <span className="text-xs font-normal text-muted">· friendly</span></button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              joinCode();
            }}
          >
            <input className="input font-mono uppercase" placeholder="Game code" value={code} maxLength={8} onChange={(e) => setCode(e.target.value)} aria-label="Game code" />
            <button className="btn-ghost shrink-0" disabled={busy || !code.trim()}>Join</button>
          </form>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{error}</p>}
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Your games</h3>
            <button className="text-xs font-semibold text-muted hover:text-fg" onClick={refreshMyGames}>↻ Refresh</button>
          </div>
          {myGames.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No games in progress. Find an opponent to start one — you can leave and come back to it here.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {myGames.map((g) => {
                const col = g.white === me ? 'w' : 'b';
                const opp = col === 'w' ? g.black_name : g.white_name;
                const yourTurn = g.status === 'active' && (g.moves.length % 2 === 0 ? 'w' : 'b') === col;
                return (
                  <li key={g.id}>
                    <button onClick={() => accept(g)} className="flex w-full items-center gap-3 rounded-xl bg-surface2/70 p-3 text-left transition hover:bg-line/60">
                      <span className={`grid h-7 w-7 place-items-center rounded-md ${col === 'w' ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}>{col === 'w' ? '♔' : '♚'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{g.status === 'waiting' ? 'Waiting for an opponent…' : `vs ${opp ?? 'opponent'}`}</span>
                        <span className="block text-xs text-muted">{g.time_ms / 60000} min · {Math.ceil(g.moves.length / 2)} moves</span>
                      </span>
                      {yourTurn && <span className="chip !bg-neon-purple/20 !text-neon-purple">Your turn</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">Quick matches pair you with someone close to your rating and change your Elo. Games with fewer than 2 moves don’t count. Wins give XP and coins. Leaving a game doesn’t pause your clock.</p>
        </div>
      </div>
    );

  /* ---------------- render: waiting ---------------- */
  if (game.status === 'waiting') {
    const waitedS = searchingSince ? Math.floor((now - searchingSince) / 1000) : null;
    const rematchName = rematchOf ? ((rematchOf.white === me ? rematchOf.black_name : rematchOf.white_name) ?? 'your opponent') : null;
    return (
      <div className="card mx-auto w-full max-w-lg p-6 text-center">
        <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-4 border-line border-t-neon-purple" />
        {rematchName ? (
          <>
            <h3 className="font-display text-xl font-bold">Rematch offered</h3>
            <p className="mt-1 text-sm text-muted">Waiting for {rematchName} to accept. You’ll play the other colour this time.</p>
          </>
        ) : game.is_private ? (
          <>
            <h3 className="font-display text-xl font-bold">Waiting for your friend…</h3>
            <p className="mt-1 text-sm text-muted">Send them this link, or the code. The game starts as soon as they open it.</p>
            <div className="mt-4 flex gap-2">
              <input className="input text-xs" readOnly value={inviteLink} onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <button className="btn-primary shrink-0" onClick={() => copy(inviteLink)}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
            <div className="mt-3 text-sm">
              Code: <b className="font-mono text-lg tracking-widest text-neon-purple">{game.code}</b>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-display text-xl font-bold">Looking for an opponent…</h3>
            <p className="mt-1 text-sm text-muted">
              {game.time_ms / 60000} minute game{waitedS !== null ? ` · ${waitedS}s` : ''}. Keep this page open — the game starts automatically.
            </p>
            {waitedS !== null && waitedS > 45 && <p className="mt-2 text-xs text-muted">Nobody else is searching right now. Try 🔗 Invite a friend, or keep waiting.</p>}
          </>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-ghost" onClick={cancelWaiting} disabled={busy}>Cancel</button>
        </div>
      </div>
    );
  }

  /* ---------------- render: game ---------------- */
  const shown = view === null ? state : positions[view];
  const mat = material(shown);
  const flipped = myColor === 'b';
  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor: Color = flipped ? 'b' : 'w';
  const nameOf = (c: Color) => (c === 'w' ? game.white_name : game.black_name) ?? 'Player';
  const ratingOf = (c: Color) => (c === 'w' ? game.white_rating : game.black_rating) ?? null;
  const deltaOf = (c: Color) => (c === 'w' ? game.white_delta : game.black_delta) ?? null;
  const rated = game.rated !== false;
  const fmtDelta = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0');
  const avatarOf = (c: Color) => (c === 'w' ? game.white_avatar : game.black_avatar) ?? { emoji: '🎮', color: 'violet' };
  const check = active && inCheck(state);
  const mateKing = game.status === 'finished' && game.result_reason === 'checkmate';
  const checkSq = view === null && (check || mateKing) ? kingSquare(state.board, turn) : -1;
  const rematchFromOpp = game.status === 'finished' && !!game.rematch_id && !!game.rematch_by && game.rematch_by !== myColor;
  const rematchFromMe = game.status === 'finished' && !!game.rematch_id && game.rematch_by === myColor;

  const Clock = ({ c }: { c: Color }) => {
    const running = active && turn === c && game.moves.length >= 2;
    const ms = clocks[c];
    return (
      <span
        className={`rounded-lg px-2.5 py-1 font-mono text-base font-bold tabular-nums ${running ? (ms < 20_000 ? 'bg-red-500 text-white' : 'bg-fg text-bg') : 'bg-surface2 text-muted'}`}
        aria-label={`${c === 'w' ? 'White' : 'Black'} clock`}
      >
        {fmtClock(ms)}
      </span>
    );
  };

  const bar = (c: Color) => (
    <PlayerBar
      color={c}
      name={
        <span className="flex items-center gap-1.5">
          <AvatarBubble avatar={avatarOf(c)} size={22} />
          <PlayerName name={nameOf(c)} avatar={avatarOf(c)} />
          {ratingOf(c) !== null && <span className="font-mono text-xs text-muted">({ratingOf(c)})</span>}
          {deltaOf(c) !== null && (
            <span className={`font-mono text-xs font-bold ${deltaOf(c)! > 0 ? 'text-emerald-500' : deltaOf(c)! < 0 ? 'text-rose-500' : 'text-muted'}`}>{fmtDelta(deltaOf(c)!)}</span>
          )}
          {c === myColor && <span className="text-xs font-semibold text-muted">(you)</span>}
        </span>
      }
      badge={c !== myColor && active && live ? <span className={`h-2 w-2 shrink-0 rounded-full ${oppOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} title={oppOnline ? 'Online' : 'Not connected'} /> : undefined}
      active={active && turn === c}
      captured={c === 'w' ? mat.byWhite : mat.byBlack}
      advantage={c === 'w' ? mat.diff : -mat.diff}
      right={<Clock c={c} />}
    />
  );

  let statusText: string;
  if (game.status === 'finished') {
    const r = REASON[game.result_reason ?? ''] ?? 'Game over';
    statusText = game.winner === null ? r : `${r} — ${game.winner === myColor ? 'you win! 🎉' : `${nameOf(game.winner)} wins`}`;
  } else if (sending) statusText = 'Sending your move…';
  else if (firstMoveLeft !== null && myColor === turn) statusText = `Your move — make your first move within ${Math.max(0, Math.ceil(firstMoveLeft / 1000))}s`;
  else if (myColor === turn) statusText = check ? 'Check! Your move' : 'Your move';
  else statusText = `Waiting for ${nameOf(oppColor)}…`;

  return (
    <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
        {offline && (
          <div className="rounded-xl bg-amber-500/15 px-3 py-2 text-center text-sm font-semibold text-amber-400" role="status">
            ⚠ Connection lost — reconnecting… Your move will be sent when you’re back online.
          </div>
        )}
        {!valid && <div className="rounded-xl bg-red-500/15 px-3 py-2 text-center text-sm text-red-400">This game contains an illegal move — it may have been tampered with.</div>}
        {bar(topColor)}
        <ChessBoard
          state={shown}
          legal={view === null ? legal : []}
          interactive={view === null && myTurn}
          flipped={flipped}
          last={applied[(view ?? applied.length) - 1]}
          animKey={view ?? applied.length}
          checkSq={checkSq}
          onMove={onMove}
          onSound={(s) => api.sound(s)}
        />
        {bar(bottomColor)}
        <BoardNav total={applied.length} view={view} setView={setView} />
        {view !== null && (
          <button className="btn-ghost w-full !py-1.5 text-xs" onClick={() => setView(null)}>
            Viewing an earlier move — back to the game ⏭
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className={`card p-4 ${game.status === 'finished' ? 'border-neon-purple/50' : ''}`}>
          <div className="font-display text-lg font-bold" aria-live="polite">{statusText}</div>
          <div className="mt-1 text-xs text-muted">
            Online · {rated ? 'Rated' : 'Friendly'} · {game.time_ms / 60000} min · game {game.code}
            {active && <> · {live ? '🟢 live' : '🟡 syncing'}</>}
          </div>
          {game.status === 'finished' && rated && myColor && (
            <div className="mt-2 text-sm">
              {deltaOf(myColor) !== null ? (
                <>
                  Rating: <b className="font-mono">{(ratingOf(myColor) ?? 1200) + deltaOf(myColor)!}</b>{' '}
                  <span className={`font-mono font-bold ${deltaOf(myColor)! > 0 ? 'text-emerald-500' : deltaOf(myColor)! < 0 ? 'text-rose-500' : 'text-muted'}`}>({fmtDelta(deltaOf(myColor)!)})</span>
                </>
              ) : (
                <span className="text-muted">Unrated — the game ended before both players moved.</span>
              )}
            </div>
          )}
          {game.draw_offer && active && game.draw_offer !== myColor && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-neon-purple/10 p-3 text-sm">
              <span className="font-semibold">🤝 {nameOf(oppColor)} offers a draw</span>
              <button className="btn-primary !py-1.5" onClick={() => b && run(async () => accept(await b.answerDraw(game.id, true)))}>Accept</button>
              <button className="btn-ghost !py-1.5" onClick={() => b && run(async () => accept(await b.answerDraw(game.id, false)))}>Decline</button>
            </div>
          )}
          {rematchFromOpp && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-neon-purple/10 p-3 text-sm">
              <span className="font-semibold">🔁 {nameOf(oppColor)} wants a rematch</span>
              <button className="btn-primary !py-1.5" disabled={busy} onClick={rematch}>Accept</button>
            </div>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {active ? (
              <>
                <button className={confirmResign ? 'btn bg-red-500 text-white !py-2' : 'btn-ghost !py-2'} onClick={resign} disabled={busy}>
                  🏳 {confirmResign ? 'Click again to resign' : 'Resign'}
                </button>
                <button className="btn-ghost !py-2" disabled={busy || game.draw_offer === myColor} onClick={() => b && run(async () => accept(await b.offerDraw(game.id)))}>
                  🤝 {game.draw_offer === myColor ? 'Draw offered' : 'Offer draw'}
                </button>
                <button className="btn-ghost !py-2" onClick={leave} title="The game keeps running — come back from the lobby">← Lobby</button>
              </>
            ) : (
              <>
                {!rematchFromOpp && (
                  <button className="btn-primary animate-pop" disabled={busy || rematchFromMe} onClick={rematch}>
                    🔁 {rematchFromMe ? 'Rematch offered' : 'Rematch'}
                  </button>
                )}
                <button
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    const t = game.time_ms;
                    setTimeMs(t);
                    leave();
                    void quickMatch(t);
                  }}
                >
                  ⚔️ New opponent
                </button>
                <button className="btn-ghost" onClick={leave}>← Lobby</button>
              </>
            )}
          </div>
        </div>
        <MoveList
          sans={sans}
          viewing={view}
          onSelect={(ply) => setView(ply >= sans.length ? null : ply)}
          emptyText={myColor === 'w' ? 'You play White — make the first move.' : 'You play Black — White moves first.'}
        />
        <p className="text-center text-xs text-muted">Click or drag pieces. Your clock only runs on your turn. ←/→ to review moves.</p>
      </div>
    </div>
  );
}
