import { useEffect, useRef, useState } from 'react';
import { useKey, type GameProps } from './shared';

type Phase = 'idle' | 'waiting' | 'go' | 'result' | 'early';

export default function ReactionTest({ api }: GameProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [last, setLast] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const timer = useRef<number>();
  const goAt = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const startRound = () => {
    setPhase('waiting');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      goAt.current = performance.now();
      setPhase('go');
      api.sound('tick');
    }, 1200 + Math.random() * 2800);
  };

  const press = () => {
    if (phase === 'idle' || phase === 'result' || phase === 'early') {
      api.sound('click');
      startRound();
    } else if (phase === 'waiting') {
      window.clearTimeout(timer.current);
      setPhase('early');
      api.sound('error');
    } else if (phase === 'go') {
      const ms = Math.round(performance.now() - goAt.current);
      setLast(ms);
      setHistory((h) => [ms, ...h].slice(0, 5));
      setPhase('result');
      api.setScore(ms);
      api.sound(ms < 250 ? 'win' : 'point');
      api.finish(ms);
    }
  };

  useKey((e) => {
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) press();
    }
  });

  const avg = history.length ? Math.round(history.reduce((a, b) => a + b, 0) / history.length) : null;
  const verdict = (ms: number) => (ms < 180 ? 'Inhuman! 🤯' : ms < 220 ? 'Elite reflexes ⚡' : ms < 270 ? 'Great! 🔥' : ms < 350 ? 'Not bad 👍' : 'Keep practising 🐢');

  const styles: Record<Phase, string> = {
    idle: 'from-neon-violet to-neon-blue',
    waiting: 'from-red-600 to-rose-500',
    go: 'from-emerald-500 to-green-400',
    result: 'from-neon-blue to-neon-cyan',
    early: 'from-orange-500 to-amber-500',
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          press();
        }}
        className={`no-touch-scroll relative flex aspect-[4/3] w-full select-none flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-2xl transition-colors duration-100 sm:aspect-[16/9] ${styles[phase]}`}
        aria-label="Reaction panel"
      >
        <div className="grid-bg absolute inset-0 opacity-30" />
        <div className="relative px-6 text-center">
          {phase === 'idle' && (
            <>
              <div className="mb-3 text-6xl">⚡</div>
              <div className="font-display text-3xl font-bold sm:text-4xl">Reaction Test</div>
              <div className="mt-2 text-white/80">Click, tap or press Space to start</div>
            </>
          )}
          {phase === 'waiting' && (
            <>
              <div className="mb-3 text-6xl">✋</div>
              <div className="font-display text-3xl font-bold sm:text-5xl">Wait for green…</div>
            </>
          )}
          {phase === 'go' && <div className="font-display text-5xl font-black sm:text-7xl">CLICK!</div>}
          {phase === 'result' && last !== null && (
            <>
              <div className="font-mono text-6xl font-black sm:text-8xl">{last}<span className="text-3xl"> ms</span></div>
              <div className="mt-2 text-xl font-semibold">{verdict(last)}</div>
              <div className="mt-4 text-white/80">Click to go again</div>
            </>
          )}
          {phase === 'early' && (
            <>
              <div className="mb-3 text-6xl">😬</div>
              <div className="font-display text-3xl font-bold sm:text-4xl">Too soon!</div>
              <div className="mt-2 text-white/85">Wait for the green screen. Click to try again.</div>
            </>
          )}
        </div>
      </button>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card p-3">
          <div className="text-xs text-muted">Last</div>
          <div className="font-mono text-lg font-bold">{last ?? '—'}{last ? ' ms' : ''}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Average (last {history.length || 5})</div>
          <div className="font-mono text-lg font-bold">{avg ?? '—'}{avg ? ' ms' : ''}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Recent</div>
          <div className="truncate font-mono text-sm font-semibold">{history.length ? history.join(' · ') : '—'}</div>
        </div>
      </div>
    </div>
  );
}
