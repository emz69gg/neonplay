import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/backend';
import type { Avatar } from '../../lib/types';
import type { PlainMove } from './ChessBoard';

/* Online chess backend. Production talks to Supabase (see supabase/schema.sql);
 * development builds can swap in a local mock for testing two tabs on one machine. */

export interface OnlineGame {
  id: string;
  code: string;
  is_private: boolean;
  status: 'waiting' | 'active' | 'finished' | 'cancelled';
  created_by: string;
  white: string | null;
  black: string | null;
  white_name: string | null;
  black_name: string | null;
  white_avatar: Avatar | null;
  black_avatar: Avatar | null;
  time_ms: number;
  white_ms: number;
  black_ms: number;
  moves: PlainMove[];
  last_move_at: string | null;
  draw_offer: 'w' | 'b' | null;
  winner: 'w' | 'b' | null;
  result_reason: string | null;
  updated_at: string;
  rematch_id?: string | null;
  rematch_by?: 'w' | 'b' | null;
}

export type GameResult = { reason: 'checkmate' | 'stalemate' | 'insufficient' | 'fifty' | 'repetition' };

export interface OnlineBackend {
  userId: () => Promise<string | null>;
  findMatch: (timeMs: number, name: string, avatar: Avatar) => Promise<OnlineGame>;
  createPrivate: (timeMs: number, name: string, avatar: Avatar) => Promise<OnlineGame>;
  join: (code: string, name: string, avatar: Avatar) => Promise<OnlineGame>;
  get: (id: string) => Promise<OnlineGame | null>;
  myGames: () => Promise<OnlineGame[]>;
  move: (id: string, m: PlainMove, result?: GameResult) => Promise<OnlineGame>;
  resign: (id: string) => Promise<OnlineGame>;
  offerDraw: (id: string) => Promise<OnlineGame>;
  answerDraw: (id: string, accept: boolean) => Promise<OnlineGame>;
  claimTimeout: (id: string) => Promise<OnlineGame>;
  cancel: (id: string) => Promise<void>;
  /** Keeps a waiting game visible to matchmaking (call every few seconds). */
  heartbeat: (id: string) => Promise<OnlineGame | null>;
  /** Ask for (or accept) a rematch of a finished game. */
  rematch: (id: string, name: string, avatar: Avatar) => Promise<OnlineGame>;
  /** Live updates for one game + whether the opponent is connected. Returns an unsubscribe function. */
  subscribe: (
    id: string,
    onGame: (g: OnlineGame) => void,
    onPresence: (opponentOnline: boolean) => void,
    onStatus?: (live: boolean) => void,
  ) => () => void;
}

const asGame = (data: unknown): OnlineGame => {
  const g = (Array.isArray(data) ? data[0] : data) as OnlineGame | null;
  if (!g || !g.id) throw new Error('The server did not return a game');
  return { ...g, moves: Array.isArray(g.moves) ? g.moves : [] };
};

const friendly = (msg: string) =>
  /function .* does not exist|Could not find the function|relation .*chess_games.* does not exist|schema cache/i.test(msg)
    ? 'Online chess is not set up on the server yet (run supabase/schema.sql in Supabase).'
    : msg;

function supabaseBackend(): OnlineBackend {
  const sb = supabase!;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(friendly(error.message));
    return data;
  };
  return {
    userId: async () => (await sb.auth.getUser()).data.user?.id ?? null,
    findMatch: async (t, name, avatar) => asGame(await rpc('chess_find_match', { p_time_ms: t, p_name: name, p_avatar: avatar })),
    createPrivate: async (t, name, avatar) => asGame(await rpc('chess_new_game', { p_time_ms: t, p_private: true, p_name: name, p_avatar: avatar })),
    join: async (code, name, avatar) => asGame(await rpc('chess_join', { p_code: code, p_name: name, p_avatar: avatar })),
    get: async (id) => {
      // no built-in retries: our own polling/retry logic handles failures and must not stall
      const { data, error } = await sb.from('chess_games').select('*').eq('id', id).retry(false).maybeSingle();
      if (error) throw new Error(friendly(error.message));
      return data ? asGame(data) : null;
    },
    myGames: async () => {
      const uid = (await sb.auth.getUser()).data.user?.id;
      if (!uid) return [];
      const { data, error } = await sb
        .from('chess_games')
        .select('*')
        .or(`white.eq.${uid},black.eq.${uid}`)
        .in('status', ['waiting', 'active'])
        .order('updated_at', { ascending: false })
        .limit(6)
        .retry(false);
      if (error) throw new Error(friendly(error.message));
      return (data ?? []).map(asGame);
    },
    move: async (id, m, result) =>
      asGame(await rpc('chess_move', { p_id: id, p_from: m.from, p_to: m.to, p_promo: m.promo ?? null, p_result: result?.reason ?? null, p_winner: null })),
    resign: async (id) => asGame(await rpc('chess_resign', { p_id: id })),
    offerDraw: async (id) => asGame(await rpc('chess_offer_draw', { p_id: id })),
    answerDraw: async (id, accept) => asGame(await rpc('chess_answer_draw', { p_id: id, p_accept: accept })),
    claimTimeout: async (id) => asGame(await rpc('chess_claim_timeout', { p_id: id })),
    cancel: async (id) => {
      await rpc('chess_cancel', { p_id: id });
    },
    heartbeat: async (id) => {
      const data = await rpc('chess_heartbeat', { p_id: id });
      return data && (data as OnlineGame).id ? asGame(data) : null;
    },
    rematch: async (id, name, avatar) => asGame(await rpc('chess_rematch', { p_id: id, p_name: name, p_avatar: avatar })),
    subscribe: (id, onGame, onPresence, onStatus) => {
      let channel: RealtimeChannel | null = null;
      let stopped = false;
      (async () => {
        const uid = (await sb.auth.getUser()).data.user?.id ?? 'anon';
        if (stopped) return;
        channel = sb
          .channel(`chess:${id}`, { config: { presence: { key: uid } } })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chess_games', filter: `id=eq.${id}` }, (payload) => {
            try {
              onGame(asGame(payload.new));
            } catch {
              /* ignore malformed payloads */
            }
          })
          .on('presence', { event: 'sync' }, () => {
            const keys = Object.keys(channel?.presenceState() ?? {});
            onPresence(keys.some((k) => k !== uid));
          })
          .subscribe(async (status) => {
            onStatus?.(status === 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') await channel?.track({ at: Date.now() });
          });
      })();
      return () => {
        stopped = true;
        onStatus?.(false);
        if (channel) void sb.removeChannel(channel);
      };
    },
  };
}

let cached: Promise<OnlineBackend | null> | null = null;

/** Returns the online backend, or null when online play isn't available in this build. */
export function getOnlineBackend(): Promise<OnlineBackend | null> {
  if (cached) return cached;
  cached = (async () => {
    if (import.meta.env.DEV) {
      try {
        if (localStorage.getItem('neonplay:mockOnline') === '1') return (await import('./onlineMock')).mockBackend();
      } catch {
        /* ignore */
      }
    }
    return supabase ? supabaseBackend() : null;
  })();
  return cached;
}
