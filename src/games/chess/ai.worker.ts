/// <reference lib="webworker" />
import { chooseMove, type Level } from './ai';
import { fromFen } from './engine';

// Runs the chess AI off the main thread so the page stays smooth while it thinks.
self.onmessage = (e: MessageEvent<{ id: number; fen: string; level: Level }>) => {
  const { id, fen, level } = e.data;
  const move = chooseMove(fromFen(fen), level);
  (self as unknown as Worker).postMessage({ id, move });
};
