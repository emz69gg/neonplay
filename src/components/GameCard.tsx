import { Link } from 'react-router-dom';
import { CATEGORIES, formatScore } from '../lib/games';
import type { GameMeta } from '../lib/types';
import { useStore } from '../store/AppStore';
import GameThumb from './GameThumb';

const NEW_DAYS = 21;

export default function GameCard({ game, size = 'md', index = 0 }: { game: GameMeta; size?: 'md' | 'lg'; index?: number }) {
  const { data, toggleFavorite } = useStore();
  const fav = data.favorites.includes(game.id);
  const best = data.highScores[game.id];
  const isNew = (Date.now() - new Date(game.addedAt).getTime()) / 86400000 < NEW_DAYS;
  const cat = CATEGORIES.find((c) => c.id === game.category)!;

  return (
    <div className="group relative animate-fade-up" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
      <Link
        to={`/game/${game.id}`}
        className="card block overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-neon-purple/60 hover:shadow-neon"
      >
        <div className="relative overflow-hidden">
          <GameThumb id={game.id} className={`block w-full transition-transform duration-500 group-hover:scale-[1.06] ${size === 'lg' ? 'aspect-[16/9]' : 'aspect-[16/10]'}`} />
          <div className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/30 group-hover:opacity-100">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-xl text-black shadow-xl transition-transform duration-300 group-hover:scale-100 scale-75">▶</span>
          </div>
          <div className="absolute left-2 top-2 flex gap-1.5">
            {isNew && <span className="rounded-md bg-neon-cyan px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black">New</span>}
          </div>
        </div>
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-bold leading-tight">{game.title}</h3>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">{game.tagline}</p>
          <div className="mt-2.5 flex items-center justify-between text-xs">
            <span className="chip !py-0.5">
              {cat.icon} {cat.label}
            </span>
            {best !== undefined && <span className="font-semibold text-neon-purple">Best {formatScore(game, best)}</span>}
          </div>
        </div>
      </Link>
      <button
        onClick={() => toggleFavorite(game.id)}
        aria-label={fav ? `Remove ${game.title} from favorites` : `Add ${game.title} to favorites`}
        aria-pressed={fav}
        className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition-all hover:scale-110 ${fav ? 'bg-white/95 text-pink-500' : 'bg-black/35 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100'}`}
      >
        {fav ? '♥' : '♡'}
      </button>
    </div>
  );
}

export function GameGrid({ games, cols = 'default' }: { games: GameMeta[]; cols?: 'default' | 'wide' }) {
  return (
    <div className={`grid gap-4 ${cols === 'wide' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
      {games.map((g, i) => (
        <GameCard key={g.id} game={g} index={i} />
      ))}
    </div>
  );
}
