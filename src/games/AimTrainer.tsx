import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useKey, type GameProps } from './shared';

/* Aim Trainer — "30 targets" speed mode (ms, lower is better) and a 60 s precision mode. */

type Mode = 'speed' | 'precision';
type Phase = 'ready' | 'playing' | 'over';
interface Target { id: number; x: number; y: number; r: number; born: number; life: number }
interface Marker { id: number; x: number; y: number; hit: boolean }
interface Save { speedBest?: number; precisionBest?: number }

const SPEED_TARGETS = 30;
const PRECISION_MS = 60_000;

export default function AimTrainer({ api }: GameProps) {
  const [mode, setMode] = useState<Mode>('speed');
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const [targets, setTargets] = useState<Target[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [stats, setStats] = useState({ hits: 0, misses: 0, expired: 0, times: [] as number[], left: SPEED_TARGETS, timeLeft: 60 });
  const [result, setResult] = useState<null | { mode: Mode; score: number; avg: number; acc: number; hits: number; times: number[]; best: boolean }>(null);
  const [save, setSave] = useState<Save>(() => api.load<Save>() ?? {});
  const area = useRef<HTMLDivElement>(null);
  const g = useRef({ uid: 1, start: 0, nextSpawn: 0, hits: 0, misses: 0, expired: 0, times: [] as number[], targets: [] as Target[] });
  const mid = useRef(0);

  const baseR = () => {
    const el = area.current;
    if (!el) return 26;
    return Math.max(18, Math.min(34, Math.min(el.clientWidth, el.clientHeight) * 0.065));
  };

  const spawn = useCallback((now: number, r: number, life: number): Target => {
    const el = area.current!;
    const w = el.clientWidth, h = el.clientHeight;
    const pad = r + 6;
    let x = 0, y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = pad + Math.random() * (w - pad * 2);
      y = pad + Math.random() * (h - pad * 2);
      if (g.current.targets.every((t) => Math.hypot(t.x - x, t.y - y) > t.r + r + 10)) break;
    }
    return { id: g.current.uid++, x, y, r, born: now, life };
  }, []);

  const finishRun = useCallback(() => {
    const s = g.current;
    const total = s.hits + s.misses + s.expired;
    const acc = total ? Math.round((s.hits / total) * 100) : 0;
    const avg = s.times.length ? Math.round(s.times.reduce((a, b) => a + b, 0) / s.times.length) : 0;
    setTargets([]);
    s.targets = [];
    setP('over');
    api.sound('win');
    if (mode === 'speed') {
      // misses cost time: each miss adds a 100 ms penalty to the average
      const score = Math.round(avg + (s.misses * 100) / SPEED_TARGETS);
      const best = save.speedBest === undefined || score < save.speedBest;
      const ns = best ? { ...save, speedBest: score } : save;
      setSave(ns);
      api.save(ns);
      api.setScore(score);
      setResult({ mode, score, avg, acc, hits: s.hits, times: [...s.times], best });
      api.finish(score, { mode: 'speed', accuracy: acc, hits: s.hits });
    } else {
      const score = Math.round(s.hits * acc);
      const best = save.precisionBest === undefined || score > save.precisionBest;
      const ns = best ? { ...save, precisionBest: score } : save;
      setSave(ns);
      api.save(ns);
      setResult({ mode, score, avg, acc, hits: s.hits, times: [...s.times], best });
      // precision uses its own local best; the leaderboard ranks the speed mode
      api.finish(Number.POSITIVE_INFINITY, { mode: 'precision', accuracy: acc, hits: s.hits, precisionScore: score });
    }
  }, [api, mode, save]);

  const start = () => {
    const now = performance.now();
    Object.assign(g.current, { start: now, nextSpawn: now, hits: 0, misses: 0, expired: 0, times: [], targets: [] });
    setStats({ hits: 0, misses: 0, expired: 0, times: [], left: SPEED_TARGETS, timeLeft: 60 });
    setResult(null);
    setMarkers([]);
    setP('playing');
    api.setScore(0);
    api.sound('click');
    if (mode === 'speed') {
      const t = spawn(now, baseR(), Infinity);
      g.current.targets = [t];
      setTargets([t]);
    } else setTargets([]);
  };

  // precision loop: spawning, shrinking, expiry, timer
  useEffect(() => {
    if (phase !== 'playing' || mode !== 'precision') return;
    let raf = 0;
    let lastSec = -1;
    const frame = (now: number) => {
      const s = g.current;
      const elapsed = now - s.start;
      const t = Math.min(1, elapsed / PRECISION_MS);
      let changed = false;
      const alive = s.targets.filter((x) => now - x.born < x.life);
      if (alive.length !== s.targets.length) {
        s.expired += s.targets.length - alive.length;
        s.targets = alive;
        changed = true;
      }
      if (now >= s.nextSpawn && s.targets.length < 3) {
        s.targets.push(spawn(now, baseR() * 1.15, 1700 - t * 500));
        s.nextSpawn = now + 650 - t * 250;
        changed = true;
      }
      if (changed) {
        setTargets([...s.targets]);
        setStats((x) => ({ ...x, expired: s.expired }));
      }
      const sec = Math.max(0, Math.ceil((PRECISION_MS - elapsed) / 1000));
      if (sec !== lastSec) {
        lastSec = sec;
        setStats((x) => ({ ...x, timeLeft: sec }));
      }
      if (elapsed >= PRECISION_MS) {
        finishRun();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, mode, spawn, finishRun]);

  // leaving the tab cancels a run (timing would be meaningless)
  useEffect(() => {
    const h = () => {
      if (document.hidden && phaseRef.current === 'playing') {
        g.current.targets = [];
        setTargets([]);
        setP('ready');
      }
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== 'playing') return;
    e.preventDefault();
    const rect = area.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const now = performance.now();
    const s = g.current;
    // hit test, honouring shrink in precision mode
    const hit = s.targets.find((t) => {
      const scale = t.life === Infinity ? 1 : Math.max(0, 1 - (now - t.born) / t.life);
      return Math.hypot(t.x - x, t.y - y) <= t.r * scale + 4;
    });
    const id = ++mid.current;
    setMarkers((m) => [...m.slice(-12), { id, x, y, hit: !!hit }]);
    window.setTimeout(() => setMarkers((m) => m.filter((k) => k.id !== id)), 600);
    if (!hit) {
      s.misses++;
      api.sound('error');
      setStats((st) => ({ ...st, misses: s.misses }));
      return;
    }
    s.hits++;
    s.times.push(Math.round(now - hit.born));
    s.targets = s.targets.filter((t) => t !== hit);
    api.sound('point');
    if (mode === 'speed') {
      const avg = Math.round(s.times.reduce((a, b) => a + b, 0) / s.times.length);
      api.setScore(avg);
      if (s.hits >= SPEED_TARGETS) {
        setStats((st) => ({ ...st, hits: s.hits, times: [...s.times], left: 0 }));
        finishRun();
        return;
      }
      const t = spawn(now, baseR(), Infinity);
      s.targets = [t];
    }
    setTargets([...s.targets]);
    setStats((st) => ({ ...st, hits: s.hits, times: [...s.times], left: SPEED_TARGETS - s.hits }));
  };

  useKey((e) => {
    if ((e.code === 'Space' || e.key === 'Enter') && phaseRef.current !== 'playing') {
      e.preventDefault();
      start();
    } else if (e.key === 'Escape' && phaseRef.current === 'playing') {
      g.current.targets = [];
      setTargets([]);
      setP('ready');
    }
  });

  const total = stats.hits + stats.misses + stats.expired;
  const acc = total ? Math.round((stats.hits / total) * 100) : 100;
  const avg = stats.times.length ? Math.round(stats.times.reduce((a, b) => a + b, 0) / stats.times.length) : 0;

  // histogram (speed: 50 ms buckets)
  const hist = (() => {
    if (!result || !result.times.length) return null;
    const bucket = 50;
    const min = Math.floor(Math.min(...result.times) / bucket) * bucket;
    const max = Math.ceil((Math.max(...result.times) + 1) / bucket) * bucket;
    const n = Math.min(14, Math.max(1, (max - min) / bucket));
    const size = Math.ceil((max - min) / n / 10) * 10 || bucket;
    const bins = Array.from({ length: n }, (_, i) => ({ from: min + i * size, count: 0 }));
    for (const t of result.times) bins[Math.min(n - 1, Math.floor((t - min) / size))].count++;
    return { bins, size, peak: Math.max(...bins.map((b) => b.count)) };
  })();

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {(['speed', 'precision'] as Mode[]).map((m) => (
            <button
              key={m}
              disabled={phase === 'playing'}
              onClick={() => {
                setMode(m);
                setResult(null);
                setP('ready');
              }}
              className={`rounded-lg px-3 py-1.5 transition disabled:opacity-50 ${mode === m ? 'bg-surface shadow' : 'text-muted'}`}
            >
              {m === 'speed' ? '⚡ 30 targets' : '🎯 Precision 60 s'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {mode === 'speed' ? <span className="chip !text-sm">🎯 {stats.left} left</span> : <span className="chip !text-sm">⏱ {stats.timeLeft}s</span>}
          <span className="chip !text-sm">✓ {stats.hits}</span>
          <span className="chip !text-sm">Accuracy {acc}%</span>
          <span className="chip !text-sm">Avg {avg || '—'}{avg ? ' ms' : ''}</span>
        </div>
      </div>

      <div
        ref={area}
        onPointerDown={onPointerDown}
        className={`no-touch-scroll relative h-[min(62vh,520px)] min-h-[320px] w-full select-none overflow-hidden rounded-2xl border border-line bg-surface2/60 ${phase === 'playing' ? 'cursor-crosshair' : ''}`}
        aria-label="Aim Trainer play area"
      >
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
        {targets.map((t) => (
          <div
            key={t.id}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: t.x - t.r,
              top: t.y - t.r,
              width: t.r * 2,
              height: t.r * 2,
              background: 'radial-gradient(circle, #fff 0 18%, #ef4444 19% 38%, #fff 39% 58%, #ef4444 59% 100%)',
              boxShadow: '0 0 20px rgba(239,68,68,.55)',
              animation: t.life === Infinity ? 'pop .18s ease-out both' : `aimshrink ${t.life}ms linear forwards`,
            }}
          />
        ))}
        {markers.map((m) => (
          <span
            key={m.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-pop text-lg font-black"
            style={{ left: m.x, top: m.y, color: m.hit ? '#22c55e' : '#ef4444' }}
          >
            {m.hit ? '✓' : '✕'}
          </span>
        ))}

        {phase !== 'playing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-[2px]">
            {result ? (
              <div className="card w-full max-w-md animate-pop p-5 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-muted">{result.mode === 'speed' ? 'Average time (incl. miss penalty)' : 'Precision score'}</div>
                <div className="font-mono text-5xl font-black gradient-text">
                  {result.score}
                  {result.mode === 'speed' && <span className="text-2xl"> ms</span>}
                </div>
                {result.best && <div className="mt-1 text-sm font-bold text-yellow-400">🏆 New personal best!</div>}
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg bg-surface2 p-2"><div className="text-xs text-muted">Hits</div><b>{result.hits}</b></div>
                  <div className="rounded-lg bg-surface2 p-2"><div className="text-xs text-muted">Accuracy</div><b>{result.acc}%</b></div>
                  <div className="rounded-lg bg-surface2 p-2"><div className="text-xs text-muted">Avg time</div><b>{result.avg} ms</b></div>
                </div>
                {hist && (
                  <div className="mt-4">
                    <div className="mb-1 text-left text-xs font-semibold text-muted">Hit times</div>
                    <div className="flex h-24 items-end gap-1" role="img" aria-label="Histogram of hit times">
                      {hist.bins.map((b) => (
                        <div key={b.from} className="flex h-full flex-1 flex-col justify-end" title={`${b.from}–${b.from + hist.size} ms: ${b.count}`}>
                          <div className="rounded-t bg-gradient-to-t from-neon-purple to-neon-cyan" style={{ height: `${(b.count / hist.peak) * 100}%`, minHeight: b.count ? 3 : 0 }} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
                      <span>{hist.bins[0].from} ms</span>
                      <span>{hist.bins[hist.bins.length - 1].from + hist.size} ms</span>
                    </div>
                  </div>
                )}
                <button className="btn-primary mt-4" onClick={start}>Play again</button>
              </div>
            ) : (
              <div className="max-w-sm text-center">
                <div className="text-5xl">🎯</div>
                <div className="mt-2 font-display text-3xl font-bold">Aim Trainer</div>
                <p className="mt-2 text-sm text-muted">
                  {mode === 'speed'
                    ? 'Hit 30 targets as fast as you can. Each miss adds a small time penalty.'
                    : '60 seconds. Targets shrink and vanish — hit as many as you can without missing.'}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Best: {mode === 'speed' ? (save.speedBest ? `${save.speedBest} ms` : '—') : save.precisionBest ?? '—'}
                </p>
                <button className="btn-primary mt-4" onClick={start}>Start</button>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted">Click or tap targets · Space to start · Esc to cancel</p>
    </div>
  );
}
