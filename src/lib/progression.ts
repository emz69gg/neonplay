import { itemsOfKind } from './cosmetics';
import { GAMES, GAME_MAP, hashString, seededRandom, todayKey } from './games';
import type { Avatar, FinishMeta, GameId, Reward, UserData } from './types';

/* ---------------- Levels ---------------- */
// Total XP needed to reach level L: 50·L·(L−1)  → L2=100, L3=300, L4=600, L5=1000 …
export const xpForLevel = (level: number) => 50 * level * (level - 1);
export const levelFromXp = (xp: number) => Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: xp - base, needed: next - base, pct: Math.min(100, ((xp - base) / (next - base)) * 100) };
}
export function rankTitle(level: number) {
  if (level >= 30) return 'Legend';
  if (level >= 20) return 'Grandmaster';
  if (level >= 12) return 'Elite';
  if (level >= 7) return 'Veteran';
  if (level >= 3) return 'Challenger';
  return 'Rookie';
}

/* ---------------- Avatars ---------------- */
export { AVATAR_COLORS } from './cosmetics';
export interface AvatarItem {
  emoji: string;
  cost: number;
}
export const AVATARS: AvatarItem[] = itemsOfKind('emoji').map((i) => ({ emoji: i.key, cost: i.price }));
export const COLOR_COST: Record<string, number> = Object.fromEntries(itemsOfKind('color').map((i) => [i.key, i.price]));
/** Coins paid for each level gained. */
export const LEVEL_UP_COINS = 50;

export const defaultAvatar = (): Avatar => ({ emoji: '🎮', color: 'violet' });

/* ---------------- Achievements ---------------- */
export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  reward: Reward;
  game?: GameId;
  check: (d: UserData, e?: GameEvent) => boolean;
}

export interface GameEvent {
  game: GameId;
  score: number;
  meta?: FinishMeta;
}

const hs = (d: UserData, g: GameId) => d.highScores[g];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_game', title: 'Player One', desc: 'Finish your first game', icon: '🎮', tier: 'bronze', reward: { xp: 25, coins: 25 }, check: (d) => d.totalPlays >= 1 },
  { id: 'explorer', title: 'Explorer', desc: `Play all ${GAMES.length} games`, icon: '🧭', tier: 'gold', reward: { xp: 200, coins: 200 }, check: (d) => GAMES.every((g) => (d.plays[g.id] ?? 0) > 0) },
  { id: 'regular', title: 'Regular', desc: 'Finish 25 games', icon: '🔁', tier: 'silver', reward: { xp: 100, coins: 100 }, check: (d) => d.totalPlays >= 25 },
  { id: 'marathon', title: 'Marathon', desc: 'Finish 100 games', icon: '🏃', tier: 'gold', reward: { xp: 300, coins: 300 }, check: (d) => d.totalPlays >= 100 },
  { id: 'level5', title: 'Rising Star', desc: 'Reach level 5', icon: '⭐', tier: 'bronze', reward: { xp: 0, coins: 100 }, check: (d) => levelFromXp(d.xp) >= 5 },
  { id: 'level10', title: 'Veteran', desc: 'Reach level 10', icon: '🌟', tier: 'silver', reward: { xp: 0, coins: 300 }, check: (d) => levelFromXp(d.xp) >= 10 },
  { id: 'level20', title: 'Grandmaster', desc: 'Reach level 20', icon: '💫', tier: 'gold', reward: { xp: 0, coins: 1000 }, check: (d) => levelFromXp(d.xp) >= 20 },
  { id: 'streak3', title: 'Habit Forming', desc: '3-day login streak', icon: '🔥', tier: 'bronze', reward: { xp: 50, coins: 50 }, check: (d) => d.login.streak >= 3 },
  { id: 'streak7', title: 'Dedicated', desc: '7-day login streak', icon: '📅', tier: 'gold', reward: { xp: 200, coins: 250 }, check: (d) => d.login.streak >= 7 },
  { id: 'collector', title: 'Curator', desc: 'Favorite 3 games', icon: '❤️', tier: 'bronze', reward: { xp: 20, coins: 30 }, check: (d) => d.favorites.length >= 3 },
  { id: 'rich', title: 'Piggy Bank', desc: 'Hold 1,000 coins', icon: '🐷', tier: 'silver', reward: { xp: 100, coins: 0 }, check: (d) => d.coins >= 1000 },
  { id: 'lightning', title: 'Lightning', desc: 'Reaction time under 250 ms', icon: '⚡', tier: 'silver', game: 'reaction', reward: { xp: 60, coins: 40 }, check: (d) => (hs(d, 'reaction') ?? 9999) < 250 },
  { id: 'superhuman', title: 'Superhuman', desc: 'Reaction time under 180 ms', icon: '🧠', tier: 'gold', game: 'reaction', reward: { xp: 150, coins: 100 }, check: (d) => (hs(d, 'reaction') ?? 9999) < 180 },
  { id: 'tile512', title: 'Getting There', desc: 'Make a 512 tile in 2048', icon: '🟧', tier: 'bronze', game: '2048', reward: { xp: 50, coins: 30 }, check: (_d, e) => e?.game === '2048' && (e.meta?.maxTile ?? 0) >= 512 },
  { id: 'tile2048', title: '2048!', desc: 'Make the 2048 tile', icon: '🏆', tier: 'gold', game: '2048', reward: { xp: 400, coins: 300 }, check: (_d, e) => e?.game === '2048' && (e.meta?.maxTile ?? 0) >= 2048 },
  { id: 'snake25', title: 'Long Boi', desc: 'Score 25 in one Snake run', icon: '🐍', tier: 'silver', game: 'snake', reward: { xp: 80, coins: 50 }, check: (d) => (hs(d, 'snake') ?? 0) >= 25 },
  { id: 'snake50', title: 'Anaconda', desc: 'Score 50 in one Snake run', icon: '🐲', tier: 'gold', game: 'snake', reward: { xp: 200, coins: 120 }, check: (d) => (hs(d, 'snake') ?? 0) >= 50 },
  { id: 'ttt_hard', title: 'Unbeatable?', desc: 'Draw against the Hard AI in Tic Tac Toe', icon: '🤝', tier: 'silver', game: 'tictactoe', reward: { xp: 60, coins: 40 }, check: (_d, e) => e?.game === 'tictactoe' && e.meta?.difficulty === 'hard' && e.meta?.draw === true },
  { id: 'ttt_win', title: 'Tactician', desc: 'Beat the Medium AI in Tic Tac Toe', icon: '❌', tier: 'bronze', game: 'tictactoe', reward: { xp: 40, coins: 25 }, check: (_d, e) => e?.game === 'tictactoe' && e.meta?.win === true && e.meta?.difficulty !== 'easy' },
  { id: 'rps5', title: 'Mind Reader', desc: '5-win streak in Rock Paper Scissors', icon: '✌️', tier: 'silver', game: 'rps', reward: { xp: 80, coins: 50 }, check: (d) => (hs(d, 'rps') ?? 0) >= 5 },
  { id: 'memory_sharp', title: 'Photographic', desc: 'Clear Normal Memory in 12 moves or fewer', icon: '🃏', tier: 'gold', game: 'memory', reward: { xp: 120, coins: 80 }, check: (_d, e) => e?.game === 'memory' && e.meta?.difficulty === 'normal' && (e.meta?.moves ?? 99) <= 12 },
  { id: 'sweeper', title: 'Sweeper', desc: 'Win a game of Minesweeper', icon: '🚩', tier: 'bronze', game: 'minesweeper', reward: { xp: 50, coins: 30 }, check: (_d, e) => e?.game === 'minesweeper' && e.meta?.win === true },
  { id: 'sweeper_pro', title: 'Bomb Squad', desc: 'Win Minesweeper on Intermediate', icon: '💣', tier: 'gold', game: 'minesweeper', reward: { xp: 200, coins: 150 }, check: (_d, e) => e?.game === 'minesweeper' && e.meta?.win === true && e.meta?.difficulty === 'intermediate' },
  { id: 'tycoon', title: 'Tycoon', desc: 'Earn 1M lifetime in Clicker Simulator', icon: '🏦', tier: 'gold', game: 'clicker', reward: { xp: 250, coins: 200 }, check: (d) => (hs(d, 'clicker') ?? 0) >= 1_000_000 },
  { id: 'flappy10', title: 'Taking Flight', desc: 'Pass 10 pipes in Flappy Wings', icon: '🐦', tier: 'bronze', game: 'flappy', reward: { xp: 60, coins: 40 }, check: (d) => (hs(d, 'flappy') ?? 0) >= 10 },
  { id: 'flappy30', title: 'Sky Captain', desc: 'Pass 30 pipes in Flappy Wings', icon: '🛩️', tier: 'gold', game: 'flappy', reward: { xp: 200, coins: 120 }, check: (d) => (hs(d, 'flappy') ?? 0) >= 30 },
  { id: 'typist60', title: 'Keyboard Warrior', desc: 'Type 60+ WPM', icon: '⌨️', tier: 'silver', game: 'typing', reward: { xp: 100, coins: 60 }, check: (d) => (hs(d, 'typing') ?? 0) >= 60 },
  { id: 'typist90', title: 'Speed Demon', desc: 'Type 90+ WPM', icon: '🏎️', tier: 'gold', game: 'typing', reward: { xp: 250, coins: 150 }, check: (d) => (hs(d, 'typing') ?? 0) >= 90 },
  { id: 'bricks_l3', title: 'Wrecking Ball', desc: 'Reach level 3 in Brick Breaker', icon: '🧱', tier: 'bronze', game: 'bricks', reward: { xp: 60, coins: 40 }, check: (_d, e) => e?.game === 'bricks' && Number(e.meta?.level ?? 0) >= 3 },
  { id: 'bricks_5k', title: 'Demolition Pro', desc: 'Score 5,000 in Brick Breaker', icon: '💥', tier: 'gold', game: 'bricks', reward: { xp: 200, coins: 120 }, check: (d) => (hs(d, 'bricks') ?? 0) >= 5000 },
  { id: 'stack_tetra', title: 'Four at Once', desc: 'Clear 4 lines with one piece in Block Stack', icon: '🟦', tier: 'silver', game: 'blockstack', reward: { xp: 80, coins: 50 }, check: (_d, e) => e?.game === 'blockstack' && Number(e.meta?.bestClear ?? 0) >= 4 },
  { id: 'stack_10k', title: 'Master Builder', desc: 'Score 10,000 in Block Stack', icon: '🏗️', tier: 'gold', game: 'blockstack', reward: { xp: 200, coins: 120 }, check: (d) => (hs(d, 'blockstack') ?? 0) >= 10000 },
  { id: 'word_win', title: 'Wordsmith', desc: 'Solve a Word Guess puzzle', icon: '🔤', tier: 'bronze', game: 'wordguess', reward: { xp: 40, coins: 25 }, check: (_d, e) => e?.game === 'wordguess' && e.meta?.win === true },
  { id: 'word_3', title: 'Word Wizard', desc: 'Solve Word Guess in 3 guesses or fewer', icon: '🧠', tier: 'gold', game: 'wordguess', reward: { xp: 150, coins: 90 }, check: (_d, e) => e?.game === 'wordguess' && e.meta?.win === true && Number(e.meta?.guesses ?? 9) <= 3 },
  { id: 'c4_win', title: 'Four in a Row', desc: 'Beat the Medium AI in Connect Four', icon: '🔴', tier: 'bronze', game: 'connect4', reward: { xp: 50, coins: 30 }, check: (_d, e) => e?.game === 'connect4' && e.meta?.win === true && e.meta?.difficulty !== 'easy' },
  { id: 'c4_hard', title: 'Grandmaster', desc: 'Beat the Hard AI in Connect Four', icon: '🏅', tier: 'gold', game: 'connect4', reward: { xp: 250, coins: 150 }, check: (_d, e) => e?.game === 'connect4' && e.meta?.win === true && e.meta?.difficulty === 'hard' },
  { id: 'whack_30', title: 'Bopper', desc: 'Score 30 in Whack-a-Mole', icon: '🔨', tier: 'bronze', game: 'whack', reward: { xp: 50, coins: 30 }, check: (d) => (hs(d, 'whack') ?? 0) >= 30 },
  { id: 'whack_combo', title: 'Combo King', desc: 'Reach a 15-hit combo in Whack-a-Mole', icon: '🔥', tier: 'silver', game: 'whack', reward: { xp: 100, coins: 60 }, check: (_d, e) => e?.game === 'whack' && Number(e.meta?.bestCombo ?? 0) >= 15 },
  { id: 'chess_win', title: 'Checkmate!', desc: 'Beat a chess bot rated 1200 or higher', icon: '♞', tier: 'silver', game: 'chess', reward: { xp: 100, coins: 60 }, check: (_d, e) => e?.game === 'chess' && e.meta?.vsAi === true && e.meta?.win === true && e.meta?.difficulty !== 'easy' },
  { id: 'chess_hard', title: 'Grandmaster Slayer', desc: 'Beat the Expert (1800) or Master (2100) chess bot', icon: '👑', tier: 'gold', game: 'chess', reward: { xp: 400, coins: 250 }, check: (_d, e) => e?.game === 'chess' && e.meta?.vsAi === true && e.meta?.win === true && e.meta?.difficulty === 'hard' },
  { id: 'chess_quick', title: 'Blitz', desc: 'Checkmate a chess bot in 25 moves or fewer', icon: '⚡', tier: 'silver', game: 'chess', reward: { xp: 80, coins: 50 }, check: (_d, e) => e?.game === 'chess' && e.meta?.vsAi === true && e.meta?.win === true && e.meta?.reason === 'checkmate' && Number(e.meta?.moves ?? 99) <= 25 },
  { id: 'chess_online', title: 'Worthy Opponent', desc: 'Win an online chess game against a real player', icon: '🌐', tier: 'gold', game: 'chess', reward: { xp: 200, coins: 120 }, check: (_d, e) => e?.game === 'chess' && e.meta?.online === true && e.meta?.win === true },
  { id: 'aim_450', title: 'Sharpshooter', desc: 'Average under 450 ms in Aim Trainer (30 targets)', icon: '🎯', tier: 'silver', game: 'aim', reward: { xp: 80, coins: 50 }, check: (d) => (hs(d, 'aim') ?? 9999) < 450 },
  { id: 'aim_acc', title: 'Laser Focus', desc: '95%+ accuracy in Aim Trainer Precision mode', icon: '🔍', tier: 'gold', game: 'aim', reward: { xp: 150, coins: 90 }, check: (_d, e) => e?.game === 'aim' && e.meta?.mode === 'precision' && Number(e.meta?.accuracy ?? 0) >= 95 && Number(e.meta?.hits ?? 0) >= 20 },
];

/* ---------------- Daily challenges ---------------- */
export interface Challenge {
  id: string;
  title: string;
  icon: string;
  game?: GameId;
  target: number;
  reward: Reward;
  /** Return new progress value given the event. */
  update: (prev: number, e: GameEvent, d: UserData) => number;
  /** Display of current progress. */
  label: (v: number) => string;
  done: (v: number) => boolean;
}

const scoreAtLeast = (id: string, game: GameId, target: number, title: string, icon: string, reward: Reward): Challenge => ({
  id, title, icon, game, target, reward,
  update: (prev, e) => (e.game === game ? Math.max(prev, e.score) : prev),
  label: (v) => `${Math.min(v, target).toLocaleString()} / ${target.toLocaleString()}`,
  done: (v) => v >= target,
});

const CHALLENGE_POOL: Challenge[] = [
  {
    id: 'distinct3', title: 'Play 3 different games', icon: '🎲', target: 3, reward: { xp: 80, coins: 150 },
    update: (_p, _e, d) => d.daily.gamesPlayed.length, label: (v) => `${Math.min(v, 3)} / 3`, done: (v) => v >= 3,
  },
  {
    id: 'plays5', title: 'Finish 5 rounds of anything', icon: '🔁', target: 5, reward: { xp: 60, coins: 125 },
    update: (_p, _e, d) => d.daily.plays, label: (v) => `${Math.min(v, 5)} / 5`, done: (v) => v >= 5,
  },
  scoreAtLeast('snake15', 'snake', 15, 'Score 15 in Snake', '🐍', { xp: 90, coins: 60 }),
  scoreAtLeast('2048_1500', '2048', 1500, 'Score 1,500 in 2048', '🔢', { xp: 90, coins: 60 }),
  scoreAtLeast('flappy8', 'flappy', 8, 'Pass 8 pipes in Flappy Wings', '🐦', { xp: 100, coins: 70 }),
  scoreAtLeast('typing40', 'typing', 40, 'Type 40 WPM', '⌨️', { xp: 80, coins: 50 }),
  scoreAtLeast('rps3', 'rps', 3, 'Get a 3-win streak in RPS', '✊', { xp: 70, coins: 50 }),
  scoreAtLeast('memory600', 'memory', 600, 'Score 600 in Memory Cards', '🃏', { xp: 80, coins: 50 }),
  {
    id: 'reaction320', title: 'React in under 320 ms', icon: '⚡', game: 'reaction', target: 1, reward: { xp: 70, coins: 125 },
    update: (p, e) => (e.game === 'reaction' && e.score < 320 ? 1 : p), label: (v) => (v ? 'Done' : 'Not yet'), done: (v) => v >= 1,
  },
  {
    id: 'mine_win', title: 'Win a game of Minesweeper', icon: '🚩', game: 'minesweeper', target: 1, reward: { xp: 110, coins: 175 },
    update: (p, e) => (e.game === 'minesweeper' && e.meta?.win ? 1 : p), label: (v) => (v ? 'Done' : 'Not yet'), done: (v) => v >= 1,
  },
  {
    id: 'ttt_ai', title: 'Beat or draw the AI in Tic Tac Toe', icon: '❌', game: 'tictactoe', target: 1, reward: { xp: 60, coins: 100 },
    update: (p, e) => (e.game === 'tictactoe' && e.meta?.vsAi && (e.meta.win || e.meta.draw) ? 1 : p), label: (v) => (v ? 'Done' : 'Not yet'), done: (v) => v >= 1,
  },
  scoreAtLeast('bricks1000', 'bricks', 1000, 'Score 1,000 in Brick Breaker', '🧱', { xp: 90, coins: 60 }),
  scoreAtLeast('stack2000', 'blockstack', 2000, 'Score 2,000 in Block Stack', '🟦', { xp: 90, coins: 60 }),
  {
    id: 'word_solve', title: 'Solve a Word Guess puzzle', icon: '🔤', game: 'wordguess', target: 1, reward: { xp: 80, coins: 125 },
    update: (p, e) => (e.game === 'wordguess' && e.meta?.win ? 1 : p), label: (v) => (v ? 'Done' : 'Not yet'), done: (v) => v >= 1,
  },
  {
    id: 'c4_ai', title: 'Beat the AI in Connect Four', icon: '🔴', game: 'connect4', target: 1, reward: { xp: 80, coins: 125 },
    update: (p, e) => (e.game === 'connect4' && e.meta?.vsAi && e.meta.win ? 1 : p), label: (v) => (v ? 'Done' : 'Not yet'), done: (v) => v >= 1,
  },
  {
    id: 'chess_ai', title: 'Win a game of chess vs a bot', icon: '♞', game: 'chess', target: 1, reward: { xp: 90, coins: 150 },
    update: (p, e) => (e.game === 'chess' && e.meta?.vsAi && e.meta.win ? 1 : p), label: (v) => (v ? 'Done' : 'Not yet'), done: (v) => v >= 1,
  },
  scoreAtLeast('whack25', 'whack', 25, 'Score 25 in Whack-a-Mole', '🔨', { xp: 70, coins: 50 }),
  {
    id: 'aim500', title: 'Average under 500 ms in Aim Trainer', icon: '🎯', game: 'aim', target: 1, reward: { xp: 80, coins: 125 },
    update: (p, e) => (e.game === 'aim' && e.meta?.mode === 'speed' && e.score < 500 ? 1 : p), label: (v) => (v ? 'Done' : 'Not yet'), done: (v) => v >= 1,
  },
];

export function dailyChallenges(date = todayKey()): Challenge[] {
  const rand = seededRandom(hashString('challenges:' + date));
  const pool = [...CHALLENGE_POOL];
  const out: Challenge[] = [];
  // always one general challenge, then two game-specific
  const general = pool.filter((c) => !c.game);
  out.push(general[Math.floor(rand() * general.length)]);
  const specific = pool.filter((c) => c.game);
  while (out.length < 3) {
    const pick = specific.splice(Math.floor(rand() * specific.length), 1)[0];
    out.push(pick);
  }
  return out;
}

/* ---------------- Daily login ---------------- */
export const LOGIN_REWARDS: Reward[] = [
  { coins: 100, xp: 20 },
  { coins: 125, xp: 30 },
  { coins: 150, xp: 40 },
  { coins: 175, xp: 50 },
  { coins: 200, xp: 60 },
  { coins: 250, xp: 80 },
  { coins: 500, xp: 150 },
];

export function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

export function loginStatus(d: UserData) {
  const today = todayKey();
  const claimedToday = d.login.lastClaim === today;
  const continuing = d.login.lastClaim === yesterdayKey();
  const nextStreak = claimedToday ? d.login.streak : continuing ? d.login.streak + 1 : 1;
  const dayIndex = (nextStreak - 1) % 7;
  return { claimedToday, nextStreak, dayIndex, reward: LOGIN_REWARDS[dayIndex] };
}

/* ---------------- Data factory ---------------- */
export function freshDaily(): UserData['daily'] {
  return { date: todayKey(), progress: {}, claimed: [], gamesPlayed: [], plays: 0 };
}

export function newUserData(username = 'Guest'): UserData {
  return {
    version: 1,
    username,
    avatar: defaultAvatar(),
    xp: 0,
    coins: 0,
    highScores: {},
    plays: {},
    totalPlays: 0,
    favorites: [],
    recent: [],
    achievements: {},
    saves: {},
    unlocks: [],
    daily: freshDaily(),
    login: { lastClaim: null, streak: 0 },
    fx: {},
    spin: { last: null },
    levelBonusPaid: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Defensive normalisation for data loaded from storage / server. */
export function normalizeUserData(raw: unknown, fallbackName = 'Guest'): UserData {
  const base = newUserData(fallbackName);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<UserData>;
  const data: UserData = {
    ...base,
    ...r,
    avatar: { ...base.avatar, ...(r.avatar ?? {}) },
    highScores: { ...(r.highScores ?? {}) },
    plays: { ...(r.plays ?? {}) },
    favorites: (r.favorites ?? []).filter((g) => g in GAME_MAP),
    recent: (r.recent ?? []).filter((g) => g in GAME_MAP),
    achievements: { ...(r.achievements ?? {}) },
    saves: { ...(r.saves ?? {}) },
    unlocks: [...(r.unlocks ?? [])],
    login: { ...base.login, ...(r.login ?? {}) },
    fx: { ...(r.fx ?? {}) },
    spin: { ...base.spin, ...(r.spin ?? {}) },
    // older saves: don't pay level-up bonuses retroactively
    levelBonusPaid: typeof r.levelBonusPaid === 'number' ? r.levelBonusPaid : levelFromXp(r.xp ?? 0),
    daily: r.daily && r.daily.date === todayKey() ? { ...freshDaily(), ...r.daily } : freshDaily(),
  };
  return data;
}

/** Merge guest progress into an account (keeps the best of both). */
export function mergeProgress(account: UserData, guest: UserData): UserData {
  const out = { ...account, highScores: { ...account.highScores }, plays: { ...account.plays } };
  for (const g of GAMES) {
    const a = account.highScores[g.id];
    const b = guest.highScores[g.id];
    if (b !== undefined && (a === undefined || (g.lowerIsBetter ? b < a : b > a))) out.highScores[g.id] = b;
    out.plays[g.id] = (account.plays[g.id] ?? 0) + (guest.plays[g.id] ?? 0);
    if (!out.saves[g.id] && guest.saves[g.id]) out.saves = { ...out.saves, [g.id]: guest.saves[g.id] };
  }
  out.totalPlays = account.totalPlays + guest.totalPlays;
  out.xp = account.xp + guest.xp;
  out.coins = account.coins + guest.coins;
  out.achievements = { ...guest.achievements, ...account.achievements };
  out.favorites = Array.from(new Set([...account.favorites, ...guest.favorites]));
  out.recent = Array.from(new Set([...guest.recent, ...account.recent])).slice(0, 12);
  out.unlocks = Array.from(new Set([...account.unlocks, ...guest.unlocks]));
  out.levelBonusPaid = Math.max(account.levelBonusPaid, guest.levelBonusPaid);
  return out;
}
