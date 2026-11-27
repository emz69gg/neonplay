import type { Avatar } from '../../lib/types';
import type { PlainMove } from './ChessBoard';
import type { GameResult, OnlineBackend, OnlineGame } from './online';

/* DEVELOPMENT ONLY: an in-browser imitation of the Supabase chess functions, so two tabs on one
 * machine can play each other without a server. Enable with localStorage 'neonplay:mockOnline' = '1'.
 * Each tab picks its user id from sessionStorage 'neonplay:mockUser'. Mirrors 004_online_chess.sql. */

const KEY = 'neonplay:mockChessGames';
const load = (): Record<string, OnlineGame> => JSON.parse(localStorage.getItem(KEY) || '{}');
const store = (all: Record<string, OnlineGame>) => localStorage.setItem(KEY, JSON.stringify(all));
const bc = new BroadcastChannel('neonplay-mock-chess');
const uid = () => {
  let u = sessionStorage.getItem('neonplay:mockUser');
  if (!u) {
    u = 'u-' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('neonplay:mockUser', u);
  }
  return u;
};
const now = () => Date.now();
const iso = () => new Date().toISOString();
const turnOf = (g: OnlineGame) => (g.moves.length % 2 === 0 ? 'w' : 'b');
const colorOf = (g: OnlineGame, u: string) => (g.white === u ? 'w' : g.black === u ? 'b' : null);
const elapsed = (g: OnlineGame) => (g.status !== 'active' || !g.last_move_at || g.moves.length < 2 ? 0 : Math.max(0, now() - Date.parse(g.last_move_at)));

function save(g: OnlineGame) {
  const all = load();
  g.updated_at = iso();
  all[g.id] = g;
  store(all);
  bc.postMessage({ type: 'update', game: g });
  return g;
}
const finish = (g: OnlineGame, winner: 'w' | 'b' | null, reason: string) => save({ ...g, status: 'finished', winner, result_reason: reason, draw_offer: null });

function newGame(t: number, priv: boolean, name: string, avatar: Avatar): OnlineGame {
  const u = uid();
  const white = Math.random() < 0.5;
  return save({
    id: crypto.randomUUID(),
    code: Math.random().toString(36).slice(2, 8).toUpperCase(),
    is_private: priv,
    status: 'waiting',
    created_by: u,
    white: white ? u : null,
    black: white ? null : u,
    white_name: white ? name : null,
    black_name: white ? null : name,
    white_avatar: white ? avatar : null,
    black_avatar: white ? null : avatar,
    time_ms: t,
    white_ms: t,
    black_ms: t,
    moves: [],
    last_move_at: null,
    draw_offer: null,
    winner: null,
    result_reason: null,
    updated_at: iso(),
  });
}

function takeSeat(g: OnlineGame, name: string, avatar: Avatar) {
  const u = uid();
  if (!g.white) Object.assign(g, { white: u, white_name: name, white_avatar: avatar });
  else Object.assign(g, { black: u, black_name: name, black_avatar: avatar });
  return save({ ...g, status: 'active', last_move_at: iso() });
}

const get = (id: string) => {
  const g = load()[id];
  if (!g) throw new Error('Game not found');
  return g;
};

export function mockBackend(): OnlineBackend {
  return {
    userId: async () => uid(),
    findMatch: async (t, name, avatar) => {
      const u = uid();
      const waiting = Object.values(load()).filter((g) => g.status === 'waiting' && !g.is_private && g.time_ms === t);
      const other = waiting.find((g) => g.created_by !== u);
      if (other) return takeSeat(other, name, avatar);
      const mine = waiting.find((g) => g.created_by === u);
      return mine ?? newGame(t, false, name, avatar);
    },
    createPrivate: async (t, name, avatar) => newGame(t, true, name, avatar),
    join: async (code, name, avatar) => {
      const g = Object.values(load()).find((x) => x.code === code.trim().toUpperCase());
      if (!g) throw new Error('Game not found — check the code');
      if (colorOf(g, uid())) return g;
      if (g.status !== 'waiting') throw new Error('That game has already started or ended');
      return takeSeat(g, name, avatar);
    },
    get: async (id) => load()[id] ?? null,
    myGames: async () => {
      const u = uid();
      return Object.values(load())
        .filter((g) => (g.white === u || g.black === u) && (g.status === 'waiting' || g.status === 'active'))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 6);
    },
    move: async (id, m: PlainMove, result?: GameResult) => {
      const g = get(id);
      const me = colorOf(g, uid());
      if (!me) throw new Error('You are not playing in this game');
      if (g.status !== 'active') throw new Error('This game is not in progress');
      if (turnOf(g) !== me) throw new Error('It is not your turn');
      const left = (me === 'w' ? g.white_ms : g.black_ms) - elapsed(g);
      if (left <= 0) return finish({ ...g, white_ms: me === 'w' ? 0 : g.white_ms, black_ms: me === 'b' ? 0 : g.black_ms }, me === 'w' ? 'b' : 'w', 'timeout');
      const ng = save({
        ...g,
        moves: [...g.moves, m.promo ? { from: m.from, to: m.to, promo: m.promo } : { from: m.from, to: m.to }],
        white_ms: me === 'w' ? left : g.white_ms,
        black_ms: me === 'b' ? left : g.black_ms,
        last_move_at: iso(),
        draw_offer: null,
      });
      if (result) return finish(ng, result.reason === 'checkmate' ? me : null, result.reason);
      return ng;
    },
    resign: async (id) => {
      const g = get(id);
      const me = colorOf(g, uid());
      if (!me || g.status !== 'active') throw new Error('You cannot resign this game');
      return finish(g, me === 'w' ? 'b' : 'w', 'resign');
    },
    offerDraw: async (id) => {
      const g = get(id);
      const me = colorOf(g, uid());
      if (!me || g.status !== 'active') throw new Error('You cannot offer a draw now');
      return save({ ...g, draw_offer: me });
    },
    answerDraw: async (id, accept) => {
      const g = get(id);
      const me = colorOf(g, uid());
      if (!me || g.status !== 'active' || !g.draw_offer || g.draw_offer === me) throw new Error('There is no draw offer to answer');
      return accept ? finish(g, null, 'agreement') : save({ ...g, draw_offer: null });
    },
    claimTimeout: async (id) => {
      const g = get(id);
      if (g.status !== 'active') return g;
      const t = turnOf(g);
      if (g.moves.length < 2) {
        if (g.last_move_at && now() - Date.parse(g.last_move_at) > 120000) return finish(g, t === 'w' ? 'b' : 'w', 'abandoned');
        return g;
      }
      const left = (t === 'w' ? g.white_ms : g.black_ms) - elapsed(g);
      return left <= 0 ? finish({ ...g, white_ms: t === 'w' ? 0 : g.white_ms, black_ms: t === 'b' ? 0 : g.black_ms }, t === 'w' ? 'b' : 'w', 'timeout') : g;
    },
    cancel: async (id) => {
      const g = load()[id];
      if (g && g.created_by === uid() && g.status === 'waiting') save({ ...g, status: 'cancelled' });
    },
    subscribe: (id, onGame, onPresence) => {
      const me = uid();
      const onMsg = (e: MessageEvent) => {
        if (e.data?.type === 'update' && e.data.game.id === id) onGame(e.data.game);
        if (e.data?.type === 'here' && e.data.id === id && e.data.user !== me) onPresence(true);
        if (e.data?.type === 'bye' && e.data.id === id && e.data.user !== me) onPresence(false);
        if (e.data?.type === 'ping' && e.data.id === id && e.data.user !== me) bc.postMessage({ type: 'here', id, user: me });
      };
      bc.addEventListener('message', onMsg);
      bc.postMessage({ type: 'ping', id, user: me });
      bc.postMessage({ type: 'here', id, user: me });
      return () => {
        bc.postMessage({ type: 'bye', id, user: me });
        bc.removeEventListener('message', onMsg);
      };
    },
  };
}
