import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { chooseMove, type Level } from './chess/ai';
import {
  colorOf,
  fromFen,
  inCheck,
  kingSquare,
  legalMoves,
  make,
  outcome,
  positionKey,
  sqName,
  START_FEN,
  toFen,
  toSan,
  type Color,
  type Move,
  type Outcome,
  type PieceChar,
  type Promo,
} from './chess/engine';
import type { GameProps } from './shared';

/* Chess — full rules, vs friend or AI (easy / medium / hard, runs in a web worker). */

type Mode = 'ai' | 'pvp';
interface PlainMove { from: number; to: number; promo?: Promo }
interface Save {
  mode: Mode;
  level: Level;
  human: Color;
  moves: PlainMove[];
  resigned: Color | null;
  reported: boolean;
  streak: number;
}

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const REASON: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  insufficient: 'Draw — not enough pieces to mate',
  fifty: 'Draw — 50-move rule',
  repetition: 'Draw — threefold repetition',
  resign: 'Resignation',
};

function Piece({ p, size = '100%' }: { p: PieceChar; size?: string }) {
  const white = colorOf(p) === 'w';
  return (
    <span
      className="pointer-events-none select-none leading-none"
      style={{
        fontSize: size,
        color: white ? '#ffffff' : '#1a1033',
        textShadow: white
          ? '0 0 1px #000, 0 0 1px #000, 0 0 2px #000, 0 2px 4px rgba(0,0,0,.45)'
          : '0 0 1px #fff, 0 0 1px rgba(255,255,255,.7), 0 2px 4px rgba(0,0,0,.35)',
        fontFamily: '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", "DejaVu Sans", sans-serif',
      }}
    >
      {GLYPH[p.toLowerCase()]}
      {'︎'}
    </span>
  );
}

/** Replay a move list from the start position. */
function replay(moves: PlainMove[]) {
  const s = fromFen(START_FEN);
  const sans: string[] = [];
  const keys: string[] = [positionKey(s)];
  const applied: Move[] = [];
  for (const pm of moves) {
    const m = legalMoves(s).find((x) => x.from === pm.from && x.to === pm.to && (x.promo ?? undefined) === (pm.promo ?? undefined));
    if (!m) break; // corrupted save: stop at the last valid move
    sans.push(toSan(s, m));
    make(s, m);
    applied.push(m);
    keys.push(positionKey(s));
  }
  return { state: s, sans, keys, applied };
}

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
  const loaded = api.load<Save>();
  const initial: Save = {
    mode: loaded?.mode ?? 'ai',
    level: loaded?.level ?? 'medium',
    human: loaded?.human ?? 'w',
    moves: fresh ? [] : loaded?.moves ?? [],
    resigned: fresh ? null : loaded?.resigned ?? null,
    reported: fresh ? false : loaded?.reported ?? false,
    streak: loaded?.streak ?? 0,
  };
  const [g, setG] = useState<Save>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [flipManual, setFlipManual] = useState(false);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; sx: number; sy: number; piece: PieceChar } | null>(null);
  const pressedSelect = useRef(false);
  const reqId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { state, sans, keys, applied } = useMemo(() => replay(g.moves), [g.moves]);
  const result: Outcome = useMemo(() => {
    if (g.resigned) return { over: true, winner: g.resigned === 'w' ? 'b' : 'w', reason: 'resign' };
    return outcome(state, keys);
  }, [state, keys, g.resigned]);
  const legal = useMemo(() => (result.over ? [] : legalMoves(state)), [state, result.over]);
  const turn = state.turn;
  const humanTurn = g.mode === 'pvp' || turn === g.human;
  const flipped = g.mode === 'ai' ? g.human === 'b' : flipManual;
  const last = applied[applied.length - 1];
  const check = !result.over && inCheck(state);
  const checkSq = check || (result.over && result.reason === 'checkmate') ? kingSquare(state.board, turn) : -1;

  // persist
  useEffect(() => {
    api.save(g);
  }, [g, api]);

  // scroll move list
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [sans.length]);

  const pushMove = useCallback(
    (m: Move) => {
      api.sound(m.captured ? 'point' : 'move');
      setG((prev) => ({ ...prev, moves: [...prev.moves, { from: m.from, to: m.to, promo: m.promo }] }));
      setSelected(null);
      setPromo(null);
    },
    [api],
  );

  // check sound after a move
  useEffect(() => {
    if (check) api.sound('flip');
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
      w.postMessage({ id, fen, level: g.level });
      return () => w.removeEventListener('message', onMsg);
    }
    const t = window.setTimeout(() => deliver(chooseMove(fromFen(fen), g.level)), 30);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.moves.length, g.mode, g.human, g.level, result.over]);

  // game over → report once
  useEffect(() => {
    if (!result.over || g.reported) return;
    const moveCount = Math.ceil(g.moves.length / 2);
    if (g.mode === 'ai') {
      const win = result.winner === g.human;
      const lose = result.winner !== null && !win;
      const streak = win ? g.streak + 1 : lose ? 0 : g.streak;
      setG((p) => ({ ...p, reported: true, streak }));
      api.setScore(streak);
      api.sound(win ? 'win' : lose ? 'lose' : 'flip');
      api.finish(streak, { win, draw: result.winner === null, difficulty: g.level, vsAi: true, moves: moveCount, reason: result.reason });
    } else {
      setG((p) => ({ ...p, reported: true }));
      api.sound('win');
      api.finish(0, { vsAi: false, moves: moveCount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.over]);

  useEffect(() => {
    api.setScore(g.streak);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- interaction ---------------- */
  const targetsFrom = (sq: number) => legal.filter((m) => m.from === sq);
  const canMovePiece = (sq: number) => humanTurn && !thinking && !result.over && colorOf(state.board[sq]) === turn;

  const tryMove = (from: number, to: number) => {
    const ms = legal.filter((m) => m.from === from && m.to === to);
    if (!ms.length) return false;
    if (ms.length > 1 && ms[0].promo) {
      setPromo({ from, to });
      return true;
    }
    pushMove(ms[0]);
    return true;
  };

  const clickSquare = (sq: number) => {
    if (promo) return;
    if (selected !== null && selected !== sq && tryMove(selected, sq)) return;
    if (canMovePiece(sq)) {
      if (pressedSelect.current) {
        pressedSelect.current = false; // already selected on pointer-down
        return;
      }
      setSelected(selected === sq ? null : sq);
    } else setSelected(null);
  };

  const onPointerDown = (e: RPointerEvent, sq: number) => {
    if (e.button !== 0 || !canMovePiece(sq) || promo) return;
    if (selected !== sq) api.sound('click');
    setSelected(sq);
    pressedSelect.current = true;
    setDrag({ from: sq, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, piece: state.board[sq] as PieceChar });
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-sq]') as HTMLElement | null;
      const to = el ? Number(el.dataset.sq) : -1;
      const from = drag.from;
      setDrag(null);
      if (to >= 0 && to !== from) {
        if (!tryMove(from, to)) api.sound('error');
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.from]);

  const newGame = (patch: Partial<Save> = {}) => {
    reqId.current++;
    setThinking(false);
    setSelected(null);
    setPromo(null);
    setG((p) => ({ ...p, ...patch, moves: [], resigned: null, reported: false }));
    api.sound('click');
  };

  const undo = () => {
    if (thinking || !g.moves.length) return;
    reqId.current++;
    let n = 1;
    if (g.mode === 'ai') {
      // take back the AI reply and your move, so it's your turn again
      n = turn === g.human ? 2 : 1;
      if (g.moves.length < n) n = g.moves.length;
    }
    setG((p) => ({ ...p, moves: p.moves.slice(0, p.moves.length - n), resigned: null, reported: result.over ? p.reported : false }));
    setSelected(null);
    api.sound('move');
  };

  const resign = () => {
    if (result.over || !g.moves.length) return;
    const loser: Color = g.mode === 'ai' ? g.human : turn;
    reqId.current++;
    setThinking(false);
    setG((p) => ({ ...p, resigned: loser }));
  };

  /* ---------------- derived display ---------------- */
  const captured = useMemo(() => {
    const count: Record<string, number> = {};
    for (const p of state.board) if (p) count[p] = (count[p] ?? 0) + 1;
    const lost = (c: Color) => {
      const out: PieceChar[] = [];
      for (const t of ['q', 'r', 'b', 'n', 'p']) {
        const key = (c === 'w' ? t.toUpperCase() : t) as PieceChar;
        const missing = Math.max(0, START_COUNT[t] - (count[key] ?? 0));
        for (let i = 0; i < missing; i++) out.push(key);
      }
      return out;
    };
    const material = (c: Color) => state.board.reduce((a, p) => a + (p && colorOf(p) === c ? VALUE[p.toLowerCase()] : 0), 0);
    return { byWhite: lost('b'), byBlack: lost('w'), diff: material('w') - material('b') };
  }, [state]);

  const targets = selected !== null ? targetsFrom(selected) : [];
  const dragMoved = !!drag && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 6;
  const names: Record<Color, string> = g.mode === 'ai' ? (g.human === 'w' ? { w: 'You', b: 'AI' } : { w: 'AI', b: 'You' }) : { w: 'White', b: 'Black' };

  let status: string;
  if (result.over) {
    if (result.winner === null) status = REASON[result.reason];
    else if (g.mode === 'ai') status = `${REASON[result.reason]} — ${result.winner === g.human ? 'you win! 🎉' : 'AI wins 🤖'}`;
    else status = `${REASON[result.reason]} — ${result.winner === 'w' ? 'White' : 'Black'} wins! 🎉`;
  } else if (thinking) status = 'AI is thinking…';
  else if (g.mode === 'ai') status = check ? 'Check! Your move' : 'Your move';
  else status = `${turn === 'w' ? 'White' : 'Black'} to move${check ? ' — check!' : ''}`;

  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor: Color = flipped ? 'b' : 'w';

  const PlayerBar = ({ c }: { c: Color }) => {
    const caps = c === 'w' ? captured.byWhite : captured.byBlack;
    const adv = c === 'w' ? captured.diff : -captured.diff;
    return (
      <div className={`flex h-9 items-center gap-2 rounded-xl px-2 ${!result.over && turn === c ? 'bg-neon-purple/15 ring-1 ring-neon-purple/40' : ''}`}>
        <span className={`grid h-6 w-6 place-items-center rounded-md text-sm ${c === 'w' ? 'bg-white text-black' : 'bg-slate-900 text-white ring-1 ring-white/20'}`}>{c === 'w' ? '♔' : '♚'}</span>
        <span className="text-sm font-bold">{names[c]}</span>
        {g.mode === 'ai' && names[c] === 'AI' && <span className="chip !py-0 !text-[10px] capitalize">{g.level}</span>}
        <span className="flex min-w-0 flex-1 flex-wrap items-center text-[15px] leading-none opacity-90">
          {caps.map((p, i) => (
            <Piece key={i} p={p} size="15px" />
          ))}
          {adv > 0 && <span className="ml-1 text-xs font-bold text-muted">+{adv}</span>}
        </span>
        {thinking && names[c] === 'AI' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-neon-purple" />}
      </div>
    );
  };

  return (
    <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,560px)_1fr]">
      {/* board column */}
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
        <PlayerBar c={topColor} />
        <div className="relative w-full select-none">
          <div className="no-touch-scroll grid aspect-square w-full grid-cols-8 overflow-hidden rounded-xl border-4 border-[#2e1065] shadow-neon">
            {rows.map((r) =>
              cols.map((f) => {
                const sq = r * 8 + f;
                const p = state.board[sq];
                const light = (r + f) % 2 === 0;
                const isTarget = targets.some((m) => m.to === sq);
                const isLast = last && (last.from === sq || last.to === sq);
                const dragging = drag?.from === sq && dragMoved;
                return (
                  <div
                    key={sq}
                    data-sq={sq}
                    role="button"
                    tabIndex={-1}
                    aria-label={`${sqName(sq)}${p ? ` ${p}` : ''}`}
                    onClick={() => clickSquare(sq)}
                    onPointerDown={(e) => onPointerDown(e, sq)}
                    className="relative grid aspect-square place-items-center"
                    style={{ background: light ? '#ece8fb' : '#8b7bc8', cursor: canMovePiece(sq) || isTarget ? 'pointer' : 'default' }}
                  >
                    {isLast && <div className="absolute inset-0 bg-yellow-300/45" />}
                    {selected === sq && <div className="absolute inset-0 bg-neon-cyan/45" />}
                    {sq === checkSq && <div className="absolute inset-0" style={{ background: 'radial-gradient(circle, rgba(239,68,68,.95) 0%, rgba(239,68,68,.55) 45%, transparent 75%)' }} />}
                    {/* coordinates */}
                    {f === cols[0] && <span className={`absolute left-0.5 top-0 text-[9px] font-bold sm:text-[11px] ${light ? 'text-[#8b7bc8]' : 'text-[#ece8fb]'}`}>{8 - r}</span>}
                    {r === rows[7] && <span className={`absolute bottom-0 right-1 text-[9px] font-bold sm:text-[11px] ${light ? 'text-[#8b7bc8]' : 'text-[#ece8fb]'}`}>{'abcdefgh'[f]}</span>}
                    {p && (
                      <span className={`relative grid h-full w-full place-items-center text-[clamp(26px,9.5vw,58px)] ${dragging ? 'opacity-30' : ''}`}>
                        <Piece p={p as PieceChar} size="1em" />
                      </span>
                    )}
                    {isTarget &&
                      (p ? (
                        <div className="pointer-events-none absolute inset-[4%] rounded-full border-[5px] border-black/30" />
                      ) : (
                        <div className="pointer-events-none absolute h-[30%] w-[30%] rounded-full bg-black/25" />
                      ))}
                  </div>
                );
              }),
            )}
          </div>

          {promo && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/55 backdrop-blur-[2px]">
              <div className="card animate-pop p-4 text-center">
                <div className="mb-3 font-display font-bold">Promote to…</div>
                <div className="flex gap-2">
                  {(['q', 'r', 'b', 'n'] as Promo[]).map((t) => (
                    <button
                      key={t}
                      className="grid h-16 w-16 place-items-center rounded-xl bg-surface2 text-5xl transition hover:bg-neon-purple/30"
                      onClick={() => {
                        const m = legal.find((x) => x.from === promo.from && x.to === promo.to && x.promo === t);
                        if (m) pushMove(m);
                      }}
                      aria-label={`Promote to ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[t]}`}
                    >
                      <Piece p={(turn === 'w' ? t.toUpperCase() : t) as PieceChar} size="1em" />
                    </button>
                  ))}
                </div>
                <button className="mt-3 text-xs font-semibold text-muted underline" onClick={() => setPromo(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
        <PlayerBar c={bottomColor} />
      </div>

      {/* side panel */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className={`card p-4 ${result.over ? 'border-neon-purple/50' : ''}`}>
          <div className="flex items-center gap-2 font-display text-lg font-bold" aria-live="polite">
            {status}
          </div>
          {g.mode === 'ai' && <div className="mt-1 text-sm text-muted">🔥 Win streak vs AI: <b className="text-fg">{g.streak}</b></div>}
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
          <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
            {(['ai', 'pvp'] as Mode[]).map((m) => (
              <button key={m} onClick={() => newGame({ mode: m })} className={`rounded-lg px-3 py-1.5 transition ${g.mode === m ? 'bg-surface shadow' : 'text-muted'}`}>
                {m === 'ai' ? '🤖 vs AI' : '👥 vs Friend'}
              </button>
            ))}
          </div>
          {g.mode === 'ai' && (
            <>
              <div className="grid grid-cols-3 rounded-xl bg-surface2 p-1 text-sm font-semibold">
                {(['easy', 'medium', 'hard'] as Level[]).map((l) => (
                  <button key={l} onClick={() => newGame({ level: l })} className={`rounded-lg px-2 py-1.5 capitalize transition ${g.level === l ? 'bg-surface shadow' : 'text-muted'}`}>
                    {l}
                  </button>
                ))}
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
          <p className="text-xs text-muted">Changing these starts a new game.</p>
        </div>

        <div className="card flex min-h-[160px] flex-1 flex-col p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Moves</div>
          <div ref={listRef} className="max-h-[260px] flex-1 overflow-y-auto font-mono text-sm">
            {sans.length === 0 ? (
              <p className="text-muted">No moves yet. {g.mode === 'ai' && g.human === 'b' ? 'The AI plays first.' : 'White moves first.'}</p>
            ) : (
              <ol className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-0.5">
                {Array.from({ length: Math.ceil(sans.length / 2) }, (_, i) => (
                  <li key={i} className="contents">
                    <span className="text-muted">{i + 1}.</span>
                    <span className={i * 2 === sans.length - 1 ? 'font-bold text-neon-purple' : ''}>{sans[i * 2]}</span>
                    <span className={i * 2 + 1 === sans.length - 1 ? 'font-bold text-neon-purple' : ''}>{sans[i * 2 + 1] ?? ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-muted">Click or tap a piece, then a square — or drag it. Your game is saved automatically.</p>
      </div>

      {drag && dragMoved && (
        <div className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-1/2 text-[clamp(32px,11vw,68px)]" style={{ left: drag.x, top: drag.y }}>
          <Piece p={drag.piece} size="1em" />
        </div>
      )}
    </div>
  );
}
