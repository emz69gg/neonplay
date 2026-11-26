import { useRef, useState } from 'react';
import { useKey, type GameProps } from './shared';

type Hand = 'rock' | 'paper' | 'scissors';
const HANDS: { id: Hand; emoji: string; key: string }[] = [
  { id: 'rock', emoji: '✊', key: '1' },
  { id: 'paper', emoji: '✋', key: '2' },
  { id: 'scissors', emoji: '✌️', key: '3' },
];
const BEATS: Record<Hand, Hand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const EMOJI: Record<Hand, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

type Outcome = 'win' | 'lose' | 'draw';

export default function RockPaperScissors({ api }: GameProps) {
  const [you, setYou] = useState<Hand | null>(null);
  const [cpu, setCpu] = useState<Hand | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [shaking, setShaking] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestRun, setBestRun] = useState(0);
  const [tally, setTally] = useState({ win: 0, lose: 0, draw: 0 });
  const [history, setHistory] = useState<{ you: Hand; cpu: Hand; o: Outcome }[]>([]);
  const busy = useRef(false);

  const play = (h: Hand) => {
    if (busy.current) return;
    busy.current = true;
    setYou(null);
    setCpu(null);
    setOutcome(null);
    setShaking(true);
    api.sound('tick');
    window.setTimeout(() => {
      const c = (['rock', 'paper', 'scissors'] as Hand[])[Math.floor(Math.random() * 3)];
      const o: Outcome = h === c ? 'draw' : BEATS[h] === c ? 'win' : 'lose';
      setShaking(false);
      setYou(h);
      setCpu(c);
      setOutcome(o);
      setTally((t) => ({ ...t, [o]: t[o] + 1 }));
      setHistory((x) => [{ you: h, cpu: c, o }, ...x].slice(0, 10));
      if (o === 'win') {
        const s = streak + 1;
        setStreak(s);
        api.setScore(s);
        api.sound('point');
        if (s > bestRun) setBestRun(s);
      } else if (o === 'lose') {
        api.sound('lose');
        // a loss ends the run — record it
        api.finish(streak);
        setStreak(0);
        api.setScore(0);
      } else api.sound('flip');
      if (o === 'win' && streak + 1 > 0) api.reportScore(streak + 1);
      busy.current = false;
    }, 650);
  };

  useKey((e) => {
    const h = HANDS.find((x) => x.key === e.key);
    if (h) play(h.id);
  });

  const msg = outcome === 'win' ? 'You win!' : outcome === 'lose' ? 'You lose!' : outcome === 'draw' ? 'Draw!' : shaking ? 'Rock… paper… scissors…' : 'Make your move';
  const color = outcome === 'win' ? 'text-emerald-400' : outcome === 'lose' ? 'text-rose-400' : 'text-fg';

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-5">
      <div className="grid w-full grid-cols-4 gap-2 text-center">
        {[
          ['Streak', `🔥 ${streak}`],
          ['Session best', bestRun],
          ['Wins', tally.win],
          ['Losses', tally.lose],
        ].map(([l, v]) => (
          <div key={l as string} className="card p-2">
            <div className="text-[11px] text-muted">{l}</div>
            <div className="font-mono text-lg font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="card relative grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-neon-purple/10 via-transparent to-neon-cyan/10" />
        <div className="relative text-center">
          <div className="text-xs font-semibold text-muted">YOU</div>
          <div className={`mt-2 text-7xl sm:text-8xl ${shaking ? 'animate-bounce' : you ? 'animate-pop' : ''}`} style={{ transform: 'scaleX(-1)' }}>
            {shaking ? '✊' : you ? EMOJI[you] : '❔'}
          </div>
        </div>
        <div className="relative font-display text-2xl font-black text-muted">VS</div>
        <div className="relative text-center">
          <div className="text-xs font-semibold text-muted">CPU</div>
          <div className={`mt-2 text-7xl sm:text-8xl ${shaking ? 'animate-bounce' : cpu ? 'animate-pop' : ''}`}>{shaking ? '✊' : cpu ? EMOJI[cpu] : '❔'}</div>
        </div>
      </div>

      <div className={`font-display text-2xl font-bold ${color}`} aria-live="polite">{msg}</div>

      <div className="grid w-full grid-cols-3 gap-3">
        {HANDS.map((h) => (
          <button
            key={h.id}
            onClick={() => play(h.id)}
            className="card group flex flex-col items-center gap-1 py-4 transition-all hover:-translate-y-1 hover:border-neon-purple hover:shadow-neon active:scale-95"
          >
            <span className="text-5xl transition-transform group-hover:scale-110">{h.emoji}</span>
            <span className="text-sm font-semibold capitalize">{h.id}</span>
            <kbd className="hidden rounded bg-surface2 px-1.5 text-[10px] text-muted sm:block">{h.key}</kbd>
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div className="flex w-full flex-wrap justify-center gap-1.5">
          {history.map((h, i) => (
            <span key={i} className={`chip ${h.o === 'win' ? '!bg-emerald-500/15 !text-emerald-400' : h.o === 'lose' ? '!bg-rose-500/15 !text-rose-400' : ''}`}>
              {EMOJI[h.you]} vs {EMOJI[h.cpu]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
