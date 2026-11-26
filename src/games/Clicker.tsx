import { useEffect, useRef, useState } from 'react';
import { compact } from '../lib/games';
import { useKey, type GameProps } from './shared';

interface Upgrade {
  id: string;
  name: string;
  icon: string;
  kind: 'click' | 'auto';
  amount: number;
  base: number;
  desc: string;
}

const UPGRADES: Upgrade[] = [
  { id: 'gloves', name: 'Power Gloves', icon: '🧤', kind: 'click', amount: 1, base: 15, desc: '+1 per click' },
  { id: 'turbo', name: 'Turbo Finger', icon: '👆', kind: 'click', amount: 6, base: 250, desc: '+6 per click' },
  { id: 'golden', name: 'Golden Mouse', icon: '🖱️', kind: 'click', amount: 40, base: 3_000, desc: '+40 per click' },
  { id: 'quantum', name: 'Quantum Tap', icon: '⚛️', kind: 'click', amount: 300, base: 60_000, desc: '+300 per click' },
  { id: 'intern', name: 'Intern', icon: '🧑‍💻', kind: 'auto', amount: 1, base: 50, desc: '+1 / sec' },
  { id: 'miner', name: 'Coin Miner', icon: '⛏️', kind: 'auto', amount: 6, base: 500, desc: '+6 / sec' },
  { id: 'factory', name: 'Mint Factory', icon: '🏭', kind: 'auto', amount: 40, base: 5_000, desc: '+40 / sec' },
  { id: 'bank', name: 'Neon Bank', icon: '🏦', kind: 'auto', amount: 250, base: 50_000, desc: '+250 / sec' },
  { id: 'lab', name: 'Crypto Lab', icon: '🧪', kind: 'auto', amount: 1_500, base: 500_000, desc: '+1.5K / sec' },
  { id: 'portal', name: 'Money Portal', icon: '🌀', kind: 'auto', amount: 10_000, base: 6_000_000, desc: '+10K / sec' },
];

const MILESTONES = [1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000];

interface Save {
  balance: number;
  lifetime: number;
  clicks: number;
  owned: Record<string, number>;
  milestones: number[];
  savedAt: number;
}

const fresh = (): Save => ({ balance: 0, lifetime: 0, clicks: 0, owned: {}, milestones: [], savedAt: Date.now() });
const cost = (u: Upgrade, n: number) => Math.ceil(u.base * Math.pow(1.15, n));

export default function Clicker({ api, fresh: isFresh }: GameProps) {
  const [s, setS] = useState<Save>(() => {
    const saved = isFresh ? undefined : api.load<Save>();
    return saved ? { ...fresh(), ...saved } : fresh();
  });
  const [floaters, setFloaters] = useState<{ id: number; x: number; y: number; v: number }[]>([]);
  const [press, setPress] = useState(false);
  const [offline, setOffline] = useState<number | null>(null);
  const ref = useRef(s);
  ref.current = s;
  const fid = useRef(0);

  const perClick = 1 + UPGRADES.filter((u) => u.kind === 'click').reduce((a, u) => a + (s.owned[u.id] ?? 0) * u.amount, 0);
  const perSec = UPGRADES.filter((u) => u.kind === 'auto').reduce((a, u) => a + (s.owned[u.id] ?? 0) * u.amount, 0);

  // offline earnings (50% efficiency, max 8h)
  const offlineDone = useRef(false);
  useEffect(() => {
    if (offlineDone.current) return;
    offlineDone.current = true;
    const cur = ref.current;
    const cps = UPGRADES.filter((u) => u.kind === 'auto').reduce((a, u) => a + (cur.owned[u.id] ?? 0) * u.amount, 0);
    const secs = Math.min(8 * 3600, (Date.now() - cur.savedAt) / 1000);
    if (cps > 0 && secs > 30) {
      const earned = Math.floor(cps * secs * 0.5);
      setS((p) => ({ ...p, balance: p.balance + earned, lifetime: p.lifetime + earned }));
      setOffline(earned);
    }
  }, []);

  // passive income tick
  useEffect(() => {
    const t = setInterval(() => {
      const cps = UPGRADES.filter((u) => u.kind === 'auto').reduce((a, u) => a + (ref.current.owned[u.id] ?? 0) * u.amount, 0);
      if (cps > 0) setS((p) => ({ ...p, balance: p.balance + cps / 10, lifetime: p.lifetime + cps / 10 }));
    }, 100);
    return () => clearInterval(t);
  }, []);

  // persist + report score
  useEffect(() => {
    const t = setInterval(() => {
      api.save({ ...ref.current, savedAt: Date.now() });
      api.reportScore(Math.floor(ref.current.lifetime));
    }, 3000);
    return () => {
      clearInterval(t);
      api.save({ ...ref.current, savedAt: Date.now() });
      api.reportScore(Math.floor(ref.current.lifetime));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // milestones → real platform rewards
  useEffect(() => {
    api.setScore(Math.floor(s.lifetime));
    const hit = MILESTONES.filter((m) => s.lifetime >= m && !s.milestones.includes(m));
    if (hit.length) {
      setS((p) => ({ ...p, milestones: [...p.milestones, ...hit] }));
      hit.forEach((m) => {
        const k = MILESTONES.indexOf(m) + 1;
        api.reward({ xp: 30 * k, coins: 25 * k }, `Clicker milestone: ${compact(m)} earned`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(s.lifetime)]);

  const click = (x?: number, y?: number) => {
    setS((p) => ({ ...p, balance: p.balance + perClick, lifetime: p.lifetime + perClick, clicks: p.clicks + 1 }));
    api.sound('tick');
    const id = ++fid.current;
    setFloaters((f) => [...f.slice(-14), { id, x: x ?? 50 + (Math.random() * 30 - 15), y: y ?? 45 + (Math.random() * 20 - 10), v: perClick }]);
    window.setTimeout(() => setFloaters((f) => f.filter((q) => q.id !== id)), 900);
    setPress(true);
    window.setTimeout(() => setPress(false), 70);
  };

  useKey((e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      click();
    }
  });

  const buy = (u: Upgrade) => {
    const n = s.owned[u.id] ?? 0;
    const c = cost(u, n);
    if (s.balance < c) {
      api.sound('error');
      return;
    }
    setS((p) => ({ ...p, balance: p.balance - c, owned: { ...p.owned, [u.id]: n + 1 } }));
    api.sound('coin');
  };

  const nextMilestone = MILESTONES.find((m) => s.lifetime < m);

  return (
    <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[1fr_380px]">
      <div className="card relative flex flex-col items-center justify-center overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(250,204,21,.18),transparent_60%)]" />
        <div className="relative text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">Balance</div>
          <div className="font-display text-5xl font-black text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,.4)] sm:text-6xl">{compact(s.balance)}</div>
          <div className="mt-1 text-sm text-muted">
            {compact(perClick)} / click · {compact(perSec)} / sec
          </div>
        </div>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            click(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
          }}
          className="no-touch-scroll relative my-6 grid h-56 w-56 place-items-center rounded-full sm:h-64 sm:w-64"
          aria-label="Click to earn coins"
        >
          <span className="absolute inset-0 animate-glow rounded-full bg-yellow-400/25 blur-2xl" />
          <span
            className={`relative grid h-full w-full place-items-center rounded-full border-8 border-yellow-600 bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-500 text-8xl font-black text-amber-700 shadow-[inset_0_-10px_30px_rgba(180,83,9,.5),0_20px_50px_-10px_rgba(250,204,21,.6)] transition-transform duration-75 ${press ? 'scale-95' : 'hover:scale-[1.03]'}`}
          >
            $
          </span>
          {floaters.map((f) => (
            <span
              key={f.id}
              className="animate-rise pointer-events-none absolute font-display text-xl font-black text-white drop-shadow"
              style={{ left: `${f.x}%`, top: `${f.y}%` }}
            >
              +{compact(f.v)}
            </span>
          ))}
        </button>
        <div className="relative w-full max-w-xs text-center text-xs text-muted">
          {nextMilestone ? (
            <>
              <div className="mb-1">Next milestone reward at {compact(nextMilestone)} lifetime</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-500" style={{ width: `${Math.min(100, (s.lifetime / nextMilestone) * 100)}%` }} />
              </div>
            </>
          ) : (
            'All milestones reached — absolute tycoon 👑'
          )}
          <div className="mt-2">Lifetime: {compact(s.lifetime)} · Clicks: {s.clicks.toLocaleString()}</div>
        </div>
        {offline !== null && (
          <button onClick={() => setOffline(null)} className="card absolute left-3 right-3 top-3 animate-fade-up border-yellow-400/40 px-4 py-2 text-sm">
            💤 While you were away you earned <b className="text-yellow-400">{compact(offline)}</b>. Tap to dismiss.
          </button>
        )}
      </div>

      <div className="card flex flex-col p-4">
        <h3 className="mb-3 font-display text-lg font-bold">Shop</h3>
        <div className="space-y-2 overflow-y-auto pr-1 lg:max-h-[520px]">
          {(['click', 'auto'] as const).map((kind) => (
            <div key={kind}>
              <div className="mb-1.5 mt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{kind === 'click' ? 'Click upgrades' : 'Generators'}</div>
              {UPGRADES.filter((u) => u.kind === kind).map((u, idx) => {
                const n = s.owned[u.id] ?? 0;
                const c = cost(u, n);
                const can = s.balance >= c;
                const visible = idx === 0 || n > 0 || s.lifetime >= u.base * 0.3;
                return (
                  <button
                    key={u.id}
                    onClick={() => buy(u)}
                    disabled={!visible}
                    className={`mb-2 flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${can ? 'border-yellow-400/40 bg-yellow-400/5 hover:bg-yellow-400/10' : 'border-line bg-surface2/50 opacity-70'}`}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface text-2xl">{visible ? u.icon : '❓'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{visible ? u.name : '???'}</span>
                      <span className="block text-xs text-muted">{visible ? u.desc : `Earn ${compact(u.base * 0.3)} to reveal`}</span>
                    </span>
                    <span className="text-right">
                      <span className={`block font-mono text-sm font-bold ${can ? 'text-yellow-400' : 'text-muted'}`}>{compact(c)}</span>
                      <span className="block text-[11px] text-muted">owned {n}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
