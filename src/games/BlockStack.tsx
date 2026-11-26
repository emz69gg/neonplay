import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useKey, type GameProps } from './shared';

/* Block Stack — falling-blocks puzzle with SRS rotation, 7-bag, hold, ghost, lock delay. */

const COLS = 10;
const ROWS = 20;
type Kind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type Cell = Kind | null;
type Phase = 'ready' | 'playing' | 'paused' | 'over';

const BASE: Record<Kind, number[][]> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const COLORS: Record<Kind, string> = { I: '#22d3ee', O: '#facc15', T: '#a855f7', S: '#4ade80', Z: '#f43f5e', J: '#3b82f6', L: '#fb923c' };

const rotateCW = (m: number[][]) => m[0].map((_, i) => m.map((row) => row[i]).reverse());
const SHAPES: Record<Kind, number[][][]> = Object.fromEntries(
  (Object.keys(BASE) as Kind[]).map((k) => {
    const r0 = BASE[k];
    const r1 = rotateCW(r0);
    const r2 = rotateCW(r1);
    const r3 = rotateCW(r2);
    return [k, [r0, r1, r2, r3]];
  }),
) as Record<Kind, number[][][]>;

// SRS wall kicks (x right, y up) keyed "from>to"
const KICKS_JLSTZ: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

interface Piece { kind: Kind; rot: number; x: number; y: number }
interface Save {
  board: Cell[][];
  cur: Piece;
  queue: Kind[];
  bag: Kind[];
  hold: Kind | null;
  score: number;
  lines: number;
  bestClear: number;
  over: boolean;
}

const emptyBoard = (): Cell[][] => Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
const spawn = (kind: Kind): Piece => ({ kind, rot: 0, x: kind === 'O' ? 4 : 3, y: kind === 'I' ? -1 : 0 });
const newBag = (): Kind[] => {
  const b: Kind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const levelOf = (lines: number) => 1 + Math.floor(lines / 10);
const gravityMs = (level: number) => Math.max(40, 1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1));

function cells(p: Piece): [number, number][] {
  const out: [number, number][] = [];
  SHAPES[p.kind][p.rot].forEach((row, y) => row.forEach((v, x) => v && out.push([p.x + x, p.y + y])));
  return out;
}
function fits(board: Cell[][], p: Piece) {
  return cells(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !board[y][x]));
}

function MiniPiece({ kind, dim = false }: { kind: Kind | null; dim?: boolean }) {
  if (!kind) return <div className="h-8 w-full sm:h-10" />;
  const m = SHAPES[kind][0].filter((r) => r.some(Boolean));
  const w = Math.max(...m.map((r) => r.lastIndexOf(1) + 1));
  const start = Math.min(...m.map((r) => (r.indexOf(1) === -1 ? 9 : r.indexOf(1))));
  return (
    <div className={`flex h-8 w-full items-center justify-center sm:h-10 ${dim ? 'opacity-40' : ''}`}>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${w - start}, var(--mp))` }}>
        {m.flatMap((r, y) =>
          r.slice(start, w).map((v, x) => (
            <div key={`${x}-${y}`} className="h-[var(--mp)] w-[var(--mp)] rounded-[3px]" style={{ background: v ? COLORS[kind] : 'transparent', boxShadow: v ? `0 0 6px ${COLORS[kind]}` : undefined }} />
          )),
        )}
      </div>
    </div>
  );
}

export default function BlockStack({ api, fresh }: GameProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const saved = fresh ? undefined : api.load<Save>();
  const resumable = !!saved && !saved.over;
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const setP = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const [ui, setUi] = useState({ score: 0, lines: 0, level: 1, hold: null as Kind | null, next: [] as Kind[], holdUsed: false });
  const [lastClear, setLastClear] = useState<{ text: string; k: number } | null>(null);

  const st = useRef({
    board: emptyBoard(),
    cur: spawn('T'),
    queue: [] as Kind[],
    bag: [] as Kind[],
    hold: null as Kind | null,
    holdUsed: false,
    score: 0,
    lines: 0,
    bestClear: 0,
    gravAcc: 0,
    lockAt: 0 as number, // ms remaining until lock when grounded (0 = not grounded)
    lockResets: 0,
    clearing: [] as number[],
    clearT: 0,
    softDrop: false,
    das: { dir: 0, t: 0, repeat: false },
  });

  const syncUi = useCallback(() => {
    const s = st.current;
    setUi({ score: s.score, lines: s.lines, level: levelOf(s.lines), hold: s.hold, next: s.queue.slice(0, 3), holdUsed: s.holdUsed });
    api.setScore(s.score);
  }, [api]);

  const persist = useCallback(
    (over = false) => {
      const s = st.current;
      api.save({ board: s.board, cur: s.cur, queue: s.queue, bag: s.bag, hold: s.hold, score: s.score, lines: s.lines, bestClear: s.bestClear, over } satisfies Save);
    },
    [api],
  );

  const pull = useCallback((): Kind => {
    const s = st.current;
    while (s.queue.length < 5) {
      if (!s.bag.length) s.bag = newBag();
      s.queue.push(s.bag.shift()!);
    }
    return s.queue.shift()!;
  }, []);

  const gameOver = useCallback(() => {
    const s = st.current;
    setP('over');
    api.sound('lose');
    persist(true);
    api.finish(s.score, { lines: s.lines, level: levelOf(s.lines), bestClear: s.bestClear });
  }, [api, persist, setP]);

  const nextPiece = useCallback(
    (kind?: Kind) => {
      const s = st.current;
      s.cur = spawn(kind ?? pull());
      s.gravAcc = 0;
      s.lockAt = 0;
      s.lockResets = 0;
      if (!fits(s.board, s.cur)) gameOver();
    },
    [gameOver, pull],
  );

  const newGame = useCallback(() => {
    const s = st.current;
    Object.assign(s, { board: emptyBoard(), queue: [], bag: [], hold: null, holdUsed: false, score: 0, lines: 0, bestClear: 0, clearing: [], clearT: 0 });
    nextPiece();
    syncUi();
  }, [nextPiece, syncUi]);

  // restore a saved run
  useEffect(() => {
    if (resumable && saved) {
      Object.assign(st.current, { board: saved.board, cur: saved.cur, queue: saved.queue, bag: saved.bag, hold: saved.hold, score: saved.score, lines: saved.lines, bestClear: saved.bestClear });
      syncUi();
    } else newGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockPiece = useCallback(() => {
    const s = st.current;
    let above = false;
    for (const [x, y] of cells(s.cur)) {
      if (y < 0) above = true;
      else s.board[y][x] = s.cur.kind;
    }
    if (above) {
      gameOver();
      return;
    }
    const full: number[] = [];
    s.board.forEach((row, y) => row.every(Boolean) && full.push(y));
    if (full.length) {
      s.clearing = full;
      s.clearT = 260;
      const level = levelOf(s.lines);
      s.score += [0, 100, 300, 500, 800][full.length] * level;
      s.bestClear = Math.max(s.bestClear, full.length);
      api.sound(full.length >= 4 ? 'win' : 'point');
      setLastClear({ text: ['', 'Single', 'Double', 'Triple', 'FOUR LINES!'][full.length], k: Date.now() });
    } else {
      api.sound('move');
      nextPiece();
    }
    s.holdUsed = false;
    syncUi();
    persist();
  }, [api, gameOver, nextPiece, persist, syncUi]);

  /* ---------- actions ---------- */
  const tryMove = useCallback((dx: number, dy: number) => {
    const s = st.current;
    const p = { ...s.cur, x: s.cur.x + dx, y: s.cur.y + dy };
    if (!fits(s.board, p)) return false;
    s.cur = p;
    if (s.lockAt && s.lockResets < 15) {
      s.lockAt = 500;
      s.lockResets++;
    }
    return true;
  }, []);

  const rotate = useCallback(
    (dir: 1 | -1) => {
      const s = st.current;
      if (s.cur.kind === 'O') return;
      const from = s.cur.rot;
      const to = (from + dir + 4) % 4;
      const table = s.cur.kind === 'I' ? KICKS_I : KICKS_JLSTZ;
      for (const [kx, ky] of table[`${from}>${to}`]) {
        const p = { ...s.cur, rot: to, x: s.cur.x + kx, y: s.cur.y - ky };
        if (fits(s.board, p)) {
          s.cur = p;
          if (s.lockAt && s.lockResets < 15) {
            s.lockAt = 500;
            s.lockResets++;
          }
          api.sound('flip');
          return;
        }
      }
    },
    [api],
  );

  const hardDrop = useCallback(() => {
    const s = st.current;
    let n = 0;
    while (tryMove(0, 1)) n++;
    s.score += n * 2;
    lockPiece();
  }, [lockPiece, tryMove]);

  const hold = useCallback(() => {
    const s = st.current;
    if (s.holdUsed) return;
    const prev = s.hold;
    s.hold = s.cur.kind;
    nextPiece(prev ?? undefined);
    s.holdUsed = true;
    api.sound('click');
    syncUi();
  }, [api, nextPiece, syncUi]);

  const act = useCallback(
    (a: 'left' | 'right' | 'rotate' | 'rotateCCW' | 'soft' | 'drop' | 'hold') => {
      if (phaseRef.current !== 'playing' || st.current.clearing.length) return;
      if (a === 'left' && tryMove(-1, 0)) api.sound('tick');
      if (a === 'right' && tryMove(1, 0)) api.sound('tick');
      if (a === 'rotate') rotate(1);
      if (a === 'rotateCCW') rotate(-1);
      if (a === 'soft' && tryMove(0, 1)) st.current.score += 1;
      if (a === 'drop') hardDrop();
      if (a === 'hold') hold();
    },
    [api, hardDrop, hold, rotate, tryMove],
  );

  /* ---------- loop ---------- */
  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const w = canvas.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w && canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(w * 2 * dpr);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const update = (dt: number) => {
      const s = st.current;
      if (s.clearing.length) {
        s.clearT -= dt;
        if (s.clearT <= 0) {
          s.board = s.board.filter((_, y) => !s.clearing.includes(y));
          while (s.board.length < ROWS) s.board.unshift(Array<Cell>(COLS).fill(null));
          s.lines += s.clearing.length;
          s.clearing = [];
          api.reportScore(s.score);
          nextPiece();
          syncUi();
          persist();
        }
        return;
      }
      // DAS (held left/right)
      if (s.das.dir) {
        s.das.t += dt;
        const delay = s.das.repeat ? 45 : 170;
        if (s.das.t >= delay) {
          s.das.t = 0;
          s.das.repeat = true;
          tryMove(s.das.dir, 0);
        }
      }
      const grav = s.softDrop ? Math.min(40, gravityMs(levelOf(s.lines)) / 20) : gravityMs(levelOf(s.lines));
      const grounded = !fits(s.board, { ...s.cur, y: s.cur.y + 1 });
      if (grounded) {
        if (!s.lockAt) s.lockAt = 500;
        s.lockAt -= dt;
        if (s.lockAt <= 0) {
          s.lockAt = 0;
          lockPiece();
        }
      } else {
        s.lockAt = 0;
        s.gravAcc += dt;
        while (s.gravAcc >= grav) {
          s.gravAcc -= grav;
          if (!tryMove(0, 1)) break;
          if (s.softDrop) s.score += 1;
        }
      }
    };

    const draw = (now: number) => {
      const s = st.current;
      const W = canvas.width;
      const cell = W / COLS;
      const dark = document.documentElement.classList.contains('dark');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = dark ? '#0c0a1d' : '#ece9fb';
      ctx.fillRect(0, 0, W, canvas.height);
      ctx.strokeStyle = dark ? 'rgba(139,92,246,.12)' : 'rgba(99,102,241,.15)';
      ctx.lineWidth = 1;
      for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, ROWS * cell); ctx.stroke(); }
      for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(W, y * cell); ctx.stroke(); }

      const block = (x: number, y: number, color: string, alpha = 1) => {
        if (y < 0) return;
        const px = x * cell, py = y * cell, pad = cell * 0.06;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = cell * 0.35;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px + pad, py + pad, cell - pad * 2, cell - pad * 2, cell * 0.16);
        else ctx.rect(px + pad, py + pad, cell - pad * 2, cell - pad * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        ctx.fillRect(px + pad * 2, py + pad * 2, cell - pad * 4, cell * 0.14);
        ctx.globalAlpha = 1;
      };

      s.board.forEach((row, y) => row.forEach((c, x) => c && block(x, y, COLORS[c])));

      if (s.clearing.length) {
        const a = 0.5 + Math.sin(now / 30) * 0.4;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        for (const y of s.clearing) ctx.fillRect(0, y * cell, W, cell);
      } else if (phaseRef.current !== 'over') {
        // ghost
        let gy = s.cur.y;
        while (fits(s.board, { ...s.cur, y: gy + 1 })) gy++;
        ctx.strokeStyle = COLORS[s.cur.kind];
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.globalAlpha = 0.55;
        for (const [x, y] of cells({ ...s.cur, y: gy })) {
          if (y < 0) continue;
          ctx.strokeRect(x * cell + cell * 0.12, y * cell + cell * 0.12, cell * 0.76, cell * 0.76);
        }
        ctx.globalAlpha = 1;
        for (const [x, y] of cells(s.cur)) block(x, y, COLORS[s.cur.kind]);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      try {
        if (phaseRef.current === 'playing') update(dt);
        draw(now);
      } catch (err) {
        console.error(err);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [api, lockPiece, nextPiece, persist, syncUi, tryMove]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const s = st.current;
      const k = e.key;
      const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's', 'z', 'x', 'c', 'A', 'D', 'W', 'S', 'Z', 'X', 'C'].includes(k);
      if (!handled) return;
      e.preventDefault();
      if (phaseRef.current !== 'playing') return;
      if (e.repeat && !['ArrowDown', 's', 'S'].includes(k)) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { act('left'); s.das = { dir: -1, t: 0, repeat: false }; }
      if (k === 'ArrowRight' || k === 'd' || k === 'D') { act('right'); s.das = { dir: 1, t: 0, repeat: false }; }
      if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') act('rotate');
      if (k === 'z' || k === 'Z') act('rotateCCW');
      if (k === 'ArrowDown' || k === 's' || k === 'S') s.softDrop = true;
      if (k === ' ') act('drop');
      if (k === 'c' || k === 'C') act('hold');
    };
    const up = (e: KeyboardEvent) => {
      const s = st.current;
      if ((['ArrowLeft', 'a', 'A'].includes(e.key) && s.das.dir === -1) || (['ArrowRight', 'd', 'D'].includes(e.key) && s.das.dir === 1)) s.das = { dir: 0, t: 0, repeat: false };
      if (['ArrowDown', 's', 'S'].includes(e.key)) s.softDrop = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [act]);

  const start = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'over' || (p === 'ready' && !resumable)) newGame();
    setP('playing');
    api.sound('click');
  }, [api, newGame, resumable, setP]);

  const restartFresh = () => {
    newGame();
    setP('playing');
    api.sound('click');
  };

  useKey((e) => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (phaseRef.current === 'playing') setP('paused');
      else if (phaseRef.current === 'paused' && e.key !== 'Escape') setP('playing');
    } else if (e.key === 'Enter' && phaseRef.current !== 'playing') start();
  });

  useEffect(() => {
    const h = () => document.hidden && phaseRef.current === 'playing' && setP('paused');
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [setP]);

  /* ---------- touch gestures on the board ---------- */
  const touch = useRef<{ x: number; y: number; t: number; moved: number; dropped: boolean } | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    touch.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, dropped: false };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const t = touch.current;
    if (!t || e.pointerType === 'mouse') return;
    const cellPx = (cv.current?.clientWidth ?? 300) / COLS;
    const dx = e.clientX - t.x;
    const steps = Math.trunc(dx / cellPx);
    if (steps !== 0) {
      for (let i = 0; i < Math.abs(steps); i++) act(steps > 0 ? 'right' : 'left');
      t.x += steps * cellPx;
      t.moved += Math.abs(steps);
    }
    const dy = e.clientY - t.y;
    if (!t.dropped && dy > cellPx * 2.5 && t.moved === 0 && performance.now() - t.t < 350) {
      t.dropped = true;
      act('drop');
    }
  };
  const onPointerUp = (e: RPointerEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t || e.pointerType === 'mouse') return;
    const dist = Math.hypot(e.clientX - t.x, e.clientY - t.y);
    if (!t.dropped && t.moved === 0 && dist < 12 && performance.now() - t.t < 300) act('rotate');
  };

  const Btn = ({ a, label, aria }: { a: Parameters<typeof act>[0]; label: string; aria: string }) => (
    <button
      className="btn-ghost h-12 !p-0 text-lg active:bg-neon-purple/30"
      aria-label={aria}
      onPointerDown={(e) => {
        e.preventDefault();
        act(a);
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex w-full max-w-[560px] flex-col items-center gap-3 [--mp:9px] sm:[--mp:12px]">
      <div className="flex w-full items-start justify-center gap-2 sm:gap-3">
        {/* left panel */}
        <div className="flex w-[58px] shrink-0 flex-col gap-2 sm:w-[92px]">
          <div className="card px-1 py-2 text-center sm:p-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Hold<span className="hidden sm:inline"> (C)</span></div>
            <MiniPiece kind={ui.hold} dim={ui.holdUsed} />
          </div>
          <div className="card space-y-1.5 px-1 py-2 text-center sm:p-2">
            <div><div className="text-[10px] font-bold uppercase text-muted">Score</div><div className="font-mono text-sm font-bold">{ui.score.toLocaleString()}</div></div>
            <div><div className="text-[10px] font-bold uppercase text-muted">Lines</div><div className="font-mono text-sm font-bold">{ui.lines}</div></div>
            <div><div className="text-[10px] font-bold uppercase text-muted">Level</div><div className="font-mono text-sm font-bold text-neon-purple">{ui.level}</div></div>
          </div>
        </div>

        {/* board */}
        <div className="relative w-full max-w-[300px]" style={{ maxWidth: 'min(300px, 44vh)' }}>
          <canvas
            ref={cv}
            className="no-touch-scroll block aspect-[1/2] w-full select-none rounded-xl border border-line shadow-neon"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (touch.current = null)}
            aria-label="Block Stack board"
          />
          {lastClear && phase === 'playing' && (
            <div key={lastClear.k} className="pointer-events-none absolute inset-x-0 top-1/3 text-center">
              <span className="inline-block animate-pop rounded-xl bg-black/50 px-3 py-1 font-display text-xl font-black text-white">{lastClear.text}</span>
            </div>
          )}
          {phase !== 'playing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/60 px-4 text-center text-white backdrop-blur-[2px]">
              <div className="text-4xl">{phase === 'over' ? '🧱' : phase === 'paused' ? '⏸' : '🟦'}</div>
              <div className="font-display text-2xl font-bold">{phase === 'over' ? 'Game over' : phase === 'paused' ? 'Paused' : 'Block Stack'}</div>
              {phase === 'over' && <div className="text-sm text-white/80">{ui.score.toLocaleString()} points · {ui.lines} lines</div>}
              {phase === 'ready' && resumable && <div className="text-sm text-white/80">Saved run: {ui.score.toLocaleString()} points</div>}
              <button className="btn-primary" onClick={start}>
                {phase === 'paused' ? 'Resume' : phase === 'over' ? 'Play again' : resumable ? 'Continue' : 'Start'}
              </button>
              {phase === 'ready' && resumable && (
                <button className="text-xs font-semibold text-white/70 underline" onClick={restartFresh}>Start a new game</button>
              )}
            </div>
          )}
        </div>

        {/* right panel */}
        <div className="flex w-[58px] shrink-0 flex-col gap-2 sm:w-[92px]">
          <div className="card px-1 py-2 text-center sm:p-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Next</div>
            {ui.next.map((k, i) => (
              <MiniPiece key={i} kind={k} />
            ))}
          </div>
          <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => (phase === 'playing' ? setP('paused') : start())}>
            {phase === 'playing' ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>
      </div>

      {/* touch buttons */}
      <div className="grid w-full max-w-sm grid-cols-6 gap-1.5 [@media(pointer:fine)]:hidden">
        <Btn a="left" label="◀" aria="Move left" />
        <Btn a="right" label="▶" aria="Move right" />
        <Btn a="rotate" label="⟳" aria="Rotate" />
        <Btn a="soft" label="▼" aria="Soft drop" />
        <Btn a="drop" label="⤓" aria="Hard drop" />
        <Btn a="hold" label="H" aria="Hold" />
      </div>
      <p className="text-center text-xs text-muted [@media(pointer:coarse)]:hidden">←/→ move · ↑ rotate · ↓ soft drop · Space hard drop · C hold · P pause</p>
      <p className="text-center text-xs text-muted [@media(pointer:fine)]:hidden">Swipe to move · tap to rotate · swipe down to drop</p>
    </div>
  );
}
