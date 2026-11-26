import { useEffect, useRef, useState } from 'react';
import type { GameProps } from './shared';

type Diff = 'beginner' | 'intermediate';
const CFG: Record<Diff, { w: number; h: number; mines: number; base: number; floor: number }> = {
  beginner: { w: 9, h: 9, mines: 10, base: 1000, floor: 100 },
  intermediate: { w: 16, h: 16, mines: 40, base: 3000, floor: 300 },
};

interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  n: number;
}
type Status = 'ready' | 'playing' | 'won' | 'lost';

const NUM_COLORS = ['', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#f97316', '#06b6d4', '#eab308', '#94a3b8'];

const empty = (d: Diff): Cell[] => Array.from({ length: CFG[d].w * CFG[d].h }, () => ({ mine: false, open: false, flag: false, n: 0 }));

function neighbours(i: number, w: number, h: number) {
  const x = i % w, y = Math.floor(i / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
    }
  return out;
}

function plant(d: Diff, safe: number): Cell[] {
  const { w, h, mines } = CFG[d];
  const cells = empty(d);
  const forbidden = new Set([safe, ...neighbours(safe, w, h)]);
  let placed = 0;
  while (placed < mines) {
    const i = Math.floor(Math.random() * cells.length);
    if (cells[i].mine || forbidden.has(i)) continue;
    cells[i].mine = true;
    placed++;
  }
  cells.forEach((c, i) => (c.n = neighbours(i, w, h).filter((j) => cells[j].mine).length));
  return cells;
}

export default function Minesweeper({ api }: GameProps) {
  const [diff, setDiff] = useState<Diff>('beginner');
  const [cells, setCells] = useState<Cell[]>(() => empty('beginner'));
  const [status, setStatus] = useState<Status>('ready');
  const [flagMode, setFlagMode] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [boom, setBoom] = useState<number | null>(null);
  const press = useRef<{ t: number; i: number; fired: boolean } | null>(null);
  const { w, h, mines } = CFG[diff];

  useEffect(() => {
    if (status !== 'playing' || !start) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(t);
  }, [status, start]);

  const reset = (d = diff) => {
    setDiff(d);
    setCells(empty(d));
    setStatus('ready');
    setStart(null);
    setElapsed(0);
    setBoom(null);
    api.setScore(0);
  };

  const flood = (cs: Cell[], i: number) => {
    const stack = [i];
    while (stack.length) {
      const k = stack.pop()!;
      const c = cs[k];
      if (c.open || c.flag) continue;
      c.open = true;
      if (c.n === 0 && !c.mine) stack.push(...neighbours(k, w, h));
    }
  };

  const checkEnd = (cs: Cell[], hitMine: number | null) => {
    if (hitMine !== null) {
      cs.forEach((c) => c.mine && (c.open = true));
      setBoom(hitMine);
      setStatus('lost');
      api.sound('lose');
      api.finish(0, { win: false, difficulty: diff });
      return;
    }
    if (cs.every((c) => c.mine || c.open)) {
      cs.forEach((c) => c.mine && (c.flag = true));
      const secs = Math.max(1, Math.round((Date.now() - (start ?? Date.now())) / 1000));
      setElapsed(secs);
      const cfg = CFG[diff];
      const score = Math.max(cfg.floor, cfg.base - secs * 5);
      setStatus('won');
      api.setScore(score);
      api.sound('win');
      api.finish(score, { win: true, difficulty: diff });
    }
  };

  const reveal = (i: number) => {
    if (status === 'won' || status === 'lost') return;
    let cs = cells.map((c) => ({ ...c }));
    if (status === 'ready') {
      cs = plant(diff, i);
      setStatus('playing');
      setStart(Date.now());
    }
    const c = cs[i];
    if (c.flag) return;
    if (c.open) {
      // chord
      if (c.n > 0) {
        const nb = neighbours(i, w, h);
        const flags = nb.filter((j) => cs[j].flag).length;
        if (flags === c.n) {
          let hit: number | null = null;
          for (const j of nb) {
            if (!cs[j].flag && !cs[j].open) {
              if (cs[j].mine) hit = j;
              else flood(cs, j);
            }
          }
          setCells(cs);
          api.sound('click');
          checkEnd(cs, hit);
        }
      }
      return;
    }
    if (c.mine) {
      setCells(cs);
      checkEnd(cs, i);
      return;
    }
    flood(cs, i);
    setCells(cs);
    api.sound('click');
    checkEnd(cs, null);
  };

  const toggleFlag = (i: number) => {
    if (status === 'won' || status === 'lost' || status === 'ready') return;
    setCells((prev) => (prev[i].open ? prev : prev.map((c, k) => (k === i ? { ...c, flag: !c.flag } : c))));
    api.sound('tick');
  };

  const flagsLeft = mines - cells.filter((c) => c.flag).length;
  const face = status === 'lost' ? '😵' : status === 'won' ? '😎' : '🙂';

  return (
    <div className="flex w-full flex-col items-center gap-3" style={{ maxWidth: diff === 'beginner' ? 420 : 600 }}>
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {(['beginner', 'intermediate'] as Diff[]).map((d) => (
            <button key={d} onClick={() => reset(d)} className={`rounded-lg px-3 py-1.5 capitalize transition ${diff === d ? 'bg-surface shadow' : 'text-muted'}`}>
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFlagMode((f) => !f)}
          className={`btn !py-1.5 ${flagMode ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white' : 'bg-surface2'}`}
          aria-pressed={flagMode}
        >
          🚩 Flag mode {flagMode ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="card flex w-full items-center justify-between px-4 py-2">
        <span className="font-mono text-lg font-bold text-rose-400">🚩 {flagsLeft}</span>
        <button onClick={() => reset()} className="text-3xl transition hover:scale-110" aria-label="New game">{face}</button>
        <span className="font-mono text-lg font-bold text-neon-cyan">⏱ {elapsed}</span>
      </div>

      <div
        className="no-touch-scroll relative grid w-full select-none gap-[2px] rounded-xl bg-line p-[2px]"
        style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {cells.map((c, i) => (
          <button
            key={i}
            className={`grid aspect-square place-items-center rounded-[3px] font-mono font-black leading-none transition-colors ${
              c.open
                ? c.mine
                  ? i === boom ? 'bg-rose-500' : 'bg-rose-500/30'
                  : 'bg-surface'
                : 'bg-gradient-to-br from-surface2 to-line/80 hover:from-neon-purple/30 hover:to-neon-blue/30'
            }`}
            style={{ fontSize: w > 10 ? 'clamp(9px, 2.6vw, 16px)' : 'clamp(14px, 4.5vw, 24px)', color: NUM_COLORS[c.n] }}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse') return;
              press.current = { t: Date.now(), i, fired: false };
              const id = i;
              window.setTimeout(() => {
                if (press.current && press.current.i === id && !press.current.fired && Date.now() - press.current.t >= 380) {
                  press.current.fired = true;
                  toggleFlag(id);
                  navigator.vibrate?.(20);
                }
              }, 400);
            }}
            onPointerLeave={() => {
              if (!press.current?.fired) press.current = null;
            }}
            onClick={() => {
              const longPressed = press.current?.fired;
              press.current = null;
              if (longPressed) return;
              if (flagMode && !cells[i].open) toggleFlag(i);
              else reveal(i);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              toggleFlag(i);
            }}
            aria-label={c.open ? (c.mine ? 'Mine' : c.n ? `${c.n}` : 'Empty') : c.flag ? 'Flagged' : 'Hidden'}
          >
            {c.open ? (c.mine ? '💣' : c.n || '') : c.flag ? '🚩' : ''}
          </button>
        ))}
        {(status === 'won' || status === 'lost') && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center animate-fade-up">
            <div className="card flex items-center gap-3 px-4 py-3 shadow-2xl">
              <span className="font-display font-bold">{status === 'won' ? `Cleared in ${elapsed}s! 🎉` : 'Boom! 💥'}</span>
              <button className="btn-primary !py-1.5" onClick={() => reset()}>Play again</button>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted">Right-click or long-press to flag · click a number to chord · first click is always safe</p>
    </div>
  );
}
