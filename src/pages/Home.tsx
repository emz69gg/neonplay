import { Link } from 'react-router-dom';
import { DailyChallengesPanel, DailyLogin } from '../components/DailyPanels';
import GameCard, { GameGrid } from '../components/GameCard';
import GameThumb from '../components/GameThumb';
import SearchBox from '../components/SearchBox';
import { SectionHeader, XPBar } from '../components/ui';
import { CATEGORIES, dailyFeaturedGame, formatScore, GAME_MAP, GAMES } from '../lib/games';
import { levelFromXp, rankTitle } from '../lib/progression';
import type { GameId } from '../lib/types';
import { useStore } from '../store/AppStore';

const FEATURED: GameId[] = ['2048', 'snake', 'flappy', 'minesweeper'];
// Editorial popularity weights, blended with how often games are played on this profile.
const POPULARITY: Record<GameId, number> = { snake: 10, '2048': 9, flappy: 9, typing: 8, minesweeper: 7, reaction: 7, memory: 6, clicker: 6, tictactoe: 5, rps: 4, bricks: 8, blockstack: 9, wordguess: 8, connect4: 6, whack: 6, aim: 7, chess: 9 };

function Hero() {
  const daily = dailyFeaturedGame();
  const collage: GameId[] = ['2048', 'snake', 'flappy', 'memory', 'minesweeper', 'clicker'];
  return (
    <section className="relative overflow-hidden border-b border-line/60">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-neon-purple/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-neon-blue/25 blur-[120px]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          <span className="chip mb-5 !bg-neon-purple/15 !text-neon-purple">✨ {GAMES.length} free games · no downloads</span>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Your Next <span className="gradient-text">Favorite Game</span> Starts Here
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Jump straight into arcade classics, brain-bending puzzles and reflex tests. Earn XP, unlock badges and climb the leaderboards — right in your browser.
          </p>
          <div className="mt-7 max-w-xl">
            <SearchBox size="lg" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/game/${daily.id}`} className="btn-primary !px-6 !py-3 !text-base">▶ Play today’s pick: {daily.title}</Link>
            <Link to="/games" className="btn-outline !px-6 !py-3 !text-base">Browse all games</Link>
          </div>
        </div>
        <div className="relative hidden h-[420px] lg:block" aria-hidden>
          {collage.map((id, i) => {
            const pos = [
              'left-[6%] top-[4%] w-[46%] rotate-[-6deg]',
              'right-[2%] top-[0%] w-[44%] rotate-[5deg]',
              'left-[28%] top-[30%] w-[48%] rotate-[1deg] z-10',
              'left-[0%] bottom-[6%] w-[40%] rotate-[4deg]',
              'right-[0%] bottom-[2%] w-[42%] rotate-[-4deg]',
              'right-[30%] bottom-[-8%] w-[34%] rotate-[-8deg] opacity-80',
            ][i];
            return (
              <Link
                to={`/game/${id}`}
                key={id}
                tabIndex={-1}
                className={`absolute ${pos} animate-float overflow-hidden rounded-2xl border border-white/10 shadow-2xl transition-transform duration-300 hover:z-20 hover:scale-105`}
                style={{ animationDelay: `${i * 0.7}s` }}
              >
                <GameThumb id={id} className="block aspect-[16/10] w-full" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PlayerStrip() {
  const { data, user, openAuth } = useStore();
  const lvl = levelFromXp(data.xp);
  return (
    <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="font-display text-lg font-bold">Level {lvl}</span>
          <span className="chip">{rankTitle(lvl)}</span>
          <span className="ml-auto text-sm text-muted">{Object.keys(data.achievements).length} badges</span>
        </div>
        <XPBar xp={data.xp} />
      </div>
      {!user && (
        <div className="flex items-center gap-3 border-t border-line/60 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <p className="text-sm text-muted">Save progress across devices &amp; join the leaderboard.</p>
          <button className="btn-primary shrink-0" onClick={() => openAuth('register')}>Sign up free</button>
        </div>
      )}
    </div>
  );
}

function DailyFeatured() {
  const g = dailyFeaturedGame();
  const { data } = useStore();
  return (
    <Link to={`/game/${g.id}`} className="group card relative block overflow-hidden transition hover:border-neon-purple/60 hover:shadow-neon">
      <div className="grid md:grid-cols-[1.2fr_1fr]">
        <div className="relative overflow-hidden">
          <GameThumb id={g.id} className="block aspect-[16/9] w-full transition-transform duration-700 group-hover:scale-105 md:h-full" />
          <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">📅 Game of the day</span>
        </div>
        <div className="flex flex-col justify-center gap-3 p-6">
          <h3 className="font-display text-2xl font-bold sm:text-3xl">{g.title}</h3>
          <p className="text-muted">{g.description}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="btn-primary">▶ Play now</span>
            {data.highScores[g.id] !== undefined && <span className="text-sm font-semibold text-neon-purple">Your best: {formatScore(g, data.highScores[g.id])}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const { data } = useStore();
  const recent = data.recent.map((id) => GAME_MAP[id]).filter(Boolean).slice(0, 5);
  const favorites = data.favorites.map((id) => GAME_MAP[id]).filter(Boolean);
  const popular = [...GAMES].sort((a, b) => POPULARITY[b.id] + (data.plays[b.id] ?? 0) * 0.5 - (POPULARITY[a.id] + (data.plays[a.id] ?? 0) * 0.5)).slice(0, 5);
  const newest = [...GAMES].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 5);

  return (
    <>
      <Hero />
      <div className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-6">
        <PlayerStrip />

        {recent.length > 0 && (
          <section>
            <SectionHeader icon="⏱️" title="Continue playing" action={<Link to="/profile" className="text-sm font-semibold text-neon-purple hover:underline">History</Link>} />
            <GameGrid games={recent} />
          </section>
        )}

        <section>
          <SectionHeader icon="📅" title="Daily featured game" sub="A new pick every day" />
          <DailyFeatured />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <DailyLogin />
          <DailyChallengesPanel />
        </section>

        <section>
          <SectionHeader icon="⭐" title="Featured games" sub="Hand-picked favourites to start with" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURED.map((id, i) => (
              <GameCard key={id} game={GAME_MAP[id]} size="lg" index={i} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader icon="🔥" title="Popular games" action={<Link to="/games?sort=popular" className="text-sm font-semibold text-neon-purple hover:underline">See all</Link>} />
          <GameGrid games={popular} />
        </section>

        <section>
          <SectionHeader icon="🆕" title="Recently added" action={<Link to="/games?sort=new" className="text-sm font-semibold text-neon-purple hover:underline">See all</Link>} />
          <GameGrid games={newest} />
        </section>

        {favorites.length > 0 && (
          <section>
            <SectionHeader icon="❤️" title="Your favorites" />
            <GameGrid games={favorites} />
          </section>
        )}

        <section>
          <SectionHeader icon="🗂️" title="Categories" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CATEGORIES.map((c, i) => {
              const count = GAMES.filter((g) => g.category === c.id).length;
              const sample = GAMES.find((g) => g.category === c.id)!;
              return (
                <Link
                  key={c.id}
                  to={`/games?category=${c.id}`}
                  className="group card relative overflow-hidden p-5 transition hover:-translate-y-1 hover:border-neon-purple/60 hover:shadow-neon animate-fade-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30 blur-2xl transition group-hover:opacity-60" style={{ background: sample.gradient[0] }} />
                  <div className="text-3xl">{c.icon}</div>
                  <div className="mt-3 font-display text-lg font-bold">{c.label}</div>
                  <div className="text-xs text-muted">{c.blurb} · {count} game{count === 1 ? '' : 's'}</div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
