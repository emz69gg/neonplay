import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import GameCard from '../components/GameCard';
import GameThumb from '../components/GameThumb';
import MiniLeaderboard from '../components/MiniLeaderboard';
import { Coin, Modal, Spinner } from '../components/ui';
import { GAME_COMPONENTS } from '../games';
import { CATEGORIES, formatScore, GAME_MAP, isGameId, relatedGames } from '../lib/games';
import { ACHIEVEMENTS } from '../lib/progression';
import type { FinishMeta, GameApi, GameId } from '../lib/types';
import { useStore, type FinishResult } from '../store/AppStore';
import NotFound from './NotFound';

export default function GamePage() {
  const { id } = useParams();
  if (!isGameId(id)) return <NotFound />;
  return <GameView key={id} id={id} />;
}

function GameView({ id }: { id: GameId }) {
  const game = GAME_MAP[id];
  const store = useStore();
  const { data, markOpened, toggleFavorite, settings, updateSettings } = store;
  const [score, setScore] = useState<number | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [fs, setFs] = useState(false);
  const [pseudoFs, setPseudoFs] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [last, setLast] = useState<(FinishResult & { k: number }) | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  const fsRef = useRef(false);
  fsRef.current = fs || pseudoFs;

  useEffect(() => {
    markOpened(id);
    document.title = `${game.title} — Play free online | NeonPlay`;
    return () => {
      document.title = 'NeonPlay — Free Online Minigames';
    };
  }, [id, game.title, markOpened]);

  useEffect(() => {
    const h = () => setFs(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), 5000);
    return () => clearTimeout(t);
  }, [last]);

  // Stable API object for the game: reads latest store via ref.
  const api = useMemo<GameApi>(
    () => ({
      setScore: (s) => setScore(s),
      finish: (s: number, meta?: FinishMeta) => {
        const r = storeRef.current.finishGame(id, s, meta);
        setLast({ ...r, k: Date.now() });
      },
      reportScore: (s) => storeRef.current.reportScore(id, s),
      reward: (r, reason) => storeRef.current.grant(r, reason),
      save: (d) => storeRef.current.saveGame(id, d),
      load: <T,>() => storeRef.current.data.saves[id] as T | undefined,
      get best() {
        return storeRef.current.data.highScores[id];
      },
      sound: (n) => storeRef.current.sound(n),
      get isFullscreen() {
        return fsRef.current;
      },
    }),
    [id],
  );

  const restart = useCallback(() => {
    if (id === 'clicker' && !confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    setFresh(true);
    setScore(null);
    setRunKey((k) => k + 1);
    store.sound('click');
  }, [id, confirmReset, store]);

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (pseudoFs) {
      setPseudoFs(false);
      return;
    }
    if (el.requestFullscreen && document.fullscreenEnabled) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        /* fall through to pseudo fullscreen */
      }
    }
    setPseudoFs(true);
  };

  useEffect(() => {
    if (!pseudoFs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPseudoFs(false);
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', esc);
    };
  }, [pseudoFs]);

  const Game = GAME_COMPONENTS[id];
  const best = data.highScores[id];
  const fav = data.favorites.includes(id);
  const cat = CATEGORIES.find((c) => c.id === game.category)!;
  const related = relatedGames(id, 4);
  const gameAchievements = ACHIEVEMENTS.filter((a) => a.game === id);
  const fullscreenActive = fs || pseudoFs;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <nav className="mb-4 flex items-center gap-2 text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-fg">Home</Link>
        <span>/</span>
        <Link to={`/games?category=${game.category}`} className="hover:text-fg">{cat.label}</Link>
        <span>/</span>
        <span className="text-fg">{game.title}</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <GameThumb id={id} className="h-14 w-20 rounded-xl shadow-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{game.title}</h1>
          <p className="text-sm text-muted">{game.tagline}</p>
        </div>
        <button onClick={() => toggleFavorite(id)} className={`btn ${fav ? 'bg-pink-500/15 text-pink-400' : 'btn-ghost'}`} aria-pressed={fav}>
          {fav ? '♥ Favorited' : '♡ Favorite'}
        </button>
      </div>

      {/* ---------- Game area ---------- */}
      <div
        ref={wrapRef}
        className={`game-fullscreen card overflow-hidden ${pseudoFs ? 'fixed inset-0 z-[80] flex flex-col rounded-none border-0' : ''}`}
      >
        <div className={`flex w-full flex-wrap items-center gap-2 border-b border-line/70 px-3 py-2.5 sm:px-4 ${fs ? 'max-w-5xl rounded-t-2xl bg-surface' : ''}`}>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-surface2 px-3 py-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{game.scoreLabel}</div>
              <div className="font-mono text-base font-bold leading-tight">{score === null ? '—' : formatScore(game, score)}</div>
            </div>
            <div className="rounded-xl bg-surface2 px-3 py-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Personal best</div>
              <div className="font-mono text-base font-bold leading-tight text-neon-purple">{formatScore(game, best)}</div>
            </div>
          </div>
          {last && (
            <div key={last.k} className="flex animate-pop items-center gap-2 rounded-xl bg-gradient-to-r from-neon-purple/20 to-neon-blue/20 px-3 py-1.5 text-sm font-semibold">
              {last.newBest && last.previousBest !== undefined && <span className="text-yellow-400">🏆 New best!</span>}
              {last.reward.xp > 0 && <span>+{last.reward.xp} XP</span>}
              {last.reward.coins > 0 && (
                <span className="flex items-center gap-1">
                  +{last.reward.coins} <Coin />
                </span>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button className="btn-ghost h-9 w-9 !p-0" onClick={() => updateSettings({ muted: !settings.muted })} aria-label={settings.muted ? 'Unmute' : 'Mute'} title={settings.muted ? 'Unmute' : 'Mute'}>
              {settings.muted ? '🔇' : '🔊'}
            </button>
            <button className="btn-ghost !py-2" onClick={restart} title="Restart">
              ↻ <span className="hidden sm:inline">Restart</span>
            </button>
            {game.fullscreen && (
              <button className="btn-ghost !py-2" onClick={toggleFullscreen} title="Fullscreen">
                {fullscreenActive ? '⤡' : '⤢'} <span className="hidden sm:inline">{fullscreenActive ? 'Exit' : 'Fullscreen'}</span>
              </button>
            )}
          </div>
        </div>
        <div className={`relative flex min-h-[420px] w-full items-center justify-center bg-bg/40 p-3 sm:p-6 ${pseudoFs ? 'flex-1 overflow-auto' : ''} ${fs ? 'max-w-5xl flex-1 rounded-b-2xl bg-surface' : ''}`}>
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex w-full justify-center">
            <Suspense fallback={<Spinner label="Loading game…" />}>
              <Game key={runKey} api={api} fresh={fresh} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ---------- Info ---------- */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-2 font-display text-xl font-bold">About {game.title}</h2>
            <p className="leading-relaxed text-muted">{game.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip">{cat.icon} {cat.label}</span>
              {game.tags.map((t) => (
                <Link key={t} to={`/games?q=${encodeURIComponent(t)}`} className="chip hover:text-fg">#{t}</Link>
              ))}
            </div>
          </section>
          <section className="card p-5 sm:p-6">
            <h2 className="mb-3 font-display text-xl font-bold">How to play</h2>
            <ol className="space-y-2.5">
              {game.instructions.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-neon-purple to-neon-blue text-xs font-bold text-white">{i + 1}</span>
                  <span className="text-muted">{s}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface2/70 p-3">
                <div className="text-xs font-bold text-muted">🖥️ Desktop</div>
                <div className="text-sm font-semibold">{game.controls.desktop}</div>
              </div>
              <div className="rounded-xl bg-surface2/70 p-3">
                <div className="text-xs font-bold text-muted">📱 Mobile</div>
                <div className="text-sm font-semibold">{game.controls.mobile}</div>
              </div>
            </div>
          </section>
          {gameAchievements.length > 0 && (
            <section className="card p-5 sm:p-6">
              <h2 className="mb-3 font-display text-xl font-bold">Achievements</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {gameAchievements.map((a) => {
                  const got = !!data.achievements[a.id];
                  return (
                    <div key={a.id} className={`flex items-center gap-3 rounded-xl border p-3 ${got ? 'border-yellow-400/40 bg-yellow-400/5' : 'border-line opacity-70'}`}>
                      <span className={`text-2xl ${got ? '' : 'grayscale'}`}>{a.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{a.title}</div>
                        <div className="text-xs text-muted">{a.desc}</div>
                      </div>
                      {got && <span className="ml-auto text-emerald-400">✓</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-display text-lg font-bold">Your stats</h2>
            <dl className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-surface2/70 p-3">
                <dt className="text-xs text-muted">Personal best</dt>
                <dd className="font-mono text-lg font-bold">{formatScore(game, best)}</dd>
              </div>
              <div className="rounded-xl bg-surface2/70 p-3">
                <dt className="text-xs text-muted">Rounds played</dt>
                <dd className="font-mono text-lg font-bold">{data.plays[id] ?? 0}</dd>
              </div>
            </dl>
          </section>
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Top players</h2>
              <Link to={`/leaderboard?game=${id}`} className="text-sm font-semibold text-neon-purple hover:underline">View all</Link>
            </div>
            <MiniLeaderboard game={id} />
          </section>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 font-display text-xl font-bold sm:text-2xl">You might also like</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {related.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
        </div>
      </section>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset your empire?">
        <p className="text-sm text-muted">Restarting Clicker Simulator wipes your balance, upgrades and generators. Your lifetime best on the leaderboard and any XP or coins you’ve already earned stay.</p>
        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button className="btn flex-1 bg-red-500 text-white hover:bg-red-600" onClick={restart}>Reset</button>
        </div>
      </Modal>
    </div>
  );
}
