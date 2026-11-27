import { inCheck, legalMoves, make, unmake, type Move, type State } from './engine';

/* Alpha-beta (negamax) with quiescence search, MVV-LVA ordering, killer moves,
 * piece-square tables and iterative deepening under a time budget. */

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables from White's point of view, index 0 = a8.
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

/** Static evaluation from the side to move's point of view. */
export function evaluate(s: State): number {
  let score = 0;
  let nonPawn = 0;
  for (const p of s.board) if (p && 'nbrqNBRQ'.includes(p)) nonPawn += VALUE[p.toLowerCase()];
  const endgame = nonPawn <= 1300;
  let wb = 0, bb = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = s.board[sq];
    if (!p) continue;
    const t = p.toLowerCase();
    const white = p !== t;
    const idx = white ? sq : (7 - (sq >> 3)) * 8 + (sq & 7);
    const table = t === 'k' && endgame ? PST.kEnd : PST[t];
    const v = VALUE[t] + table[idx];
    score += white ? v : -v;
    if (t === 'b') white ? wb++ : bb++;
  }
  if (wb >= 2) score += 30;
  if (bb >= 2) score -= 30;
  return s.turn === 'w' ? score : -score;
}

const MATE = 100000;
class Timeout extends Error {}

interface Ctx {
  deadline: number;
  nodes: number;
  killers: (Move | null)[][];
}

const same = (a: Move | null, b: Move) => !!a && a.from === b.from && a.to === b.to && a.promo === b.promo;

function order(moves: Move[], ctx: Ctx, ply: number, pv?: Move | null) {
  const k = ctx.killers[ply] ?? [];
  const score = (m: Move) => {
    if (pv && same(pv, m)) return 1e7;
    let v = 0;
    if (m.captured) v += 1e5 + VALUE[m.captured.toLowerCase()] * 10 - VALUE[m.piece.toLowerCase()];
    if (m.promo) v += 9e4 + VALUE[m.promo];
    if (same(k[0], m) || same(k[1], m)) v += 5e4;
    return v;
  };
  return moves.map((m) => ({ m, v: score(m) })).sort((a, b) => b.v - a.v).map((x) => x.m);
}

function quiesce(s: State, alpha: number, beta: number, ctx: Ctx, qdepth: number): number {
  if ((++ctx.nodes & 1023) === 0 && performance.now() > ctx.deadline) throw new Timeout();
  const stand = evaluate(s);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (qdepth <= 0) return alpha;
  for (const m of order(legalMoves(s, true), ctx, 63)) {
    const u = make(s, m);
    const v = -quiesce(s, -beta, -alpha, ctx, qdepth - 1);
    unmake(s, m, u);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(s: State, depth: number, alpha: number, beta: number, ply: number, ctx: Ctx): number {
  if ((++ctx.nodes & 1023) === 0 && performance.now() > ctx.deadline) throw new Timeout();
  if (s.half >= 100) return 0;
  const check = inCheck(s);
  if (depth <= 0 && !check) return quiesce(s, alpha, beta, ctx, 6);
  const moves = legalMoves(s);
  if (!moves.length) return check ? -MATE + ply : 0;
  let best = -Infinity;
  for (const m of order(moves, ctx, ply)) {
    const u = make(s, m);
    const v = -negamax(s, depth - 1 + (check ? 1 : 0) * (ply < 8 ? 1 : 0), -beta, -alpha, ply + 1, ctx);
    unmake(s, m, u);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!m.captured) {
        const k = (ctx.killers[ply] ??= [null, null]);
        if (!same(k[0], m)) {
          k[1] = k[0];
          k[0] = m;
        }
      }
      break;
    }
  }
  return best;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
}

/** Iterative deepening search. Returns the best move found before the deadline. */
export function search(root: State, maxDepth: number, budgetMs: number, rootScores?: Map<Move, number>): SearchResult {
  const s: State = { ...root, board: [...root.board], castling: { ...root.castling } };
  const ctx: Ctx = { deadline: performance.now() + budgetMs, nodes: 0, killers: [] };
  const moves = legalMoves(s);
  if (!moves.length) return { move: null, score: 0, depth: 0, nodes: 0 };
  let best: Move = moves[0];
  let bestScore = -Infinity;
  let reached = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let alpha = -Infinity;
      let iterBest: Move = best;
      const iterScores = new Map<Move, number>();
      for (const m of order(moves, ctx, 0, best)) {
        const u = make(s, m);
        // with rootScores we need every root move's real score, so no alpha narrowing at the root
        const v = -negamax(s, depth - 1, -Infinity, rootScores ? Infinity : -alpha, 1, ctx);
        unmake(s, m, u);
        iterScores.set(m, v);
        if (v > alpha) {
          alpha = v;
          iterBest = m;
        }
      }
      if (rootScores) {
        rootScores.clear();
        iterScores.forEach((v, m) => rootScores.set(m, v));
      }
      best = iterBest;
      bestScore = alpha;
      reached = depth;
      if (Math.abs(alpha) > MATE - 1000) break; // found a forced mate
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return { move: best, score: bestScore, depth: reached, nodes: ctx.nodes };
}

export type Level = 'easy' | 'medium' | 'hard';

/* ---------------- Practice bots, each tuned to play around an Elo rating ---------------- */
export type BotId = 'pawny' | 'rookie' | 'novice' | 'clubber' | 'tactician' | 'expert' | 'master';
export interface Bot {
  id: BotId;
  name: string;
  elo: number;
  emoji: string;
  blurb: string;
  /** used for achievements / rewards */
  tier: Level;
  depth: number;
  ms: number;
  /** chance of playing a completely random move */
  blunder: number;
  /** random noise (centipawns) added to each move's score */
  noise: number;
}
export const BOTS: Bot[] = [
  { id: 'pawny', name: 'Pawny', elo: 400, emoji: '🐣', blurb: 'Just learned how the pieces move.', tier: 'easy', depth: 1, ms: 200, blunder: 0.45, noise: 260 },
  { id: 'rookie', name: 'Rookie', elo: 700, emoji: '🙂', blurb: 'Grabs pieces, often leaves its own hanging.', tier: 'easy', depth: 1, ms: 200, blunder: 0.22, noise: 150 },
  { id: 'novice', name: 'Novice', elo: 900, emoji: '🤓', blurb: 'Sees one move ahead. Still blunders.', tier: 'easy', depth: 2, ms: 300, blunder: 0.1, noise: 90 },
  { id: 'clubber', name: 'Clubber', elo: 1200, emoji: '😎', blurb: 'A solid club player. Punishes loose pieces.', tier: 'medium', depth: 2, ms: 450, blunder: 0.03, noise: 45 },
  { id: 'tactician', name: 'Tactician', elo: 1500, emoji: '🦊', blurb: 'Loves forks, pins and cheap tricks.', tier: 'medium', depth: 3, ms: 700, blunder: 0.01, noise: 22 },
  { id: 'expert', name: 'Expert', elo: 1800, emoji: '🧠', blurb: 'Calculates deep. Rarely makes mistakes.', tier: 'hard', depth: 5, ms: 1300, blunder: 0, noise: 8 },
  { id: 'master', name: 'Master', elo: 2100, emoji: '👑', blurb: 'Full strength. Bring your best game.', tier: 'hard', depth: 8, ms: 2200, blunder: 0, noise: 0 },
];
export const botById = (id: string | undefined): Bot => BOTS.find((b) => b.id === id) ?? BOTS[3];
/** The bot whose rating is closest to (and preferably just above) a player's rating. */
export function suggestedBot(rating: number): Bot {
  return BOTS.reduce((best, b) => (Math.abs(b.elo - (rating + 100)) < Math.abs(best.elo - (rating + 100)) ? b : best), BOTS[0]);
}

const gauss = () => {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Pick a move the way a player of this bot's rating might. */
export function botMove(s: State, bot: Bot): Move | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  if (bot.noise === 0) return search(s, bot.depth, bot.ms).move;
  if (Math.random() < bot.blunder) return moves[Math.floor(Math.random() * moves.length)];
  const scores = new Map<Move, number>();
  const res = search(s, bot.depth, bot.ms, scores);
  if (!scores.size) return res.move;
  let best: Move | null = null;
  let bestV = -Infinity;
  scores.forEach((v, m) => {
    // never miss a forced mate in its favour, otherwise add human-like noise
    const noisy = v > MATE - 1000 ? v : v + gauss() * bot.noise;
    if (noisy > bestV) {
      bestV = noisy;
      best = m;
    }
  });
  return best ?? res.move;
}

/** Pick a move for the given difficulty. */
export function chooseMove(s: State, level: Level): Move | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (level === 'easy') {
    // shallow search with a lot of noise: plays sensible-looking moves but blunders often
    if (Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
    const scored = moves.map((m) => {
      const u = make(s, m);
      const v = -evaluate(s) + (Math.random() - 0.5) * 160;
      unmake(s, m, u);
      return { m, v };
    });
    scored.sort((a, b) => b.v - a.v);
    return scored[0].m;
  }
  if (level === 'medium') return search(s, 3, 500).move;
  return search(s, 7, 1800).move;
}
