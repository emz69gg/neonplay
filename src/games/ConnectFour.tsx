import { useEffect, useRef, useState } from 'react';
import { useKey, type GameProps } from './shared';

/* Connect Four — vs friend or alpha-beta AI (iterative deepening with a time budget). */

const C = 7;
const R = 6;
type Cell = 0 | 1 | 2; // 1 = red (you / P1), 2 = yellow (AI / P2)
type Mode = 'ai' | 'pvp';
type Diff = 'easy' | 'medium' | 'hard';
type Board = Cell[]; // index = r * C + c, r = 0 is the top row

const idx = (r: number, c: number) => r * C + c;
const emptyBoard = (): Board => Array(R * C).fill(0);
const ORDER = [3, 2, 4, 1, 5, 0, 6];

function dropRow(b: Board, c: number) {
  for (let r = R - 1; r >= 0; r--) if (!b[idx(r, c)]) return r;
  return -1;
}

function winLine(b: Board): number[] | null {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const p = b[idx(r, c)];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        const line = [idx(r, c)];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= R || cc < 0 || cc >= C || b[idx(rr, cc)] !== p) break;
          line.push(idx(rr, cc));
        }
        if (line.length === 4) return line;
      }
    }
  return null;
}

function wonAt(b: Board, r: number, c: number) {
  const p = b[idx(r, c)];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < R && cc >= 0 && cc < C && b[idx(rr, cc)] === p) {
        n++;
        rr += dr * s;
        cc += dc * s;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}

function scoreWindow(a: Cell, b: Cell, c: Cell, d: Cell, me: Cell) {
  const opp = me === 1 ? 2 : 1;
  let mine = 0, theirs = 0, empty = 0;
  for (const x of [a, b, c, d]) x === me ? mine++ : x === opp ? theirs++ : empty++;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -8;
  if (theirs === 2 && empty === 2) return -2;
  return 0;
}

function evaluate(b: Board, me: Cell) {
  let s = 0;
  for (let r = 0; r < R; r++) s += (b[idx(r, 3)] === me ? 4 : b[idx(r, 3)] ? -4 : 0);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (c + 3 < C) s += scoreWindow(b[idx(r, c)], b[idx(r, c + 1)], b[idx(r, c + 2)], b[idx(r, c + 3)], me);
      if (r + 3 < R) s += scoreWindow(b[idx(r, c)], b[idx(r + 1, c)], b[idx(r + 2, c)], b[idx(r + 3, c)], me);
      if (r + 3 < R && c + 3 < C) s += scoreWindow(b[idx(r, c)], b[idx(r + 1, c + 1)], b[idx(r + 2, c + 2)], b[idx(r + 3, c + 3)], me);
      if (r + 3 < R && c - 3 >= 0) s += scoreWindow(b[idx(r, c)], b[idx(r + 1, c - 1)], b[idx(r + 2, c - 2)], b[idx(r + 3, c - 3)], me);
    }
  return s;
}

class Timeout extends Error {}

function search(b: Board, depth: number, alpha: number, beta: number, turn: Cell, me: Cell, deadline: number, filled: number): number {
  if (performance.now() > deadline) throw new Timeout();
  if (filled === R * C) return 0;
  if (depth === 0) return evaluate(b, me);
  const maximizing = turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const c of ORDER) {
    const r = dropRow(b, c);
    if (r < 0) continue;
    b[idx(r, c)] = turn;
    let v: number;
    if (wonAt(b, r, c)) v = (maximizing ? 1 : -1) * (100000 + depth);
    else v = search(b, depth - 1, alpha, beta, turn === 1 ? 2 : 1, me, deadline, filled + 1);
    b[idx(r, c)] = 0;
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (alpha >= beta) break;
  }
  return best;
}

function bestMove(board: Board, me: Cell, maxDepth: number, budgetMs: number): number {
  const b = [...board];
  const filled = b.filter(Boolean).length;
  const valid = ORDER.filter((c) => dropRow(b, c) >= 0);
  // immediate win / block first
  for (const who of [me, me === 1 ? 2 : 1] as Cell[])
    for (const c of valid) {
      const r = dropRow(b, c);
      b[idx(r, c)] = who;
      const w = wonAt(b, r, c);
      b[idx(r, c)] = 0;
      if (w) return c;
    }
  const deadline = performance.now() + budgetMs;
  let choice = valid[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let bestV = -Infinity;
      let bestC = valid[0];
      for (const c of valid) {
        const r = dropRow(b, c);
        b[idx(r, c)] = me;
        const v = search(b, depth - 1, -Infinity, Infinity, me === 1 ? 2 : 1, me, deadline, filled + 1);
        b[idx(r, c)] = 0;
        if (v > bestV) {
          bestV = v;
          bestC = c;
        }
      }
      choice = bestC;
      if (bestV >= 100000) break;
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return choice;
}

function aiChoice(b: Board, diff: Diff): number {
  const valid = ORDER.filter((c) => dropRow(b, c) >= 0);
  const random = valid[Math.floor(Math.random() * valid.length)];
  if (diff === 'easy') return Math.random() < 0.45 ? bestMove(b, 2, 2, 50) : random;
  if (diff === 'medium') return Math.random() < 0.15 ? random : bestMove(b, 2, 4, 120);
  return bestMove(b, 2, 9, 260);
}

export default function ConnectFour({ api }: GameProps) {
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Diff>('medium');
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [turn, setTurn] = useState<Cell>(1);
  const [starter, setStarter] = useState<Cell>(1);
  const [last, setLast] = useState<number | null>(null);
  const [hover, setHover] = useState<number>(3);
  const [thinking, setThinking] = useState(false);
  const [tally, setTally] = useState({ p1: 0, p2: 0, draw: 0 });
  const [streak, setStreak] = useState(0);
  const [roundDone, setRoundDone] = useState(false);
  const lockRef = useRef(false);

  const line = winLine(board);
  const full = board.every(Boolean);
  const over = !!line || full;

  const newRound = (first: Cell = starter === 1 ? 2 : 1) => {
    setBoard(emptyBoard());
    setStarter(first);
    setTurn(first);
    setLast(null);
    setRoundDone(false);
    lockRef.current = false;
  };

  const resetAll = (m: Mode, d: Diff) => {
    setMode(m);
    setDiff(d);
    setTally({ p1: 0, p2: 0, draw: 0 });
    setStreak(0);
    api.setScore(0);
    newRound(1);
  };

  const play = (c: number, who: Cell) => {
    setBoard((b) => {
      if (winLine(b) || b.every(Boolean)) return b;
      const r = dropRow(b, c);
      if (r < 0) return b;
      const nb = [...b];
      nb[idx(r, c)] = who;
      setLast(idx(r, c));
      return nb;
    });
    setTurn(who === 1 ? 2 : 1);
    api.sound('move');
  };

  const humanPlay = (c: number) => {
    if (over || thinking || lockRef.current) return;
    if (mode === 'ai' && turn !== 1) return;
    if (dropRow(board, c) < 0) {
      api.sound('error');
      return;
    }
    lockRef.current = true;
    play(c, turn);
    window.setTimeout(() => (lockRef.current = false), 120);
  };

  // AI move
  useEffect(() => {
    if (mode !== 'ai' || turn !== 2 || over) return;
    setThinking(true);
    const t = window.setTimeout(() => {
      const c = aiChoice(board, diff);
      play(c, 2);
      setThinking(false);
    }, 420);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, mode, diff, over]);

  // round end
  useEffect(() => {
    if (!over || roundDone) return;
    setRoundDone(true);
    const winner = line ? board[line[0]] : 0;
    setTally((t) => ({ p1: t.p1 + (winner === 1 ? 1 : 0), p2: t.p2 + (winner === 2 ? 1 : 0), draw: t.draw + (winner ? 0 : 1) }));
    if (mode === 'ai') {
      const win = winner === 1;
      const lose = winner === 2;
      const s = win ? streak + 1 : lose ? 0 : streak;
      setStreak(s);
      api.setScore(s);
      api.sound(win ? 'win' : lose ? 'lose' : 'flip');
      api.finish(s, { win, draw: !winner, difficulty: diff, vsAi: true });
    } else {
      api.sound(winner ? 'win' : 'flip');
      api.finish(0, { vsAi: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  useKey((e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => Math.max(0, h - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHover((h) => Math.min(C - 1, h + 1));
    } else if (e.key === 'Enter' || e.code === 'Space' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (over) newRound();
      else humanPlay(hover);
    } else if (/^[1-7]$/.test(e.key)) humanPlay(Number(e.key) - 1);
  });

  const winner = line ? board[line[0]] : 0;
  const names = mode === 'ai' ? { 1: 'You', 2: 'AI' } : { 1: 'Red', 2: 'Yellow' };
  const status = line
    ? mode === 'ai'
      ? winner === 1 ? 'You win! 🎉' : 'AI wins 🤖'
      : `${names[winner as 1 | 2]} wins! 🎉`
    : full
      ? "It's a draw 🤝"
      : mode === 'ai'
        ? turn === 1 ? 'Your turn — drop a red disc' : 'AI is thinking…'
        : `${names[turn as 1 | 2]}'s turn`;
  const discColor = (p: Cell) => (p === 1 ? 'radial-gradient(circle at 35% 30%, #fda4af, #ef4444 55%, #b91c1c)' : 'radial-gradient(circle at 35% 30%, #fef08a, #eab308 55%, #a16207)');
  const canHover = !over && !thinking && (mode === 'pvp' || turn === 1);

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {(['ai', 'pvp'] as Mode[]).map((m) => (
            <button key={m} onClick={() => resetAll(m, diff)} className={`rounded-lg px-3 py-1.5 transition ${mode === m ? 'bg-surface shadow' : 'text-muted'}`}>
              {m === 'ai' ? '🤖 vs AI' : '👥 vs Friend'}
            </button>
          ))}
        </div>
        {mode === 'ai' && (
          <div className="grid grid-cols-3 rounded-xl bg-surface2 p-1 text-sm font-semibold">
            {(['easy', 'medium', 'hard'] as Diff[]).map((d) => (
              <button key={d} onClick={() => resetAll('ai', d)} className={`rounded-lg px-3 py-1.5 capitalize transition ${diff === d ? 'bg-surface shadow' : 'text-muted'}`}>
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid w-full grid-cols-3 gap-2 text-center">
        <div className="card p-2"><div className="text-xs text-muted">🔴 {names[1]}</div><div className="font-mono text-xl font-bold text-red-400">{tally.p1}</div></div>
        <div className="card p-2"><div className="text-xs text-muted">Draws</div><div className="font-mono text-xl font-bold">{tally.draw}</div></div>
        <div className="card p-2"><div className="text-xs text-muted">🟡 {names[2]}</div><div className="font-mono text-xl font-bold text-yellow-400">{tally.p2}</div></div>
      </div>

      <div className="flex items-center gap-2 font-display text-lg font-bold" aria-live="polite">
        {thinking && <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-neon-purple" />}
        {status}
      </div>

      <div className="w-full select-none">
        {/* preview row */}
        <div className="grid grid-cols-7 gap-1.5 px-2 sm:gap-2 sm:px-3">
          {Array.from({ length: C }, (_, c) => (
            <div key={c} className="aspect-square p-[6%]">
              {canHover && hover === c && <div className="h-full w-full rounded-full opacity-70" style={{ background: discColor(turn) }} />}
            </div>
          ))}
        </div>
        <div className="relative rounded-2xl bg-gradient-to-b from-blue-600 to-blue-800 p-2 shadow-[0_20px_50px_-20px_rgba(37,99,235,.7)] sm:p-3">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: C }, (_, c) => (
              <button
                key={c}
                className={`grid grid-rows-6 gap-1.5 rounded-xl transition sm:gap-2 ${canHover && hover === c ? 'bg-white/10' : ''}`}
                onMouseEnter={() => setHover(c)}
                onFocus={() => setHover(c)}
                onClick={() => {
                  setHover(c);
                  humanPlay(c);
                }}
                aria-label={`Column ${c + 1}`}
              >
                {Array.from({ length: R }, (_, r) => {
                  const v = board[idx(r, c)];
                  const win = line?.includes(idx(r, c));
                  return (
                    <div key={r} className="aspect-square rounded-full bg-slate-950/80 p-[6%] shadow-[inset_0_3px_6px_rgba(0,0,0,.6)]">
                      {v !== 0 && (
                        <div
                          className={`h-full w-full rounded-full ${win ? 'ring-4 ring-white ring-offset-0 animate-pulse' : ''}`}
                          style={{
                            background: discColor(v),
                            ['--from' as string]: `-${(r + 1) * 115}%`,
                            animation: last === idx(r, c) ? 'discdrop .45s cubic-bezier(.5,0,.75,0) both' : undefined,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {mode === 'ai' && <span className="chip">🔥 Win streak: {streak}</span>}
        {over && <button className="btn-primary animate-pop" onClick={() => newRound()}>Next round</button>}
      </div>
      <p className="hidden text-center text-xs text-muted sm:block">Click a column · or ←/→ and Enter · or keys 1–7</p>
    </div>
  );
}
