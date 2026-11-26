import { useEffect, useRef, useState } from 'react';
import { shuffle, type GameProps } from './shared';

const ICONS = ['🚀', '👾', '🎧', '🍕', '🦊', '⚡', '🌈', '🎲', '🐙', '💎', '🍩', '🌵', '🎸', '🧊', '🔥', '🪐'];
type Diff = 'normal' | 'hard';
const CONFIG: Record<Diff, { pairs: number; cols: number; base: number }> = {
  normal: { pairs: 8, cols: 4, base: 1000 },
  hard: { pairs: 12, cols: 6, base: 1800 },
};

interface Card {
  id: number;
  icon: string;
  matched: boolean;
}

const deal = (d: Diff): Card[] =>
  shuffle(shuffle(ICONS).slice(0, CONFIG[d].pairs).flatMap((icon) => [icon, icon])).map((icon, id) => ({ id, icon, matched: false }));

export default function MemoryCards({ api }: GameProps) {
  const [diff, setDiff] = useState<Diff>('normal');
  const [cards, setCards] = useState<Card[]>(() => deal('normal'));
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finished, setFinished] = useState<null | { score: number; secs: number }>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!startedAt || finished) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt, finished]);

  const secs = startedAt ? Math.floor(((finished ? startedAt + finished.secs * 1000 : now) - startedAt) / 1000) : 0;

  const newGame = (d = diff) => {
    setDiff(d);
    setCards(deal(d));
    setOpen([]);
    setMoves(0);
    setStartedAt(null);
    setFinished(null);
    lock.current = false;
    api.setScore(0);
  };

  const flip = (i: number) => {
    if (lock.current || finished || open.includes(i) || cards[i].matched) return;
    if (!startedAt) setStartedAt(Date.now());
    api.sound('flip');
    const next = [...open, i];
    setOpen(next);
    if (next.length === 2) {
      const m = moves + 1;
      setMoves(m);
      const [a, b] = next;
      if (cards[a].icon === cards[b].icon) {
        const nc = cards.map((c, k) => (k === a || k === b ? { ...c, matched: true } : c));
        setCards(nc);
        setOpen([]);
        api.sound('point');
        if (nc.every((c) => c.matched)) {
          const s = Math.max(1, Math.floor((Date.now() - (startedAt ?? Date.now())) / 1000));
          const cfg = CONFIG[diff];
          const score = Math.max(cfg.base / 10, Math.round(cfg.base - (m - cfg.pairs) * 20 - s * 3));
          setFinished({ score, secs: s });
          api.setScore(score);
          api.sound('win');
          api.finish(score, { moves: m, difficulty: diff, win: true });
        }
      } else {
        lock.current = true;
        window.setTimeout(() => {
          setOpen([]);
          lock.current = false;
        }, 750);
      }
    }
  };

  const cfg = CONFIG[diff];
  const matched = cards.filter((c) => c.matched).length / 2;

  return (
    <div className="flex w-full flex-col items-center gap-4" style={{ maxWidth: diff === 'normal' ? 480 : 720 }}>
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
          {(['normal', 'hard'] as Diff[]).map((d) => (
            <button key={d} onClick={() => newGame(d)} className={`rounded-lg px-3 py-1.5 capitalize transition ${diff === d ? 'bg-surface shadow' : 'text-muted'}`}>
              {d} ({CONFIG[d].pairs * 2})
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <span className="chip !text-sm">👆 {moves} moves</span>
          <span className="chip !text-sm">⏱ {secs}s</span>
          <span className="chip !text-sm">✓ {matched}/{cfg.pairs}</span>
        </div>
      </div>

      <div className="relative w-full">
        <div className="grid w-full gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}>
          {cards.map((c, i) => {
            const faceUp = c.matched || open.includes(i);
            return (
              <button
                key={`${diff}-${c.id}-${c.icon}`}
                onClick={() => flip(i)}
                className="aspect-square [perspective:800px]"
                aria-label={faceUp ? c.icon : 'Hidden card'}
              >
                <div className={`relative h-full w-full transition-transform duration-300 [transform-style:preserve-3d] ${faceUp ? '[transform:rotateY(180deg)]' : ''}`}>
                  <div className="absolute inset-0 grid place-items-center rounded-xl border border-neon-purple/40 bg-gradient-to-br from-neon-violet to-neon-blue shadow-neon [backface-visibility:hidden]">
                    <div className="grid-bg absolute inset-0 rounded-xl opacity-40" />
                    <span className="relative text-2xl text-white/80">✦</span>
                  </div>
                  <div className={`absolute inset-0 grid place-items-center rounded-xl border bg-surface text-3xl [backface-visibility:hidden] [transform:rotateY(180deg)] sm:text-5xl ${c.matched ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-line'}`}>
                    {c.icon}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-bg/80 backdrop-blur-sm animate-fade-up">
            <div className="text-5xl">🧠</div>
            <div className="font-display text-3xl font-bold">Board cleared!</div>
            <div className="text-muted">{moves} moves · {finished.secs}s</div>
            <div className="font-mono text-4xl font-black gradient-text">{finished.score} pts</div>
            <button className="btn-primary mt-2" onClick={() => newGame()}>Play again</button>
          </div>
        )}
      </div>
    </div>
  );
}
