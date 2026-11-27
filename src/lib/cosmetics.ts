import { hashString, seededRandom, todayKey } from './games';

/* =====================================================================
   Shop catalog: everything players can buy with coins.
   Item ids look like "kind:key". Owned ids live in UserData.unlocks.
   ===================================================================== */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];
export const RARITY_PRICE: Record<Rarity, number> = { common: 250, rare: 1000, epic: 2500, legendary: 5000, mythic: 10000 };
export const RARITY_STYLE: Record<Rarity, { label: string; text: string; ring: string; glow: string; chip: string }> = {
  common: { label: 'Common', text: 'text-slate-400', ring: 'border-slate-500/40', glow: 'rgba(148,163,184,.35)', chip: 'bg-slate-500/20 text-slate-300' },
  rare: { label: 'Rare', text: 'text-sky-400', ring: 'border-sky-400/60', glow: 'rgba(56,189,248,.45)', chip: 'bg-sky-500/20 text-sky-300' },
  epic: { label: 'Epic', text: 'text-fuchsia-400', ring: 'border-fuchsia-400/60', glow: 'rgba(217,70,239,.5)', chip: 'bg-fuchsia-500/20 text-fuchsia-300' },
  legendary: { label: 'Legendary', text: 'text-amber-400', ring: 'border-amber-400/70', glow: 'rgba(251,191,36,.55)', chip: 'bg-amber-500/20 text-amber-300' },
  mythic: { label: 'Mythic', text: 'text-rose-300', ring: 'border-rose-300/80', glow: 'rgba(244,114,182,.6)', chip: 'bg-gradient-to-r from-fuchsia-500/30 via-rose-400/30 to-cyan-400/30 text-rose-200' },
};

/** Which part of the player each item changes. */
export type Kind = 'emoji' | 'color' | 'frame' | 'name' | 'bg' | 'badge' | 'pet' | 'trail' | 'win' | 'coin' | 'theme';
export type ShopCategory = 'featured' | 'skins' | 'pets' | 'effects' | 'profile' | 'themes';

export const KIND_INFO: Record<Kind, { label: string; category: Exclude<ShopCategory, 'featured'>; icon: string }> = {
  emoji: { label: 'Avatar skin', category: 'skins', icon: '🙂' },
  color: { label: 'Avatar colour', category: 'skins', icon: '🎨' },
  frame: { label: 'Profile frame', category: 'profile', icon: '🖼️' },
  name: { label: 'Name colour', category: 'profile', icon: '✒️' },
  bg: { label: 'Profile background', category: 'profile', icon: '🌌' },
  badge: { label: 'Badge', category: 'profile', icon: '🏅' },
  pet: { label: 'Companion', category: 'pets', icon: '🐾' },
  trail: { label: 'Cursor trail', category: 'effects', icon: '✨' },
  win: { label: 'Win animation', category: 'effects', icon: '🎆' },
  coin: { label: 'Coin effect', category: 'effects', icon: '🪙' },
  theme: { label: 'Menu theme', category: 'themes', icon: '🎨' },
};

export interface Item {
  id: string;
  kind: Kind;
  key: string;
  name: string;
  rarity: Rarity;
  /** price in coins; 0 = free starter item */
  price: number;
  desc: string;
  icon?: string;
}

const it = (kind: Kind, key: string, name: string, rarity: Rarity, desc: string, icon?: string, free = false): Item => ({
  id: `${kind}:${key}`,
  kind,
  key,
  name,
  rarity,
  price: free ? 0 : RARITY_PRICE[rarity],
  desc,
  icon,
});

/* ---------------- Visual definitions (used by the renderers) ---------------- */

/** Avatar background gradients. */
export const AVATAR_COLORS: Record<string, [string, string]> = {
  violet: ['#a855f7', '#6366f1'],
  ocean: ['#3b82f6', '#22d3ee'],
  sunset: ['#f97316', '#ec4899'],
  mono: ['#475569', '#1e293b'],
  lime: ['#84cc16', '#10b981'],
  gold: ['#eab308', '#f97316'],
  ruby: ['#ef4444', '#a855f7'],
  synth: ['#ec4899', '#22d3ee'],
  abyss: ['#0f172a', '#4338ca'],
  aurora: ['#34d399', '#8b5cf6'],
  galaxy: ['#1e1b4b', '#db2777'],
};

/** Name colours: a CSS colour or gradient; animated ones shimmer. */
export const NAME_STYLES: Record<string, { css: string; animated?: boolean }> = {
  cyan: { css: '#22d3ee' },
  pink: { css: '#f472b6' },
  lime: { css: '#a3e635' },
  gold: { css: 'linear-gradient(90deg,#fde047,#f59e0b,#fde047)' },
  ice: { css: 'linear-gradient(90deg,#e0f2fe,#38bdf8,#e0f2fe)' },
  rainbow: { css: 'linear-gradient(90deg,#f43f5e,#f59e0b,#84cc16,#22d3ee,#a855f7,#f43f5e)', animated: true },
  plasma: { css: 'linear-gradient(90deg,#ec4899,#8b5cf6,#22d3ee,#8b5cf6,#ec4899)', animated: true },
  cosmic: { css: 'linear-gradient(90deg,#fff,#f0abfc,#67e8f9,#fde68a,#fff)', animated: true },
};

/** Profile banner backgrounds. */
export const BACKGROUNDS: Record<string, string> = {
  grid: 'linear-gradient(180deg,rgba(168,85,247,.25),transparent 70%), repeating-linear-gradient(90deg,rgba(168,85,247,.25) 0 1px,transparent 1px 32px), repeating-linear-gradient(0deg,rgba(168,85,247,.25) 0 1px,transparent 1px 32px), #120a24',
  sunset: 'linear-gradient(180deg,#1e1b4b 0%,#7c3aed 45%,#ec4899 75%,#f97316 100%)',
  ocean: 'radial-gradient(circle at 20% 120%,#22d3ee 0,transparent 55%), radial-gradient(circle at 90% -20%,#3b82f6 0,transparent 50%), #0b1530',
  aurora: 'radial-gradient(ellipse at 20% 0%,rgba(52,211,153,.7),transparent 55%), radial-gradient(ellipse at 80% 10%,rgba(139,92,246,.75),transparent 55%), radial-gradient(ellipse at 50% 120%,rgba(34,211,238,.5),transparent 60%), #070b1a',
  starfield: 'radial-gradient(1.5px 1.5px at 10% 20%,#fff,transparent), radial-gradient(1px 1px at 30% 70%,#fff,transparent), radial-gradient(1.5px 1.5px at 55% 35%,#fde68a,transparent), radial-gradient(1px 1px at 70% 80%,#fff,transparent), radial-gradient(1.5px 1.5px at 85% 15%,#a5f3fc,transparent), radial-gradient(1px 1px at 92% 60%,#fff,transparent), radial-gradient(1px 1px at 45% 90%,#f0abfc,transparent), linear-gradient(180deg,#05010f,#1e1b4b)',
  nebula: 'radial-gradient(ellipse at 30% 40%,rgba(236,72,153,.65),transparent 50%), radial-gradient(ellipse at 70% 60%,rgba(59,130,246,.6),transparent 50%), radial-gradient(1.5px 1.5px at 20% 80%,#fff,transparent), radial-gradient(1px 1px at 80% 20%,#fff,transparent), radial-gradient(1.5px 1.5px at 60% 15%,#fff,transparent), #090616',
  galaxy: 'conic-gradient(from 200deg at 50% 50%,#1e1b4b,#7e22ce,#db2777,#f59e0b,#22d3ee,#1e1b4b)',
};

/** Menu themes: accent colours used across the whole site (r g b). */
export const THEMES: Record<string, { purple: string; blue: string; cyan: string; pink: string; swatch: string[] }> = {
  neon: { purple: '168 85 247', blue: '59 130 246', cyan: '34 211 238', pink: '236 72 153', swatch: ['#a855f7', '#3b82f6', '#22d3ee'] },
  cyber: { purple: '59 130 246', blue: '14 165 233', cyan: '45 212 191', pink: '99 102 241', swatch: ['#3b82f6', '#0ea5e9', '#2dd4bf'] },
  sakura: { purple: '236 72 153', blue: '244 114 182', cyan: '251 207 232', pink: '217 70 239', swatch: ['#ec4899', '#f472b6', '#fbcfe8'] },
  toxic: { purple: '132 204 22', blue: '16 185 129', cyan: '190 242 100', pink: '34 197 94', swatch: ['#84cc16', '#10b981', '#bef264'] },
  sunset: { purple: '249 115 22', blue: '239 68 68', cyan: '251 191 36', pink: '236 72 153', swatch: ['#f97316', '#ef4444', '#fbbf24'] },
  royal: { purple: '234 179 8', blue: '168 85 247', cyan: '253 224 71', pink: '217 119 6', swatch: ['#eab308', '#a855f7', '#fde047'] },
};

/* ---------------- Catalog ---------------- */
export const ITEMS: Item[] = [
  // avatar skins (free starters are owned by everyone)
  it('emoji', '🎮', 'Gamer', 'common', 'The classic.', '🎮', true),
  it('emoji', '👾', 'Invader', 'common', 'Retro arcade energy.', '👾', true),
  it('emoji', '🐱', 'Kitty', 'common', 'Nine lives, one high score.', '🐱', true),
  it('emoji', '🦊', 'Fox', 'common', 'Quick and clever.', '🦊', true),
  it('emoji', '🐸', 'Frog', 'common', 'Leaps to the top.', '🐸', true),
  it('emoji', '🤖', 'Robot', 'common', 'Beep boop.', '🤖', true),
  it('emoji', '🐼', 'Panda', 'common', 'Chill but deadly.', '🐼'),
  it('emoji', '👻', 'Ghost', 'common', 'Now you see me…', '👻'),
  it('emoji', '🐙', 'Octopus', 'common', 'Eight arms, eight inputs.', '🐙'),
  it('emoji', '🦄', 'Unicorn', 'common', 'Rare in the wild.', '🦄'),
  it('emoji', '🥷', 'Ninja', 'rare', 'Silent and swift.', '🥷'),
  it('emoji', '🧙', 'Wizard', 'rare', 'Casts high scores.', '🧙'),
  it('emoji', '🦈', 'Shark', 'rare', 'Smells victory.', '🦈'),
  it('emoji', '👑', 'Royal', 'rare', 'Rule the leaderboard.', '👑'),
  it('emoji', '🐉', 'Dragon', 'epic', 'Breathes neon fire.', '🐉'),
  it('emoji', '👽', 'Visitor', 'epic', 'Not from around here.', '👽'),
  it('emoji', '💎', 'Diamond', 'legendary', 'Unbreakable.', '💎'),
  it('emoji', '🚀', 'Rocket', 'legendary', 'To the moon.', '🚀'),
  it('emoji', '🌌', 'Galaxy', 'mythic', 'Contains multitudes.', '🌌'),
  // avatar colours
  it('color', 'violet', 'Violet', 'common', 'Default neon.', undefined, true),
  it('color', 'ocean', 'Ocean', 'common', 'Deep blue.', undefined, true),
  it('color', 'sunset', 'Sunset', 'common', 'Warm glow.', undefined, true),
  it('color', 'mono', 'Mono', 'common', 'Stealth mode.'),
  it('color', 'lime', 'Lime', 'common', 'Zesty.'),
  it('color', 'gold', 'Gold', 'rare', 'Shiny.'),
  it('color', 'ruby', 'Ruby', 'rare', 'Precious.'),
  it('color', 'synth', 'Synthwave', 'epic', 'Pink meets cyan.'),
  it('color', 'abyss', 'Abyss', 'epic', 'From the deep.'),
  it('color', 'aurora', 'Aurora', 'legendary', 'Northern lights.'),
  it('color', 'galaxy', 'Galaxy', 'mythic', 'Starlight core.'),
  // frames
  it('frame', 'neon', 'Neon Ring', 'common', 'A soft glowing ring.'),
  it('frame', 'pixel', 'Pixel', 'common', 'Chunky 8-bit border.'),
  it('frame', 'circuit', 'Circuit', 'rare', 'Rotating data ring.'),
  it('frame', 'laurel', 'Laurel', 'rare', 'For champions.'),
  it('frame', 'crown', 'Crowned', 'epic', 'A crown that floats above you.'),
  it('frame', 'flame', 'Inferno', 'epic', 'Flickering neon flames.'),
  it('frame', 'wings', 'Seraph', 'legendary', 'Glowing wings that gently beat.'),
  it('frame', 'cosmic', 'Cosmic', 'mythic', 'A spinning galaxy with orbiting stars.'),
  // name colours
  it('name', 'cyan', 'Cyan', 'common', 'Cool and clean.'),
  it('name', 'pink', 'Hot Pink', 'common', 'Loud and proud.'),
  it('name', 'lime', 'Acid', 'common', 'Toxic green.'),
  it('name', 'ice', 'Frost', 'rare', 'Icy gradient.'),
  it('name', 'gold', 'Gilded', 'rare', 'Golden gradient.'),
  it('name', 'rainbow', 'Rainbow', 'epic', 'Animated rainbow.'),
  it('name', 'plasma', 'Plasma', 'legendary', 'Flowing pink-violet-cyan.'),
  it('name', 'cosmic', 'Starlight', 'mythic', 'Shimmers like a nebula.'),
  // profile backgrounds
  it('bg', 'grid', 'Synth Grid', 'common', 'Retro neon grid.'),
  it('bg', 'sunset', 'Outrun', 'common', 'Purple-orange sky.'),
  it('bg', 'ocean', 'Deep Sea', 'rare', 'Bioluminescent waves.'),
  it('bg', 'aurora', 'Aurora', 'epic', 'Dancing northern lights.'),
  it('bg', 'starfield', 'Starfield', 'epic', 'A quiet night sky.'),
  it('bg', 'nebula', 'Nebula', 'legendary', 'Clouds of cosmic dust.'),
  it('bg', 'galaxy', 'Event Horizon', 'mythic', 'A swirling galaxy.'),
  // badges (shown next to your name)
  it('badge', 'bolt', 'Speedster', 'common', 'Shown next to your name.', '⚡'),
  it('badge', 'heart', 'Good Vibes', 'common', 'Spread the love.', '💜'),
  it('badge', 'target', 'Sharpshooter', 'rare', 'Never misses.', '🎯'),
  it('badge', 'fire', 'On Fire', 'rare', 'Hot streak.', '🔥'),
  it('badge', 'gem', 'Gem', 'epic', 'Polished player.', '💠'),
  it('badge', 'crown', 'Royalty', 'legendary', 'Bow down.', '👑'),
  it('badge', 'star', 'Celestial', 'mythic', 'One of a kind.', '🌠'),
  // companions
  it('pet', 'bolt', 'Bolt', 'common', 'A tiny robot that bobs beside you.', '🤖'),
  it('pet', 'chick', 'Pip', 'common', 'Hops happily.', '🐤'),
  it('pet', 'cat', 'Neko', 'rare', 'Sways side to side.', '🐈'),
  it('pet', 'ghost', 'Boo', 'rare', 'Fades in and out.', '👻'),
  it('pet', 'dragon', 'Ember', 'epic', 'Flaps its wings.', '🐉'),
  it('pet', 'ufo', 'Saucer', 'legendary', 'Hovers with a tractor beam.', '🛸'),
  it('pet', 'spirit', 'Wisp', 'mythic', 'A glowing spirit that orbits you.', '✨'),
  // effects
  it('trail', 'sparkle', 'Sparkles', 'common', 'Little sparkles follow your cursor.'),
  it('trail', 'neon', 'Neon Line', 'rare', 'A glowing ribbon.'),
  it('trail', 'stars', 'Stardust', 'epic', 'Multicoloured stars.'),
  it('trail', 'rainbow', 'Rainbow', 'legendary', 'Full-spectrum streak.'),
  it('trail', 'comet', 'Comet', 'mythic', 'A blazing comet tail.'),
  it('win', 'confetti', 'Confetti', 'common', 'Classic celebration when you win.'),
  it('win', 'fireworks', 'Fireworks', 'rare', 'Bursts of light.'),
  it('win', 'coinrain', 'Coin Rain', 'epic', 'Make it rain.'),
  it('win', 'victory', 'Victory Banner', 'legendary', 'A huge neon VICTORY.'),
  it('win', 'supernova', 'Supernova', 'mythic', 'A shockwave of stars.'),
  it('coin', 'sparkle', 'Glint', 'common', 'Coins sparkle when you earn them.'),
  it('coin', 'gems', 'Gems', 'rare', 'Earn gems instead of coins (visually).'),
  it('coin', 'stars', 'Stars', 'epic', 'Stars fly to your balance.'),
  it('coin', 'hearts', 'Hearts', 'legendary', 'Cute floating hearts.'),
  it('coin', 'neon', 'Neon Burst', 'mythic', 'Glowing coins fly to your balance.'),
  // themes
  it('theme', 'neon', 'Neon', 'common', 'The default purple-blue glow.', undefined, true),
  it('theme', 'cyber', 'Cyber Blue', 'common', 'Cool blue and teal.'),
  it('theme', 'sakura', 'Sakura', 'rare', 'Soft pinks.'),
  it('theme', 'toxic', 'Toxic', 'epic', 'Radioactive green.'),
  it('theme', 'sunset', 'Sunset', 'legendary', 'Orange and red.'),
  it('theme', 'royal', 'Royal Gold', 'mythic', 'Gold and violet.'),
];

export const ITEM_MAP: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const itemsOfKind = (k: Kind) => ITEMS.filter((i) => i.kind === k);

export function owns(unlocks: string[], id: string) {
  const item = ITEM_MAP[id];
  return !!item && (item.price === 0 || unlocks.includes(id));
}

/* ---------------- Featured deals: 4 items, 25% off, rotate daily ---------------- */
export const FEATURED_DISCOUNT = 0.25;
export function featuredItems(date = todayKey()): Item[] {
  const rand = seededRandom(hashString('shop' + date));
  const pool = ITEMS.filter((i) => i.price > 0);
  const out: Item[] = [];
  // at least one epic-or-better deal each day
  const premium = pool.filter((i) => ['epic', 'legendary', 'mythic'].includes(i.rarity));
  out.push(premium[Math.floor(rand() * premium.length)]);
  while (out.length < 4) {
    const p = pool[Math.floor(rand() * pool.length)];
    if (!out.some((o) => o.kind === p.kind)) out.push(p);
  }
  return out;
}
export function priceOf(item: Item, date = todayKey()) {
  return featuredItems(date).some((f) => f.id === item.id) ? Math.round((item.price * (1 - FEATURED_DISCOUNT)) / 10) * 10 : item.price;
}

/* ---------------- Daily spin (free, once a day) ---------------- */
export interface SpinPrize {
  id: string;
  label: string;
  icon: string;
  weight: number;
  coins?: number;
  xp?: number;
  item?: Rarity;
  color: string;
}
export const SPIN_PRIZES: SpinPrize[] = [
  { id: 'c50', label: '50', icon: '🪙', weight: 22, coins: 50, color: '#4c1d95' },
  { id: 'x100', label: '100 XP', icon: '⭐', weight: 18, xp: 100, color: '#1e3a8a' },
  { id: 'c100', label: '100', icon: '🪙', weight: 20, coins: 100, color: '#6d28d9' },
  { id: 'common', label: 'Common', icon: '🎁', weight: 12, item: 'common', color: '#334155' },
  { id: 'c250', label: '250', icon: '🪙', weight: 12, coins: 250, color: '#7e22ce' },
  { id: 'rare', label: 'Rare', icon: '💠', weight: 8, item: 'rare', color: '#0369a1' },
  { id: 'c500', label: '500', icon: '💰', weight: 6, coins: 500, color: '#a21caf' },
  { id: 'epic', label: 'Epic', icon: '🔮', weight: 2, item: 'epic', color: '#be185d' },
];
export function rollSpin(rand = Math.random): number {
  const total = SPIN_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = rand() * total;
  for (let i = 0; i < SPIN_PRIZES.length; i++) {
    r -= SPIN_PRIZES[i].weight;
    if (r < 0) return i;
  }
  return 0;
}
/** A random unowned item of a rarity (or null if you own them all → coins instead). */
export function randomUnowned(unlocks: string[], rarity: Rarity, rand = Math.random): Item | null {
  const pool = ITEMS.filter((i) => i.rarity === rarity && i.price > 0 && !unlocks.includes(i.id));
  return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
}
