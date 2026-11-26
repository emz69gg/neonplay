import { useSearchParams } from 'react-router-dom';
import { GameGrid } from '../components/GameCard';
import { EmptyState } from '../components/ui';
import { CATEGORIES, GAMES, searchGames } from '../lib/games';
import type { Category } from '../lib/types';
import { useStore } from '../store/AppStore';

type Sort = 'az' | 'new' | 'popular' | 'played';

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const { data } = useStore();
  const q = params.get('q') ?? '';
  const category = (params.get('category') as Category | 'favorites' | null) ?? null;
  const sort = (params.get('sort') as Sort) ?? 'popular';

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  let list = q ? searchGames(q) : GAMES;
  if (category === 'favorites') list = list.filter((g) => data.favorites.includes(g.id));
  else if (category) list = list.filter((g) => g.category === category);
  list = [...list].sort((a, b) => {
    if (sort === 'az') return a.title.localeCompare(b.title);
    if (sort === 'new') return b.addedAt.localeCompare(a.addedAt);
    if (sort === 'played') return (data.plays[b.id] ?? 0) - (data.plays[a.id] ?? 0);
    return GAMES.indexOf(a) - GAMES.indexOf(b);
  });

  const title = category === 'favorites' ? 'Your favorites' : category ? CATEGORIES.find((c) => c.id === category)?.label + ' games' : 'All games';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mt-1 text-muted">{list.length} game{list.length === 1 ? '' : 's'}{q && <> matching “{q}”</>}</p>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">⌕</span>
          <input className="input !pl-9" value={q} onChange={(e) => set('q', e.target.value || null)} placeholder="Filter games…" aria-label="Filter games" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <button onClick={() => set('category', null)} className={`chip shrink-0 !px-3.5 !py-2 !text-sm transition ${!category ? '!bg-gradient-to-r from-neon-purple to-neon-blue !text-white' : 'hover:!text-fg'}`}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => set('category', c.id)} className={`chip shrink-0 !px-3.5 !py-2 !text-sm transition ${category === c.id ? '!bg-gradient-to-r from-neon-purple to-neon-blue !text-white' : 'hover:!text-fg'}`}>
              {c.icon} {c.label}
            </button>
          ))}
          <button onClick={() => set('category', 'favorites')} className={`chip shrink-0 !px-3.5 !py-2 !text-sm transition ${category === 'favorites' ? '!bg-gradient-to-r from-pink-500 to-neon-purple !text-white' : 'hover:!text-fg'}`}>❤️ Favorites</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted lg:ml-auto">
          Sort
          <select className="input !w-auto !py-2" value={sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="popular">Featured</option>
            <option value="new">Newest</option>
            <option value="az">A–Z</option>
            <option value="played">Most played by you</option>
          </select>
        </label>
      </div>

      <div className="mt-6">
        {list.length ? (
          <GameGrid games={list} />
        ) : category === 'favorites' ? (
          <EmptyState icon="💜" title="No favorites yet" desc="Tap the heart on any game card to save it here." />
        ) : (
          <EmptyState icon="🔍" title="No games found" desc="Try a different search or category." action={<button className="btn-ghost" onClick={() => setParams({})}>Clear filters</button>} />
        )}
      </div>
    </div>
  );
}
