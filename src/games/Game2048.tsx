import { useCallback, useEffect, useRef, useState } from 'react';
import { useDirectionKeys, useSwipe, type Dir, type GameProps } from './shared';

interface Tile {
  id: number;
  v: number;
  r: number;
  c: number;
  isNew?: boolean;
  merged?: boolean;
}
interface Save {
  tiles: Tile[];
  score: number;
  won: boolean;
  keepPlaying: boolean;
  over: boolean;
}

const N = 4;
let uid = 1;

function spawn(tiles: Tile[]): Tile[] {
  const empty: [number, number][] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!tiles.some((t) => t.r === r && t.c === c)) empty.push([r, c]);
  if (!empty.length) return tiles;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  return [...tiles, { id: uid++, v: Math.random() < 0.9 ? 2 : 4, r, c, isNew: true }];
}

function newBoard(): Tile[] {
  return spawn(spawn([]));
}

function move(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; moved: boolean } {
  const grid: (Tile | null)[][] = Array.from({ length: N }, () => Array(N).fill(null));
  tiles.forEach((t) => (grid[t.r][t.c] = { ...t, isNew: false, merged: false }));
  const out: Tile[] = [];
  let gained = 0;
  let moved = false;
  for (let i = 0; i < N; i++) {
    // collect line in movement order
    const line: Tile[] = [];
    for (let j = 0; j < N; j++) {
      const [r, c] =
        dir === 'left' ? [i, j] : dir === 'right' ? [i, N - 1 - j] : dir === 'up' ? [j, i] : [N - 1 - j, i];
      const t = grid[r][c];
      if (t) line.push(t);
    }
    let pos = 0;
    for (let k = 0; k < line.length; k++) {
      const t = line[k];
      const next = line[k + 1];
      const [r, c] = dir === 'left' ? [i, pos] : dir === 'right' ? [i, N - 1 - pos] : dir === 'up' ? [pos, i] : [N - 1 - pos, i];
      if (next && next.v === t.v) {
        // both slide to the same cell; the survivor doubles
        const v = t.v * 2;
        gained += v;
        out.push({ ...t, r, c, v, merged: true });
        out.push({ ...next, r, c, v: next.v, id: -next.id }); // ghost for slide animation, removed after
        if (t.r !== r || t.c !== c || next.r !== r || next.c !== c) moved = true;
        moved = true;
        k++;
      } else {
        if (t.r !== r || t.c !== c) moved = true;
        out.push({ ...t, r, c });
      }
      pos++;
    }
  }
  return { tiles: out, gained, moved };
}

function canMove(tiles: Tile[]) {
  if (tiles.length < N * N) return true;
  const g: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  tiles.forEach((t) => (g[t.r][t.c] = t.v));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (c + 1 < N && g[r][c] === g[r][c + 1]) return true;
    if (r + 1 < N && g[r][c] === g[r + 1][c]) return true;
  }
  return false;
}

const COLORS: Record<number, [string, string]> = {
  2: ['#2a2a3d', '#e9e7ff'],
  4: ['#36325a', '#e9e7ff'],
  8: ['#7c3aed', '#fff'],
  16: ['#8b5cf6', '#fff'],
  32: ['#6366f1', '#fff'],
  64: ['#3b82f6', '#fff'],
  128: ['#06b6d4', '#fff'],
  256: ['#14b8a6', '#fff'],
  512: ['#ec4899', '#fff'],
  1024: ['#f97316', '#fff'],
  2048: ['#facc15', '#422006'],
};

export default function Game2048({ api, fresh }: GameProps) {
  const saved = fresh ? undefined : api.load<Save>();
  const [tiles, setTiles] = useState<Tile[]>(() => {
    if (saved && !saved.over && saved.tiles?.length) {
      const maxId = Math.max(...saved.tiles.map((t) => Math.abs(t.id)));
      uid = Math.max(uid, maxId + 1);
      return saved.tiles.filter((t) => t.id > 0).map((t) => ({ ...t, isNew: false, merged: false }));
    }
    return newBoard();
  });
  const [score, setScore] = useState(saved && !saved.over ? saved.score : 0);
  const [won, setWon] = useState(saved && !saved.over ? saved.won : false);
  const [keepPlaying, setKeepPlaying] = useState(saved && !saved.over ? saved.keepPlaying : false);
  const [over, setOver] = useState(false);
  const [bump, setBump] = useState<{ v: number; k: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const stateRef = useRef({ tiles, score, over, won, keepPlaying });
  stateRef.current = { tiles, score, over, won, keepPlaying };

  useEffect(() => {
    api.setScore(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  useEffect(() => {
    api.save({ tiles: tiles.filter((t) => t.id > 0), score, won, keepPlaying, over } satisfies Save);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, score, won, keepPlaying, over]);

  const doMove = useCallback(
    (dir: Dir) => {
      const s = stateRef.current;
      if (s.over || busy.current || (s.won && !s.keepPlaying)) return;
      const res = move(s.tiles, dir);
      if (!res.moved) return;
      busy.current = true;
      setTiles(res.tiles);
      api.sound(res.gained ? 'point' : 'move');
      const newScore = s.score + res.gained;
      if (res.gained) {
        setScore(newScore);
        setBump({ v: res.gained, k: Date.now() });
        api.reportScore(newScore);
      }
      window.setTimeout(() => {
        const cleaned = res.tiles.filter((t) => t.id > 0);
        const next = spawn(cleaned);
        setTiles(next);
        busy.current = false;
        const maxTile = Math.max(...next.map((t) => t.v));
        if (maxTile >= 2048 && !s.won) {
          setWon(true);
          api.sound('win');
        }
        if (!canMove(next)) {
          setOver(true);
          api.sound('lose');
          api.finish(newScore, { maxTile });
        }
      }, 110);
    },
    [api],
  );

  useDirectionKeys(doMove);
  useSwipe(boardRef, doMove);

  const restart = () => {
    if (!over && score > 0) api.finish(score, { maxTile: Math.max(...tiles.map((t) => t.v)) });
    uid++;
    setTiles(newBoard());
    setScore(0);
    setWon(false);
    setKeepPlaying(false);
    setOver(false);
    api.sound('click');
  };

  const maxTile = Math.max(...tiles.map((t) => t.v));
  const GAP = 'var(--g)';
  const SIZE = `calc((100% - 5 * ${GAP}) / 4)`;
  const pos = (i: number) => `calc(${GAP} + ${i} * (${SIZE} + ${GAP}))`;

  return (
    <div className="flex w-full max-w-[min(520px,100%)] flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex gap-2">
          <div className="card relative min-w-[84px] px-3 py-2 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Score</div>
            <div className="font-mono text-lg font-bold">{score}</div>
            {bump && (
              <span key={bump.k} className="animate-rise pointer-events-none absolute left-1/2 top-4 font-bold text-neon-cyan">
                +{bump.v}
              </span>
            )}
          </div>
          <div className="card min-w-[84px] px-3 py-2 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Best tile</div>
            <div className="font-mono text-lg font-bold">{maxTile}</div>
          </div>
        </div>
        <button className="btn-ghost" onClick={restart}>↻ New game</button>
      </div>

      <div
        ref={boardRef}
        className="no-touch-scroll relative aspect-square w-full select-none rounded-2xl bg-surface2 [--g:8px] sm:[--g:12px]"
        style={{ boxShadow: 'inset 0 0 0 1px rgb(var(--line))' }}
        aria-label="2048 board"
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="absolute rounded-xl bg-line/50" style={{ width: SIZE, height: SIZE, left: pos(i % 4), top: pos(Math.floor(i / 4)) }} />
        ))}
        {tiles.map((t) => {
          const [bg, fg] = COLORS[t.v] ?? ['#111827', '#fde047'];
          return (
            <div
              key={t.id}
              className="absolute grid place-items-center rounded-xl font-display font-bold transition-[left,top] duration-100 ease-out"
              style={{ width: SIZE, height: SIZE, left: pos(t.c), top: pos(t.r), zIndex: t.id < 0 ? 1 : 2 }}
            >
              <div
                className={`grid h-full w-full place-items-center rounded-xl ${t.isNew ? 'animate-pop' : ''} ${t.merged ? 'animate-pop' : ''}`}
                style={{
                  background: bg,
                  color: fg,
                  fontSize: t.v >= 1024 ? 'clamp(18px,5vw,30px)' : t.v >= 128 ? 'clamp(20px,6vw,36px)' : 'clamp(24px,7vw,44px)',
                  boxShadow: t.v >= 8 ? `0 0 ${Math.min(30, Math.log2(t.v) * 3)}px ${bg}88` : undefined,
                }}
              >
                {t.v}
              </div>
            </div>
          );
        })}
        {(over || (won && !keepPlaying)) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-bg/80 backdrop-blur-sm animate-fade-up">
            <div className="text-5xl">{over ? '🧱' : '🏆'}</div>
            <div className="font-display text-3xl font-bold">{over ? 'No moves left' : 'You made 2048!'}</div>
            <div className="text-muted">Score: {score}</div>
            <div className="flex gap-2">
              {!over && (
                <button className="btn-primary" onClick={() => setKeepPlaying(true)}>Keep going</button>
              )}
              <button className={over ? 'btn-primary' : 'btn-ghost'} onClick={restart}>Play again</button>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted">Swipe on the board or use arrow keys / WASD. Your game is saved automatically.</p>
    </div>
  );
}
