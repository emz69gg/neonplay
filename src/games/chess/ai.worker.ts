/// <reference lib="webworker" />
import { botById, botMove } from './ai';
import { fromFen } from './engine';

// Runs the chess AI off the main thread so the page stays smooth while it thinks.
self.onmessage = (e: MessageEvent<{ id: number; fen: string; bot: string }>) => {
  const { id, fen, bot } = e.data;
  const move = botMove(fromFen(fen), botById(bot));
  (self as unknown as Worker).postMessage({ id, move });
};
