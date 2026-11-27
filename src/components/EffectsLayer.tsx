import { useEffect, useRef } from 'react';
import { THEMES } from '../lib/cosmetics';
import { onFx } from '../lib/fx';
import { useStore } from '../store/AppStore';

/* One full-screen canvas for equipped effects: cursor trail, win animations, coin bursts.
   Also applies the equipped menu theme. Draws nothing (and runs no loop) when idle. */

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // remaining seconds
  max: number;
  size: number;
  color: string;
  shape: 'star' | 'dot' | 'rect' | 'coin' | 'gem' | 'heart' | 'ring' | 'text';
  rot?: number;
  vr?: number;
  g?: number; // gravity
  tx?: number; // homing target
  ty?: number;
  text?: string;
  delay?: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function star(ctx: CanvasRenderingContext2D, r: number, points = 4) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * 0.38 : r;
    const a = (i * Math.PI) / points - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
function heart(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.45, -s, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s, s, -s * 0.3, 0, s * 0.35);
  ctx.fill();
}

export default function EffectsLayer() {
  const { data, settings } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = data.fx;
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const reduce = settings.reducedMotion;

  // menu theme → CSS variables
  useEffect(() => {
    const t = THEMES[fx.theme ?? 'neon'] ?? THEMES.neon;
    const st = document.documentElement.style;
    st.setProperty('--neon-purple', t.purple);
    st.setProperty('--neon-blue', t.blue);
    st.setProperty('--neon-cyan', t.cyan);
    st.setProperty('--neon-pink', t.pink);
  }, [fx.theme]);

  useEffect(() => {
    if (reduce) return;
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const parts: P[] = [];
    const ribbon: { x: number; y: number; t: number }[] = [];
    let banner: { t: number; text: string } | null = null;
    let raf = 0;
    let last = performance.now();
    let hue = 0;
    const fine = window.matchMedia('(pointer: fine)').matches;
    let trialTrail: { kind: string; until: number } | null = null;
    const trailKind = () => (trialTrail && performance.now() < trialTrail.until ? trialTrail.kind : fxRef.current.trail);

    const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--neon-purple').trim().replace(/ /g, ',');

    const wake = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    const onMove = (e: PointerEvent) => {
      const kind = trailKind();
      if (!kind || !fine || e.pointerType !== 'mouse') return;
      const { clientX: x, clientY: y } = e;
      hue = (hue + 6) % 360;
      if (kind === 'neon' || kind === 'rainbow') {
        ribbon.push({ x, y, t: performance.now() });
        if (ribbon.length > 40) ribbon.shift();
      }
      if (kind === 'sparkle' && Math.random() < 0.6)
        parts.push({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-20, 20), vy: rnd(-10, 30), life: 0.6, max: 0.6, size: rnd(3, 6), color: pick(['#fff', `rgb(${accent()})`, '#f0abfc']), shape: 'star' });
      if (kind === 'stars' && Math.random() < 0.8)
        parts.push({ x, y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.9, max: 0.9, size: rnd(3, 7), color: `hsl(${rnd(0, 360)},95%,70%)`, shape: 'star', rot: rnd(0, 6), vr: rnd(-4, 4) });
      if (kind === 'rainbow' && Math.random() < 0.4)
        parts.push({ x, y, vx: rnd(-15, 15), vy: rnd(10, 40), life: 0.7, max: 0.7, size: rnd(2, 3), color: `hsl(${hue},95%,65%)`, shape: 'dot' });
      if (kind === 'comet') {
        for (let i = 0; i < 2; i++)
          parts.push({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), vx: rnd(-25, 25), vy: rnd(-25, 25), life: 0.7, max: 0.7, size: rnd(3, 8), color: pick(['#fde68a', '#fb923c', '#f472b6', '#fff']), shape: 'dot' });
        ribbon.push({ x, y, t: performance.now() });
        if (ribbon.length > 24) ribbon.shift();
      }
      wake();
    };

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    const win = (kind: string) => {
      const cx = W() / 2;
      const cy = H() / 2;
      if (kind === 'confetti')
        for (let i = 0; i < 160; i++)
          parts.push({ x: rnd(0, W()), y: rnd(-H() * 0.6, -10), vx: rnd(-40, 40), vy: rnd(120, 320), g: 60, life: 3.2, max: 3.2, size: rnd(5, 10), color: `hsl(${rnd(0, 360)},90%,62%)`, shape: 'rect', rot: rnd(0, 6), vr: rnd(-8, 8) });
      if (kind === 'fireworks')
        for (let b = 0; b < 6; b++) {
          const bx = rnd(W() * 0.15, W() * 0.85);
          const by = rnd(H() * 0.15, H() * 0.55);
          const col = `hsl(${rnd(0, 360)},95%,65%)`;
          for (let i = 0; i < 46; i++) {
            const a = (i / 46) * Math.PI * 2;
            const sp = rnd(120, 260);
            parts.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 90, life: 1.6, max: 1.6, size: rnd(2, 3.5), color: col, shape: 'dot', delay: b * 0.35 });
          }
        }
      if (kind === 'coinrain')
        for (let i = 0; i < 90; i++)
          parts.push({ x: rnd(0, W()), y: rnd(-H(), -20), vx: rnd(-20, 20), vy: rnd(250, 450), life: 3.4, max: 3.4, size: rnd(9, 15), color: '#fbbf24', shape: 'coin', rot: rnd(0, 6), vr: rnd(3, 8) });
      if (kind === 'victory') {
        banner = { t: 2.6, text: 'VICTORY' };
        for (let i = 0; i < 70; i++) {
          const a = rnd(0, Math.PI * 2);
          parts.push({ x: cx, y: cy, vx: Math.cos(a) * rnd(150, 420), vy: Math.sin(a) * rnd(80, 260), life: 1.4, max: 1.4, size: rnd(3, 7), color: pick(['#fde68a', `rgb(${accent()})`, '#22d3ee']), shape: 'star', rot: 0, vr: rnd(-6, 6) });
        }
      }
      if (kind === 'supernova') {
        for (let r = 0; r < 3; r++) parts.push({ x: cx, y: cy, vx: 0, vy: 0, life: 1.4, max: 1.4, size: 10, color: pick(['#f0abfc', '#67e8f9', '#fde68a']), shape: 'ring', delay: r * 0.18 });
        for (let i = 0; i < 140; i++) {
          const a = rnd(0, Math.PI * 2);
          const sp = rnd(200, 700);
          parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.8, max: 1.8, size: rnd(2, 6), color: `hsl(${rnd(260, 360 + 60) % 360},95%,72%)`, shape: pick(['star', 'dot']), rot: 0, vr: rnd(-5, 5) });
        }
      }
      wake();
    };

    const coins = (amount: number, kind: string) => {
      const target = document.getElementById('coin-balance')?.getBoundingClientRect();
      const tx = target ? target.left + target.width / 2 : W() - 120;
      const ty = target ? target.top + target.height / 2 : 30;
      const n = Math.min(16, Math.max(4, Math.round(amount / 15)));
      const shape: P['shape'] = kind === 'gems' ? 'gem' : kind === 'stars' ? 'star' : kind === 'hearts' ? 'heart' : 'coin';
      const color = kind === 'gems' ? '#67e8f9' : kind === 'stars' ? '#fde047' : kind === 'hearts' ? '#f472b6' : kind === 'neon' ? `rgb(${accent()})` : '#fbbf24';
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        parts.push({ x: W() / 2 + rnd(-30, 30), y: H() * 0.55 + rnd(-30, 30), vx: Math.cos(a) * rnd(150, 300), vy: Math.sin(a) * rnd(150, 300), life: 1.6, max: 1.6, size: rnd(7, 11), color, shape, tx, ty, delay: i * 0.04, rot: 0, vr: rnd(-3, 3) });
      }
      wake();
    };

    const off = onFx((e) => {
      const f = fxRef.current;
      if (e.type === 'win' && (e.kind ?? f.win)) win((e.kind ?? f.win)!);
      if (e.type === 'coins' && (e.kind ?? f.coin)) coins(e.amount, (e.kind ?? f.coin)!);
      if (e.type === 'trail') trialTrail = { kind: e.kind, until: performance.now() + 6000 };
    });

    function drawPart(p: P) {
      const k = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.rot) ctx.rotate(p.rot);
      ctx.globalAlpha = p.shape === 'rect' || p.shape === 'coin' ? Math.min(1, k * 3) : k;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.shape === 'rect' ? 0 : 10;
      switch (p.shape) {
        case 'star':
          star(ctx, p.size);
          break;
        case 'dot':
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.4 + k * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'rect':
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        case 'coin': {
          const sx = Math.abs(Math.cos(p.rot ?? 0)) * 0.8 + 0.2;
          ctx.rotate(-(p.rot ?? 0));
          ctx.scale(sx, 1);
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.55)';
          ctx.beginPath();
          ctx.arc(-p.size * 0.25, -p.size * 0.25, p.size * 0.35, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'gem':
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.8, -p.size * 0.2);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.8, -p.size * 0.2);
          ctx.closePath();
          ctx.fill();
          break;
        case 'heart':
          heart(ctx, p.size);
          break;
        case 'ring': {
          const r = (1 - k) * Math.max(W(), H()) * 0.6;
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 6 * k + 1;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W(), H());
      ctx.globalCompositeOperation = 'lighter';

      // ribbons (neon / rainbow / comet)
      const kind = trailKind();
      while (ribbon.length && now - ribbon[0].t > (kind === 'comet' ? 260 : 380)) ribbon.shift();
      if (ribbon.length > 1 && kind) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < ribbon.length; i++) {
          const k = i / ribbon.length;
          ctx.strokeStyle = kind === 'rainbow' ? `hsla(${(hue - (ribbon.length - i) * 8 + 360) % 360},95%,65%,${k})` : kind === 'comet' ? `rgba(251,146,60,${k * 0.7})` : `rgba(${accent()},${k})`;
          ctx.lineWidth = (kind === 'comet' ? 10 : 4) * k + 1;
          ctx.shadowColor = ctx.strokeStyle as string;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(ribbon[i - 1].x, ribbon[i - 1].y);
          ctx.lineTo(ribbon[i].x, ribbon[i].y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (p.delay && p.delay > 0) {
          p.delay -= dt;
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        if (p.tx !== undefined && p.ty !== undefined && p.life < p.max - 0.35) {
          // home in on the coin balance
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const d = Math.hypot(dx, dy);
          if (d < 14) {
            parts.splice(i, 1);
            continue;
          }
          const sp = 900;
          p.vx += ((dx / d) * sp - p.vx) * Math.min(1, dt * 6);
          p.vy += ((dy / d) * sp - p.vy) * Math.min(1, dt * 6);
        } else if (p.tx !== undefined) {
          p.vx *= 0.92;
          p.vy *= 0.92;
        }
        if (p.g) p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot = (p.rot ?? 0) + p.vr * dt;
        drawPart(p);
      }

      if (banner) {
        banner.t -= dt;
        const t = 2.6 - banner.t;
        const sc = t < 0.35 ? 0.4 + (t / 0.35) * 0.7 : t < 0.5 ? 1.1 - ((t - 0.35) / 0.15) * 0.1 : 1;
        const a = banner.t < 0.5 ? banner.t / 0.5 : 1;
        ctx.save();
        ctx.translate(W() / 2, H() / 2);
        ctx.scale(sc, sc);
        ctx.globalAlpha = a;
        ctx.font = `900 ${Math.min(120, W() / 7)}px "Space Grotesk", Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = `rgb(${accent()})`;
        ctx.shadowBlur = 40;
        ctx.strokeStyle = `rgb(${accent()})`;
        ctx.lineWidth = 6;
        ctx.strokeText(banner.text, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillText(banner.text, 0, 0);
        ctx.restore();
        if (banner.t <= 0) banner = null;
      }

      if (parts.length || ribbon.length || banner) raf = requestAnimationFrame(loop);
      else {
        ctx.clearRect(0, 0, W(), H());
        raf = 0;
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      off();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  if (reduce) return null;
  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[70] h-full w-full" aria-hidden />;
}
