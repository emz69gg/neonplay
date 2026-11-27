import type { GameId } from '../lib/types';
import { GAME_MAP } from '../lib/games';

/** Hand-drawn SVG cover art for each game — no image downloads required. */
function Art({ id }: { id: GameId }) {
  switch (id) {
    case 'reaction':
      return (
        <g>
          <circle cx="100" cy="62" r="34" fill="#fff" opacity=".15" />
          <circle cx="100" cy="62" r="24" fill="#4ade80" />
          <path d="M104 40l-16 26h12l-4 18 16-26h-12z" fill="#fff" />
          <circle cx="100" cy="62" r="44" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeDasharray="4 6" />
        </g>
      );
    case '2048': {
      const tiles = [
        ['2', '#fde68a'], ['4', '#fdba74'], ['8', '#fb923c'], ['16', '#f97316'],
        ['32', '#ef4444'], ['64', '#dc2626'], ['128', '#facc15'], ['2048', '#fbbf24'],
      ] as const;
      return (
        <g>
          {tiles.map(([t, c], i) => (
            <g key={i} transform={`translate(${44 + (i % 4) * 29} ${30 + Math.floor(i / 4) * 32})`}>
              <rect width="26" height="28" rx="5" fill={c} />
              <text x="13" y="19" textAnchor="middle" fontSize={t.length > 2 ? 8 : 12} fontWeight="800" fill="#7c2d12" fontFamily="Inter">{t}</text>
            </g>
          ))}
        </g>
      );
    }
    case 'snake':
      return (
        <g>
          <path d="M40 90 H90 V50 H140 V75 H160" fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="160" cy="75" r="8" fill="#fff" />
          <circle cx="162" cy="72" r="2" fill="#065f46" />
          <circle cx="60" cy="45" r="7" fill="#ef4444" />
          <path d="M60 38 q3 -5 6 -4" stroke="#166534" strokeWidth="2" fill="none" />
        </g>
      );
    case 'tictactoe':
      return (
        <g stroke="#fff" strokeWidth="4" strokeLinecap="round">
          <path d="M80 28v72M120 28v72M58 52h84M58 76h84" strokeOpacity=".5" />
          <path d="M64 32l12 14M76 32l-12 14" />
          <circle cx="100" cy="64" r="8" fill="none" />
          <path d="M124 80l12 14M136 80l-12 14" />
          <circle cx="140" cy="40" r="8" fill="none" />
        </g>
      );
    case 'rps':
      return (
        <g fontSize="34" textAnchor="middle">
          <text x="60" y="80">✊</text>
          <text x="100" y="60">✋</text>
          <text x="140" y="80">✌️</text>
        </g>
      );
    case 'memory':
      return (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${46 + i * 28} ${36 + (i % 2) * 10}) rotate(${(i - 1.5) * 6} 12 18)`}>
              <rect width="24" height="34" rx="5" fill={i === 1 || i === 2 ? '#fff' : '#1e3a8a'} stroke="#fff" strokeWidth="2" />
              {i === 1 || i === 2 ? <text x="12" y="23" textAnchor="middle" fontSize="14">⭐</text> : <path d="M6 10l12 14M18 10L6 24" stroke="#60a5fa" strokeWidth="1.5" />}
            </g>
          ))}
        </g>
      );
    case 'minesweeper':
      return (
        <g>
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={52 + (i % 4) * 24} y={26 + Math.floor(i / 4) * 24} width="22" height="22" rx="3" fill={[1, 2, 5, 6, 9].includes(i) ? '#cbd5e1' : '#475569'} />
          ))}
          <text x="87" y="43" fontSize="13" fontWeight="800" fill="#2563eb" fontFamily="Inter">1</text>
          <text x="111" y="67" fontSize="13" fontWeight="800" fill="#16a34a" fontFamily="Inter">2</text>
          <text x="131" y="44" fontSize="14">🚩</text>
          <circle cx="139" cy="85" r="7" fill="#0f172a" />
          <path d="M139 74v22M128 85h22" stroke="#0f172a" strokeWidth="2" />
        </g>
      );
    case 'clicker':
      return (
        <g>
          <circle cx="100" cy="64" r="32" fill="#fde047" stroke="#ca8a04" strokeWidth="4" />
          <circle cx="100" cy="64" r="22" fill="none" stroke="#ca8a04" strokeWidth="2" />
          <text x="100" y="74" textAnchor="middle" fontSize="26" fontWeight="900" fill="#a16207" fontFamily="Inter">$</text>
          <text x="148" y="42" fontSize="12" fontWeight="800" fill="#fff" fontFamily="Inter">+1</text>
          <text x="40" y="96" fontSize="12" fontWeight="800" fill="#fff" fontFamily="Inter">+5</text>
          <path d="M136 92l10 4-6 3 4 7-3 2-4-7-5 4z" fill="#fff" />
        </g>
      );
    case 'flappy':
      return (
        <g>
          <rect x="130" y="0" width="22" height="42" fill="#22d3ee" rx="3" />
          <rect x="130" y="82" width="22" height="50" fill="#22d3ee" rx="3" />
          <rect x="56" y="0" width="22" height="24" fill="#a78bfa" rx="3" />
          <rect x="56" y="70" width="22" height="60" fill="#a78bfa" rx="3" />
          <ellipse cx="104" cy="60" rx="13" ry="11" fill="#fde047" />
          <circle cx="109" cy="56" r="3" fill="#fff" /><circle cx="110" cy="56" r="1.5" fill="#000" />
          <path d="M116 61l7 2-7 3z" fill="#f97316" />
          <ellipse cx="98" cy="63" rx="6" ry="4" fill="#facc15" stroke="#ca8a04" />
        </g>
      );
    case 'typing':
      return (
        <g>
          <rect x="40" y="44" width="120" height="56" rx="8" fill="#fff" opacity=".18" />
          {Array.from({ length: 30 }).map((_, i) => (
            <rect key={i} x={46 + (i % 10) * 11} y={50 + Math.floor(i / 10) * 12} width="9" height="9" rx="2" fill="#fff" opacity={i === 13 ? 1 : 0.55} />
          ))}
          <rect x="68" y="86" width="64" height="8" rx="2" fill="#fff" opacity=".55" />
          <text x="100" y="32" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff" fontFamily="JetBrains Mono">WPM</text>
        </g>
      );
    case 'chess':
      return (
        <g>
          {Array.from({ length: 16 }).map((_, i) => (
            <rect key={i} x={68 + (i % 4) * 16} y={36 + Math.floor(i / 4) * 16} width="16" height="16" fill={(i + Math.floor(i / 4)) % 2 ? '#8b7bc8' : '#ece8fb'} opacity=".9" />
          ))}
          <g transform="translate(58 26)" fill="#fff" stroke="#1e1b4b" strokeWidth="2.5" strokeLinejoin="round">
            <path d="M8 74 h34 v-8 h-4 l-3 -22 h4 v-6 h-6 v-6 h4 v-6 h-6 v-6 h-6 v6 h-6 v6 h4 v6 h-6 v6 h4 l-3 22 h-4z" />
          </g>
          <g transform="translate(104 30)" fill="#1e1b4b" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round">
            <path d="M6 70 h34 v-8 h-4 c0 -14 2 -22 -2 -30 c-4 -8 -14 -14 -24 -12 l2 6 c-6 2 -10 8 -8 14 l6 2 c2 -4 6 -6 10 -6 c-2 8 -8 14 -10 26 h-4z" />
          </g>
        </g>
      );
    case 'bricks':
      return (
        <g>
          {Array.from({ length: 18 }).map((_, i) => {
            const c = ['#fda4af', '#f9a8d4', '#c4b5fd', '#93c5fd', '#67e8f9', '#fde68a'][Math.floor(i / 6) * 2 + (i % 2)] ?? '#fff';
            return (i === 8 || i === 13) ? null : <rect key={i} x={30 + (i % 6) * 24} y={18 + Math.floor(i / 6) * 13} width="21" height="10" rx="2.5" fill={c} />;
          })}
          <circle cx="112" cy="82" r="5" fill="#fff" />
          <path d="M112 82 L92 60" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeDasharray="3 3" />
          <rect x="84" y="104" width="44" height="7" rx="3.5" fill="#fff" />
        </g>
      );
    case 'blockstack': {
      const cells: [number, number, string][] = [
        [0, 4, '#22d3ee'], [1, 4, '#22d3ee'], [2, 4, '#22d3ee'], [3, 4, '#22d3ee'],
        [4, 4, '#facc15'], [5, 4, '#facc15'], [4, 3, '#facc15'], [5, 3, '#facc15'],
        [0, 3, '#a78bfa'], [1, 3, '#a78bfa'], [2, 3, '#a78bfa'], [1, 2, '#a78bfa'],
        [6, 4, '#4ade80'], [6, 3, '#4ade80'], [7, 3, '#4ade80'], [7, 2, '#4ade80'],
        [3, 0, '#fb7185'], [4, 0, '#fb7185'], [4, 1, '#fb7185'], [5, 1, '#fb7185'],
      ];
      return (
        <g>
          <rect x="56" y="10" width="88" height="110" rx="6" fill="#000" opacity=".2" />
          {cells.map(([x, y, c], i) => (
            <rect key={i} x={60 + x * 10} y={y === 0 || y === 1 ? 24 + y * 10 : 64 + y * 10} width="9" height="9" rx="1.5" fill={c} />
          ))}
        </g>
      );
    }
    case 'wordguess': {
      const rows = [['W', 'O', 'R', 'D', 'S'], ['G', 'U', 'E', 'S', 'S']];
      const col = [['#64748b', '#eab308', '#64748b', '#22c55e', '#64748b'], ['#22c55e', '#22c55e', '#22c55e', '#22c55e', '#22c55e']];
      return (
        <g>
          {rows.map((r, y) =>
            r.map((ch, x) => (
              <g key={`${x}${y}`} transform={`translate(${42 + x * 24} ${28 + y * 38})`}>
                <rect width="21" height="30" rx="4" fill={col[y][x]} />
                <text x="10.5" y="21" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="Inter">{ch}</text>
              </g>
            )),
          )}
        </g>
      );
    }
    case 'connect4':
      return (
        <g>
          <rect x="44" y="20" width="112" height="96" rx="8" fill="#1d4ed8" />
          {Array.from({ length: 30 }).map((_, i) => {
            const x = i % 6, y = Math.floor(i / 6);
            const red = [[1, 4], [2, 3], [3, 2], [4, 1], [2, 4], [4, 4]].some(([a, b]) => a === x && b === y);
            const yel = [[3, 4], [3, 3], [1, 3], [4, 3], [4, 2]].some(([a, b]) => a === x && b === y);
            return <circle key={i} cx={56 + x * 18} cy={32 + y * 18} r="7" fill={red ? '#ef4444' : yel ? '#facc15' : '#0f172a'} opacity={red || yel ? 1 : 0.55} />;
          })}
          <path d="M74 104 L128 50" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeOpacity=".8" />
        </g>
      );
    case 'whack':
      return (
        <g>
          {[[60, 96], [100, 104], [140, 96]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="20" ry="7" fill="#3f2a14" />
          ))}
          <g transform="translate(100 78)">
            <ellipse cx="0" cy="10" rx="16" ry="20" fill="#a16207" />
            <circle cx="-6" cy="2" r="3" fill="#fff" /><circle cx="6" cy="2" r="3" fill="#fff" />
            <circle cx="-6" cy="2" r="1.5" fill="#000" /><circle cx="6" cy="2" r="1.5" fill="#000" />
            <ellipse cx="0" cy="10" rx="5" ry="3.5" fill="#fda4af" />
          </g>
          <ellipse cx="100" cy="104" rx="20" ry="7" fill="#3f2a14" opacity=".6" />
          <g transform="translate(128 34) rotate(35)">
            <rect x="-4" y="0" width="8" height="40" rx="3" fill="#fde68a" />
            <rect x="-16" y="-14" width="32" height="18" rx="5" fill="#ef4444" />
          </g>
        </g>
      );
    case 'aim':
      return (
        <g>
          <circle cx="100" cy="64" r="34" fill="#fff" />
          <circle cx="100" cy="64" r="26" fill="#ef4444" />
          <circle cx="100" cy="64" r="18" fill="#fff" />
          <circle cx="100" cy="64" r="10" fill="#ef4444" />
          <path d="M100 18v16M100 94v16M54 64h16M130 64h16" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="44" cy="30" r="7" fill="#fff" opacity=".5" />
          <circle cx="160" cy="100" r="5" fill="#fff" opacity=".5" />
        </g>
      );
  }
}

export default function GameThumb({ id, className = '' }: { id: GameId; className?: string }) {
  const g = GAME_MAP[id];
  return (
    <svg viewBox="0 0 200 128" className={className} role="img" aria-label={`${g.title} cover art`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={g.gradient[0]} />
          <stop offset="1" stopColor={g.gradient[1]} />
        </linearGradient>
        <radialGradient id={`r-${id}`} cx=".8" cy=".1" r=".9">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="200" height="128" fill={`url(#g-${id})`} />
      <rect width="200" height="128" fill={`url(#r-${id})`} />
      <Art id={id} />
    </svg>
  );
}
