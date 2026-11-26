import { useCallback, useEffect, useRef, useState } from 'react';
import { cssVar, useDirectionKeys, useKey, useSwipe, type Dir, type GameProps } from './shared';

/* ------------------------------------------------------------------ *
 * Snake — smooth interpolated movement, 3 modes, power-ups, particles
 * ------------------------------------------------------------------ */

const G = 20;
type P = { x: number; y: number };
type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';
type Mode = 'classic' | 'portal' | 'maze';
type FoodKind = 'apple' | 'gold' | 'slow';

interface Food {
  p: P;
  kind: FoodKind;
  born: number;
  ttl: number; // ms, Infinity for apples
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Save {
  mode: Mode;
  bests: Partial<Record<Mode, number>>;
}

const MODES: { id: Mode; label: string; icon: string; desc: string }[] = [
  { id: 'classic', label: 'Classic', icon: '🧱', desc: 'Walls are deadly' },
  { id: 'portal', label: 'Portal', icon: '🌀', desc: 'Go through walls' },
  { id: 'maze', label: 'Maze', icon: '🏰', desc: 'Dodge obstacles' },
];

const FOOD_INFO: Record<FoodKind, { points: number; grow: number; color: string; label: string }> = {
  apple: { points: 1, grow: 1, color: '#f43f5e', label: '+1' },
  gold: { points: 3, grow: 2, color: '#facc15', label: '+3' },
  slow: { points: 1, grow: 1, color: '#38bdf8', label: 'SLOW-MO' },
};

const VEC: Record<Dir, P> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const key = (p: P) => p.y * G + p.x;

function mazeWalls(): Set<number> {
  const s = new Set<number>();
  const add = (x: number, y: number) => s.add(y * G + x);
  // four corner L-shapes
  for (const [cx, cy, sx, sy] of [
    [4, 4, 1, 1],
    [15, 4, -1, 1],
    [4, 15, 1, -1],
    [15, 15, -1, -1],
  ]) {
    for (let i = 0; i < 4; i++) {
      add(cx + i * sx, cy);
      add(cx, cy + i * sy);
    }
  }
  // vertical bars top & bottom centre
  for (let y = 0; y < 4; y++) {
    add(10, y + 1);
    add(9, G - 2 - y);
  }
  return s;
}
const MAZE = mazeWalls();

const START: P[] = [
  { x: 7, y: 10 },
  { x: 6, y: 10 },
  { x: 5, y: 10 },
];

const baseSpeed = (mode: Mode) => (mode === 'maze' ? 145 : 130);
const speedFor = (mode: Mode, score: number) => Math.max(58, baseSpeed(mode) - score * 2.6);

export default function Snake({ api }: GameProps) {
  // mode + per-mode bests survive restarts
  const saved = api.load<Save>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [mode, setModeState] = useState<Mode>(saved?.mode ?? 'classic');
  const [bests, setBests] = useState<Partial<Record<Mode, number>>>(saved?.bests ?? {});
  const [hud, setHud] = useState({ score: 0, length: 3, slow: false, count: 3 });
  const [lastRun, setLastRun] = useState<{ score: number; newBest: boolean } | null>(null);
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const overAt = useRef(0);
  const hudCount = useRef(3);
  const slowRef = useRef(false);
  const bestsRef = useRef(bests);
  bestsRef.current = bests;

  const st = useRef({
    snake: START.map((p) => ({ ...p })),
    prev: START.map((p) => ({ ...p })),
    dir: 'right' as Dir,
    queue: [] as Dir[],
    foods: [] as Food[],
    grow: 0,
    speed: 130,
    acc: 0,
    last: 0,
    score: 0,
    slowUntil: 0,
    particles: [] as Particle[],
    popups: [] as { x: number; y: number; text: string; color: string; life: number }[],
    shake: 0,
    flash: 0,
    countdownAt: 0,
    dead: false,
  });

  // test hook (dev builds only)
  if (import.meta.env.DEV) (window as unknown as { __snake?: unknown }).__snake = st.current;

  /* ---------------- helpers ---------------- */
  const occupied = useCallback((p: P) => {
    const s = st.current;
    return (
      s.snake.some((q) => q.x === p.x && q.y === p.y) ||
      s.foods.some((f) => f.p.x === p.x && f.p.y === p.y) ||
      (modeRef.current === 'maze' && MAZE.has(key(p)))
    );
  }, []);

  const spawn = useCallback(
    (kind: FoodKind) => {
      for (let tries = 0; tries < 500; tries++) {
        const p = { x: Math.floor(Math.random() * G), y: Math.floor(Math.random() * G) };
        if (occupied(p)) continue;
        st.current.foods.push({ p, kind, born: performance.now(), ttl: kind === 'apple' ? Infinity : 6500 });
        return;
      }
    },
    [occupied],
  );

  const reset = useCallback(() => {
    const s = st.current;
    Object.assign(s, {
      snake: START.map((p) => ({ ...p })),
      prev: START.map((p) => ({ ...p })),
      dir: 'right',
      queue: [],
      foods: [],
      grow: 0,
      speed: baseSpeed(modeRef.current),
      acc: 0,
      score: 0,
      slowUntil: 0,
      particles: [],
      popups: [],
      shake: 0,
      flash: 0,
      dead: false,
    });
    spawn('apple');
    setHud({ score: 0, length: 3, slow: false, count: 3 });
    api.setScore(0);
  }, [api, spawn]);

  // initial food so the board isn't empty
  useEffect(() => {
    if (!st.current.foods.length) spawn('apple');
  }, [spawn]);

  const burst = (p: P, color: string, n = 16) => {
    const s = st.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 5;
      s.particles.push({ x: p.x + 0.5, y: p.y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 400 + Math.random() * 400, color, size: 0.08 + Math.random() * 0.1 });
    }
  };

  /* ---------------- background (cached) ---------------- */
  const buildBg = useCallback((size: number) => {
    const bg = document.createElement('canvas');
    bg.width = size;
    bg.height = size;
    const ctx = bg.getContext('2d')!;
    const cell = size / G;
    for (let y = 0; y < G; y++)
      for (let x = 0; x < G; x++) {
        ctx.fillStyle = (x + y) % 2 ? cssVar('--surface-2', 0.95) : cssVar('--surface-2', 0.6);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    bgRef.current = bg;
    (bg as HTMLCanvasElement & { theme?: boolean }).theme = document.documentElement.classList.contains('dark');
  }, []);

  /* ---------------- drawing ---------------- */
  const draw = useCallback(
    (now: number) => {
      const cv = canvasRef.current;
      if (!cv || !cv.width) return;
      const ctx = cv.getContext('2d')!;
      const W = cv.width;
      const cell = W / G;
      const s = st.current;
      const m = modeRef.current;
      const dark = document.documentElement.classList.contains('dark');
      const bg = bgRef.current as (HTMLCanvasElement & { theme?: boolean }) | null;
      if (!bg || bg.width !== W || bg.theme !== dark) buildBg(W);

      ctx.save();
      ctx.clearRect(0, 0, W, W);
      if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake * cell, (Math.random() - 0.5) * s.shake * cell);
      ctx.drawImage(bgRef.current!, 0, 0);

      // portal mode: glowing edges
      if (m === 'portal') {
        ctx.strokeStyle = `rgba(34,211,238,${0.35 + Math.sin(now / 300) * 0.15})`;
        ctx.lineWidth = cell * 0.12;
        ctx.setLineDash([cell * 0.4, cell * 0.3]);
        ctx.strokeRect(cell * 0.06, cell * 0.06, W - cell * 0.12, W - cell * 0.12);
        ctx.setLineDash([]);
      }

      // maze walls
      if (m === 'maze') {
        for (const k of MAZE) {
          const x = k % G, y = Math.floor(k / G);
          const gr = ctx.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
          gr.addColorStop(0, '#64748b');
          gr.addColorStop(1, '#334155');
          ctx.fillStyle = gr;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2, cell * 0.18);
          else ctx.rect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
          ctx.fill();
        }
      }

      // food
      for (const f of s.foods) {
        const info = FOOD_INFO[f.kind];
        const cx = (f.p.x + 0.5) * cell, cy = (f.p.y + 0.5) * cell;
        const age = Math.max(0, now - f.born);
        const appear = Math.min(1, age / 180);
        const pulse = 1 + Math.sin(now / 170 + f.p.x) * 0.08;
        const r = Math.max(0.1, cell * 0.36 * pulse * appear);
        const left = f.ttl === Infinity ? 1 : Math.max(0, 1 - age / f.ttl);
        const blink = left < 0.3 && Math.floor(now / 120) % 2 === 0;
        if (blink) continue;
        ctx.save();
        ctx.shadowColor = info.color;
        ctx.shadowBlur = cell * 0.9;
        ctx.fillStyle = info.color;
        ctx.beginPath();
        if (f.kind === 'gold') {
          // star
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5 + now / 900;
            const rr = i % 2 ? r * 0.5 : r * 1.15;
            ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          }
          ctx.closePath();
        } else ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (f.kind === 'apple') {
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.ellipse(cx + cell * 0.1, cy - r * 0.95, cell * 0.12, cell * 0.06, -0.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.45)';
          ctx.beginPath();
          ctx.arc(cx - r * 0.35, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        if (f.kind === 'slow') {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = cell * 0.07;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx, cy - r * 0.6);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + r * 0.45, cy);
          ctx.stroke();
        }
        if (f.ttl !== Infinity) {
          ctx.strokeStyle = info.color;
          ctx.lineWidth = cell * 0.06;
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.55, -Math.PI / 2, -Math.PI / 2 + Math.max(0, left) * Math.PI * 2);
          ctx.stroke();
        }
      }

      // snake (interpolated)
      const t = phaseRef.current === 'playing' ? Math.min(1, s.acc / s.speed) : s.dead ? 1 : 0;
      const pts = s.snake.map((p, i) => {
        const q = s.prev[i] ?? p;
        const jump = Math.abs(p.x - q.x) > 1 || Math.abs(p.y - q.y) > 1; // portal wrap
        if (jump) return { x: p.x, y: p.y, brk: true };
        return { x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t, brk: false };
      });
      const n = pts.length;
      const slow = now < s.slowUntil;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = n - 1; i > 0; i--) {
        const a = pts[i], b = pts[i - 1];
        if (Math.abs(a.x - b.x) > 1.5 || Math.abs(a.y - b.y) > 1.5) continue; // across a portal
        const k = i / Math.max(1, n - 1);
        const w = cell * (0.78 - k * 0.3);
        const r = Math.round(168 + (59 - 168) * k), g = Math.round(85 + (130 - 85) * k), bl = Math.round(247 + (246 - 247) * k);
        ctx.strokeStyle = slow ? `rgb(${56 + k * 40},${189 - k * 40},248)` : `rgb(${r},${g},${bl})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo((a.x + 0.5) * cell, (a.y + 0.5) * cell);
        ctx.lineTo((b.x + 0.5) * cell, (b.y + 0.5) * cell);
        ctx.stroke();
      }
      // belly stripe pattern
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      for (let i = 2; i < n; i += 2) {
        const p = pts[i];
        ctx.beginPath();
        ctx.arc((p.x + 0.5) * cell, (p.y + 0.5) * cell, Math.max(0.1, cell * (0.16 - (i / n) * 0.06)), 0, Math.PI * 2);
        ctx.fill();
      }

      // head
      const h = pts[0];
      const v = VEC[s.dir];
      const hx = (h.x + 0.5) * cell, hy = (h.y + 0.5) * cell;
      ctx.save();
      ctx.shadowColor = slow ? '#38bdf8' : '#a855f7';
      ctx.shadowBlur = cell * 0.8;
      ctx.fillStyle = slow ? '#38bdf8' : '#a855f7';
      ctx.beginPath();
      ctx.arc(hx, hy, cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // tongue
      if (!s.dead && Math.floor(now / 400) % 3 === 0) {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = cell * 0.07;
        const tx = hx + v.x * cell * 0.5, ty = hy + v.y * cell * 0.5;
        const ex = tx + v.x * cell * 0.25, ey = ty + v.y * cell * 0.25;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex + (v.y * 0.12 + v.x * 0.1) * cell, ey + (v.x * 0.12 + v.y * 0.1) * cell);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + (-v.y * 0.12 + v.x * 0.1) * cell, ey + (-v.x * 0.12 + v.y * 0.1) * cell);
        ctx.stroke();
      }
      // eyes — look toward the nearest food
      const target = s.foods[0]?.p;
      for (const side of [-1, 1]) {
        const ox = v.x * cell * 0.14 + v.y * side * cell * 0.2;
        const oy = v.y * cell * 0.14 + v.x * side * cell * 0.2;
        const ex = hx + ox, ey = hy + oy;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, ey, cell * 0.13, 0, Math.PI * 2);
        ctx.fill();
        if (s.dead) {
          ctx.strokeStyle = '#111';
          ctx.lineWidth = cell * 0.05;
          const d = cell * 0.07;
          ctx.beginPath();
          ctx.moveTo(ex - d, ey - d);
          ctx.lineTo(ex + d, ey + d);
          ctx.moveTo(ex + d, ey - d);
          ctx.lineTo(ex - d, ey + d);
          ctx.stroke();
        } else {
          let lx = v.x, ly = v.y;
          if (target) {
            const dx = (target.x + 0.5) * cell - ex, dy = (target.y + 0.5) * cell - ey;
            const len = Math.hypot(dx, dy) || 1;
            lx = dx / len;
            ly = dy / len;
          }
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.arc(ex + lx * cell * 0.05, ey + ly * cell * 0.05, cell * 0.065, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // particles
      for (const p of s.particles) {
        const a = 1 - p.life / p.max;
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * cell, p.y * cell, Math.max(0.1, p.size * cell * (0.5 + a * 0.5)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // score popups
      ctx.textAlign = 'center';
      ctx.font = `800 ${Math.round(cell * 0.6)}px "Space Grotesk", Inter, sans-serif`;
      for (const p of s.popups) {
        ctx.globalAlpha = Math.max(0, 1 - p.life / 800);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, (p.x + 0.5) * cell, (p.y - p.life / 400) * cell);
      }
      ctx.globalAlpha = 1;

      if (s.flash > 0) {
        ctx.fillStyle = `rgba(239,68,68,${s.flash})`;
        ctx.fillRect(-cell, -cell, W + cell * 2, W + cell * 2);
      }
      ctx.restore();
    },
    [buildBg],
  );

  // keep canvas resolution matched to its CSS size
  useEffect(() => {
    const cv = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const size = Math.floor(cv.clientWidth * Math.min(2, window.devicePixelRatio || 1));
      if (size && size !== cv.width) {
        cv.width = size;
        cv.height = size;
        bgRef.current = null;
      }
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  /* ---------------- game logic ---------------- */
  const die = useCallback(() => {
    const s = st.current;
    s.dead = true;
    s.flash = 0.45;
    s.shake = 0.5;
    burst(s.snake[0], '#a855f7', 26);
    overAt.current = performance.now();
    setPhase('over');
    phaseRef.current = 'over';
    api.sound('lose');
    const m = modeRef.current;
    const b = bestsRef.current;
    const newBest = s.score > 0 && s.score > (b[m] ?? 0);
    const nb = newBest ? { ...b, [m]: s.score } : b;
    setLastRun({ score: s.score, newBest });
    setBests(nb);
    api.save({ mode: m, bests: nb } satisfies Save);
    api.finish(s.score, { mode: m });
  }, [api]);

  const step = useCallback(
    (now: number) => {
      const s = st.current;
      const m = modeRef.current;
      while (s.queue.length) {
        const d = s.queue.shift()!;
        if (d !== OPP[s.dir] && d !== s.dir) {
          s.dir = d;
          break;
        }
      }
      const v = VEC[s.dir];
      let head = { x: s.snake[0].x + v.x, y: s.snake[0].y + v.y };
      if (m === 'portal') head = { x: (head.x + G) % G, y: (head.y + G) % G };

      const foodIdx = s.foods.findIndex((f) => f.p.x === head.x && f.p.y === head.y);
      const willGrow = s.grow > 0 || foodIdx >= 0;
      const body = willGrow ? s.snake : s.snake.slice(0, -1);
      const hitsWall = head.x < 0 || head.y < 0 || head.x >= G || head.y >= G;
      if (hitsWall || body.some((p) => p.x === head.x && p.y === head.y) || (m === 'maze' && MAZE.has(key(head)))) {
        die();
        return;
      }

      s.prev = s.snake.map((p) => ({ ...p }));
      if (willGrow) s.prev.push({ ...s.prev[s.prev.length - 1] });
      s.snake = [head, ...body];
      if (foodIdx < 0 && s.grow > 0) s.grow--;

      if (foodIdx >= 0) {
        const f = s.foods.splice(foodIdx, 1)[0];
        const info = FOOD_INFO[f.kind];
        s.score += info.points;
        s.grow += info.grow - 1; // one segment already added this step
        burst(f.p, info.color, f.kind === 'apple' ? 14 : 24);
        s.popups.push({ x: f.p.x, y: f.p.y, text: info.label, color: info.color, life: 0 });
        if (f.kind === 'slow') s.slowUntil = now + 5000;
        api.sound(f.kind === 'apple' ? 'point' : 'coin');
        if (f.kind === 'apple') {
          spawn('apple');
          const hasBonus = s.foods.some((x) => x.kind !== 'apple');
          if (!hasBonus && s.score >= 3) {
            const r = Math.random();
            if (r < 0.2) spawn('gold');
            else if (r < 0.3) spawn('slow');
          }
        }
        setHud((h) => ({ ...h, score: s.score, length: s.snake.length + s.grow }));
        api.setScore(s.score);
      }
      const base = speedFor(m, s.score);
      s.speed = now < s.slowUntil ? base * 1.6 : base;
    },
    [api, die, spawn],
  );

  // main loop: fixed-timestep logic + interpolated rendering every frame
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const s = st.current;
      const dt = s.last ? Math.min(100, now - s.last) : 0;
      s.last = now;
      const ph = phaseRef.current;

      if (ph === 'countdown') {
        const left = 3 - Math.floor((now - s.countdownAt) / 500);
        if (left <= 0) {
          setPhase('playing');
          phaseRef.current = 'playing';
          s.acc = 0;
          api.sound('jump');
        } else if (left !== hudCount.current) {
          hudCount.current = left;
          setHud((h) => ({ ...h, count: left }));
          api.sound('tick');
        }
      }

      if (ph === 'playing') {
        s.acc += dt;
        let guard = 0;
        while (s.acc >= s.speed && phaseRef.current === 'playing' && guard++ < 5) {
          s.acc -= s.speed;
          step(now);
        }
        // expire bonus food
        const before = s.foods.length;
        s.foods = s.foods.filter((f) => now - f.born < f.ttl);
        if (s.foods.length !== before && !s.foods.some((f) => f.kind === 'apple')) spawn('apple');
        const slow = now < s.slowUntil;
        if (slow !== slowRef.current) {
          slowRef.current = slow;
          setHud((h) => ({ ...h, slow }));
          if (!slow) s.speed = speedFor(modeRef.current, s.score);
        }
      }

      // effects always animate
      for (const p of s.particles) {
        p.life += dt;
        p.x += (p.vx * dt) / 1000;
        p.y += (p.vy * dt) / 1000;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
      s.particles = s.particles.filter((p) => p.life < p.max);
      for (const p of s.popups) p.life += dt;
      s.popups = s.popups.filter((p) => p.life < 800);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt / 700);
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt / 450);

      try {
        draw(now);
      } catch (err) {
        console.error(err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [api, draw, spawn, step]);

  /* ---------------- controls ---------------- */
  const start = useCallback(() => {
    const ph = phaseRef.current;
    if (ph === 'over' || ph === 'ready') reset();
    if (ph === 'paused') {
      st.current.acc = 0;
      setPhase('playing');
      phaseRef.current = 'playing';
      return;
    }
    st.current.countdownAt = performance.now();
    hudCount.current = 3;
    setHud((h) => ({ ...h, count: 3 }));
    setLastRun(null);
    setPhase('countdown');
    phaseRef.current = 'countdown';
    api.sound('tick');
  }, [api, reset]);

  const pause = useCallback(() => {
    if (phaseRef.current === 'playing') {
      setPhase('paused');
      phaseRef.current = 'paused';
    }
  }, []);

  const steer = (d: Dir) => {
    const ph = phaseRef.current;
    if (ph === 'over' && performance.now() - overAt.current < 700) return;
    if (ph === 'ready' || ph === 'over' || ph === 'paused') start();
    const q = st.current.queue;
    const lastDir = q[q.length - 1] ?? st.current.dir;
    if (q.length < 3 && d !== lastDir) q.push(d);
  };

  const setMode = (m: Mode) => {
    if (m === modeRef.current) return;
    setModeState(m);
    modeRef.current = m;
    api.save({ mode: m, bests } satisfies Save);
    setPhase('ready');
    phaseRef.current = 'ready';
    setLastRun(null);
    reset();
    api.sound('click');
  };

  useDirectionKeys(steer);
  useSwipe(wrapRef, steer);
  useKey((e) => {
    if (e.code === 'Space' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      if (phaseRef.current === 'playing') pause();
      else if (e.key !== 'Escape' && phaseRef.current !== 'countdown') start();
    }
  });

  // auto-pause when the tab is hidden
  useEffect(() => {
    const h = () => document.hidden && pause();
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [pause]);

  const speedMult = Math.round((baseSpeed(mode) / speedFor(mode, hud.score)) * 10) / 10;

  const Pad = ({ d, label }: { d: Dir; label: string }) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        steer(d);
      }}
      className="btn-ghost h-16 w-16 !p-0 text-2xl active:bg-neon-purple/30"
      aria-label={`Move ${d}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex w-full max-w-[min(560px,100%)] flex-col items-center gap-3">
      {/* mode picker */}
      <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-surface2 p-1 text-sm font-semibold" role="radiogroup" aria-label="Game mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            disabled={phase === 'playing' || phase === 'countdown'}
            className={`rounded-lg px-2 py-1.5 transition disabled:cursor-not-allowed ${mode === m.id ? 'bg-surface shadow' : 'text-muted hover:text-fg disabled:opacity-50'}`}
            title={m.desc}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* HUD */}
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <span className="chip !text-sm">🍎 {hud.score}</span>
          <span className="chip !text-sm">📏 {hud.length}</span>
          <span className="chip !text-sm">⚡ {speedMult}×</span>
          {hud.slow && <span className="chip animate-pulse !bg-sky-500/20 !text-sm !text-sky-400">⏱ Slow-mo</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">Best ({mode}): {bests[mode] ?? 0}</span>
          <button className="btn-ghost !py-1.5" onClick={() => (phase === 'playing' ? pause() : start())} disabled={phase === 'countdown'}>
            {phase === 'playing' ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="no-touch-scroll relative w-full overflow-hidden rounded-2xl border border-line shadow-neon">
        <canvas ref={canvasRef} className="block aspect-square w-full" onClick={() => phase !== 'playing' && phase !== 'countdown' && start()} />

        {phase === 'countdown' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span key={hud.count} className="animate-pop font-display text-8xl font-black text-white drop-shadow-[0_0_30px_rgba(168,85,247,.9)]">{hud.count}</span>
          </div>
        )}

        {(phase === 'ready' || phase === 'paused' || phase === 'over') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/65 px-6 text-center backdrop-blur-[2px]" onClick={start}>
            <div className="text-5xl">{phase === 'over' ? (lastRun?.newBest ? '🏆' : '💀') : phase === 'paused' ? '⏸' : '🐍'}</div>
            <div className="font-display text-3xl font-bold">
              {phase === 'over' ? (lastRun?.newBest ? 'New best!' : 'Game over') : phase === 'paused' ? 'Paused' : 'Snake'}
            </div>
            {phase === 'over' && lastRun && (
              <div className="text-muted">
                Score <b className="text-fg">{lastRun.score}</b> · {MODES.find((m) => m.id === mode)!.label} best <b className="text-fg">{bests[mode] ?? 0}</b>
              </div>
            )}
            {phase === 'ready' && (
              <div className="grid gap-1 text-sm text-muted">
                <span>{MODES.find((m) => m.id === mode)!.desc}</span>
                <span className="flex flex-wrap justify-center gap-x-3">
                  <span><span className="text-rose-400">●</span> Apple +1</span>
                  <span><span className="text-yellow-400">★</span> Star +3</span>
                  <span><span className="text-sky-400">●</span> Slow-mo</span>
                </span>
              </div>
            )}
            <button
              className="btn-primary"
              onClick={(e) => {
                e.stopPropagation();
                start();
              }}
            >
              {phase === 'paused' ? 'Resume' : phase === 'over' ? 'Play again' : 'Start'}
            </button>
            <div className="text-xs text-muted">Arrows / WASD · swipe · Space to pause</div>
          </div>
        )}
      </div>

      {/* D-pad for touch devices */}
      <div className="hidden grid-cols-3 gap-2 [@media(pointer:coarse)]:grid" aria-label="Direction pad">
        <span />
        <Pad d="up" label="▲" />
        <span />
        <Pad d="left" label="◀" />
        <Pad d="down" label="▼" />
        <Pad d="right" label="▶" />
      </div>
    </div>
  );
}
