import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchGames } from '../lib/games';
import GameThumb from './GameThumb';

export default function SearchBox({ size = 'md', autoFocus = false, onDone }: { size?: 'md' | 'lg'; autoFocus?: boolean; onDone?: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const results = q.trim() ? searchGames(q).slice(0, 6) : [];

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (path: string) => {
    nav(path);
    setOpen(false);
    setQ('');
    onDone?.();
  };

  const submit = () => {
    if (results[active] && q.trim()) go(`/game/${results[active].id}`);
    else go(`/games?q=${encodeURIComponent(q.trim())}`);
  };

  const big = size === 'lg';
  return (
    <div ref={ref} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        role="search"
      >
        <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${big ? 'left-5 text-lg' : 'left-3.5 text-sm'}`} aria-hidden>
          ⌕
        </span>
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search games, e.g. snake, puzzle, typing…"
          aria-label="Search games"
          className={`input ${big ? '!rounded-2xl !py-4 !pl-12 !text-base shadow-neon' : '!pl-9'}`}
        />
      </form>
      {open && q.trim() && (
        <div className="card absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden p-1.5 shadow-2xl animate-fade-up">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted">No games match “{q}”.</div>
          ) : (
            results.map((g, i) => (
              <button
                key={g.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/game/${g.id}`)}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${i === active ? 'bg-surface2' : ''}`}
              >
                <GameThumb id={g.id} className="h-9 w-14 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{g.title}</div>
                  <div className="truncate text-xs text-muted">{g.tagline}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
