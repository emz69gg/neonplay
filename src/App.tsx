import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Home from './pages/Home';
import { AppStoreProvider, useStore } from './store/AppStore';

const Browse = lazy(() => import('./pages/Browse'));
const GamePage = lazy(() => import('./pages/GamePage'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Profile = lazy(() => import('./pages/Profile'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-5">
        <div className="grid h-16 w-16 animate-pulse place-items-center rounded-2xl bg-gradient-to-br from-neon-purple to-neon-blue shadow-neon">
          <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden><path d="M7 4.5v15l12-7.5z" fill="white" /></svg>
        </div>
        <Spinner size={28} label="Loading NeonPlay…" />
      </div>
    </div>
  );
}

function Shell() {
  const { ready } = useStore();
  if (!ready) return <Splash />;
  return (
    <Layout>
      <Suspense fallback={<div className="py-32"><Spinner label="Loading…" /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/games" element={<Browse />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppStoreProvider>
        <Shell />
      </AppStoreProvider>
    </HashRouter>
  );
}
