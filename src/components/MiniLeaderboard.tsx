import { useEffect, useState } from 'react';
import { gameLeaderboard, isCloud, type LeaderRow } from '../lib/backend';
import { formatScore, GAME_MAP } from '../lib/games';
import type { GameId } from '../lib/types';
import { useStore } from '../store/AppStore';
import { AvatarBubble } from './ui';

export default function MiniLeaderboard({ game, limit = 5 }: { game: GameId; limit?: number }) {
  const { data, user } = useStore();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const best = data.highScores[game];

  useEffect(() => {
    let alive = true;
    // small delay so a freshly-saved score is included
    const t = setTimeout(() => {
      gameLeaderboard(game, limit)
        .then((r) => alive && (setRows(r), setErr(null)))
        .catch((e) => alive && setErr(e.message));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [game, limit, best]);

  const myId = user?.id ?? 'guest';
  const meta = GAME_MAP[game];

  if (err) return <p className="text-sm text-muted">Couldn’t load leaderboard: {err}</p>;
  if (!rows)
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-10" />
        ))}
      </div>
    );
  if (!rows.length) return <p className="text-sm text-muted">No scores yet — be the first{isCloud ? '' : ' on this device'}!</p>;
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={r.id} className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${r.id === myId ? 'bg-neon-purple/15 ring-1 ring-neon-purple/40' : ''}`}>
          <span className={`w-6 text-center font-mono text-sm font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-muted'}`}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
          <AvatarBubble avatar={r.avatar} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.username}</span>
          <span className="font-mono text-sm font-bold">{formatScore(meta, r.value)}</span>
        </li>
      ))}
    </ol>
  );
}
