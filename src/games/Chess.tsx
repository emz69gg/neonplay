import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/ui';
import { BOTS, botById, botMove, suggestedBot, type BotId } from './chess/ai';
import { BoardNav, ChessBoard, material, MoveList, PlayerBar, replay, type PlainMove } from './chess/ChessBoard';
import { fromFen, inCheck, kingSquare, legalMoves, outcome, toFen, type Color, type Move, type Outcome } from './chess/engine';
import { useChessRating } from './chess/rating';
import type { GameProps } from './shared';

/* Chess — full rules; vs AI (web worker), vs a friend on this device, or online vs real players. */

const ChessOnline = lazy(() => import('./chess/ChessOnline'));

type Mode = 'ai' | 'pvp' | 'online';
interface Save {
  mode: Mode;
  bot: BotId;
  /** bots you have beaten at least once */
  beaten: BotId[];
  human: Color;
  moves: PlainMove[];
  resigned: Color | null;
  reported: boolean;
  streak: number;
}

const REASON: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  insufficient: 'Draw — not enough pieces to mate',
  fifty: 'Draw — 50-move rule',
  repetition: 'Draw — threefold repetition',
  resign: 'Resignation',
};

const hasActiveOnlineGame = () => {
  try {
    return !!localStorage.getItem('neonplay:chessOnlineActive');
  } catch {
    return false;
  }
};

let worker: Worker | null | undefined;
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./chess/ai.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

export default function Chess({ api, fresh }: GameProps) {
  const [params, setParams] = useSearchParams();
  const joinCode = params.get('join');
  const loaded = api.load<Save & { level?: string }>();
  // older saves stored a difficulty level instead of a bot
  const legacyBot: Record<string, BotId> = { easy: 'rookie', medium: 'clubber', hard: 'expert' };
  const [g, setG] = useState<Save>(() => ({
    // jump back into an online game that's still running
    mode: joinCode || hasActiveOnlineGame() ? 'online' : loaded?.mode ?? 'ai',
    bot: loaded?.bot ?? legacyBot[loaded?.level ?? ''] ?? 'clubber',
    beaten: loaded?.beaten ?? [],
    human: loaded?.human ?? 'w',
    moves: fresh ? [] : loaded?.moves ?? [],
    resigned: fresh ? null : loaded?.resigned ?? null,
    reported: fresh ? false : loaded?.reported ?? false,
    streak: loaded?.streak ?? 0,
  }));
  const [thinking, setThinking] = useState(false);
  const [flipManual, setFlipManual] = useState(false);
  const reqId = useRef(0);
  const bot = botById(g.bot);
  const rating = useChessRating();
  const nextUnbeaten = BOTS.find((b) => !g.beaten.includes(b.id)) ?? BOTS[BOTS.length - 1];
  const recommended = rating && rating.games > 0 ? suggestedBot(rating.rating) : nextUnbeaten;

  const { state, sans, keys, applied, positions } = useMemo(() => replay(g.moves), [g.moves]);
  const [view, setView] = useState<number | null>(null); // reviewing an earlier position
  useEffect(() => setView(null), [g.moves.length]);
  const result: Outcome = useMemo(() => {
    if (g.resigned) return { over: true, winner: g.resigned === 'w' ? 'b' : 'w', reason: 'resign' };
    return outcome(state, keys);
  }, [state, keys, g.resigned]);
  const legal = useMemo(() => (result.over ? [] : legalMoves(state)), [state, result.over]);
  const turn = state.turn;
  const local = g.mode !== 'online';
  const humanTurn = g.mode === 'pvp' || turn === g.human;
  const flipped = g.mode === 'ai' ? g.human === 'b' : flipManual;
  const check = !result.over && inCheck(state);
  const checkSq = check || (result.over && result.reason === 'checkmate') ? kingSquare(state.board, turn) : -1;

  useEffect(() => {
    api.save(g);
  }, [g, api]);

  const pushMove = useCallback(
    (m: Move) => {
      api.sound(m.captured ? 'point' : 'move');
      setG((prev) => ({ ...prev, moves: [...prev.moves, m.promo ? { from: m.from, to: m.to, promo: m.promo } : { from: m.from, to: m.to }] }));
    },
    [api],
  );

  useEffect(() => {
    if (local && check) api.sound('flip');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.moves.length]);

  // AI move
  useEffect(() => {
    if (g.mode !== 'ai' || result.over || turn === g.human) return;
    const id = ++reqId.current;
    const fen = toFen(state);
    const started = performance.now();
    setThinking(true);
    const deliver = (mv: Move | null) => {
      if (id !== reqId.current || !mv) return;
      const wait = Math.max(0, 450 - (performance.now() - started));
      window.setTimeout(() => {
        if (id !== reqId.current) return;
        setThinking(false);
        pushMove(mv);
      }, wait);
    };
    const w = getWorker();
    if (w) {
      const onMsg = (e: MessageEvent<{ id: number; move: Move | null }>) => {
        if (e.data.id === id) {
          w.removeEventListener('message', onMsg);
          deliver(e.data.move);
        }
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ id, fen, bot: g.bot });
      return () => w.removeEventListener('message', onMsg);
    }
    const t = window.setTimeout(() => deliver(botMove(fromFen(fen), bot)), 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.moves.length, g.mode, g.human, g.bot, result.over]);

  // local game over → report once
  useEffect(() => {
    if (!local || !result.over || g.reported) return;
    const moveCount = Math.ceil(g.moves.length / 2);
    if (g.mode === 'ai') {
      const win = result.winner === g.human;
      const lose = result.winner !== null && !win;
      const streak = win ? g.streak + 1 : lose ? 0 : g.streak;
      setG((p) => ({ ...p, reported: true, streak, beaten: win && !p.beaten.includes(p.bot) ? [...p.beaten, p.bot] : p.beaten }));
      api.setScore(streak);
      api.sound(win ? 'win' : lose ? 'lose' : 'flip');
      api.finish(streak, { win, draw: result.winner === null, difficulty: bot.tier, bot: bot.id, botElo: bot.elo, vsAi: true, moves: moveCount, reason: result.reason });
    } else {
      setG((p) => ({ ...p, reported: true }));
      api.sound('win');
      api.finish(0, { vsAi: false, moves: moveCount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.over, local]);

  useEffect(() => {
    api.setScore(g.streak);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = (mode: Mode) => {
    if (mode === g.mode) return;
    reqId.current++;
    setThinking(false);
    // switching between local modes starts a new game; online keeps the local game untouched
    if (mode === 'online' || g.mode === 'online') setG((p) => ({ ...p, mode }));
    else setG((p) => ({ ...p, mode, moves: [], resigned: null, reported: false }));
    api.sound('click');
  };

  const newGame = (patch: Partial<Save> = {}) => {
    reqId.current++;
    setThinking(false);
    setG((p) => ({ ...p, ...patch, moves: [], resigned: null, reported: false }));
    api.sound('click');
  };

  const undo = () => {
    if (thinking || !g.moves.length) return;
    reqId.current++;
    let n = 1;
    if (g.mode === 'ai') n = Math.min(g.moves.length, turn === g.human ? 2 : 1);
    setG((p) => ({ ...p, moves: p.moves.slice(0, p.moves.length - n), resigned: null }));
    api.sound('move');
  };

  const resign = () => {
    if (result.over || !g.moves.length) return;
    reqId.current++;
    setThinking(false);
    setG((p) => ({ ...p, resigned: p.mode === 'ai' ? p.human : turn }));
  };

  const shown = view === null ? state : positions[view];
  const mat = useMemo(() => material(shown), [shown]);
  const botName = `${bot.emoji} ${bot.name}`;
  const youName = rating && rating.games > 0 ? `You (${rating.rating})` : 'You';
  const names: Record<Color, string> = g.mode === 'ai' ? (g.human === 'w' ? { w: youName, b: botName } : { w: botName, b: youName }) : { w: 'White', b: 'Black' };
  const isBot = (c: Color) => g.mode === 'ai' && c !== g.human;

  let status: string;
  if (result.over) {
    if (result.winner === null) status = REASON[result.reason];
    else if (g.mode === 'ai') status = `${REASON[result.reason]} — ${result.winner === g.human ? `you beat ${bot.name}! 🎉` : `${bot.name} wins ${bot.emoji}`}`;
    else status = `${REASON[result.reason]} — ${result.winner === 'w' ? 'White' : 'Black'} wins! 🎉`;
  } else if (thinking) status = `${bot.name} is thinking…`;
  else if (g.mode === 'ai') status = check ? 'Check! Your move' : 'Your move';
  else status = `${turn === 'w' ? 'White' : 'Black'} to move${check ? ' — check!' : ''}`;

  const bar = (c: Color) => (
    <PlayerBar
      color={c}
      name={names[c]}
      active={!result.over && turn === c}
      captured={c === 'w' ? mat.byWhite : mat.byBlack}
      advantage={c === 'w' ? mat.diff : -mat.diff}
      badge={isBot(c) ? <span className="chip !py-0 !text-[10px]">{bot.elo}</span> : undefined}
      right={thinking && isBot(c) ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-neon-purple" /> : undefined}
    />
  );

  const modeTabs = (
    <div className="grid grid-cols-3 rounded-xl bg-surface2 p-1 text-sm font-semibold">
      {(['ai', 'pvp', 'online'] as Mode[]).map((m) => (
        <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-2 py-1.5 transition ${g.mode === m ? 'bg-surface shadow' : 'text-muted'}`}>
          {m === 'ai' ? '🤖 vs Bots' : m === 'pvp' ? '👥 Same device' : '🌐 Online'}
        </button>
      ))}
    </div>
  );

  if (g.mode === 'online')
    return (
      <div className="flex w-full max-w-5xl flex-col items-center gap-4">
        <div className="w-full max-w-md">{modeTabs}</div>
        <Suspense fallback={<Spinner label="Loading online chess…" />}>
          <ChessOnline
            api={api}
            initialJoin={joinCode}
            onJoinHandled={() => {
              const p = new URLSearchParams(params);
              p.delete('join');
              setParams(p, { replace: true });
            }}
          />
        </Suspense>
      </div>
    );

  return (
    <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
        {bar(flipped ? 'w' : 'b')}
        <ChessBoard
          state={shown}
          legal={view === null ? legal : []}
          interactive={view === null && humanTurn && !thinking && !result.over}
          flipped={flipped}
          last={applied[(view ?? applied.length) - 1]}
          animKey={view ?? applied.length}
          checkSq={view === null ? checkSq : -1}
          onMove={pushMove}
          onSound={(s) => api.sound(s)}
        />
        {bar(flipped ? 'b' : 'w')}
        <BoardNav total={applied.length} view={view} setView={setView} />
        {view !== null && (
          <button className="btn-ghost w-full !py-1.5 text-xs" onClick={() => setView(null)}>
            Viewing move {Math.ceil(view / 2)}{view % 2 ? '' : '…'} — back to the game ⏭
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className={`card p-4 ${result.over ? 'border-neon-purple/50' : ''}`}>
          <div className="font-display text-lg font-bold" aria-live="polite">{status}</div>
          {g.mode === 'ai' && <div className="mt-1 text-sm text-muted">🔥 Win streak vs bots: <b className="text-fg">{g.streak}</b></div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {result.over ? (
              <button className="btn-primary animate-pop" onClick={() => newGame()}>New game</button>
            ) : (
              <>
                <button className="btn-ghost !py-2" onClick={undo} disabled={thinking || !g.moves.length}>↶ Undo</button>
                <button className="btn-ghost !py-2" onClick={resign} disabled={!g.moves.length || thinking}>🏳 Resign</button>
              </>
            )}
            {g.mode === 'pvp' && <button className="btn-ghost !py-2" onClick={() => setFlipManual((f) => !f)}>⇅ Flip</button>}
          </div>
        </div>

        <div className="card space-y-3 p-4">
          {modeTabs}
          {g.mode === 'ai' && (
            <>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
                  <span className="font-semibold uppercase tracking-wide">Practice bots</span>
                  <span>{rating && rating.games > 0 ? <>Your rating: <b className="text-fg">{rating.rating}</b></> : `${g.beaten.length}/${BOTS.length} beaten`}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:grid-cols-4" role="radiogroup" aria-label="Choose a bot">
                  {BOTS.map((b) => (
                    <button
                      key={b.id}
                      role="radio"
                      aria-checked={g.bot === b.id}
                      title={`${b.name} (${b.elo}) — ${b.blurb}`}
                      onClick={() => newGame({ bot: b.id })}
                      className={`relative flex flex-col items-center rounded-xl border px-1 py-1.5 text-center transition ${g.bot === b.id ? 'border-neon-purple bg-neon-purple/10 shadow' : 'border-line bg-surface2 hover:border-neon-purple/50'}`}
                    >
                      {g.beaten.includes(b.id) && <span className="absolute right-1 top-0.5 text-[10px] text-emerald-500" aria-label="beaten">✓</span>}
                      <span className="text-xl leading-none">{b.emoji}</span>
                      <span className="mt-0.5 text-[11px] font-semibold leading-tight">{b.name}</span>
                      <span className="text-[10px] text-muted">{b.elo}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-xl bg-surface2 px-3 py-2 text-xs">
                  <b>{bot.emoji} {bot.name} · {bot.elo}</b> — <span className="text-muted">{bot.blurb}</span>
                  {recommended.id !== bot.id ? (
                    <button className="mt-1 block font-semibold text-neon-purple hover:underline" onClick={() => newGame({ bot: recommended.id })}>
                      {rating && rating.games > 0 ? `Recommended for your ${rating.rating} rating` : 'Next challenge'}: {recommended.emoji} {recommended.name} ({recommended.elo}) →
                    </button>
                  ) : (
                    <span className="mt-1 block font-semibold text-emerald-500">{rating && rating.games > 0 ? '✓ A good match for your rating' : '✓ Your next challenge'}</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
                {(['w', 'b'] as Color[]).map((c) => (
                  <button key={c} onClick={() => newGame({ human: c })} className={`rounded-lg px-2 py-1.5 transition ${g.human === c ? 'bg-surface shadow' : 'text-muted'}`}>
                    {c === 'w' ? '♔ Play White' : '♚ Play Black'}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="text-xs text-muted">Changing these starts a new game. Want a real opponent? Try 🌐 Online.</p>
        </div>

        <MoveList sans={sans} viewing={view} onSelect={(ply) => setView(ply >= sans.length ? null : ply)} emptyText={g.mode === 'ai' && g.human === 'b' ? `${bot.name} plays first.` : 'White moves first.'} />
        <p className="text-center text-xs text-muted">Click or tap a piece, then a square — or drag it. Your game is saved automatically.</p>
      </div>
    </div>
  );
}
