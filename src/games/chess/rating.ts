import { useEffect, useState } from 'react';
import { chessRatingOf, type ChessRating } from '../../lib/backend';
import { useStore } from '../../store/AppStore';
import { getOnlineBackend } from './online';

/** The signed-in player's online chess rating, or null (guest, offline, or not set up). */
export function useChessRating(refreshKey: unknown = 0): ChessRating | null {
  const { user } = useStore();
  const loggedIn = user?.provider === 'supabase';
  const [rating, setRating] = useState<ChessRating | null>(null);
  useEffect(() => {
    let alive = true;
    if (!loggedIn) {
      setRating(null);
      return;
    }
    getOnlineBackend()
      .then((b) => b?.userId())
      .then((id) => (id ? chessRatingOf(id) : null))
      .then((r) => alive && setRating(r))
      .catch(() => alive && setRating(null));
    return () => {
      alive = false;
    };
  }, [loggedIn, user?.id, refreshKey]);
  return rating;
}
