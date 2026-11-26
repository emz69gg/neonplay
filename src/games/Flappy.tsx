import { useCallback, useEffect, useRef, useState } from 'react';
import { useKey, type GameProps } from './shared';

const W = 400;
const H = 600;
const GROUND = 70;
const BIRD_X = 110;
const R = 15;
const PIPE_W = 66;

type Phase = 'ready' | 'playing' | 'over';
interface Pipe {
  x: number;
  gapY: number;
  gap: number;
  scored: boolean;
}

export default function Flappy({ api }: GameProps) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [score, setScore] = useState(0);
  const phaseRef = useRef<Phase>('ready');
  phaseRef.current = phase;
  const g = useRef({
    y: H / 2 - 40,
    vy: 0,
    pipes: [] as Pipe[],
    score: 0,
    dist: 0,
    t: 0,
    overAt: 0,
    stars: Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * (H - GROUND), s: Math.random() * 1.6 + 0.4 })),
  });

  const reset = useCallback(() => {
    Object.assign(g.current, { y: H / 2 - 40, vy: 0, pipes: [], score: 0, dist: 0 });
    setScore(0);
    api.setScore(0);
  }, [api]);

  const flap = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'over') {
      if (performance.now() - g.current.overAt < 600) return;
      reset();
      setPhase('ready');
      return;
    }
    if (p === 'ready') setPhase('playing');
    g.current.vy = -420;
    api.sound('jump');
  }, [api, reset]);

  useKey((e) => {
    if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (!e.repeat) flap();
    }
  });

  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let last = performance.now();

    const die = () => {
      if (phaseRef.current === 'over') return;
      const s = g.current;
      s.overAt = performance.now();
      setPhase('over');
      phaseRef.current = 'over';
      api.sound('lose');
      api.finish(s.score);
    };

    const frame = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const s = g.current;
      const ph = phaseRef.current;
      s.t += dt;
      const speed = 165 + Math.min(110, s.score * 4);

      if (ph === 'ready') {
        s.y = H / 2 - 40 + Math.sin(s.t * 3) * 10;
      } else if (ph === 'playing') {
        s.vy += 1450 * dt;
        s.y += s.vy * dt;
        s.dist += speed * dt;
        for (const p of s.pipes) p.x -= speed * dt;
        s.pipes = s.pipes.filter((p) => p.x > -PIPE_W - 10);
        const lastPipe = s.pipes[s.pipes.length - 1];
        if (!lastPipe || lastPipe.x < W - 230) {
          const gap = Math.max(132, 175 - s.score * 1.6);
          s.pipes.push({ x: W + 10, gap, gapY: 90 + Math.random() * (H - GROUND - 180 - gap) + gap / 2, scored: false });
        }
        for (const p of s.pipes) {
          if (!p.scored && p.x + PIPE_W < BIRD_X - R) {
            p.scored = true;
            s.score++;
            setScore(s.score);
            api.setScore(s.score);
            api.sound('point');
          }
          const inX = BIRD_X + R - 3 > p.x && BIRD_X - R + 3 < p.x + PIPE_W;
          const inGap = s.y - R + 3 > p.gapY - p.gap / 2 && s.y + R - 3 < p.gapY + p.gap / 2;
          if (inX && !inGap) die();
        }
        if (s.y + R > H - GROUND || s.y - R < 0) {
          s.y = Math.min(s.y, H - GROUND - R);
          die();
        }
      } else if (ph === 'over') {
        if (s.y + R < H - GROUND) {
          s.vy += 1450 * dt;
          s.y = Math.min(H - GROUND - R, s.y + s.vy * dt);
        }
      }

      // ---- draw ----
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0d0820');
      sky.addColorStop(1, '#1b1145');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      for (const st of s.stars) {
        const x = (((st.x - s.dist * 0.05 * st.s) % W) + W) % W;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + st.s * 0.3})`;
        ctx.fillRect(x, st.y, st.s, st.s);
      }
      // city silhouette
      ctx.fillStyle = 'rgba(139,92,246,.18)';
      for (let i = 0; i < 12; i++) {
        const bx = ((((i * 60 - s.dist * 0.2) % (W + 60)) + W + 60) % (W + 60)) - 60;
        const bh = 60 + ((i * 37) % 90);
        ctx.fillRect(bx, H - GROUND - bh, 44, bh);
      }
      // pipes
      for (const p of s.pipes) {
        const top = p.gapY - p.gap / 2;
        const bottom = p.gapY + p.gap / 2;
        const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
        grad.addColorStop(0, '#7c3aed');
        grad.addColorStop(1, '#22d3ee');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 16;
        ctx.fillRect(p.x, -5, PIPE_W, top + 5);
        ctx.fillRect(p.x, bottom, PIPE_W, H - GROUND - bottom);
        ctx.fillRect(p.x - 5, top - 22, PIPE_W + 10, 22);
        ctx.fillRect(p.x - 5, bottom, PIPE_W + 10, 22);
        ctx.shadowBlur = 0;
      }
      // ground
      ctx.fillStyle = '#120c2c';
      ctx.fillRect(0, H - GROUND, W, GROUND);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(0, H - GROUND, W, 3);
      ctx.strokeStyle = 'rgba(168,85,247,.25)';
      for (let i = 0; i < 14; i++) {
        const x = ((((i * 34 - s.dist) % W) + W) % W);
        ctx.beginPath();
        ctx.moveTo(x, H - GROUND + 10);
        ctx.lineTo(x - 14, H);
        ctx.stroke();
      }
      // bird
      ctx.save();
      ctx.translate(BIRD_X, s.y);
      const angle = ph === 'ready' ? 0 : Math.max(-0.5, Math.min(1.3, s.vy / 600));
      ctx.rotate(angle);
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(0, 0, R + 3, R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      const wing = Math.sin(s.t * (ph === 'playing' ? 25 : 10)) * 5;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(-6, 2 + wing, 9, 5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(7, -5, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(9, -5, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(14, -1);
      ctx.lineTo(24, 2);
      ctx.lineTo(14, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // score
      if (ph !== 'ready') {
        ctx.font = '800 52px "Space Grotesk", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,.45)';
        ctx.strokeText(String(s.score), W / 2, 90);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(s.score), W / 2, 90);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [api]);

  return (
    <div className="relative w-full max-w-[min(420px,100%)]">
      <canvas
        ref={cv}
        className="no-touch-scroll block w-full cursor-pointer select-none rounded-2xl border border-line shadow-neon"
        style={{ aspectRatio: `${W} / ${H}`, maxHeight: '78vh', margin: '0 auto' }}
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
        aria-label="Flappy Wings game area. Tap or press Space to flap."
      />
      {phase !== 'playing' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white">
          {phase === 'ready' ? (
            <>
              <div className="mt-40 font-display text-3xl font-bold drop-shadow">Flappy Wings</div>
              <div className="animate-pulse rounded-full bg-black/40 px-4 py-1.5 text-sm">Tap or press Space to fly</div>
            </>
          ) : (
            <div className="card pointer-events-auto mx-6 animate-pop p-6 text-fg">
              <div className="text-4xl">💥</div>
              <div className="font-display text-2xl font-bold">Game over</div>
              <div className="my-1 text-muted">You passed {score} pipe{score === 1 ? '' : 's'}</div>
              <button className="btn-primary mt-2 w-full" onClick={flap}>Play again</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
