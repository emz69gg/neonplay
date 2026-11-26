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
