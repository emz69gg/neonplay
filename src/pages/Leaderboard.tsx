import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import GameThumb from '../components/GameThumb';
import { PlayerName } from '../components/Cosmetics';
import { AvatarBubble, EmptyState, Spinner } from '../components/ui';
import { chessEloLeaderboard, gameLeaderboard, isCloud, xpLeaderboard, type EloRow, type LeaderRow } from '../lib/backend';
import { formatScore, GAME_MAP, GAMES, isGameId } from '../lib/games';
import { levelFromXp } from '../lib/progression';
import { useStore } from '../store/AppStore';

export default function Leaderboard() {
  const [params, setParams] = useSearchParams();
  const sel = params.get('game');
  const elo = params.get('board') === 'elo';
  const game = !elo && isGameId(sel ?? undefined) ? GAME_MAP[sel as keyof typeof GAME_MAP] : null;
  const { user, data, openAuth } = useStore();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [eloRows, setEloRows] = useState<EloRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setErr(null);
    (elo
      ? chessEloLeaderboard().then((r) => {
          if (alive) setEloRows(r);
          return r.map((e): LeaderRow => ({ id: e.id, username: e.username, avatar: e.avatar, value: e.rating }));
        })
      : game
        ? gameLeaderboard(game.id)
        : xpLeaderboard()
    )
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [game, elo, data.xp, data.highScores]);

  const myId = user?.id ?? 'guest';
  const myRank = rows ? rows.findIndex((r) => r.id === myId) : -1;
  const fmt = (v: number) => (elo ? `${v} Elo` : game ? formatScore(game, v) : `${v.toLocaleString()} XP`);
  const eloOf = (id: string) => eloRows.find((e) => e.id === id);
  const podium = rows?.slice(0, 3) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">🏆 Leaderboards</h1>
          <p className="mt-1 text-muted">
            {isCloud ? 'Global rankings across all players.' : 'Rankings for players on this device. Connect Supabase to enable global rankings.'}
          </p>
        </div>
        {!user && (
          <button className="btn-primary" onClick={() => openAuth('register')}>Create an account to compete</button>
        )}
      </div>

      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
        <button onClick={() => setParams({})} className={`chip shrink-0 !px-3.5 !py-2 !text-sm ${!game && !elo ? '!bg-gradient-to-r from-neon-purple to-neon-blue !text-white' : ''}`}>⭐ Overall XP</button>
        <button onClick={() => setParams({ board: 'elo' })} className={`chip shrink-0 !px-3.5 !py-2 !text-sm ${elo ? '!bg-gradient-to-r from-neon-purple to-neon-blue !text-white' : ''}`}>♞ Chess Elo</button>
        {GAMES.map((g) => (
          <button key={g.id} onClick={() => setParams({ game: g.id })} className={`chip shrink-0 !py-1.5 !pl-1.5 !pr-3 !text-sm ${game?.id === g.id ? '!bg-gradient-to-r from-neon-purple to-neon-blue !text-white' : ''}`}>
            <GameThumb id={g.id} className="h-5 w-7 rounded" />
            {g.title}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {elo && (
          <p className="mb-4 text-sm text-muted">
            Ratings from rated online chess (🌐 Online → Quick match). Everyone starts at 1200; invite-link games are friendly and don’t count.
          </p>
        )}
        {elo && !isCloud ? (
          <EmptyState icon="🌐" title="Chess ratings need the online server" desc="Elo comes from online games against real players, which needs Supabase connected." />
        ) : err ? (
          <EmptyState icon="⚠️" title="Couldn’t load the leaderboard" desc={err} />
        ) : !rows ? (
          <div className="py-16"><Spinner label="Loading rankings…" /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="🏁"
            title={elo ? 'No rated games yet' : 'No scores yet'}
            desc={elo ? 'Play a rated online quick match to get the first chess rating.' : game ? `Nobody has a ${game.title} score yet. Set the first one!` : 'Play any game to get on the board.'}
            action={<Link to={elo ? '/game/chess' : game ? `/game/${game.id}` : '/games'} className="btn-primary">Play now</Link>}
          />
        ) : (
          <>
            {/* podium */}
            <div className="mb-6 grid grid-cols-3 items-end gap-3">
              {[1, 0, 2].map((idx) => {
                const r = podium[idx];
                if (!r) return <div key={idx} />;
                const h = idx === 0 ? 'pt-8 pb-6' : idx === 1 ? 'pt-6 pb-4' : 'pt-4 pb-3';
                const medal = ['🥇', '🥈', '🥉'][idx];
                return (
                  <div key={r.id} className={`card relative flex flex-col items-center text-center ${h} ${idx === 0 ? 'border-yellow-400/50 shadow-[0_0_40px_-10px_rgba(250,204,21,.5)]' : ''} ${r.id === myId ? 'ring-2 ring-neon-purple' : ''} animate-fade-up`}>
                    <span className="absolute -top-4 text-3xl">{medal}</span>
                    <AvatarBubble avatar={r.avatar} size={idx === 0 ? 64 : 52} />
                    <div className="mt-3 max-w-full px-2 font-bold"><PlayerName name={r.username} avatar={r.avatar} /></div>
                    <div className="font-mono text-sm font-bold text-neon-purple">{fmt(r.value)}</div>
                  </div>
                );
              })}
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface2/60 text-left text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="w-16 px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    {!game && !elo && <th className="hidden px-4 py-3 sm:table-cell">Level</th>}
                    {elo && <th className="hidden px-4 py-3 sm:table-cell">Games</th>}
                    {elo && <th className="hidden px-4 py-3 md:table-cell">W / L / D</th>}
                    {elo && <th className="hidden px-4 py-3 md:table-cell">Peak</th>}
                    <th className="px-4 py-3 text-right">{elo ? 'Rating' : game ? game.scoreLabel : 'XP'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={`border-t border-line/60 transition hover:bg-surface2/40 ${r.id === myId ? 'bg-neon-purple/10' : ''}`}>
                      <td className="px-4 py-3 font-mono font-bold text-muted">#{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <AvatarBubble avatar={r.avatar} size={32} />
                          <PlayerName name={r.username} avatar={r.avatar} className="font-semibold" />
                          {r.id === myId && <span className="chip !py-0 !text-[10px]">YOU</span>}
                        </div>
                      </td>
                      {!game && !elo && <td className="hidden px-4 py-3 sm:table-cell">Lv {r.level ?? levelFromXp(r.value)}</td>}
                      {elo && <td className="hidden px-4 py-3 sm:table-cell">{eloOf(r.id)?.games ?? 0}</td>}
                      {elo && (
                        <td className="hidden px-4 py-3 font-mono md:table-cell">
                          <span className="text-emerald-500">{eloOf(r.id)?.wins ?? 0}</span> / <span className="text-rose-500">{eloOf(r.id)?.losses ?? 0}</span> / {eloOf(r.id)?.draws ?? 0}
                        </td>
                      )}
                      {elo && <td className="hidden px-4 py-3 font-mono md:table-cell">{eloOf(r.id)?.peak ?? r.value}</td>}
                      <td className="px-4 py-3 text-right font-mono font-bold">{fmt(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!elo && myRank === -1 && (game ? data.highScores[game.id] !== undefined : data.totalPlays > 0) && (
              <p className="mt-3 text-center text-sm text-muted">
                {user ? 'Your score is outside the top 50 — keep playing!' : 'Guest scores only appear on this device. Sign up to join the rankings.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
