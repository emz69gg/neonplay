/* ------------------------------------------------------------------
 * Chess rules engine: legal move generation (castling, en passant,
 * promotion), check / checkmate / stalemate, draw rules and SAN.
 * Board: 64 squares, index = rank * 8 + file, rank 0 = the 8th rank
 * (top of the board from White's side). White pieces are upper-case.
 * ------------------------------------------------------------------ */

export type Color = 'w' | 'b';
export type PieceChar = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Sq = PieceChar | '';
export type Promo = 'q' | 'r' | 'b' | 'n';

export interface Move {
  from: number;
  to: number;
  piece: PieceChar;
  captured: Sq;
  promo?: Promo;
  flag?: 'ep' | 'castleK' | 'castleQ' | 'double';
}

export interface State {
  board: Sq[];
  turn: Color;
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
  ep: number; // en-passant target square or -1
  half: number; // half-move clock (50-move rule)
  full: number;
}

interface Undo {
  castling: State['castling'];
  ep: number;
  half: number;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const colorOf = (p: Sq): Color | null => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');
export const fileOf = (sq: number) => sq & 7;
export const rankOf = (sq: number) => sq >> 3;
export const sqName = (sq: number) => 'abcdefgh'[fileOf(sq)] + (8 - rankOf(sq));
export const sqFromName = (n: string) => (8 - Number(n[1])) * 8 + 'abcdefgh'.indexOf(n[0]);

export function fromFen(fen: string): State {
  const [pos, turn, cast, ep, half, full] = fen.trim().split(/\s+/);
  const board: Sq[] = [];
  for (const ch of pos.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push('');
    else board.push(ch as PieceChar);
  }
  return {
    board,
    turn: turn as Color,
    castling: { K: cast.includes('K'), Q: cast.includes('Q'), k: cast.includes('k'), q: cast.includes('q') },
    ep: ep && ep !== '-' ? sqFromName(ep) : -1,
    half: Number(half ?? 0),
    full: Number(full ?? 1),
  };
}

export function toFen(s: State): string {
  let out = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f];
      if (!p) empty++;
      else {
        if (empty) out += empty;
        empty = 0;
        out += p;
      }
    }
    if (empty) out += empty;
    if (r < 7) out += '/';
  }
  const c = s.castling;
  const cast = (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') || '-';
  return `${out} ${s.turn} ${cast} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
}

/** Position key for repetition detection (no move counters). */
export const positionKey = (s: State) => toFen(s).split(' ').slice(0, 4).join(' ');

export const cloneState = (s: State): State => ({ ...s, board: [...s.board], castling: { ...s.castling } });

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** Is square `sq` attacked by side `by`? */
export function isAttacked(board: Sq[], sq: number, by: Color): boolean {
  const r = rankOf(sq), f = fileOf(sq);
  const up = by === 'w';
  // pawns: a white pawn attacks towards rank-1 (upwards), so it sits one rank below (r+1)
  const pr = up ? r + 1 : r - 1;
  const pawn = up ? 'P' : 'p';
  if (pr >= 0 && pr < 8) {
    if (f > 0 && board[pr * 8 + f - 1] === pawn) return true;
    if (f < 7 && board[pr * 8 + f + 1] === pawn) return true;
  }
  const kn = up ? 'N' : 'n';
  for (const [dr, df] of KNIGHT) {
    const rr = r + dr, ff = f + df;
    if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === kn) return true;
  }
  const kg = up ? 'K' : 'k';
  for (const [dr, df] of KING) {
    const rr = r + dr, ff = f + df;
    if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === kg) return true;
  }
  const rq = up ? ['R', 'Q'] : ['r', 'q'];
  for (const [dr, df] of ROOK_D) {
    let rr = r + dr, ff = f + df;
    while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
      const p = board[rr * 8 + ff];
      if (p) {
        if (p === rq[0] || p === rq[1]) return true;
        break;
      }
      rr += dr;
      ff += df;
    }
  }
  const bq = up ? ['B', 'Q'] : ['b', 'q'];
  for (const [dr, df] of BISHOP_D) {
    let rr = r + dr, ff = f + df;
    while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
      const p = board[rr * 8 + ff];
      if (p) {
        if (p === bq[0] || p === bq[1]) return true;
        break;
      }
      rr += dr;
      ff += df;
    }
  }
  return false;
}

export const kingSquare = (board: Sq[], c: Color) => board.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (s: State, c: Color = s.turn) => isAttacked(s.board, kingSquare(s.board, c), c === 'w' ? 'b' : 'w');

function pseudoMoves(s: State, capturesOnly = false): Move[] {
  const { board, turn } = s;
  const moves: Move[] = [];
  const enemy: Color = turn === 'w' ? 'b' : 'w';
  const add = (from: number, to: number, flag?: Move['flag']) => {
    const piece = board[from] as PieceChar;
    const captured = board[to];
    if ((piece === 'P' && rankOf(to) === 0) || (piece === 'p' && rankOf(to) === 7)) {
      for (const promo of ['q', 'r', 'b', 'n'] as Promo[]) moves.push({ from, to, piece, captured, promo });
    } else moves.push({ from, to, piece, captured, flag });
  };
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || colorOf(p) !== turn) continue;
    const r = rankOf(sq), f = fileOf(sq);
    const type = p.toLowerCase();
    if (type === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const startRank = turn === 'w' ? 6 : 1;
      const one = sq + dir * 8;
      if (!capturesOnly && r + dir >= 0 && r + dir < 8 && !board[one]) {
        add(sq, one);
        const two = sq + dir * 16;
        if (r === startRank && !board[two]) add(sq, two, 'double');
      }
      // promotions count as "noisy" even without a capture
      if (capturesOnly && r + dir >= 0 && r + dir < 8 && !board[one] && (r + dir === 0 || r + dir === 7)) add(sq, one);
      for (const df of [-1, 1]) {
        const ff = f + df, rr = r + dir;
        if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        const to = rr * 8 + ff;
        if (board[to] && colorOf(board[to]) === enemy) add(sq, to);
        else if (to === s.ep) moves.push({ from: sq, to, piece: p as PieceChar, captured: turn === 'w' ? 'p' : 'P', flag: 'ep' });
      }
    } else if (type === 'n' || type === 'k') {
      for (const [dr, df] of type === 'n' ? KNIGHT : KING) {
        const rr = r + dr, ff = f + df;
        if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
        const to = rr * 8 + ff;
        const t = board[to];
        if (t && colorOf(t) === turn) continue;
        if (capturesOnly && !t) continue;
        add(sq, to);
      }
      if (type === 'k' && !capturesOnly) {
        const home = turn === 'w' ? 60 : 4;
        if (sq === home && !isAttacked(board, home, enemy)) {
          const canK = turn === 'w' ? s.castling.K : s.castling.k;
          const canQ = turn === 'w' ? s.castling.Q : s.castling.q;
          const rook = turn === 'w' ? 'R' : 'r';
          if (canK && !board[home + 1] && !board[home + 2] && board[home + 3] === rook && !isAttacked(board, home + 1, enemy) && !isAttacked(board, home + 2, enemy))
            moves.push({ from: home, to: home + 2, piece: p as PieceChar, captured: '', flag: 'castleK' });
          if (canQ && !board[home - 1] && !board[home - 2] && !board[home - 3] && board[home - 4] === rook && !isAttacked(board, home - 1, enemy) && !isAttacked(board, home - 2, enemy))
            moves.push({ from: home, to: home - 2, piece: p as PieceChar, captured: '', flag: 'castleQ' });
        }
      }
    } else {
      const dirs = type === 'r' ? ROOK_D : type === 'b' ? BISHOP_D : [...ROOK_D, ...BISHOP_D];
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const to = rr * 8 + ff;
          const t = board[to];
          if (t) {
            if (colorOf(t) === enemy) add(sq, to);
            break;
          }
          if (!capturesOnly) add(sq, to);
          rr += dr;
          ff += df;
        }
      }
    }
  }
  return moves;
}

/** Apply a move in place; returns undo info for unmake(). */
export function make(s: State, m: Move): Undo {
  const undo: Undo = { castling: { ...s.castling }, ep: s.ep, half: s.half };
  const b = s.board;
  b[m.to] = m.promo ? ((s.turn === 'w' ? m.promo.toUpperCase() : m.promo) as PieceChar) : m.piece;
  b[m.from] = '';
  if (m.flag === 'ep') b[m.to + (s.turn === 'w' ? 8 : -8)] = '';
  if (m.flag === 'castleK') {
    b[m.from + 1] = b[m.from + 3];
    b[m.from + 3] = '';
  }
  if (m.flag === 'castleQ') {
    b[m.from - 1] = b[m.from - 4];
    b[m.from - 4] = '';
  }
  const c = s.castling;
  if (m.piece === 'K') c.K = c.Q = false;
  if (m.piece === 'k') c.k = c.q = false;
  for (const sq of [m.from, m.to]) {
    if (sq === 63) c.K = false;
    if (sq === 56) c.Q = false;
    if (sq === 7) c.k = false;
    if (sq === 0) c.q = false;
  }
  s.ep = m.flag === 'double' ? (m.from + m.to) / 2 : -1;
  s.half = m.piece === 'P' || m.piece === 'p' || m.captured ? 0 : s.half + 1;
  if (s.turn === 'b') s.full++;
  s.turn = s.turn === 'w' ? 'b' : 'w';
  return undo;
}

export function unmake(s: State, m: Move, u: Undo) {
  s.turn = s.turn === 'w' ? 'b' : 'w';
  if (s.turn === 'b') s.full--;
  const b = s.board;
  b[m.from] = m.piece;
  if (m.flag === 'ep') {
    b[m.to] = '';
    b[m.to + (s.turn === 'w' ? 8 : -8)] = m.captured;
  } else b[m.to] = m.captured;
  if (m.flag === 'castleK') {
    b[m.from + 3] = b[m.from + 1];
    b[m.from + 1] = '';
  }
  if (m.flag === 'castleQ') {
    b[m.from - 4] = b[m.from - 1];
    b[m.from - 1] = '';
  }
  s.castling = u.castling;
  s.ep = u.ep;
  s.half = u.half;
}

/** All legal moves for the side to move. */
export function legalMoves(s: State, capturesOnly = false): Move[] {
  const me = s.turn;
  const out: Move[] = [];
  for (const m of pseudoMoves(s, capturesOnly)) {
    const u = make(s, m);
    if (!inCheck(s, me)) out.push(m);
    unmake(s, m, u);
  }
  return out;
}

export function insufficientMaterial(board: Sq[]): boolean {
  const pieces: { p: string; sq: number }[] = [];
  board.forEach((p, sq) => p && p.toLowerCase() !== 'k' && pieces.push({ p: p.toLowerCase(), sq }));
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].p === 'n' || pieces[0].p === 'b')) return true;
  if (pieces.every((x) => x.p === 'b')) {
    const colors = new Set(pieces.map((x) => (rankOf(x.sq) + fileOf(x.sq)) % 2));
    return colors.size === 1;
  }
  return false;
}

export type Outcome =
  | { over: false }
  | { over: true; winner: Color | null; reason: 'checkmate' | 'stalemate' | 'insufficient' | 'fifty' | 'repetition' | 'resign' };

export function outcome(s: State, history: string[]): Outcome {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? { over: true, winner: s.turn === 'w' ? 'b' : 'w', reason: 'checkmate' } : { over: true, winner: null, reason: 'stalemate' };
  if (insufficientMaterial(s.board)) return { over: true, winner: null, reason: 'insufficient' };
  if (s.half >= 100) return { over: true, winner: null, reason: 'fifty' };
  const key = positionKey(s);
  if (history.filter((k) => k === key).length >= 3) return { over: true, winner: null, reason: 'repetition' };
  return { over: false };
}

/** Standard Algebraic Notation for `m` in position `s` (before the move). */
export function toSan(s: State, m: Move): string {
  let san: string;
  if (m.flag === 'castleK') san = 'O-O';
  else if (m.flag === 'castleQ') san = 'O-O-O';
  else {
    const type = m.piece.toUpperCase();
    const capture = !!m.captured;
    if (type === 'P') {
      san = (capture ? 'abcdefgh'[fileOf(m.from)] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
    } else {
      const others = legalMoves(s).filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let dis = '';
      if (others.length) {
        const sameFile = others.some((o) => fileOf(o.from) === fileOf(m.from));
        const sameRank = others.some((o) => rankOf(o.from) === rankOf(m.from));
        if (!sameFile) dis = 'abcdefgh'[fileOf(m.from)];
        else if (!sameRank) dis = String(8 - rankOf(m.from));
        else dis = sqName(m.from);
      }
      san = type + dis + (capture ? 'x' : '') + sqName(m.to);
    }
  }
  const u = make(s, m);
  const check = inCheck(s);
  const mate = check && legalMoves(s).length === 0;
  unmake(s, m, u);
  return san + (mate ? '#' : check ? '+' : '');
}

export function perft(s: State, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(s);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    const u = make(s, m);
    n += perft(s, depth - 1);
    unmake(s, m, u);
  }
  return n;
}
