import { useCallback, useEffect, useRef, useState } from 'react';
import { useKey, type GameProps } from './shared';

/* Whack-a-Mole — 30 s rounds, golden & bomb critters, combo multiplier. */

type Kind = 'normal' | 'gold' | 'bomb';
type Diff = 'normal' | 'hard';
type Phase = 'ready' | 'playing' | 'paused' | 'over';

interface Hole {
  kind: Kind | null;
  id: number;
  upAt: number; // game-clock ms
  downAt: number;
  hit: boolean;
}
interface Floater { id: number; hole: number; text: string; color: string }

const ROUND_MS = 30_000;

function Critter({ kind, hit }: { kind: Kind; hit: boolean }) {
  if (kind === 'bomb')
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <path d="M58 18 q10 -10 18 -4" stroke="#a16207" strokeWidth="4" fill="none" />
        <circle cx="78" cy="12" r="6" fill="#f97316" className="animate-pulse" />
        <circle cx="50" cy="60" r="34" fill="#1f2937" />
        <circle cx="38" cy="48" r="8" fill="#fff" opacity=".25" />
        <rect x="42" y="20" width="16" height="10" rx="2" fill="#374151" />
        <path d="M36 62 l8 -6 M36 56 l8 6 M56 62 l8 -6 M56 56 l8 6" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
        <path d="M40 78 q10 -6 20 0" stroke="#ef4444" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  const body = kind === 'gold' ? '#facc15' : '#a16207';
  const belly = kind === 'gold' ? '#fef9c3' : '#d6a35c';
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {kind === 'gold' && <circle cx="50" cy="55" r="44" fill="#fde047" opacity=".35" />}
      <ellipse cx="50" cy="62" rx="34" ry="38" fill={body} />
      <ellipse cx="50" cy="74" rx="20" ry="22" fill={belly} />
      <circle cx="24" cy="30" r="9" fill={body} />
      <circle cx="76" cy="30" r="9" fill={body} />
      {hit ? (
        <>
          <path d="M32 42 l10 10 M42 42 l-10 10 M58 42 l10 10 M68 42 l-10 10" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="66" r="6" fill="#1f2937" />
        </>
      ) : (
        <>
          <circle cx="37" cy="47" r="7" fill="#fff" />
          <circle cx="63" cy="47" r="7" fill="#fff" />
          <circle cx="38" cy="48" r="3.5" fill="#111" />
          <circle cx="64" cy="48" r="3.5" fill="#111" />
          <ellipse cx="50" cy="60" rx="7" ry="5" fill="#f472b6" />
          <path d="M43 68 q7 6 14 0" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect x="46" y="67" width="4" height="6" rx="1" fill="#fff" />
          <rect x="50" y="67" width="4" height="6" rx="1" fill="#fff" />
        </>
      )}
      {kind === 'gold' && <path d="M50 4 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z" fill="#fff" />}
    </svg>
  );
}

export default function WhackAMole({ api }: GameProps) {
  const [diff, setDiff] = useState<Diff>('normal');
  const size = diff === 'hard' ? 4 : 3;
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const setP = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const [holes, setHoles] = useState<Hole[]>(() => Array.from({ length: 9 }, () => ({ kind: null, id: 0, upAt: 0, downAt: 0, hit: false })));
  const [hud, setHud] = useState({ score: 0, combo: 0, left: 30, bestCombo: 0, hits: 0, misses: 0 });
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [flash, setFlash] = useState(0);

  const g = useRef({ clock: 0, nextSpawn: 0, score: 0, combo: 0, bestCombo: 0, hits: 0, misses: 0, uid: 1, holes: [] as Hole[] });
  const fid = useRef(0);

  const resetHoles = useCallback((n: number) => {
    g.current.holes = Array.from({ length: n }, () => ({ kind: null, id: 0, upAt: 0, downAt: 0, hit: false }));
    setHoles(g.current.holes.map((h) => ({ ...h })));
  }, []);

  useEffect(() => {
    resetHoles(size * size);
  }, [size, resetHoles]);

  const start = useCallback(() => {
    if (phaseRef.current === 'paused') {
      setP('playing');
      return;
    }
    Object.assign(g.current, { clock: 0, nextSpawn: 400, score: 0, combo: 0, bestCombo: 0, hits: 0, misses: 0 });
    resetHoles(size * size);
    setHud({ score: 0, combo: 0, left: 30, bestCombo: 0, hits: 0, misses: 0 });
    api.setScore(0);
    setP('playing');
    api.sound('click');
  }, [api, resetHoles, setP, size]);

  const float = (hole: number, text: string, color: string) => {
    const id = ++fid.current;
    setFloaters((f) => [...f.slice(-8), { id, hole, text, color }]);
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 700);
  };

  // game loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const s = g.current;
      if (phaseRef.current === 'playing') {
        s.clock += dt;
        const t = s.clock / ROUND_MS; // 0..1
        const hard = diff === 'hard';
        // retract
        let changed = false;
        for (const h of s.holes)
          if (h.kind && s.clock >= h.downAt) {
            h.kind = null;
            h.hit = false;
            changed = true;
          }
        // spawn
        if (s.clock >= s.nextSpawn && s.clock < ROUND_MS - 300) {
          const upCount = s.holes.filter((h) => h.kind).length;
          const maxUp = hard ? 4 : 3;
          const free = s.holes.map((h, i) => (h.kind ? -1 : i)).filter((i) => i >= 0);
          if (upCount < maxUp && free.length) {
            const i = free[Math.floor(Math.random() * free.length)];
            const r = Math.random();
            const kind: Kind = s.clock > 3000 && r < (hard ? 0.2 : 0.14) ? 'bomb' : r > 0.88 ? 'gold' : 'normal';
            const stay = (1150 - t * 550) * (hard ? 0.8 : 1) * (kind === 'gold' ? 0.75 : 1);
            s.holes[i] = { kind, id: s.uid++, upAt: s.clock, downAt: s.clock + stay, hit: false };
            changed = true;
          }
          s.nextSpawn = s.clock + (850 - t * 480) * (hard ? 0.75 : 1) * (0.7 + Math.random() * 0.6);
        }
        if (changed) setHoles(s.holes.map((h) => ({ ...h })));
        const left = Math.max(0, Math.ceil((ROUND_MS - s.clock) / 1000));
        setHud((h) => (h.left !== left ? { ...h, left } : h));
        if (left <= 5 && left !== hudLeft.current && left > 0) api.sound('tick');
        hudLeft.current = left;
        if (s.clock >= ROUND_MS) {
          for (const h of s.holes) h.kind = null;
          setHoles(s.holes.map((h) => ({ ...h })));
          setP('over');
          api.sound('win');
          api.finish(s.score, { bestCombo: s.bestCombo, difficulty: diff, hits: s.hits });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [api, diff, setP]);
  const hudLeft = useRef(30);

  const whack = (i: number) => {
    if (phaseRef.current !== 'playing') return;
    const s = g.current;
    const h = s.holes[i];
    if (!h) return;
    if (!h.kind || h.hit) {
      s.combo = 0;
      s.misses++;
      api.sound('click');
      setHud((x) => ({ ...x, combo: 0, misses: s.misses }));
      return;
    }
    h.hit = true;
    h.downAt = Math.min(h.downAt, s.clock + 260);
    if (h.kind === 'bomb') {
      s.score = Math.max(0, s.score - 5);
      s.combo = 0;
      setFlash((f) => f + 1);
      api.sound('error');
      float(i, '−5', '#ef4444');
    } else {
      s.combo++;
      s.hits++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const mult = 1 + Math.floor(s.combo / 5);
      const pts = (h.kind === 'gold' ? 3 : 1) * mult;
      s.score += pts;
      api.sound(h.kind === 'gold' ? 'coin' : 'point');
      float(i, `+${pts}`, h.kind === 'gold' ? '#facc15' : '#ffffff');
    }
    api.setScore(s.score);
    setHoles(s.holes.map((x) => ({ ...x })));
    setHud((x) => ({ ...x, score: s.score, combo: s.combo, bestCombo: s.bestCombo, hits: s.hits }));
  };

  useKey((e) => {
    if (/^[1-9]$/.test(e.key)) {
      // map like a phone keypad: 1 = top-left
      whack(Number(e.key) - 1);
    } else if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      if (phaseRef.current !== 'playing') start();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (phaseRef.current === 'playing') setP('paused');
    }
  });

  useEffect(() => {
    const h = () => document.hidden && phaseRef.current === 'playing' && setP('paused');
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [setP]);

  const mult = 1 + Math.floor(hud.combo / 5);

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {(['normal', 'hard'] as Diff[]).map((d) => (
            <button
              key={d}
              disabled={phase === 'playing'}
              onClick={() => {
                setDiff(d);
                setP('ready');
              }}
              className={`rounded-lg px-3 py-1.5 capitalize transition disabled:opacity-50 ${diff === d ? 'bg-surface shadow' : 'text-muted'}`}
            >
              {d} {d === 'normal' ? '3×3' : '4×4'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <span className="chip !text-sm">⭐ {hud.score}</span>
          <span className={`chip !text-sm ${hud.left <= 5 && phase === 'playing' ? '!bg-rose-500/20 !text-rose-400' : ''}`}>⏱ {hud.left}s</span>
          <span className={`chip !text-sm ${mult > 1 ? '!bg-neon-purple/20 !text-neon-purple' : ''}`}>🔥 {hud.combo} · ×{mult}</span>
        </div>
      </div>

      <div className="relative w-full">
        <div
          className="no-touch-scroll grid w-full select-none gap-3 rounded-3xl bg-gradient-to-b from-lime-600 to-green-800 p-4 shadow-[inset_0_-10px_30px_rgba(0,0,0,.3)] sm:gap-4 sm:p-6"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {holes.slice(0, size * size).map((h, i) => (
            <button
              key={i}
              onPointerDown={(e) => {
                e.preventDefault();
                whack(i);
              }}
              className="relative aspect-square cursor-pointer"
              aria-label={`Hole ${i + 1}${h.kind ? `, ${h.kind}` : ''}`}
            >
              {/* hole back */}
              <div className="absolute inset-x-[6%] bottom-[8%] h-[34%] rounded-[50%] bg-[#2b1a0a] shadow-[inset_0_8px_14px_rgba(0,0,0,.7)]" />
              {/* critter (clipped to rise out of the hole) */}
              <div className="absolute inset-x-[12%] bottom-[22%] top-0 overflow-hidden">
                <div
                  key={h.id}
                  className="absolute inset-x-0 bottom-0 h-[92%] transition-transform duration-150 ease-out"
                  style={{ transform: h.kind ? (h.hit ? 'translateY(30%) scale(.95)' : 'translateY(0)') : 'translateY(105%)', animation: h.kind && !h.hit ? 'popup .14s ease-out backwards' : undefined }}
                >
                  {h.kind && <Critter kind={h.kind} hit={h.hit} />}
                </div>
              </div>
              {/* hole front lip */}
              <div className="absolute inset-x-[4%] bottom-[4%] h-[20%] rounded-[50%] border-t-4 border-[#5b3a1a] bg-transparent" />
              <span className="absolute left-1 top-1 hidden rounded bg-black/30 px-1 text-[10px] font-bold text-white/70 sm:block">{i < 9 ? i + 1 : ''}</span>
              {floaters
                .filter((f) => f.hole === i)
                .map((f) => (
                  <span key={f.id} className="animate-rise pointer-events-none absolute left-1/2 top-1/3 font-display text-2xl font-black drop-shadow" style={{ color: f.color }}>
                    {f.text}
                  </span>
                ))}
            </button>
          ))}
        </div>
        {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 rounded-3xl bg-red-500/40" style={{ animation: 'fade-up .4s ease reverse both' }} />}

        {phase !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-black/55 px-6 text-center text-white backdrop-blur-[2px]">
            <div className="text-5xl">{phase === 'over' ? '🏁' : phase === 'paused' ? '⏸' : '🔨'}</div>
            <div className="font-display text-3xl font-bold">{phase === 'over' ? `${hud.score} points!` : phase === 'paused' ? 'Paused' : 'Whack-a-Mole'}</div>
            {phase === 'over' && (
              <div className="text-sm text-white/80">{hud.hits} hits · best combo {hud.bestCombo} · {hud.misses} misses</div>
            )}
            {phase === 'ready' && (
              <div className="grid gap-1 text-sm text-white/80">
                <span>Normal +1 · <span className="text-yellow-300">Golden +3</span> · <span className="text-red-400">Bomb −5</span></span>
                <span>Every 5 hits in a row adds ×1 to your multiplier</span>
              </div>
            )}
            <button className="btn-primary" onClick={start}>{phase === 'paused' ? 'Resume' : phase === 'over' ? 'Play again' : 'Start (30 s)'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
