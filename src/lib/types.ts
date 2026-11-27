export type GameId =
  | 'reaction'
  | '2048'
  | 'snake'
  | 'tictactoe'
  | 'rps'
  | 'memory'
  | 'minesweeper'
  | 'clicker'
  | 'flappy'
  | 'typing'
  | 'bricks'
  | 'blockstack'
  | 'wordguess'
  | 'connect4'
  | 'whack'
  | 'aim'
  | 'chess';

export type Category = 'arcade' | 'puzzle' | 'skill' | 'strategy' | 'idle';

export interface Reward {
  xp: number;
  coins: number;
}

export interface GameMeta {
  id: GameId;
  title: string;
  tagline: string;
  description: string;
  instructions: string[];
  controls: { desktop: string; mobile: string };
  category: Category;
  tags: string[];
  scoreLabel: string;
  lowerIsBetter?: boolean;
  unit?: string;
  addedAt: string; // ISO date
  gradient: [string, string];
  fullscreen: boolean;
  reward: (score: number, meta?: FinishMeta) => Reward;
}

/** Extra context a game can send when a round finishes (used for achievements & challenges). */
export interface FinishMeta {
  win?: boolean;
  difficulty?: string;
  maxTile?: number;
  accuracy?: number;
  moves?: number;
  [k: string]: unknown;
}

export interface Avatar {
  emoji: string;
  color: string; // gradient key
  /** equipped cosmetics other players can see (keys from the shop catalog) */
  frame?: string;
  name?: string;
  bg?: string;
  badge?: string;
  pet?: string;
}

/** Equipped effects only you see. */
export interface Effects {
  trail?: string;
  win?: string;
  coin?: string;
  theme?: string;
}

export interface DailyState {
  date: string;
  progress: Record<string, number>;
  claimed: string[];
  gamesPlayed: GameId[];
  plays: number;
}

export interface UserData {
  version: 1;
  username: string;
  avatar: Avatar;
  xp: number;
  coins: number;
  highScores: Partial<Record<GameId, number>>;
  plays: Partial<Record<GameId, number>>;
  totalPlays: number;
  favorites: GameId[];
  recent: GameId[];
  achievements: Record<string, number>;
  saves: Partial<Record<GameId, unknown>>;
  unlocks: string[];
  daily: DailyState;
  login: { lastClaim: string | null; streak: number };
  fx: Effects;
  spin: { last: string | null };
  /** highest level whose level-up coin bonus has been paid */
  levelBonusPaid: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  provider: 'supabase' | 'local';
}

/** API handed to every game component by the GamePage shell. */
export interface GameApi {
  /** Update the live score display. */
  setScore: (score: number) => void;
  /** A round ended: records personal best, grants XP/coins, checks achievements. */
  finish: (score: number, meta?: FinishMeta) => void;
  /** Update best score without a round reward (used by idle games). */
  reportScore: (score: number) => void;
  /** Grant XP/coins directly (milestones). */
  reward: (r: Reward, reason: string) => void;
  /** Persisted per-game save slot. */
  save: (data: unknown) => void;
  load: <T>() => T | undefined;
  best: number | undefined;
  sound: (name: SoundName) => void;
  isFullscreen: boolean;
}

export type SoundName =
  | 'click'
  | 'move'
  | 'point'
  | 'win'
  | 'lose'
  | 'flip'
  | 'coin'
  | 'error'
  | 'jump'
  | 'tick'
  | 'level';
