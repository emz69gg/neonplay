import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameId } from '../lib/types';
import type { GameProps } from './shared';

/** Each game is code-split so the homepage loads fast. */
export const GAME_COMPONENTS: Record<GameId, LazyExoticComponent<ComponentType<GameProps>>> = {
  reaction: lazy(() => import('./ReactionTest')),
  '2048': lazy(() => import('./Game2048')),
  snake: lazy(() => import('./Snake')),
  tictactoe: lazy(() => import('./TicTacToe')),
  rps: lazy(() => import('./RockPaperScissors')),
  memory: lazy(() => import('./MemoryCards')),
  minesweeper: lazy(() => import('./Minesweeper')),
  clicker: lazy(() => import('./Clicker')),
  flappy: lazy(() => import('./Flappy')),
  typing: lazy(() => import('./TypingTest')),
  bricks: lazy(() => import('./BrickBreaker')),
  blockstack: lazy(() => import('./BlockStack')),
  wordguess: lazy(() => import('./WordGuess')),
  connect4: lazy(() => import('./ConnectFour')),
  whack: lazy(() => import('./WhackAMole')),
  aim: lazy(() => import('./AimTrainer')),
  chess: lazy(() => import('./Chess')),
  neoncity: lazy(() => import('./NeonCity')),
};
