import { useEffect, useState } from 'react';
import type { GameProps } from './shared';

type Cell = 'X' | 'O' | null;
type Mode = 'ai' | 'pvp';
type Diff = 'easy' | 'medium' | 'hard';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winner(b: Cell[]): { w: Cell; line: number[] } | null {
  for (const l of LINES) {
    const [a, c, d] = l;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { w: b[a], line: l };
  }
  return null;
}

function minimax(b: Cell[], turn: 'X' | 'O', depth: number): number {
  const w = winner(b);
  if (w) return w.w === 'O' ? 10 - depth : depth - 10;
  if (b.every(Boolean)) return 0;
  const scores: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    scores.push(minimax(b, turn === 'X' ? 'O' : 'X', depth + 1));
    b[i] = null;
  }
  return turn === 'O' ? Math.max(...scores) : Math.min(...scores);
}

function bestMove(b: Cell[]): number {
  let best = -Infinity;
  let moves: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    const copy = [...b];
    copy[i] = 'O';
    const s = minimax(copy, 'X', 0);
    if (s > best) {
      best = s;
      moves = [i];
    } else if (s === best) moves.push(i);
  }
  return moves[Math.floor(Math.random() * moves.length)];
}

function aiMove(b: Cell[], diff: Diff): number {
  const empty = b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
  const random = () => empty[Math.floor(Math.random() * empty.length)];
  if (diff === 'easy') return Math.random() < 0.25 ? bestMove(b) : random();
  if (diff === 'medium') return Math.random() < 0.7 ? bestMove(b) : random();
  return bestMove(b);
}

export default function TicTacToe({ api }: GameProps) {
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Diff>('medium');
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');
  const [starter, setStarter] = useState<'X' | 'O'>('X');
  const [tally, setTally] = useState({ X: 0, O: 0, draw: 0 });
  const [streak, setStreak] = useState(0);
  const [done, setDone] = useState(false);

  const result = winner(board);
  const isDraw = !result && board.every(Boolean);

  const newRound = (nextStarter = starter === 'X' ? 'O' : 'X') => {
    setBoard(Array(9).fill(null));
    setStarter(nextStarter as 'X' | 'O');
    setTurn(nextStarter as 'X' | 'O');
    setDone(false);
  };

  const resetAll = (m: Mode, d: Diff) => {
    setMode(m);
    setDiff(d);
    setTally({ X: 0, O: 0, draw: 0 });
    setStreak(0);
    api.setScore(0);
    newRound('X');
  };

  // end-of-round bookkeeping
  useEffect(() => {
    if (done || (!result && !isDraw)) return;
    setDone(true);
    if (result) setTally((t) => ({ ...t, [result.w!]: t[result.w as 'X' | 'O'] + 1 }));
    else setTally((t) => ({ ...t, draw: t.draw + 1 }));
    if (mode === 'ai') {
      const win = result?.w === 'X';
      const lose = result?.w === 'O';
      const s = win ? streak + 1 : lose ? 0 : streak;
      setStreak(s);
      api.setScore(s);
      api.sound(win ? 'win' : lose ? 'lose' : 'flip');
      api.finish(s, { win, draw: isDraw, difficulty: diff, vsAi: true });
    } else {
      api.sound(result ? 'win' : 'flip');
      api.finish(0, { vsAi: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, isDraw]);

  // AI turn
  useEffect(() => {
    if (mode !== 'ai' || turn !== 'O' || result || isDraw) return;
    const t = window.setTimeout(() => {
      setBoard((b) => {
        if (winner(b) || b.every(Boolean)) return b;
        const i = aiMove(b, diff);
        const nb = [...b];
        nb[i] = 'O';
        return nb;
      });
      setTurn('X');
      api.sound('move');
    }, 380);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, mode, diff, result, isDraw]);

  const play = (i: number) => {
    if (board[i] || result || isDraw) return;
    if (mode === 'ai' && turn === 'O') return;
    const nb = [...board];
    nb[i] = turn;
    setBoard(nb);
    setTurn(turn === 'X' ? 'O' : 'X');
    api.sound('click');
  };

  const status = result
    ? mode === 'ai'
      ? result.w === 'X' ? 'You win! 🎉' : 'AI wins 🤖'
      : `${result.w} wins! 🎉`
    : isDraw
      ? "It's a draw 🤝"
      : mode === 'ai'
        ? turn === 'X' ? 'Your turn (X)' : 'AI is thinking…'
        : `${turn}'s turn`;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
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
        <div className="card p-2"><div className="text-xs text-muted">{mode === 'ai' ? 'You (X)' : 'X'}</div><div className="font-mono text-xl font-bold text-neon-purple">{tally.X}</div></div>
        <div className="card p-2"><div className="text-xs text-muted">Draws</div><div className="font-mono text-xl font-bold">{tally.draw}</div></div>
        <div className="card p-2"><div className="text-xs text-muted">{mode === 'ai' ? 'AI (O)' : 'O'}</div><div className="font-mono text-xl font-bold text-neon-cyan">{tally.O}</div></div>
      </div>

      <div className="font-display text-lg font-bold" aria-live="polite">{status}</div>

      <div className="grid aspect-square w-full grid-cols-3 gap-2.5 rounded-2xl bg-surface2 p-2.5">
        {board.map((c, i) => {
          const inLine = result?.line.includes(i);
          return (
            <button
              key={i}
              onClick={() => play(i)}
              className={`grid place-items-center rounded-xl bg-surface text-5xl font-black transition-all hover:bg-line/60 sm:text-6xl ${inLine ? 'bg-gradient-to-br from-neon-purple/40 to-neon-blue/40 ring-2 ring-neon-purple' : ''}`}
              aria-label={`Square ${i + 1}${c ? `, ${c}` : ''}`}
            >
              {c && (
                <span className={`animate-pop ${c === 'X' ? 'text-neon-purple drop-shadow-[0_0_12px_rgba(168,85,247,.7)]' : 'text-neon-cyan drop-shadow-[0_0_12px_rgba(34,211,238,.7)]'}`}>
                  {c === 'X' ? '✕' : '◯'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        {mode === 'ai' && <span className="chip">🔥 Win streak: {streak}</span>}
        {(result || isDraw) && (
          <button className="btn-primary animate-pop" onClick={() => newRound()}>Next round</button>
        )}
      </div>
    </div>
  );
}
