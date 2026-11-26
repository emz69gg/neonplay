import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { isCloud } from '../lib/backend';
import { CATEGORIES } from '../lib/games';
import { levelFromXp } from '../lib/progression';
import { useStore } from '../store/AppStore';
import AuthModal from './AuthModal';
import SearchBox from './SearchBox';
import SettingsModal from './SettingsModal';
import { AvatarBubble, Coin, XPBar } from './ui';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="NeonPlay home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-neon-purple to-neon-blue shadow-neon">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path d="M7 4.5v15l12-7.5z" fill="white" />
        </svg>
      </span>
      <span className="font-display text-xl font-bold tracking-tight">
        Neon<span className="gradient-text">Play</span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/games', label: 'Games', icon: '🎮' },
  { to: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

function UserMenu() {
  const { user, data, openAuth, logout, openSettings } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const lvl = levelFromXp(data.xp);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition hover:bg-surface2 sm:pr-3" aria-haspopup="menu" aria-expanded={open}>
        <div className="relative">
          <AvatarBubble avatar={data.avatar} size={36} />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-gradient-to-r from-neon-purple to-neon-blue px-1.5 text-[10px] font-extrabold text-white ring-2 ring-bg">{lvl}</span>
        </div>
        <span className="hidden max-w-[110px] truncate text-sm font-semibold sm:block">{data.username}</span>
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-50 mt-2 w-64 p-2 shadow-2xl animate-fade-up" role="menu">
          <div className="px-3 py-2">
            <div className="font-semibold">{data.username}</div>
            <div className="text-xs text-muted">{user ? (user.provider === 'supabase' ? 'Cloud account' : 'Account on this device') : 'Guest — progress saved in this browser'}</div>
            <div className="mt-2.5">
              <XPBar xp={data.xp} />
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          {[
            ['/profile', '👤 Profile'],
            ['/profile#achievements', '🏅 Achievements'],
            ['/leaderboard', '🏆 Leaderboards'],
          ].map(([to, label]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface2" role="menuitem">
              {label}
            </Link>
          ))}
          <button onClick={() => { openSettings(true); setOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2" role="menuitem">
            ⚙️ Settings
          </button>
          <div className="my-1 h-px bg-line" />
          {user ? (
            <button onClick={() => { void logout(); setOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-surface2" role="menuitem">
              ↩ Log out
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-1">
              <button className="btn-ghost !py-2" onClick={() => { openAuth('login'); setOpen(false); }}>Log in</button>
              <button className="btn-primary !py-2" onClick={() => { openAuth('register'); setOpen(false); }}>Sign up</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Navbar() {
  const { data, settings, updateSettings, openSettings, user, openAuth, sound } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setSearchOpen(false), [loc.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.slice(0, 3).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-surface2 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto hidden w-full max-w-xs md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 md:ml-0">
          <button className="btn-ghost h-9 w-9 !p-0 md:hidden" onClick={() => setSearchOpen((s) => !s)} aria-label="Search">⌕</button>
          <Link to="/profile" className="hidden items-center gap-1.5 rounded-full bg-surface2 px-3 py-1.5 text-sm font-bold sm:flex" title="Your coins">
            <Coin /> {data.coins.toLocaleString()}
          </Link>
          <button
            className="btn-ghost h-9 w-9 !p-0"
            onClick={() => {
              updateSettings({ muted: !settings.muted });
              if (settings.muted) setTimeout(() => sound('click'), 0);
            }}
            aria-label={settings.muted ? 'Unmute sound' : 'Mute sound'}
            title={settings.muted ? 'Unmute' : 'Mute'}
          >
            {settings.muted ? '🔇' : '🔊'}
          </button>
          <button className="btn-ghost hidden h-9 w-9 !p-0 sm:grid" onClick={() => openSettings(true)} aria-label="Settings" title="Settings">⚙️</button>
          {!user && (
            <button className="btn-primary hidden !py-2 sm:inline-flex" onClick={() => openAuth('register')}>
              Sign up
            </button>
          )}
          <UserMenu />
        </div>
      </div>
      {searchOpen && (
        <div className="border-t border-line/60 px-4 py-3 md:hidden">
          <SearchBox autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  );
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Mobile">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${isActive ? 'text-neon-purple' : 'text-muted'}`}
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line/60 pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">Free browser minigames. No downloads, no installs — play instantly, earn XP and climb the leaderboards.</p>
          <p className="mt-3 text-xs text-muted">{isCloud ? '☁️ Cloud saves enabled' : '💾 Progress is saved in this browser'}</p>
        </div>
        <div>
          <div className="mb-3 text-sm font-bold">Categories</div>
          <ul className="space-y-2 text-sm text-muted">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <Link to={`/games?category=${c.id}`} className="hover:text-fg">{c.icon} {c.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-bold">Explore</div>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link to="/games" className="hover:text-fg">All games</Link></li>
            <li><Link to="/leaderboard" className="hover:text-fg">Leaderboards</Link></li>
            <li><Link to="/profile" className="hover:text-fg">Your profile</Link></li>
            <li><Link to="/profile#achievements" className="hover:text-fg">Achievements</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line/60 py-5 text-center text-xs text-muted">© {new Date().getFullYear()} NeonPlay. Made for fun.</div>
    </footer>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  const tone = { default: 'border-line', gold: 'border-yellow-400/50', success: 'border-emerald-400/50', error: 'border-red-400/60' };
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-[70] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2 lg:bottom-5 lg:right-5" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`card pointer-events-auto flex items-center gap-3 border-l-4 px-4 py-3 text-left shadow-2xl animate-fade-up ${tone[t.tone ?? 'default']}`}
        >
          <span className="text-2xl">{t.icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">{t.title}</span>
            {t.desc && <span className="block truncate text-xs text-muted">{t.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  useEffect(() => {
    if (loc.hash) {
      const el = document.getElementById(loc.hash.slice(1));
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main key={loc.pathname} className="flex-1 animate-fade-up">{children}</main>
      <Footer />
      <MobileNav />
      <Toasts />
      <AuthModal />
      <SettingsModal />
    </div>
  );
}
