import { useCallback, useEffect, useRef, useState } from 'react';
import { useKey, type GameProps } from './shared';

/* Brick Breaker — canvas, fixed logical resolution, sub-stepped physics. */

const W = 480;
const H = 640;
const COLS = 10;
const MARGIN = 14;
const GAP = 4;
const TOP = 74;
const BRICK_H = 18;
const BRICK_W = (W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
const PADDLE_Y = H - 46;
const PADDLE_H = 12;
const BASE_PADDLE_W = 84;
const BALL_R = 7;
const POWER_TIME = 10_000;

type Phase = 'ready' | 'playing' | 'paused' | 'over';
type PowerKind = 'wide' | 'multi' | 'slow' | 'life';

interface Ball { x: number; y: number; vx: number; vy: number; stuck: boolean; trail: { x: number; y: number }[] }
interface Brick { x: number; y: number; hp: number; max: number; row: number }
interface Power { x: number; y: number; kind: PowerKind }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }

const POWER_INFO: Record<PowerKind, { icon: string; color: string; label: string }> = {
  wide: { icon: '↔', color: '#22d3ee', label: 'Wide paddle' },
  multi: { icon: '✦', color: '#a855f7', label: 'Multi-ball' },
  slow: { icon: '⏱', color: '#38bdf8', label: 'Slow ball' },
  life: { icon: '♥', color: '#f43f5e', label: 'Extra life' },
};

const ROW_COLORS = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// '.' empty, '1'..'3' hit points
const LAYOUTS: string[][] = [
  ['1111111111', '1111111111', '1111111111', '1111111111', '1111111111'],
  ['2222222222', '1111111111', '.11111111.', '..111111..', '...1111...', '....11....'],
  ['1.1.1.1.1.', '.1.1.1.1.1', '2.2.2.2.2.', '.2.2.2.2.2', '1.1.1.1.1.', '.1.1.1.1.1'],
  ['3333333333', '1........1', '1.222222.1', '1.2....2.1', '1.222222.1', '1........1', '1111111111'],
  ['..2....2..', '...2..2...', '..222222..', '.22.22.22.', '2222222222', '2.222222.2', '2.2....2.2', '...33.33..'],
];

function genLayout(level: number): string[] {
  const rows = Math.min(8, 5 + Math.floor(level / 3));
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let half = '';
    for (let c = 0; c < COLS / 2; c++) {
      const roll = Math.random();
      const hp = roll < 0.18 ? '.' : roll < 0.18 + Math.min(0.35, level * 0.03) ? (Math.random() < 0.4 ? '3' : '2') : '1';
      half += hp;
    }
    out.push(half + half.split('').reverse().join(''));
  }
  return out;
}

function buildBricks(level: number): Brick[] {
  const layout = level <= LAYOUTS.length ? LAYOUTS[level - 1] : genLayout(level);
  const bricks: Brick[] = [];
  layout.forEach((row, r) =>
    row.split('').forEach((ch, c) => {
      if (ch === '.') return;
      const hp = Number(ch);
      bricks.push({ x: MARGIN + c * (BRICK_W + GAP), y: TOP + r * (BRICK_H + GAP), hp, max: hp, row: r });
    }),
  );
  return bricks;
}

const ballSpeed = (level: number) => Math.min(560, 340 + level * 18);

export default function BrickBreaker({ api }: GameProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const setP = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, wide: 0, slow: 0 });
  const [banner, setBanner] = useState<string | null>(null);
  const keys = useRef(new Set<string>());

  const g = useRef({
    paddleX: W / 2,
    targetX: null as number | null,
    balls: [] as Ball[],
    bricks: [] as Brick[],
    powers: [] as Power[],
    particles: [] as Particle[],
    wideUntil: 0,
    slowUntil: 0,
    lives: 3,
    score: 0,
    level: 1,
    shake: 0,
    clock: 0, // game time in ms (pauses with the game)
  });

  const newBall = (): Ball => ({ x: g.current.paddleX, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true, trail: [] });

  const reset = useCallback(() => {
    Object.assign(g.current, {
      paddleX: W / 2, targetX: null, balls: [], bricks: buildBricks(1), powers: [], particles: [],
      wideUntil: 0, slowUntil: 0, lives: 3, score: 0, level: 1, shake: 0, clock: 0,
    });
    g.current.balls = [newBall()];
    setHud({ score: 0, lives: 3, level: 1, wide: 0, slow: 0 });
    api.setScore(0);
  }, [api]);

  useEffect(() => {
    reset();
  }, [reset]);

  const launch = useCallback(() => {
    const s = g.current;
    const sp = ballSpeed(s.level);
    for (const b of s.balls)
      if (b.stuck) {
        const a = (Math.random() - 0.5) * 0.6;
        b.vx = sp * Math.sin(a);
        b.vy = -sp * Math.cos(a);
        b.stuck = false;
        api.sound('jump');
      }
  }, [api]);

  const start = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'ready' || p === 'over') {
      reset();
      setP('playing');
      setBanner('Level 1');
      setTimeout(() => setBanner(null), 1200);
      api.sound('click');
    } else if (p === 'paused') setP('playing');
  }, [api, reset, setP]);

  const burst = (x: number, y: number, color: string, n = 10) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 180;
      g.current.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 350 + Math.random() * 350, color });
    }
  };

  /* --------------- main loop --------------- */
  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    let raf = 0;
    let last = performance.now();
    let hudTimer = 0;

    const paddleW = () => (g.current.clock < g.current.wideUntil ? BASE_PADDLE_W * 1.6 : BASE_PADDLE_W);

    const loseLife = () => {
      const s = g.current;
      s.lives--;
      s.shake = 10;
      api.sound('lose');
      if (s.lives <= 0) {
        setP('over');
        api.finish(s.score, { level: s.level });
        return;
      }
      s.balls = [newBall()];
      s.powers = [];
      s.wideUntil = 0;
      s.slowUntil = 0;
    };

    const update = (dtMs: number) => {
      const s = g.current;
      s.clock += dtMs;
      const dt = dtMs / 1000;
      // paddle
      const pw = paddleW();
      const kSpeed = 560;
      if (keys.current.has('left')) s.paddleX -= kSpeed * dt;
      if (keys.current.has('right')) s.paddleX += kSpeed * dt;
      if (s.targetX !== null) s.paddleX += (s.targetX - s.paddleX) * Math.min(1, dt * 22);
      s.paddleX = Math.max(pw / 2 + 4, Math.min(W - pw / 2 - 4, s.paddleX));

      const slow = s.clock < s.slowUntil ? 0.6 : 1;
      const lost: Ball[] = [];
      for (const b of s.balls) {
        if (b.stuck) {
          b.x = s.paddleX;
          b.y = PADDLE_Y - BALL_R - 1;
          continue;
        }
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();
        const dist = Math.hypot(b.vx, b.vy) * slow * dt;
        const steps = Math.max(1, Math.ceil(dist / 4));
        for (let i = 0; i < steps; i++) {
          b.x += (b.vx * slow * dt) / steps;
          b.y += (b.vy * slow * dt) / steps;
          // walls
          if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); api.sound('tick'); }
          if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); api.sound('tick'); }
          if (b.y < BALL_R + 40) { b.y = BALL_R + 40; b.vy = Math.abs(b.vy); api.sound('tick'); }
          // paddle
          if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y + BALL_R <= PADDLE_Y + PADDLE_H + 8 && Math.abs(b.x - s.paddleX) <= pw / 2 + BALL_R) {
            const rel = Math.max(-1, Math.min(1, (b.x - s.paddleX) / (pw / 2)));
            const ang = rel * (Math.PI / 3);
            const sp = Math.hypot(b.vx, b.vy);
            b.vx = sp * Math.sin(ang);
            b.vy = -sp * Math.cos(ang);
            b.y = PADDLE_Y - BALL_R;
            api.sound('move');
          }
          // bricks
          for (const br of s.bricks) {
            if (br.hp <= 0) continue;
            const cx = Math.max(br.x, Math.min(b.x, br.x + BRICK_W));
            const cy = Math.max(br.y, Math.min(b.y, br.y + BRICK_H));
            const dx = b.x - cx, dy = b.y - cy;
            if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
            // decide bounce axis from overlap
            const overlapX = Math.min(b.x + BALL_R - br.x, br.x + BRICK_W - (b.x - BALL_R));
            const overlapY = Math.min(b.y + BALL_R - br.y, br.y + BRICK_H - (b.y - BALL_R));
            if (overlapX < overlapY) {
              b.vx = b.x < br.x + BRICK_W / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
            } else {
              b.vy = b.y < br.y + BRICK_H / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
            }
            br.hp--;
            const color = ROW_COLORS[br.row % ROW_COLORS.length];
            if (br.hp <= 0) {
              s.score += 10 * s.level;
              burst(br.x + BRICK_W / 2, br.y + BRICK_H / 2, color, 12);
              api.sound('point');
              if (Math.random() < 0.12) {
                const kinds: PowerKind[] = ['wide', 'multi', 'slow', 'life'];
                const kind = kinds[Math.floor(Math.random() * (s.lives >= 5 ? 3 : 4))];
                s.powers.push({ x: br.x + BRICK_W / 2, y: br.y + BRICK_H / 2, kind });
              }
            } else {
              s.score += 2 * s.level;
              burst(cx, cy, '#ffffff', 4);
              api.sound('tick');
            }
            api.setScore(s.score);
            break;
          }
          if (b.y - BALL_R > H) {
            lost.push(b);
            break;
          }
        }
      }
      if (lost.length) {
        s.balls = s.balls.filter((b) => !lost.includes(b));
        if (!s.balls.length) loseLife();
      }

      // power-ups
      for (const p of s.powers) p.y += 150 * dt;
      s.powers = s.powers.filter((p) => {
        if (p.y > H + 20) return false;
        if (p.y + 10 >= PADDLE_Y && p.y - 10 <= PADDLE_Y + PADDLE_H && Math.abs(p.x - s.paddleX) <= paddleW() / 2 + 12) {
          api.sound('coin');
          burst(p.x, PADDLE_Y, POWER_INFO[p.kind].color, 14);
          if (p.kind === 'wide') s.wideUntil = s.clock + POWER_TIME;
          if (p.kind === 'slow') s.slowUntil = s.clock + POWER_TIME;
          if (p.kind === 'life') s.lives = Math.min(5, s.lives + 1);
          if (p.kind === 'multi') {
            const src = s.balls.find((b) => !b.stuck) ?? s.balls[0];
            if (src) {
              const sp = Math.hypot(src.vx, src.vy) || ballSpeed(s.level);
              for (const off of [-0.5, 0.5]) {
                const a = Math.atan2(src.vx, -src.vy) + off;
                s.balls.push({ x: src.x, y: src.stuck ? PADDLE_Y - 20 : src.y, vx: sp * Math.sin(a), vy: -Math.abs(sp * Math.cos(a)), stuck: false, trail: [] });
              }
            }
          }
          return false;
        }
        return true;
      });

      // level clear
      if (phaseRef.current === 'playing' && s.bricks.every((b) => b.hp <= 0)) {
        s.score += 100 * s.level;
        s.level++;
        s.bricks = buildBricks(s.level);
        s.balls = [newBall()];
        s.powers = [];
        api.setScore(s.score);
        api.sound('level');
        setBanner(`Level ${s.level}`);
        setTimeout(() => setBanner(null), 1300);
      }
    };

    const draw = () => {
      const s = g.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0d0a1f');
      bg.addColorStop(1, '#170f3a');
      ctx.fillStyle = bg;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      // grid
      ctx.strokeStyle = 'rgba(139,92,246,.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 40; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // top bar
      ctx.fillStyle = 'rgba(168,85,247,.5)';
      ctx.fillRect(0, 38, W, 2);

      // bricks
      for (const br of s.bricks) {
        if (br.hp <= 0) continue;
        const color = ROW_COLORS[br.row % ROW_COLORS.length];
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.55 + (br.hp / br.max) * 0.45;
        ctx.fillStyle = color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(br.x, br.y, BRICK_W, BRICK_H, 4);
        else ctx.rect(br.x, br.y, BRICK_W, BRICK_H);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,.28)';
        ctx.fillRect(br.x + 3, br.y + 2, BRICK_W - 6, 3);
        if (br.max > 1) {
          // armour ring / cracks
          ctx.strokeStyle = 'rgba(255,255,255,.75)';
          ctx.lineWidth = 1.5;
          if (br.hp === br.max) ctx.strokeRect(br.x + 2.5, br.y + 2.5, BRICK_W - 5, BRICK_H - 5);
          const cracks = br.max - br.hp;
          for (let i = 0; i < cracks; i++) {
            const cx = br.x + BRICK_W * (0.3 + i * 0.35);
            ctx.beginPath();
            ctx.moveTo(cx, br.y + 2);
            ctx.lineTo(cx + 4, br.y + BRICK_H / 2);
            ctx.lineTo(cx - 2, br.y + BRICK_H - 2);
            ctx.stroke();
          }
        }
      }

      // power-ups
      for (const p of s.powers) {
        const info = POWER_INFO[p.kind];
        ctx.save();
        ctx.shadowColor = info.color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = info.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(p.x - 16, p.y - 10, 32, 20, 10);
        else ctx.rect(p.x - 16, p.y - 10, 32, 20);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.font = '700 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(info.icon, p.x, p.y + 1);
      }

      // paddle
      const pw = s.clock < s.wideUntil ? BASE_PADDLE_W * 1.6 : BASE_PADDLE_W;
      const pg = ctx.createLinearGradient(s.paddleX - pw / 2, 0, s.paddleX + pw / 2, 0);
      pg.addColorStop(0, '#a855f7');
      pg.addColorStop(1, '#22d3ee');
      ctx.save();
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 18;
      ctx.fillStyle = pg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(s.paddleX - pw / 2, PADDLE_Y, pw, PADDLE_H, 6);
      else ctx.rect(s.paddleX - pw / 2, PADDLE_Y, pw, PADDLE_H);
      ctx.fill();
      ctx.restore();

      // balls
      const slow = s.clock < s.slowUntil;
      for (const b of s.balls) {
        b.trail.forEach((t, i) => {
          ctx.fillStyle = slow ? `rgba(56,189,248,${(i / b.trail.length) * 0.35})` : `rgba(255,255,255,${(i / b.trail.length) * 0.3})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, Math.max(0.5, BALL_R * (i / b.trail.length)), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.save();
        ctx.shadowColor = slow ? '#38bdf8' : '#ffffff';
        ctx.shadowBlur = 16;
        ctx.fillStyle = slow ? '#bae6fd' : '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // particles
      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      // HUD on canvas
      ctx.fillStyle = '#fff';
      ctx.font = '700 18px "Space Grotesk", Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${s.score}`, 14, 20);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '600 14px Inter, sans-serif';
      ctx.fillText(`LEVEL ${s.level}`, W / 2, 20);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f43f5e';
      ctx.font = '700 16px Inter, sans-serif';
      ctx.fillText('♥'.repeat(Math.max(0, s.lives)), W - 14, 20);

      if (phaseRef.current === 'playing' && s.balls.some((b) => b.stuck)) {
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.font = '600 15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Tap or press Space to launch', W / 2, PADDLE_Y - 60);
      }
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(34, now - last);
      last = now;
      const s = g.current;
      try {
        if (phaseRef.current === 'playing') update(dt);
        for (const p of s.particles) {
          p.life += dt;
          p.x += (p.vx * dt) / 1000;
          p.y += (p.vy * dt) / 1000;
          p.vy += (400 * dt) / 1000;
        }
        s.particles = s.particles.filter((p) => p.life < p.max);
        if (s.shake > 0) s.shake = Math.max(0, s.shake - dt / 25);
        draw();
      } catch (err) {
        console.error(err);
      }
      hudTimer += dt;
      if (hudTimer > 200) {
        hudTimer = 0;
        setHud({
          score: s.score, lives: s.lives, level: s.level,
          wide: Math.max(0, Math.ceil((s.wideUntil - s.clock) / 1000)),
          slow: Math.max(0, Math.ceil((s.slowUntil - s.clock) / 1000)),
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [api, setP]);

  /* --------------- input --------------- */
  const toLogicalX = (clientX: number) => {
    const r = cv.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) { keys.current.add('left'); g.current.targetX = null; e.preventDefault(); }
      if (['ArrowRight', 'd', 'D'].includes(e.key)) { keys.current.add('right'); g.current.targetX = null; e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) keys.current.delete('left');
      if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.current.delete('right');
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useKey((e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (phaseRef.current === 'playing') launch();
      else start();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (phaseRef.current === 'playing') setP('paused');
      else if (phaseRef.current === 'paused' && e.key !== 'Escape') setP('playing');
    }
  });

  useEffect(() => {
    const h = () => document.hidden && phaseRef.current === 'playing' && setP('paused');
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [setP]);

  return (
    <div className="flex w-full flex-col items-center gap-3" style={{ maxWidth: 'min(480px, 100%, 56vh)' }}>
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="chip !text-sm">⭐ {hud.score}</span>
          <span className="chip !text-sm">🧱 Level {hud.level}</span>
          {hud.wide > 0 && <span className="chip !bg-cyan-500/15 !text-sm !text-cyan-400">↔ {hud.wide}s</span>}
          {hud.slow > 0 && <span className="chip !bg-sky-500/15 !text-sm !text-sky-400">⏱ {hud.slow}s</span>}
        </div>
        <button className="btn-ghost !py-1.5" onClick={() => (phase === 'playing' ? setP('paused') : start())}>
          {phase === 'playing' ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>
      <div className="relative w-full">
        <canvas
          ref={cv}
          className="no-touch-scroll mx-auto block w-full cursor-none select-none rounded-2xl border border-line shadow-neon"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerMove={(e) => (g.current.targetX = toLogicalX(e.clientX))}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            g.current.targetX = toLogicalX(e.clientX);
            if (phaseRef.current === 'playing') launch();
          }}
          aria-label="Brick Breaker game area"
        />
        {banner && phase === 'playing' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span key={banner} className="animate-pop font-display text-5xl font-black text-white drop-shadow-[0_0_24px_rgba(168,85,247,.9)]">{banner}</span>
          </div>
        )}
        {phase !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/55 px-6 text-center text-white backdrop-blur-[2px]" onClick={start}>
            <div className="text-5xl">{phase === 'over' ? '💥' : phase === 'paused' ? '⏸' : '🧱'}</div>
            <div className="font-display text-3xl font-bold">{phase === 'over' ? 'Game over' : phase === 'paused' ? 'Paused' : 'Brick Breaker'}</div>
            {phase === 'over' && <div className="text-white/80">Score {hud.score} · reached level {hud.level}</div>}
            {phase === 'ready' && (
              <div className="grid gap-1 text-sm text-white/75">
                <span>Catch power-ups:</span>
                <span className="flex flex-wrap justify-center gap-x-3">
                  {Object.values(POWER_INFO).map((p) => (
                    <span key={p.label}><span style={{ color: p.color }}>{p.icon}</span> {p.label}</span>
                  ))}
                </span>
              </div>
            )}
            <button className="btn-primary" onClick={(e) => { e.stopPropagation(); start(); }}>
              {phase === 'paused' ? 'Resume' : phase === 'over' ? 'Play again' : 'Start'}
            </button>
            <div className="text-xs text-white/60">Mouse / drag or ←/→ · Space to launch · P to pause</div>
          </div>
        )}
      </div>
    </div>
  );
}
