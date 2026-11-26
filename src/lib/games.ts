import type { Category, GameId, GameMeta } from './types';

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export const CATEGORIES: { id: Category; label: string; icon: string; blurb: string }[] = [
  { id: 'arcade', label: 'Arcade', icon: '🕹️', blurb: 'Fast reflex action' },
  { id: 'puzzle', label: 'Puzzle', icon: '🧩', blurb: 'Think before you click' },
  { id: 'skill', label: 'Skill', icon: '⚡', blurb: 'Test your limits' },
  { id: 'strategy', label: 'Strategy', icon: '♟️', blurb: 'Outsmart the opponent' },
  { id: 'idle', label: 'Idle', icon: '💰', blurb: 'Grow your empire' },
];

export const GAMES: GameMeta[] = [
  {
    id: 'reaction',
    title: 'Reaction Test',
    tagline: 'How fast are your reflexes?',
    description:
      'Wait for the screen to flash green, then hit it as fast as you can. Each round measures your reaction time in milliseconds. Click too early and you have to start that round again.',
    instructions: [
      'Press start, then wait while the panel is red.',
      'The moment it turns green, click, tap or press Space.',
      'Clicking during red counts as a false start.',
      'Lower times are better — the pros sit under 200 ms.',
    ],
    controls: { desktop: 'Mouse click or Space', mobile: 'Tap the panel' },
    category: 'skill',
    tags: ['reflex', 'quick'],
    scoreLabel: 'Time',
    unit: 'ms',
    lowerIsBetter: true,
    addedAt: '2026-09-02',
    gradient: ['#22c55e', '#0ea5e9'],
    fullscreen: true,
    reward: (ms) => ({ xp: clamp(Math.round((600 - ms) / 10), 5, 40), coins: ms < 250 ? 15 : ms < 350 ? 10 : 5 }),
  },
  {
    id: '2048',
    title: '2048',
    tagline: 'Slide, merge, reach 2048.',
    description:
      'Slide numbered tiles on a 4×4 grid. When two tiles with the same number touch, they merge into one. Keep merging to build the 2048 tile — and keep going for a higher score. Your board is saved automatically.',
    instructions: [
      'Swipe or use the arrow keys / WASD to move every tile.',
      'Matching tiles merge and add their value to your score.',
      'A new tile appears after every move.',
      'The game ends when no moves are left.',
    ],
    controls: { desktop: 'Arrow keys or WASD', mobile: 'Swipe on the board' },
    category: 'puzzle',
    tags: ['numbers', 'classic'],
    scoreLabel: 'Score',
    addedAt: '2026-08-14',
    gradient: ['#f59e0b', '#ef4444'],
    fullscreen: true,
    reward: (s) => ({ xp: clamp(Math.round(s / 80), 5, 150), coins: clamp(Math.round(s / 200), 2, 80) }),
  },
  {
    id: 'snake',
    title: 'Snake',
    tagline: 'Eat, grow, don’t bite yourself.',
    description:
      'The classic, upgraded. Guide your neon snake to food, grow longer and dodge your own tail. Pick a mode — Classic walls, Portal edges that wrap around, or a Maze of obstacles — and grab bonus stars and slow-mo clocks before they vanish. The snake speeds up as your score climbs.',
    instructions: [
      'Pick a mode: Classic, Portal (wrap through walls) or Maze.',
      'Steer with arrow keys, WASD, swipes or the on-screen pad.',
      'Apples are +1. Golden stars are +3 and slow-mo clocks slow time for 5 s — both disappear after a few seconds.',
      'Hitting a wall, an obstacle or yourself ends the run. Space or P pauses.',
    ],
    controls: { desktop: 'Arrow keys / WASD, Space to pause', mobile: 'Swipe or D-pad' },
    category: 'arcade',
    tags: ['classic', 'retro', 'modes'],
    scoreLabel: 'Score',
    addedAt: '2026-08-14',
    gradient: ['#10b981', '#84cc16'],
    fullscreen: true,
    reward: (s) => ({ xp: clamp(s * 4, 3, 160), coins: clamp(s * 2, 1, 80) }),
  },
  {
    id: 'tictactoe',
    title: 'Tic Tac Toe',
    tagline: 'Three in a row wins.',
    description:
      'Play the timeless game against a friend on the same device, or challenge the AI. On Hard the AI plays perfectly — a draw is a good result, a win is impossible. Your best win streak against the AI is your score.',
    instructions: [
      'Choose a mode: vs Friend, or vs AI (Easy / Medium / Hard).',
      'Take turns placing X and O on the 3×3 grid.',
      'Get three in a row horizontally, vertically or diagonally.',
      'Win streaks against the AI count toward your best.',
    ],
    controls: { desktop: 'Click a square', mobile: 'Tap a square' },
    category: 'strategy',
    tags: ['2 players', 'ai'],
    scoreLabel: 'Win streak',
    addedAt: '2026-08-20',
    gradient: ['#6366f1', '#a855f7'],
    fullscreen: false,
    reward: (_s, m) => (m?.win ? { xp: m.difficulty === 'hard' ? 60 : m.difficulty === 'medium' ? 30 : 15, coins: 10 } : { xp: 5, coins: 2 }),
  },
  {
    id: 'rps',
    title: 'Rock Paper Scissors',
    tagline: 'Read the computer’s mind.',
    description:
      'Rock beats scissors, scissors beat paper, paper beats rock. Play against the computer and build the longest win streak you can. Ties don’t break your streak — losses do.',
    instructions: [
      'Pick rock, paper or scissors (or press 1, 2, 3).',
      'The computer picks at the same time.',
      'Every win adds to your streak; a loss resets it.',
      'Your longest streak is your score.',
    ],
    controls: { desktop: 'Click or keys 1 / 2 / 3', mobile: 'Tap a hand' },
    category: 'strategy',
    tags: ['quick', 'luck'],
    scoreLabel: 'Best streak',
    addedAt: '2026-09-10',
    gradient: ['#ec4899', '#f97316'],
    fullscreen: false,
    reward: (s) => ({ xp: clamp(s * 8, 2, 120), coins: clamp(s * 4, 1, 60) }),
  },
  {
    id: 'memory',
    title: 'Memory Cards',
    tagline: 'Flip. Remember. Match.',
    description:
      'All cards start face down. Flip two at a time to find matching pairs. Clear the board in as few moves and as little time as possible for a higher score.',
    instructions: [
      'Choose Normal (16 cards) or Hard (24 cards).',
      'Flip two cards. Matching pairs stay face up.',
      'Clear every pair to win.',
      'Fewer moves and faster time = more points.',
    ],
    controls: { desktop: 'Click cards', mobile: 'Tap cards' },
    category: 'puzzle',
    tags: ['memory', 'relaxing'],
    scoreLabel: 'Points',
    addedAt: '2026-09-18',
    gradient: ['#06b6d4', '#3b82f6'],
    fullscreen: true,
    reward: (s) => ({ xp: clamp(Math.round(s / 20), 5, 100), coins: clamp(Math.round(s / 40), 2, 50) }),
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    tagline: 'Clear the field. Don’t blow up.',
    description:
      'Reveal every safe square without hitting a mine. Numbers show how many mines touch that square. Use logic to flag mines and clear the board. Your first click is always safe.',
    instructions: [
      'Left-click / tap to reveal a square.',
      'Right-click, long-press or use Flag mode to mark a mine.',
      'Click a revealed number with all its flags placed to clear its neighbours.',
      'Reveal every safe square to win — faster is more points.',
    ],
    controls: { desktop: 'Left click reveal, right click flag', mobile: 'Tap reveal, long-press or Flag mode' },
    category: 'puzzle',
    tags: ['logic', 'classic'],
    scoreLabel: 'Points',
    addedAt: '2026-10-05',
    gradient: ['#64748b', '#3b82f6'],
    fullscreen: true,
    reward: (s, m) => (m?.win ? { xp: clamp(Math.round(s / 15), 20, 200), coins: clamp(Math.round(s / 30), 10, 100) } : { xp: 5, coins: 1 }),
  },
  {
    id: 'clicker',
    title: 'Clicker Simulator',
    tagline: 'Click. Upgrade. Get rich.',
    description:
      'Start with a single coin and build an empire. Click to earn, buy upgrades that boost every click, and hire auto-miners that earn while you sit back. Progress is saved — even while you’re away you earn some offline income.',
    instructions: [
      'Click / tap the big coin to earn.',
      'Buy click upgrades to earn more per click.',
      'Buy generators for automatic income every second.',
      'Hit milestones to earn real platform XP and coins.',
    ],
    controls: { desktop: 'Click or Space', mobile: 'Tap the coin' },
    category: 'idle',
    tags: ['idle', 'incremental'],
    scoreLabel: 'Lifetime earned',
    addedAt: '2026-10-21',
    gradient: ['#eab308', '#f97316'],
    fullscreen: false,
    reward: () => ({ xp: 0, coins: 0 }),
  },
  {
    id: 'flappy',
    title: 'Flappy Wings',
    tagline: 'Tap to fly. Don’t touch the pipes.',
    description:
      'Keep your bird in the air and fly through the gaps between the neon pipes. Gravity is relentless and the pipes speed up as your score grows. One touch and it’s over.',
    instructions: [
      'Tap, click or press Space / ↑ to flap.',
      'Fly through the gaps between pipes.',
      'Each pipe passed is +1 point.',
      'Touching a pipe, the floor or the ceiling ends the run.',
    ],
    controls: { desktop: 'Space, ↑ or click', mobile: 'Tap anywhere on the game' },
    category: 'arcade',
    tags: ['one-tap', 'hard'],
    scoreLabel: 'Pipes',
    addedAt: '2026-10-28',
    gradient: ['#8b5cf6', '#22d3ee'],
    fullscreen: true,
    reward: (s) => ({ xp: clamp(s * 5, 2, 200), coins: clamp(s * 2, 1, 100) }),
  },
  {
    id: 'typing',
    title: 'Typing Speed Test',
    tagline: 'How many words per minute?',
    description:
      'Type the words as quickly and accurately as you can before the timer runs out. Your net WPM counts only correctly typed words, and accuracy is shown live.',
    instructions: [
      'Pick 15, 30 or 60 seconds.',
      'Start typing — the timer begins with your first key.',
      'Press Space to move to the next word.',
      'Mistakes are highlighted in red and lower your net WPM.',
    ],
    controls: { desktop: 'Keyboard', mobile: 'On-screen keyboard (tap the text)' },
    category: 'skill',
    tags: ['keyboard', 'speed'],
    scoreLabel: 'WPM',
    unit: 'wpm',
    addedAt: '2026-11-03',
    gradient: ['#a855f7', '#ec4899'],
    fullscreen: false,
    reward: (wpm) => ({ xp: clamp(Math.round(wpm * 1.2), 5, 160), coins: clamp(Math.round(wpm / 2), 2, 70) }),
  },
  {
    id: 'bricks',
    title: 'Brick Breaker',
    tagline: 'Smash every neon brick.',
    description:
      'Bounce the ball off your paddle and smash through walls of glowing bricks. Tough bricks crack before they break, and falling power-ups give you a wider paddle, extra balls, slow motion or an extra life. Clear a level to move on — every level is worth more points.',
    instructions: [
      'Move the paddle with your mouse or finger, or ←/→ (A/D).',
      'Press Space or tap to launch the ball.',
      'Where the ball hits the paddle decides its angle — aim with the edges.',
      'Catch power-ups and don’t let the ball fall. You have 3 lives.',
    ],
    controls: { desktop: 'Mouse or ←/→, Space to launch, P to pause', mobile: 'Drag to move, tap to launch' },
    category: 'arcade',
    tags: ['classic', 'power-ups', 'levels'],
    scoreLabel: 'Score',
    addedAt: '2026-11-26',
    gradient: ['#f43f5e', '#8b5cf6'],
    fullscreen: true,
    reward: (s) => ({ xp: clamp(Math.round(s / 15), 5, 200), coins: clamp(Math.round(s / 30), 2, 100) }),
  },
  {
    id: 'blockstack',
    title: 'Block Stack',
    tagline: 'Fit the falling blocks. Clear lines.',
    description:
      'Falling shapes made of four blocks drop into a 10×20 well. Move and rotate them to fill complete rows — a full row disappears and scores points. Clear four rows at once for a big bonus. Every 10 lines the level goes up and the blocks fall faster. Your run is saved if you leave.',
    instructions: [
      '←/→ move, ↑ rotates, ↓ drops faster, Space drops instantly.',
      'Press C to hold a piece for later.',
      'Fill a whole row to clear it — 4 rows at once scores the most.',
      'The game ends when the blocks reach the top.',
    ],
    controls: { desktop: '←/→ move, ↑ rotate, ↓ soft drop, Space hard drop, C hold', mobile: 'Swipe ←/→ to move, tap to rotate, swipe ↓ to drop, or the buttons' },
    category: 'puzzle',
    tags: ['classic', 'blocks', 'lines'],
    scoreLabel: 'Score',
    addedAt: '2026-11-26',
    gradient: ['#06b6d4', '#6366f1'],
    fullscreen: true,
    reward: (s) => ({ xp: clamp(Math.round(s / 60), 5, 220), coins: clamp(Math.round(s / 120), 2, 110) }),
  },
  {
    id: 'wordguess',
    title: 'Word Guess',
    tagline: 'Find the hidden five-letter word.',
    description:
      'Guess the secret five-letter word in six tries. After each guess the tiles change colour to show how close you were: green letters are in the right spot, yellow ones are in the word but somewhere else. Play the Daily word — the same for everyone today — or practise in Unlimited mode.',
    instructions: [
      'Type a 5-letter word and press Enter.',
      'Green = right letter, right place. Yellow = right letter, wrong place. Grey = not in the word.',
      'You have 6 tries. Fewer guesses = more points.',
      'Daily mode has one new word per day; Unlimited never ends.',
    ],
    controls: { desktop: 'Keyboard, Enter to guess, Backspace to delete', mobile: 'On-screen keyboard' },
    category: 'puzzle',
    tags: ['words', 'daily', 'brain'],
    scoreLabel: 'Points',
    addedAt: '2026-11-26',
    gradient: ['#22c55e', '#eab308'],
    fullscreen: false,
    reward: (s, m) => (m?.win ? { xp: clamp(Math.round(s / 6), 20, 100), coins: clamp(Math.round(s / 12), 10, 50) } : { xp: 5, coins: 2 }),
  },
  {
    id: 'connect4',
    title: 'Connect Four',
    tagline: 'Drop discs. Line up four.',
    description:
      'Take turns dropping discs into a seven-column grid. The first player to line up four in a row — across, down or diagonally — wins. Play a friend on the same device or take on the AI; on Hard it thinks several moves ahead. Your best win streak against the AI is your score.',
    instructions: [
      'Choose vs Friend or vs AI (Easy / Medium / Hard).',
      'Click or tap a column to drop your disc into it.',
      'Get four of your discs in a row in any direction to win.',
      'Wins in a row against the AI build your streak.',
    ],
    controls: { desktop: 'Click a column, or ←/→ and Enter', mobile: 'Tap a column' },
    category: 'strategy',
    tags: ['2 players', 'ai', 'classic'],
    scoreLabel: 'Win streak',
    addedAt: '2026-11-26',
    gradient: ['#ef4444', '#eab308'],
    fullscreen: false,
    reward: (_s, m) => (m?.win ? { xp: m.difficulty === 'hard' ? 80 : m.difficulty === 'medium' ? 40 : 20, coins: m.difficulty === 'hard' ? 30 : 12 } : { xp: 5, coins: 2 }),
  },
  {
    id: 'whack',
    title: 'Whack-a-Mole',
    tagline: 'Bop them before they hide.',
    description:
      'Little critters pop out of their holes — bop them as fast as you can before they duck back down. Golden ones are worth extra, but don’t touch the bombs! Hit several in a row to build a combo multiplier. They get faster as the 30-second round goes on.',
    instructions: [
      'Click or tap a critter when it pops up (or use keys 1–9).',
      'Normal = +1, golden = +3, bomb = −5. Avoid the bombs!',
      'Hits in a row build a combo that multiplies your points. Missing resets it.',
      'Score as many points as you can in 30 seconds.',
    ],
    controls: { desktop: 'Click, or number keys 1–9', mobile: 'Tap' },
    category: 'skill',
    tags: ['reflex', 'quick', 'combo'],
    scoreLabel: 'Points',
    addedAt: '2026-11-26',
    gradient: ['#84cc16', '#a16207'],
    fullscreen: true,
    reward: (s) => ({ xp: clamp(s * 2, 3, 150), coins: clamp(s, 1, 75) }),
  },
  {
    id: 'aim',
    title: 'Aim Trainer',
    tagline: 'Click targets. Fast.',
    description:
      'Targets appear anywhere on screen — hit them as quickly and accurately as you can. In 30 Targets mode your score is your average time per target, so lower is better. Precision mode gives you 60 seconds with shrinking targets, and your score depends on hits and accuracy.',
    instructions: [
      'Pick 30 Targets (speed) or Precision 60 s (accuracy).',
      'Click or tap each target as fast as you can.',
      'Misses lower your accuracy — don’t spam clicks.',
      'At the end you get your stats and a chart of your hit times.',
    ],
    controls: { desktop: 'Mouse', mobile: 'Tap' },
    category: 'skill',
    tags: ['reflex', 'precision', 'fps'],
    scoreLabel: 'Avg time',
    unit: 'ms',
    lowerIsBetter: true,
    addedAt: '2026-11-26',
    gradient: ['#0ea5e9', '#ec4899'],
    fullscreen: true,
    reward: (ms, m) => (m?.mode === 'precision' ? { xp: 20, coins: 8 } : { xp: clamp(Math.round((900 - ms) / 8), 5, 80), coins: clamp(Math.round((900 - ms) / 20), 2, 35) }),
  },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

export const isGameId = (id: string | undefined): id is GameId => !!id && id in GAME_MAP;

export function formatScore(game: GameMeta, score: number | undefined): string {
  if (score === undefined || score === null) return '—';
  if (game.id === 'clicker') return compact(score);
  return `${Math.round(score).toLocaleString()}${game.unit ? ` ${game.unit}` : ''}`;
}

export function compact(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let u = -1;
  let v = n;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)}${units[u]}`;
}

export function isBetter(game: GameMeta, score: number, prev: number | undefined) {
  if (prev === undefined) return true;
  return game.lowerIsBetter ? score < prev : score > prev;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyFeaturedGame(date = todayKey()): GameMeta {
  return GAMES[hashString('featured:' + date) % GAMES.length];
}

export function relatedGames(id: GameId, n = 4): GameMeta[] {
  const g = GAME_MAP[id];
  const same = GAMES.filter((x) => x.id !== id && x.category === g.category);
  const rand = seededRandom(hashString(id));
  const others = GAMES.filter((x) => x.id !== id && x.category !== g.category).sort(() => rand() - 0.5);
  return [...same, ...others].slice(0, n);
}

export function searchGames(q: string): GameMeta[] {
  const s = q.trim().toLowerCase();
  if (!s) return GAMES;
  return GAMES.filter((g) =>
    [g.title, g.tagline, g.category, ...g.tags].some((t) => t.toLowerCase().includes(s)),
  );
}
