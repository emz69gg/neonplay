import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bannerStyle, PlayerName } from '../components/Cosmetics';
import { AvatarBubble, Coin } from '../components/ui';
import {
  FEATURED_DISCOUNT,
  featuredItems,
  ITEMS,
  KIND_INFO,
  owns,
  priceOf,
  RARITIES,
  RARITY_PRICE,
  RARITY_STYLE,
  SPIN_PRIZES,
  THEMES,
  type Item,
  type Kind,
  type Rarity,
  type ShopCategory,
} from '../lib/cosmetics';
import { emitFx } from '../lib/fx';
import { todayKey } from '../lib/games';
import { useStore } from '../store/AppStore';

const CATS: { id: ShopCategory; label: string; icon: string }[] = [
  { id: 'featured', label: 'Featured', icon: '⭐' },
  { id: 'skins', label: 'Skins', icon: '🙂' },
  { id: 'pets', label: 'Pets', icon: '🐾' },
  { id: 'effects', label: 'Effects', icon: '✨' },
  { id: 'profile', label: 'Profile', icon: '🖼️' },
  { id: 'themes', label: 'Themes', icon: '🎨' },
];
const KINDS_OF: Record<Exclude<ShopCategory, 'featured'>, Kind[]> = {
  skins: ['emoji', 'color'],
  pets: ['pet'],
  effects: ['trail', 'win', 'coin'],
  profile: ['frame', 'name', 'bg', 'badge'],
  themes: ['theme'],
};
const EFFECT_ICON: Record<string, string> = {
  'trail:sparkle': '✨', 'trail:neon': '〰️', 'trail:stars': '🌟', 'trail:rainbow': '🌈', 'trail:comet': '☄️',
  'win:confetti': '🎊', 'win:fireworks': '🎆', 'win:coinrain': '💰', 'win:victory': '🏆', 'win:supernova': '💥',
  'coin:sparkle': '🪙', 'coin:gems': '💎', 'coin:stars': '⭐', 'coin:hearts': '💖', 'coin:neon': '🔆',
};

function untilMidnight(now: number) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((d.getTime() - now) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** What the item looks like, using the player's own avatar where it makes sense. */
function Preview({ item }: { item: Item }) {
  const { data } = useStore();
  const a = data.avatar;
  const base = { ...a, frame: undefined, pet: undefined };
  switch (item.kind) {
    case 'emoji':
      return <AvatarBubble avatar={{ ...base, emoji: item.key }} size={64} />;
    case 'color':
      return <AvatarBubble avatar={{ ...base, color: item.key }} size={64} />;
    case 'frame':
      return <AvatarBubble avatar={{ ...base, frame: item.key }} size={56} />;
    case 'pet':
      return <AvatarBubble avatar={{ ...base, pet: item.key }} size={50} />;
    case 'name':
      return <PlayerName name={data.username} avatar={{ ...a, name: item.key, badge: undefined }} className="max-w-full font-display text-xl font-bold" />;
    case 'badge':
      return <span className="text-5xl" style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,.35))' }}>{item.icon}</span>;
    case 'bg':
      return <div className="h-16 w-full rounded-xl" style={bannerStyle(item.key)} />;
    case 'theme': {
      const t = THEMES[item.key];
      return (
        <div className="w-full space-y-1.5">
          <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${t.swatch.join(',')})` }} />
          <div className="flex justify-center gap-1.5">
            {t.swatch.map((c) => (
              <span key={c} className="h-7 w-7 rounded-full" style={{ background: c, boxShadow: `0 0 12px ${c}` }} />
            ))}
          </div>
        </div>
      );
    }
    default:
      return <span className="text-5xl">{EFFECT_ICON[item.id] ?? item.icon ?? '✨'}</span>;
  }
}

function ItemCard({ item, deal = false }: { item: Item; deal?: boolean }) {
  const { data, buyItem, equipItem, unequip, toast } = useStore();
  const r = RARITY_STYLE[item.rarity];
  const have = owns(data.unlocks, item.id);
  const price = priceOf(item);
  const equipped =
    item.kind === 'emoji' ? data.avatar.emoji === item.key
    : item.kind === 'color' ? data.avatar.color === item.key
    : ['frame', 'name', 'bg', 'badge', 'pet'].includes(item.kind) ? data.avatar[item.kind as 'frame'] === item.key
    : item.kind === 'theme' ? (data.fx.theme ?? 'neon') === item.key
    : data.fx[item.kind as 'trail'] === item.key;
  const canUnequip = equipped && !['emoji', 'color', 'theme'].includes(item.kind);
  const affordable = data.coins >= price;
  const previewable = ['trail', 'win', 'coin'].includes(item.kind);

  const buy = () => {
    const res = buyItem(item.id);
    if (!res.ok) toast({ icon: '🪙', title: 'Not enough coins', desc: res.error, tone: 'error' });
  };
  const preview = () => {
    if (item.kind === 'win') emitFx({ type: 'win', kind: item.key });
    if (item.kind === 'coin') emitFx({ type: 'coins', amount: 150, kind: item.key });
    if (item.kind === 'trail') {
      emitFx({ type: 'trail', kind: item.key });
      toast({ icon: '🖱️', title: `Previewing ${item.name}`, desc: 'Move your mouse around for a few seconds.' });
    }
  };

  return (
    <div
      className={`card group relative flex flex-col overflow-hidden border-2 ${r.ring} p-3 transition hover:-translate-y-0.5 ${equipped ? 'ring-2 ring-neon-purple' : ''}`}
      style={{ boxShadow: item.rarity !== 'common' ? `0 0 22px -8px ${r.glow}` : undefined }}
    >
      {item.rarity === 'mythic' && <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-cyan-400/10" />}
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${r.chip}`}>{r.label}</span>
        {deal && !have && <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">−{FEATURED_DISCOUNT * 100}%</span>}
        {have && <span className="text-[10px] font-bold uppercase text-emerald-400">{equipped ? '✓ Equipped' : 'Owned'}</span>}
      </div>
      <div className="relative my-3 grid min-h-[84px] place-items-center px-2">
        <Preview item={item} />
      </div>
      <div className="min-w-0">
        <div className="truncate font-display font-bold">{item.name}</div>
        <div className="text-[11px] text-muted">{KIND_INFO[item.kind].label}</div>
        <p className="mt-1 line-clamp-2 min-h-[2.5em] text-xs text-muted">{item.desc}</p>
      </div>
      <div className="mt-3 flex gap-1.5">
        {!have ? (
          <button className={`min-w-0 flex-1 !px-2 !py-2 text-sm ${affordable ? 'btn-primary' : 'btn-ghost opacity-80'}`} onClick={buy} aria-label={`Buy ${item.name} for ${price} coins`}>
            <Coin /> {price.toLocaleString()}
            {deal && price < item.price && <s className="ml-1 text-[11px] opacity-60">{item.price.toLocaleString()}</s>}
          </button>
        ) : canUnequip ? (
          <button className="btn-ghost flex-1 !py-2 text-sm" onClick={() => unequip(item.kind)}>Unequip</button>
        ) : (
          <button className="btn-ghost flex-1 !py-2 text-sm" disabled={equipped} onClick={() => equipItem(item.id)}>
            {equipped ? 'Equipped' : 'Equip'}
          </button>
        )}
        {previewable && (
          <button className="btn-ghost !px-2.5 !py-2 text-sm" onClick={preview} title="Preview" aria-label={`Preview ${item.name}`}>▶</button>
        )}
      </div>
    </div>
  );
}

function DailySpin() {
  const { data, spinWheel, toast, sound } = useStore();
  const now = useNow();
  const spunToday = data.spin.last === todayKey();
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ReactNode>(null);
  const n = SPIN_PRIZES.length;
  const seg = 360 / n;

  const spin = () => {
    if (spinning) return;
    const res = spinWheel();
    if (!res) return;
    setSpinning(true);
    setResult(null);
    sound('click');
    // land the chosen segment under the pointer (top), with a little randomness inside the segment
    const target = 360 * 6 + (360 - (res.index * seg + seg / 2)) + (Math.random() - 0.5) * seg * 0.6;
    setRot((r) => r - (r % 360) + target);
    const ticks = window.setInterval(() => sound('tick'), 180);
    window.setTimeout(() => {
      window.clearInterval(ticks);
      setSpinning(false);
      sound('win');
      const msg = res.item
        ? `${RARITY_STYLE[res.item.rarity].label} ${KIND_INFO[res.item.kind].label.toLowerCase()}: ${res.item.name}!`
        : res.prize.xp
          ? `+${res.prize.xp} XP`
          : `+${res.coins.toLocaleString()} coins`;
      setResult(
        <>
          You won <b className="text-fg">{msg}</b>
          {res.item && <> — find it in your items and equip it.</>}
        </>,
      );
      toast({ icon: res.item?.icon ?? res.prize.icon, title: 'Daily spin', desc: `You won ${msg}`, tone: 'gold' });
    }, 4200);
  };

  return (
    <section className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-neon-purple/20 blur-3xl" />
      <h2 className="font-display text-xl font-bold">🎡 Daily spin</h2>
      <p className="text-sm text-muted">One free spin every day. Win coins, XP or a cosmetic you don’t own yet. It never costs anything.</p>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative h-56 w-56 shrink-0">
          <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2 text-2xl drop-shadow-[0_0_6px_rgba(255,255,255,.8)]" aria-hidden>▼</div>
          <svg
            viewBox="-100 -100 200 200"
            className="h-full w-full rounded-full"
            style={{ transform: `rotate(${rot}deg)`, transition: spinning ? 'transform 4.1s cubic-bezier(.12,.75,.12,1)' : 'none', animation: 'spin-glow 3s ease-in-out infinite' }}
            role="img"
            aria-label="Prize wheel"
          >
            {SPIN_PRIZES.map((p, i) => {
              const a0 = ((i * seg - 90) * Math.PI) / 180;
              const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
              const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
              return (
                <g key={p.id}>
                  <path d={`M0 0 L ${96 * Math.cos(a0)} ${96 * Math.sin(a0)} A 96 96 0 0 1 ${96 * Math.cos(a1)} ${96 * Math.sin(a1)} Z`} fill={p.color} stroke="#0b0716" strokeWidth="2" />
                  <g transform={`translate(${62 * Math.cos(mid)} ${62 * Math.sin(mid)}) rotate(${(i + 0.5) * seg})`}>
                    <text textAnchor="middle" y="-2" fontSize="18">{p.icon}</text>
                    <text textAnchor="middle" y="14" fontSize={p.label.length > 5 ? 8.5 : 10} fontWeight="800" fill="#fff">{p.label}</text>
                  </g>
                </g>
              );
            })}
            <circle r="96" fill="none" stroke="rgb(var(--neon-cyan))" strokeWidth="3" />
            <circle r="16" fill="#0b0716" stroke="rgb(var(--neon-purple))" strokeWidth="3" />
          </svg>
        </div>
        <div className="flex-1 text-center sm:text-left">
          {spunToday && !spinning ? (
            <>
              <div className="text-sm text-muted">{result ?? 'You’ve used today’s spin.'}</div>
              <div className="mt-2 font-mono text-2xl font-bold">{untilMidnight(now)}</div>
              <div className="text-xs text-muted">until your next free spin</div>
            </>
          ) : (
            <>
              <button className="btn-primary !px-8 !py-3 !text-base" onClick={spin} disabled={spinning}>
                {spinning ? 'Spinning…' : 'Spin for free'}
              </button>
              <ul className="mt-3 space-y-0.5 text-xs text-muted">
                <li>🪙 50–500 coins · ⭐ 100 XP</li>
                <li>🎁 Common, 💠 Rare or 🔮 Epic item you don’t own</li>
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Shop() {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const cat = (CATS.find((c) => c.id === params.get('cat'))?.id ?? 'featured') as ShopCategory;
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'locked'>('all');
  const now = useNow();
  const deals = useMemo(() => featuredItems(), []);
  const ownedCount = ITEMS.filter((i) => owns(data.unlocks, i.id)).length;

  const filter = (list: Item[]) =>
    list
      .filter((i) => rarity === 'all' || i.rarity === rarity)
      .filter((i) => (ownedFilter === 'all' ? true : ownedFilter === 'owned' ? owns(data.unlocks, i.id) : !owns(data.unlocks, i.id)));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">🛍️ Shop</h1>
          <p className="mt-1 text-muted">Spend the coins you earn playing on skins, companions, effects and profile flair.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="card flex items-center gap-2 px-4 py-2.5">
            <Coin />
            <span className="font-mono text-xl font-bold">{data.coins.toLocaleString()}</span>
          </div>
          <div className="card px-4 py-2.5 text-sm">
            <b>{ownedCount}</b>
            <span className="text-muted"> / {ITEMS.length} owned</span>
          </div>
        </div>
      </div>

      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" role="tablist">
        {CATS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            onClick={() => setParams(c.id === 'featured' ? {} : { cat: c.id })}
            className={`chip shrink-0 !px-4 !py-2 !text-sm ${cat === c.id ? '!bg-gradient-to-r from-neon-purple to-neon-blue !text-white' : ''}`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {cat === 'featured' ? (
        <div className="mt-6 space-y-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
            <DailySpin />
            <section className="card relative overflow-hidden p-5">
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-neon-cyan/15 blur-3xl" />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-bold">🔥 Today’s deals</h2>
                <span className="text-sm text-muted">
                  New deals in <b className="font-mono text-fg">{untilMidnight(now)}</b>
                </span>
              </div>
              <p className="text-sm text-muted">{FEATURED_DISCOUNT * 100}% off these four items until midnight.</p>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                {deals.map((i) => (
                  <ItemCard key={i.id} item={i} deal />
                ))}
              </div>
            </section>
          </div>
          <section>
            <h2 className="mb-3 font-display text-xl font-bold">How to earn coins</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['🎮', 'Finish a game', '5–60'],
                ['🏆', 'Win a game', 'up to 150'],
                ['🎁', 'Daily login', '100–500'],
                ['📋', 'Daily challenge', '100–175'],
                ['🏅', 'Achievement', '25–1,000'],
                ['⬆️', 'Level up', '50'],
              ].map(([icon, label, v]) => (
                <div key={label} className="card p-4">
                  <div className="text-2xl">{icon}</div>
                  <div className="mt-1 text-sm font-semibold">{label}</div>
                  <div className="font-mono text-sm text-neon-purple">{v} 🪙</div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-display text-xl font-bold">Rarity</h2>
            <div className="flex flex-wrap gap-2">
              {RARITIES.map((r) => (
                <span key={r} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${RARITY_STYLE[r].chip}`}>
                  {RARITY_STYLE[r].label} · {RARITY_PRICE[r].toLocaleString()} 🪙
                </span>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Rarity:</span>
            {(['all', ...RARITIES] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRarity(r)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${rarity === r ? 'bg-surface2 text-fg shadow' : 'text-muted hover:text-fg'} ${r !== 'all' ? RARITY_STYLE[r].text : ''}`}
              >
                {r === 'all' ? 'All' : RARITY_STYLE[r].label}
              </button>
            ))}
            <span className="ml-2 text-muted">Show:</span>
            {(['all', 'owned', 'locked'] as const).map((o) => (
              <button key={o} onClick={() => setOwnedFilter(o)} className={`rounded-lg px-2.5 py-1 font-semibold capitalize transition ${ownedFilter === o ? 'bg-surface2 text-fg shadow' : 'text-muted hover:text-fg'}`}>
                {o}
              </button>
            ))}
          </div>
          {KINDS_OF[cat].map((k) => {
            const list = filter(ITEMS.filter((i) => i.kind === k));
            return (
              <section key={k} className="mb-8">
                <h2 className="mb-3 font-display text-lg font-bold">
                  {KIND_INFO[k].icon} {KIND_INFO[k].label}s
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">Nothing matches these filters.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {list.map((i) => (
                      <ItemCard key={i.id} item={i} deal={deals.some((d) => d.id === i.id)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {cat === 'effects' && <p className="text-xs text-muted">Cursor trails show on computers with a mouse. Effects are turned off when “Reduce motion” is on in Settings.</p>}
        </div>
      )}
    </div>
  );
}

