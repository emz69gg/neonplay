import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AvatarBubble } from '../../components/ui';
import { isCloud } from '../../lib/backend';
import { useStore } from '../../store/AppStore';
import type { GameApi } from '../../lib/types';
import { ChessBoard, material, MoveList, PlayerBar, replay } from './ChessBoard';
import { cloneState, inCheck, kingSquare, legalMoves, make, outcome, positionKey, type Color, type Move } from './engine';
import { getOnlineBackend, type GameResult, type OnlineBackend, type OnlineGame } from './online';

/* Online 1v1 chess: quick match, invite links, server-side clocks, draw offers, resign. */

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
  abandoned: 'Game abandoned',
  agreement: 'Draw agreed',
};
const REPORTED_KEY = 'neonplay:chessOnlineReported';

const fmtClock = (ms: number) => {
  const t = Math.max(0, ms);
  if (t < 20_000) return `${Math.floor(t / 1000)}.${Math.floor((t % 1000) / 100)}`;
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
};

function reportedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REPORTED_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function ChessOnline({ api, initialJoin, onJoinHandled }: { api: GameApi; initialJoin?: string | null; onJoinHandled?: () => void }) {
  const { user, data, openAuth } = useStore();
  const [backend, setBackend] = useState<OnlineBackend | null | 'loading'>('loading');
  const [me, setMe] = useState<string | null>(null);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [timeMs, setTimeMs] = useState(300_000);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myGames, setMyGames] = useState<OnlineGame[]>([]);
  const [oppOnline, setOppOnline] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [confirmResign, setConfirmResign] = useState(false);
  const [copied, setCopied] = useState(false);
  const skew = useRef(0); // local clock − server clock (approx.)
  const lastClaim = useRef(0);
  const gameRef = useRef<OnlineGame | null>(null);
  gameRef.current = game;

  const mockMode = import.meta.env.DEV && typeof localStorage !== 'undefined' && localStorage.getItem('neonplay:mockOnline') === '1';
  const loggedIn = mockMode || user?.provider === 'supabase';

  useEffect(() => {
    getOnlineBackend().then(setBackend);
  }, []);

  useEffect(() => {
    if (backend && backend !== 'loading' && loggedIn) backend.userId().then(setMe);
  }, [backend, loggedIn, user?.id]);

  const accept = useCallback((g: OnlineGame) => {
    skew.current = Date.now() - Date.parse(g.updated_at);
    setGame((prev) => {
      // ignore stale updates (older than what we already have)
      if (prev && prev.id === g.id && Date.parse(prev.updated_at) > Date.parse(g.updated_at) && prev.moves.length >= g.moves.length) return prev;
      return g;
    });
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>) => {
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
    },
    [],
  );

  const refreshMyGames = useCallback(() => {
    if (backend && backend !== 'loading' && loggedIn) backend.myGames().then(setMyGames).catch(() => undefined);
  }, [backend, loggedIn]);

  useEffect(() => {
    if (!game) refreshMyGames();
  }, [game, refreshMyGames]);

  // invite link → join
  useEffect(() => {
    if (!initialJoin || !backend || backend === 'loading' || !loggedIn || !me) return;
    onJoinHandled?.();
    void run(async () => accept(await backend.join(initialJoin, data.username, data.avatar)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJoin, backend, loggedIn, me]);

  // live updates + polling fallback
  useEffect(() => {
    if (!game || !backend || backend === 'loading') return;
    if (game.status === 'finished' || game.status === 'cancelled') return;
    const unsub = backend.subscribe(game.id, accept, setOppOnline);
    const poll = window.setInterval(() => {
      backend.get(game.id).then((g) => g && accept(g)).catch(() => undefined);
    }, 4000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, game?.status === 'finished' || game?.status === 'cancelled', backend]);

  // clock tick
  useEffect(() => {
    if (game?.status !== 'active') return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [game?.status]);

  /* ---------------- derived ---------------- */
  const myColor: Color | null = game && me ? (game.white === me ? 'w' : game.black === me ? 'b' : null) : null;
  const oppColor: Color = myColor === 'b' ? 'w' : 'b';
  const rep = useMemo(() => replay(game?.moves ?? []), [game?.moves]);
  const { state, sans, keys, applied } = rep;
  const active = game?.status === 'active';
  const turn = state.turn;
  const legal = useMemo(() => (active ? legalMoves(state) : []), [state, active]);
  const myTurn = active && myColor === turn;

  const clocks = useMemo(() => {
    if (!game) return { w: 0, b: 0 };
    let used = 0;
    if (active && game.last_move_at && game.moves.length >= 2) used = Math.max(0, now - skew.current - Date.parse(game.last_move_at));
    return { w: game.white_ms - (turn === 'w' ? used : 0), b: game.black_ms - (turn === 'b' ? used : 0) };
  }, [game, now, active, turn]);

  const firstMoveLeft = game && active && game.moves.length < 2 && game.last_move_at ? 120_000 - (now - skew.current - Date.parse(game.last_move_at)) : null;

  // ask the server to end the game when a clock hits zero (it double-checks the time itself)
  useEffect(() => {
    if (!game || !active || !backend || backend === 'loading') return;
    const flagged = (game.moves.length >= 2 && clocks[turn] <= 0) || (firstMoveLeft !== null && firstMoveLeft <= 0);
    if (flagged && Date.now() - lastClaim.current > 1500) {
      lastClaim.current = Date.now();
      backend.claimTimeout(game.id).then(accept).catch(() => undefined);
    }
  }, [clocks, turn, game, active, backend, firstMoveLeft, accept]);

  // sounds when the opponent moves
  const prevLen = useRef(0);
  useEffect(() => {
    const n = game?.moves.length ?? 0;
    if (n > prevLen.current && applied.length === n) {
      const last = applied[n - 1];
      const moverColor: Color = n % 2 === 1 ? 'w' : 'b';
      if (moverColor !== myColor) api.sound(last.captured ? 'point' : 'move');
      if (inCheck(state)) window.setTimeout(() => api.sound('flip'), 120);
    }
    prevLen.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.moves.length]);

  // report finished games to the platform once (XP, coins, achievements)
  useEffect(() => {
    if (!game || game.status !== 'finished' || !myColor) return;
    const done = reportedIds();
    if (done.includes(game.id)) return;
    localStorage.setItem(REPORTED_KEY, JSON.stringify([...done, game.id].slice(-60)));
    const win = game.winner === myColor;
    const draw = game.winner === null;
    api.sound(win ? 'win' : draw ? 'flip' : 'lose');
    const aiStreak = api.load<{ streak?: number }>()?.streak ?? 0;
    api.finish(aiStreak, { online: true, win, draw, reason: game.result_reason ?? undefined, moves: Math.ceil(game.moves.length / 2) });
  }, [game, myColor, api]);

  /* ---------------- actions ---------------- */
  const b = backend && backend !== 'loading' ? backend : null;

  const onMove = (m: Move) => {
    if (!game || !b || !myTurn) return;
    // detect a finished position after this move
    const after = cloneState(state);
    make(after, m);
    const res = outcome(after, [...keys, positionKey(after)]);
    const result: GameResult | undefined = res.over && res.reason !== 'resign' ? { reason: res.reason } : undefined;
    const pm = m.promo ? { from: m.from, to: m.to, promo: m.promo } : { from: m.from, to: m.to };
    const optimistic: OnlineGame = { ...game, moves: [...game.moves, pm], draw_offer: null, updated_at: new Date(Date.now() - skew.current).toISOString() };
    setGame(optimistic);
    api.sound(m.captured ? 'point' : 'move');
    b.move(game.id, pm, result)
      .then(accept)
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        b.get(game.id).then((g) => g && setGame(g));
      });
  };

  const quickMatch = () => b && run(async () => accept(await b.findMatch(timeMs, data.username, data.avatar)));
  const invite = () => b && run(async () => accept(await b.createPrivate(timeMs, data.username, data.avatar)));
  const joinCode = () => b && code.trim() && run(async () => accept(await b.join(code, data.username, data.avatar)));
  const cancelWaiting = () =>
    b && game && run(async () => {
      await b.cancel(game.id);
      setGame(null);
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
  const leave = () => {
    setGame(null);
    setError(null);
    setOppOnline(false);
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
        <p className="mt-1 text-sm text-muted">Log in or create a free account to find an opponent or invite a friend.</p>
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
          <button className="btn-primary w-full !py-3 !text-base" disabled={busy} onClick={quickMatch}>
            {busy ? 'Please wait…' : '⚔️ Find an opponent'}
          </button>
          <button className="btn-ghost w-full" disabled={busy} onClick={invite}>🔗 Invite a friend</button>
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
          <h3 className="font-display text-lg font-bold">Your games</h3>
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
          <p className="mt-4 text-xs text-muted">Wins give XP and coins. Leaving a game doesn’t pause your clock.</p>
        </div>
      </div>
    );

  /* ---------------- render: waiting ---------------- */
  if (game.status === 'waiting')
    return (
      <div className="card mx-auto w-full max-w-lg p-6 text-center">
        <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-4 border-line border-t-neon-purple" />
        {game.is_private ? (
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
            <p className="mt-1 text-sm text-muted">{game.time_ms / 60000} minute game. Keep this page open — the game starts automatically.</p>
          </>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-ghost" onClick={cancelWaiting} disabled={busy}>Cancel</button>
          <button className="btn-ghost" onClick={leave}>Back to lobby</button>
        </div>
      </div>
    );

  /* ---------------- render: game ---------------- */
  const mat = material(state);
  const flipped = myColor === 'b';
  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor: Color = flipped ? 'b' : 'w';
  const nameOf = (c: Color) => (c === 'w' ? game.white_name : game.black_name) ?? 'Player';
  const avatarOf = (c: Color) => (c === 'w' ? game.white_avatar : game.black_avatar) ?? { emoji: '🎮', color: 'violet' };
  const check = active && inCheck(state);
  const mateKing = game.status === 'finished' && game.result_reason === 'checkmate';
  const checkSq = check || mateKing ? kingSquare(state.board, turn) : -1;

  const Clock = ({ c }: { c: Color }) => {
    const running = active && turn === c && game.moves.length >= 2;
    const ms = clocks[c];
    return (
      <span
        className={`rounded-lg px-2.5 py-1 font-mono text-base font-bold tabular-nums ${
          running ? (ms < 20_000 ? 'bg-red-500 text-white' : 'bg-fg text-bg') : 'bg-surface2 text-muted'
        }`}
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
          {nameOf(c)}
          {c === myColor && <span className="text-xs font-semibold text-muted">(you)</span>}
        </span>
      }
      badge={
        c !== myColor && active ? (
          <span className={`h-2 w-2 shrink-0 rounded-full ${oppOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} title={oppOnline ? 'Online' : 'Not connected'} />
        ) : undefined
      }
      active={active && turn === c}
      captured={c === 'w' ? mat.byWhite : mat.byBlack}
      advantage={c === 'w' ? mat.diff : -mat.diff}
      right={<Clock c={c} />}
    />
  );

  let status: string;
  if (game.status === 'finished') {
    const r = REASON[game.result_reason ?? ''] ?? 'Game over';
    status = game.winner === null ? r : `${r} — ${game.winner === myColor ? 'you win! 🎉' : `${nameOf(game.winner)} wins`}`;
  } else if (firstMoveLeft !== null && myTurn) status = `Your move — make your first move within ${Math.max(0, Math.ceil(firstMoveLeft / 1000))}s`;
  else if (myTurn) status = check ? 'Check! Your move' : 'Your move';
  else status = `Waiting for ${nameOf(oppColor)}…`;

  return (
    <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
        {bar(topColor)}
        <ChessBoard
          state={state}
          legal={legal}
          interactive={myTurn}
          flipped={flipped}
          last={applied[applied.length - 1]}
          checkSq={checkSq}
          onMove={onMove}
          onSound={(s) => api.sound(s)}
        />
        {bar(bottomColor)}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className={`card p-4 ${game.status === 'finished' ? 'border-neon-purple/50' : ''}`}>
          <div className="font-display text-lg font-bold" aria-live="polite">{status}</div>
          <div className="mt-1 text-xs text-muted">Online · {game.time_ms / 60000} min · game {game.code}</div>
          {game.draw_offer && active && game.draw_offer !== myColor && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-neon-purple/10 p-3 text-sm">
              <span className="font-semibold">🤝 {nameOf(oppColor)} offers a draw</span>
              <button className="btn-primary !py-1.5" onClick={() => b && run(async () => accept(await b.answerDraw(game.id, true)))}>Accept</button>
              <button className="btn-ghost !py-1.5" onClick={() => b && run(async () => accept(await b.answerDraw(game.id, false)))}>Decline</button>
            </div>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {active ? (
              <>
                <button className={confirmResign ? 'btn bg-red-500 text-white !py-2' : 'btn-ghost !py-2'} onClick={resign} disabled={busy}>
                  🏳 {confirmResign ? 'Click again to resign' : 'Resign'}
                </button>
                <button
                  className="btn-ghost !py-2"
                  disabled={busy || game.draw_offer === myColor}
                  onClick={() => b && run(async () => accept(await b.offerDraw(game.id)))}
                >
                  🤝 {game.draw_offer === myColor ? 'Draw offered' : 'Offer draw'}
                </button>
                <button className="btn-ghost !py-2" onClick={leave}>← Lobby</button>
              </>
            ) : (
              <>
                <button
                  className="btn-primary animate-pop"
                  disabled={busy}
                  onClick={() => {
                    const t = game.time_ms;
                    setTimeMs(t);
                    leave();
                    if (b) void run(async () => accept(await b.findMatch(t, data.username, data.avatar)));
                  }}
                >
                  ⚔️ New opponent
                </button>
                <button className="btn-ghost" onClick={leave}>← Lobby</button>
              </>
            )}
          </div>
        </div>
        <MoveList sans={sans} emptyText={myColor === 'w' ? 'You play White — make the first move.' : 'You play Black — White moves first.'} />
        <p className="text-center text-xs text-muted">Click or drag pieces. Your clock only runs on your turn.</p>
      </div>
    </div>
  );
}
