import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import {
  cloneState,
  colorOf,
  fromFen,
  legalMoves,
  make,
  positionKey,
  sqName,
  START_FEN,
  toSan,
  type Color,
  type Move,
  type PieceChar,
  type Promo,
  type State,
} from './engine';

/* Shared chess UI pieces: board (click + drag + promotion), player bars, move list. */

export interface PlainMove {
  from: number;
  to: number;
  promo?: Promo;
}

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

export function Piece({ p, size = '100%' }: { p: PieceChar; size?: string }) {
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

/** Replay a move list from the start position. Stops at the first invalid move. */
export function replay(moves: PlainMove[]) {
  const state = fromFen(START_FEN);
  const sans: string[] = [];
  const keys: string[] = [positionKey(state)];
  const applied: Move[] = [];
  const positions: State[] = [cloneState(state)];
  let valid = true;
  for (const pm of moves) {
    const m = legalMoves(state).find((x) => x.from === pm.from && x.to === pm.to && (x.promo ?? undefined) === (pm.promo ?? undefined));
    if (!m) {
      valid = false;
      break;
    }
    sans.push(toSan(state, m));
    make(state, m);
    applied.push(m);
    keys.push(positionKey(state));
    positions.push(cloneState(state));
  }
  return { state, sans, keys, applied, positions, valid };
}

export function material(state: State) {
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
  const sum = (c: Color) => state.board.reduce((a, p) => a + (p && colorOf(p) === c ? VALUE[p.toLowerCase()] : 0), 0);
  return { byWhite: lost('b'), byBlack: lost('w'), diff: sum('w') - sum('b') };
}

export function PlayerBar({
  color,
  name,
  active,
  captured,
  advantage,
  badge,
  right,
}: {
  color: Color;
  name: ReactNode;
  active: boolean;
  captured: PieceChar[];
  advantage: number;
  badge?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className={`flex min-h-9 items-center gap-2 rounded-xl px-2 py-1 ${active ? 'bg-neon-purple/15 ring-1 ring-neon-purple/40' : ''}`}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm ${color === 'w' ? 'bg-white text-black' : 'bg-slate-900 text-white ring-1 ring-white/20'}`}>{color === 'w' ? '♔' : '♚'}</span>
      <span className="min-w-0 truncate text-sm font-bold">{name}</span>
      {badge}
      <span className="flex min-w-0 flex-1 flex-wrap items-center text-[15px] leading-none opacity-90">
        {captured.map((p, i) => (
          <Piece key={i} p={p} size="15px" />
        ))}
        {advantage > 0 && <span className="ml-1 text-xs font-bold text-muted">+{advantage}</span>}
      </span>
      {right}
    </div>
  );
}

export function MoveList({ sans, emptyText, viewing, onSelect }: { sans: string[]; emptyText: string; viewing?: number | null; onSelect?: (ply: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewing == null) ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [sans.length, viewing]);
  const current = viewing ?? sans.length; // ply shown on the board
  const cell = (ply: number) => {
    const san = sans[ply - 1];
    if (!san) return <span />;
    const on = ply === current;
    return (
      <button
        type="button"
        onClick={() => onSelect?.(ply)}
        className={`rounded px-1 text-left transition hover:bg-surface2 ${on ? 'bg-neon-purple/20 font-bold text-neon-purple' : ''}`}
      >
        {san}
      </button>
    );
  };
  return (
    <div className="card flex min-h-[140px] flex-1 flex-col p-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Moves</div>
      <div ref={ref} className="max-h-[240px] flex-1 overflow-y-auto font-mono text-sm">
        {sans.length === 0 ? (
          <p className="text-muted">{emptyText}</p>
        ) : (
          <ol className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-0.5" aria-label="Move list">
            {Array.from({ length: Math.ceil(sans.length / 2) }, (_, i) => (
              <li key={i} className="contents">
                <span className="py-0.5 text-muted">{i + 1}.</span>
                {cell(i * 2 + 1)}
                {cell(i * 2 + 2)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function slideStyle(m: Move, flipped: boolean): CSSProperties {
  const col = (sq: number) => (flipped ? 7 - (sq & 7) : sq & 7);
  const row = (sq: number) => (flipped ? 7 - (sq >> 3) : sq >> 3);
  return {
    ['--dx' as string]: `${(col(m.from) - col(m.to)) * 100}%`,
    ['--dy' as string]: `${(row(m.from) - row(m.to)) * 100}%`,
    animation: 'pieceslide .18s ease-out both',
  };
}

/** ⏮ ◀ ▶ ⏭ controls for reviewing earlier positions. view = ply shown, or null for the live position. */
export function BoardNav({ total, view, setView }: { total: number; view: number | null; setView: (v: number | null) => void }) {
  const cur = view ?? total;
  const go = (v: number) => setView(v >= total ? null : Math.max(0, v));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(cur - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(cur + 1);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const btn = 'btn-ghost h-9 flex-1 !p-0 text-base';
  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} onClick={() => go(0)} disabled={cur === 0} aria-label="First move">⏮</button>
      <button className={btn} onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Previous move">◀</button>
      <button className={btn} onClick={() => go(cur + 1)} disabled={view === null} aria-label="Next move">▶</button>
      <button className={btn} onClick={() => setView(null)} disabled={view === null} aria-label="Latest position">⏭</button>
    </div>
  );
}

/** Interactive board. `interactive` = the local player may move pieces of the side to move. */
export function ChessBoard({
  state,
  legal,
  interactive,
  flipped,
  last,
  checkSq,
  onMove,
  onSound,
  animKey,
}: {
  animKey?: string | number;
  state: State;
  legal: Move[];
  interactive: boolean;
  flipped: boolean;
  last?: Move;
  checkSq: number;
  onMove: (m: Move) => void;
  onSound: (s: 'click' | 'error') => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; sx: number; sy: number; piece: PieceChar } | null>(null);
  const pressedSelect = useRef(false);
  const turn = state.turn;

  // clear selection whenever the position changes
  const posKey = useMemo(() => state.board.join('') + state.turn, [state]);
  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [posKey]);

  const canMovePiece = (sq: number) => interactive && colorOf(state.board[sq]) === turn;

  const tryMove = (from: number, to: number) => {
    const ms = legal.filter((m) => m.from === from && m.to === to);
    if (!ms.length) return false;
    if (ms.length > 1 && ms[0].promo) {
      setPromo({ from, to });
      return true;
    }
    onMove(ms[0]);
    return true;
  };

  const clickSquare = (sq: number) => {
    if (promo) return;
    if (selected !== null && selected !== sq && tryMove(selected, sq)) return;
    if (canMovePiece(sq)) {
      if (pressedSelect.current) {
        pressedSelect.current = false;
        return;
      }
      setSelected(selected === sq ? null : sq);
    } else setSelected(null);
  };

  const onPointerDown = (e: RPointerEvent, sq: number) => {
    if (e.button !== 0 || !canMovePiece(sq) || promo) return;
    if (selected !== sq) onSound('click');
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
      if (to >= 0 && to !== from && !tryMove(from, to)) onSound('error');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.from]);

  const targets = selected !== null ? legal.filter((m) => m.from === selected) : [];
  const dragMoved = !!drag && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) > 6;
  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
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
                {f === cols[0] && <span className={`absolute left-0.5 top-0 text-[9px] font-bold sm:text-[11px] ${light ? 'text-[#8b7bc8]' : 'text-[#ece8fb]'}`}>{8 - r}</span>}
                {r === rows[7] && <span className={`absolute bottom-0 right-1 text-[9px] font-bold sm:text-[11px] ${light ? 'text-[#8b7bc8]' : 'text-[#ece8fb]'}`}>{'abcdefgh'[f]}</span>}
                {p && (
                  <span
                    key={last && last.to === sq ? `slide-${animKey}` : 'still'}
                    className={`relative grid h-full w-full place-items-center text-[clamp(26px,9.5vw,58px)] ${last && last.to === sq ? 'z-[2]' : 'z-[1]'} ${dragging ? 'opacity-30' : ''}`}
                    style={last && last.to === sq && !dragMoved ? slideStyle(last, flipped) : undefined}
                  >
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
                    if (m) onMove(m);
                    setPromo(null);
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

      {drag && dragMoved && (
        <div className="pointer-events-none fixed z-[90] -translate-x-1/2 -translate-y-1/2 text-[clamp(32px,11vw,68px)]" style={{ left: drag.x, top: drag.y }}>
          <Piece p={drag.piece} size="1em" />
        </div>
      )}
    </div>
  );
}
