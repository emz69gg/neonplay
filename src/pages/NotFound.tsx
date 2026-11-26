import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <div className="font-display text-8xl font-black gradient-text">404</div>
      <h1 className="mt-4 font-display text-2xl font-bold">Game over… this page doesn’t exist</h1>
      <p className="mt-2 text-muted">The link might be broken or the page was moved.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/" className="btn-primary">Back home</Link>
        <Link to="/games" className="btn-ghost">Browse games</Link>
      </div>
    </div>
  );
}
