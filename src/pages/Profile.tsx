import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DailyChallengesPanel } from '../components/DailyPanels';
import { GameGrid } from '../components/GameCard';
import GameThumb from '../components/GameThumb';
import { AvatarBubble, Coin, EmptyState, XPBar } from '../components/ui';
import { isCloud } from '../lib/backend';
import { formatScore, GAME_MAP, GAMES } from '../lib/games';
import { ACHIEVEMENTS, AVATAR_COLORS, AVATARS, COLOR_COST, levelFromXp, rankTitle } from '../lib/progression';
import { bannerStyle, PlayerName } from '../components/Cosmetics';
import { useChessRating } from '../games/chess/rating';
import { useStore } from '../store/AppStore';

function ChessRatingCard() {
  const r = useChessRating();
  if (!r) return null;
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">♞ Chess rating</h2>
        <Link to="/leaderboard?board=elo" className="text-xs font-semibold text-neon-purple hover:underline">Elo leaderboard →</Link>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <span className="font-mono text-4xl font-bold text-neon-purple">{r.rating}</span>
        <span className="pb-1 text-sm text-muted">{r.games ? `peak ${r.peak}` : 'provisional — play a rated quick match'}</span>
      </div>
      {r.games > 0 && (
        <div className="mt-2 text-sm">
          {r.games} rated games · <span className="text-emerald-500">{r.wins}W</span> <span className="text-rose-500">{r.losses}L</span> {r.draws}D
        </div>
      )}
      <Link to="/game/chess" className="btn-ghost mt-3 w-full !py-2 text-sm">Play or train with bots</Link>
    </section>
  );
}

function NameEditor() {
  const { data, setUsername } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.username);
  const [err, setErr] = useState<string | null>(null);
  if (!editing)
    return (
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 font-display text-3xl font-bold"><PlayerName name={data.username} avatar={data.avatar} /></h1>
        <button className="btn-ghost h-8 w-8 !p-0 text-sm" onClick={() => { setName(data.username); setEditing(true); }} aria-label="Edit username">✏️</button>
      </div>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await setUsername(name);
        if (r) setErr(r);
        else {
          setErr(null);
          setEditing(false);
        }
      }}
    >
      <input className="input !w-48" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={16} aria-label="Username" />
      <button className="btn-primary !py-2">Save</button>
      <button type="button" className="btn-ghost !py-2" onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>
      {err && <span className="w-full text-sm text-red-400">{err}</span>}
    </form>
  );
}

function AvatarShop() {
  const { data, setAvatar, toast } = useStore();
  const [draft, setDraft] = useState(data.avatar);
  const owned = (k: string, cost: number) => cost === 0 || data.unlocks.includes(k);
  const emojiCost = AVATARS.find((a) => a.emoji === draft.emoji)?.cost ?? 0;
  const colorCost = COLOR_COST[draft.color] ?? 0;
  const due = (owned(`emoji:${draft.emoji}`, emojiCost) ? 0 : emojiCost) + (owned(`color:${draft.color}`, colorCost) ? 0 : colorCost);
  const changed = draft.emoji !== data.avatar.emoji || draft.color !== data.avatar.color;

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Avatar studio</h2>
          <p className="text-sm text-muted">Spend coins you earn from playing to unlock new looks.</p>
        </div>
        <AvatarBubble avatar={draft} size={56} ring />
      </div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Character</div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        {AVATARS.map((a) => {
          const has = owned(`emoji:${a.emoji}`, a.cost);
          return (
            <button
              key={a.emoji}
              onClick={() => setDraft({ ...draft, emoji: a.emoji })}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border text-2xl transition hover:scale-105 ${draft.emoji === a.emoji ? 'border-neon-purple bg-neon-purple/15' : 'border-line bg-surface2/50'}`}
              aria-label={`${a.emoji}${has ? '' : `, costs ${a.cost} coins`}`}
            >
              <span className={has ? '' : 'opacity-60'}>{a.emoji}</span>
              {!has && <span className="absolute bottom-0.5 flex items-center gap-0.5 text-[9px] font-bold text-yellow-400">{a.cost}</span>}
            </button>
          );
        })}
      </div>
      <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-muted">Background</div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(AVATAR_COLORS).map(([k, [a, b]]) => {
          const cost = COLOR_COST[k] ?? 0;
          const has = owned(`color:${k}`, cost);
          return (
            <button
              key={k}
              onClick={() => setDraft({ ...draft, color: k })}
              className={`relative h-11 w-11 rounded-full transition hover:scale-110 ${draft.color === k ? 'ring-2 ring-neon-purple ring-offset-2 ring-offset-surface' : ''}`}
              style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
              aria-label={`${k} background${has ? '' : `, costs ${cost} coins`}`}
            >
              {!has && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/80 px-1 text-[9px] font-bold text-yellow-400">{cost}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          disabled={!changed}
          onClick={() => {
            const r = setAvatar(draft);
            if (!r.ok) toast({ icon: '🪙', title: 'Not enough coins', desc: r.error, tone: 'error' });
          }}
        >
          {due > 0 ? <>Unlock &amp; equip for {due} <Coin /></> : 'Equip'}
        </button>
        <span className="flex items-center gap-1 text-sm text-muted">You have <Coin /> <b className="text-fg">{data.coins.toLocaleString()}</b></span>
        <Link to="/shop" className="text-sm font-semibold text-neon-purple hover:underline">Frames, pets, effects &amp; more in the Shop →</Link>
      </div>
    </section>
  );
}

export default function Profile() {
  const { data, user, openAuth, logout } = useStore();
  const lvl = levelFromXp(data.xp);
  const unlocked = ACHIEVEMENTS.filter((a) => data.achievements[a.id]).length;
  const recent = data.recent.map((g) => GAME_MAP[g]).filter(Boolean);
  const favs = data.favorites.map((g) => GAME_MAP[g]).filter(Boolean);
  const tierCls = { bronze: 'from-amber-700 to-amber-500', silver: 'from-slate-400 to-slate-200', gold: 'from-yellow-500 to-amber-300' };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* header */}
      <section className="card relative overflow-hidden p-6" style={bannerStyle(data.avatar.bg)}>
        <div className={`pointer-events-none absolute inset-0 ${data.avatar.bg ? 'bg-gradient-to-r from-bg/85 via-bg/55 to-bg/20' : 'bg-gradient-to-br from-neon-purple/15 via-transparent to-neon-blue/15'}`} />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="px-3 pt-4"><AvatarBubble avatar={data.avatar} size={96} ring /></div>
          <div className="min-w-0 flex-1">
            <NameEditor />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="chip !bg-neon-purple/15 !text-neon-purple">Level {lvl} · {rankTitle(lvl)}</span>
              <span>{user ? (user.provider === 'supabase' ? `☁️ ${user.email ?? 'Cloud account'}` : '💾 Account on this device') : '👤 Guest player'}</span>
              <span>· Joined {new Date(data.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="mt-4 max-w-md">
              <XPBar xp={data.xp} />
            </div>
          </div>
          <div className="flex gap-2 sm:flex-col">
            {user ? (
              <button className="btn-ghost" onClick={() => void logout()}>Log out</button>
            ) : (
              <>
                <button className="btn-primary" onClick={() => openAuth('register')}>Create account</button>
                <button className="btn-ghost" onClick={() => openAuth('login')}>Log in</button>
              </>
            )}
          </div>
        </div>
        {!user && (
          <p className="relative mt-4 rounded-xl bg-surface2/70 px-4 py-2.5 text-sm text-muted">
            Your guest progress is saved in this browser. {isCloud ? 'Create an account to sync it across devices' : 'Create an account to keep it under your own name'} and appear on the leaderboard.
          </p>
        )}
      </section>

      {/* stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['🪙', 'Coins', data.coins.toLocaleString()],
          ['🎮', 'Games played', data.totalPlays.toLocaleString()],
          ['🏅', 'Achievements', `${unlocked} / ${ACHIEVEMENTS.length}`],
          ['🔥', 'Login streak', `${data.login.streak} day${data.login.streak === 1 ? '' : 's'}`],
        ].map(([icon, label, v]) => (
          <div key={label} className="card p-4">
            <div className="text-2xl">{icon}</div>
            <div className="mt-2 font-mono text-2xl font-bold">{v}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* high scores */}
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 font-display text-xl font-bold">Personal bests</h2>
          <ul className="divide-y divide-line/60">
            {GAMES.map((g) => (
              <li key={g.id}>
                <Link to={`/game/${g.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                  <GameThumb id={g.id} className="h-9 w-14 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{g.title}</span>
                    <span className="block text-xs text-muted">{data.plays[g.id] ?? 0} rounds</span>
                  </span>
                  <span className={`font-mono text-sm font-bold ${data.highScores[g.id] !== undefined ? 'text-neon-purple' : 'text-muted'}`}>{formatScore(g, data.highScores[g.id])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-6">
          <ChessRatingCard />
          <DailyChallengesPanel />
          <AvatarShop />
        </div>
      </div>

      {/* achievements */}
      <section id="achievements" className="card scroll-mt-24 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Achievements &amp; badges</h2>
          <span className="chip">{unlocked} / {ACHIEVEMENTS.length} unlocked</span>
        </div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-surface2">
          <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-300 transition-[width] duration-700" style={{ width: `${(unlocked / ACHIEVEMENTS.length) * 100}%` }} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const at = data.achievements[a.id];
            return (
              <div key={a.id} className={`flex items-center gap-3 rounded-xl border p-3 transition ${at ? 'border-yellow-400/30 bg-yellow-400/5' : 'border-line/70 bg-surface2/30'}`}>
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-2xl ${at ? tierCls[a.tier] : 'from-surface2 to-line grayscale'}`}>
                  <span className={at ? '' : 'opacity-40'}>{at ? a.icon : '🔒'}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold">{a.title}</span>
                    <span className="text-[10px] font-bold uppercase text-muted">{a.tier}</span>
                  </div>
                  <div className="text-xs text-muted">{a.desc}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {at ? `Unlocked ${new Date(at).toLocaleDateString()}` : `Reward: ${a.reward.coins ? `${a.reward.coins} coins` : ''}${a.reward.coins && a.reward.xp ? ' · ' : ''}${a.reward.xp ? `${a.reward.xp} XP` : ''}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-bold">Recently played</h2>
        {recent.length ? <GameGrid games={recent.slice(0, 10)} /> : <EmptyState icon="🕹️" title="Nothing played yet" desc="Your recently played games will show up here." action={<Link to="/games" className="btn-primary">Find a game</Link>} />}
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-bold">Favorite games</h2>
        {favs.length ? <GameGrid games={favs} /> : <EmptyState icon="💜" title="No favorites yet" desc="Tap the heart on any game to keep it close." />}
      </section>
    </div>
  );
}
