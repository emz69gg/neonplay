import type { CSSProperties, ReactNode } from 'react';
import { BACKGROUNDS, ITEM_MAP, NAME_STYLES } from '../lib/cosmetics';
import type { Avatar } from '../lib/types';

/* Renderers for shop cosmetics: frames, companions, name colours, badges, banners. */

const anim = (name: string, dur: string, extra = 'infinite'): CSSProperties => ({ animation: `${name} ${dur} ease-in-out ${extra}` });

/** Decoration drawn around an avatar of the given size. */
export function Frame({ id, size }: { id?: string; size: number }) {
  if (!id) return null;
  const pad = Math.max(3, size * 0.09);
  const box: CSSProperties = { position: 'absolute', inset: -pad, pointerEvents: 'none' };
  switch (id) {
    case 'neon':
      return <span className="cosfx rounded-full" style={{ ...box, border: `${Math.max(2, size * 0.05)}px solid rgb(var(--neon-cyan))`, boxShadow: '0 0 10px rgb(var(--neon-cyan)/.8), inset 0 0 8px rgb(var(--neon-cyan)/.6)', ...anim('cos-pulse', '2.4s') }} />;
    case 'pixel':
      return (
        <span
          style={{ ...box, borderRadius: size * 0.12, border: `${Math.max(3, size * 0.07)}px solid #a3e635`, boxShadow: `0 0 0 ${Math.max(1, size * 0.03)}px #14532d, 0 0 10px #a3e63588`, imageRendering: 'pixelated' }}
        />
      );
    case 'circuit':
      return (
        <svg className="cosfx" viewBox="0 0 100 100" style={{ ...box, ...anim('cos-spin', '8s', 'infinite'), animationTimingFunction: 'linear' }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke="#38bdf8" strokeWidth="4" strokeDasharray="14 6 3 6" style={{ filter: 'drop-shadow(0 0 3px #38bdf8)' }} />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="2 5" />
          {[0, 90, 180, 270].map((a) => (
            <circle key={a} cx={50 + 46 * Math.cos((a * Math.PI) / 180)} cy={50 + 46 * Math.sin((a * Math.PI) / 180)} r="4" fill="#e0f2fe" />
          ))}
        </svg>
      );
    case 'laurel':
      return (
        <svg viewBox="0 0 100 100" style={box}>
          <circle cx="50" cy="50" r="47" fill="none" stroke="#fbbf24" strokeWidth="3" />
          {Array.from({ length: 7 }).map((_, i) => {
            const a = 110 + i * 15;
            const r = (a * Math.PI) / 180;
            const b = 70 - i * 15;
            const r2 = (b * Math.PI) / 180;
            return (
              <g key={i} fill="#facc15" stroke="#a16207" strokeWidth=".8">
                <ellipse cx={50 + 47 * Math.cos(r)} cy={50 + 47 * Math.sin(r)} rx="7" ry="3.2" transform={`rotate(${a + 60} ${50 + 47 * Math.cos(r)} ${50 + 47 * Math.sin(r)})`} />
                <ellipse cx={50 + 47 * Math.cos(r2)} cy={50 + 47 * Math.sin(r2)} rx="7" ry="3.2" transform={`rotate(${b - 60} ${50 + 47 * Math.cos(r2)} ${50 + 47 * Math.sin(r2)})`} />
              </g>
            );
          })}
        </svg>
      );
    case 'crown':
      return (
        <>
          <span className="rounded-full" style={{ ...box, border: `${Math.max(2, size * 0.05)}px solid #fbbf24`, boxShadow: '0 0 12px #f59e0b99' }} />
          <span className="cosfx" style={{ position: 'absolute', left: '50%', top: -size * 0.55, marginLeft: -size * 0.22, fontSize: size * 0.44, lineHeight: 1, filter: 'drop-shadow(0 0 6px #fbbf24)', ...anim('cos-bob', '2.2s') }}>
            👑
          </span>
        </>
      );
    case 'flame':
      return (
        <span
          className="cosfx rounded-full"
          style={{
            ...box,
            background: 'conic-gradient(from 0deg,#f97316,#ec4899,#facc15,#f43f5e,#f97316)',
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${pad + 2}px), #000 calc(100% - ${pad + 1}px))`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${pad + 2}px), #000 calc(100% - ${pad + 1}px))`,
            ...anim('cos-flicker', '0.9s'),
          }}
        />
      );
    case 'wings': {
      const w = size * 0.75;
      const wing = (side: 'l' | 'r'): CSSProperties => ({
        position: 'absolute',
        top: size * 0.05,
        [side === 'l' ? 'right' : 'left']: size * 0.78,
        width: w,
        height: w,
        transformOrigin: side === 'l' ? '100% 60%' : '0% 60%',
        animation: `cos-flap-${side} 1.6s ease-in-out infinite`,
        filter: 'drop-shadow(0 0 6px #e0e7ff)',
        pointerEvents: 'none',
      });
      const path = 'M100 60 C 70 10, 30 0, 2 18 C 25 22, 35 30, 40 36 C 22 36, 10 42, 4 54 C 25 50, 40 54, 48 60 C 34 64, 24 74, 22 88 C 45 76, 70 72, 100 60 Z';
      return (
        <>
          <span className="rounded-full" style={{ ...box, border: `${Math.max(2, size * 0.05)}px solid #e0e7ff`, boxShadow: '0 0 14px #a5b4fc' }} />
          <svg className="cosfx" viewBox="0 0 100 100" style={wing('l')}><path d={path} fill="url(#wingG)" /><defs><linearGradient id="wingG" x1="1" x2="0"><stop offset="0" stopColor="#c7d2fe" /><stop offset="1" stopColor="#f0abfc" /></linearGradient></defs></svg>
          <svg className="cosfx" viewBox="0 0 100 100" style={wing('r')}><path d={path} fill="url(#wingG)" /></svg>
        </>
      );
    }
    case 'cosmic':
      return (
        <>
          <span
            className="cosfx rounded-full"
            style={{
              ...box,
              background: 'conic-gradient(#f0abfc,#67e8f9,#fde68a,#a78bfa,#f472b6,#f0abfc)',
              WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${pad + 1}px), #000 calc(100% - ${pad}px))`,
              mask: `radial-gradient(farthest-side, transparent calc(100% - ${pad + 1}px), #000 calc(100% - ${pad}px))`,
              filter: 'drop-shadow(0 0 6px #f0abfc)',
              animation: 'cos-spin 4s linear infinite',
            }}
          />
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="cosfx"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: Math.max(4, size * 0.1),
                height: Math.max(4, size * 0.1),
                margin: -Math.max(2, size * 0.05),
                borderRadius: 9,
                background: ['#fde68a', '#67e8f9', '#f0abfc'][i],
                boxShadow: `0 0 8px ${['#fde68a', '#67e8f9', '#f0abfc'][i]}`,
                ['--r' as string]: `${size / 2 + pad * 1.6}px`,
                animation: `cos-orbit ${3 + i}s linear infinite`,
                animationDelay: `${-i * 1.1}s`,
                pointerEvents: 'none',
              }}
            />
          ))}
        </>
      );
    default:
      return null;
  }
}

const PET_ANIM: Record<string, CSSProperties> = {
  bolt: anim('cos-bob', '1.6s'),
  chick: anim('cos-hop', '1.2s'),
  cat: anim('cos-sway', '2.4s'),
  ghost: anim('cos-fade', '3s'),
  dragon: anim('cos-hover', '1.4s'),
  ufo: anim('cos-hover', '2.2s'),
  spirit: { animation: 'cos-orbit 3.5s linear infinite' },
};

/** A small companion that sits beside the avatar. */
export function Pet({ id, size }: { id?: string; size: number }) {
  if (!id) return null;
  const item = ITEM_MAP[`pet:${id}`];
  if (!item) return null;
  const s = Math.max(14, size * 0.46);
  const orbit = id === 'spirit';
  return (
    <span
      className="cosfx"
      aria-hidden
      style={{
        position: 'absolute',
        ...(orbit ? { left: '50%', top: '50%', margin: -s / 2, ['--r' as string]: `${size * 0.72}px` } : { right: -s * 0.75, bottom: -s * 0.15 }),
        width: s,
        height: s,
        fontSize: s * 0.85,
        lineHeight: `${s}px`,
        textAlign: 'center',
        filter: `drop-shadow(0 0 ${Math.max(3, s * 0.25)}px rgb(var(--neon-cyan) / .8))`,
        pointerEvents: 'none',
        ...PET_ANIM[id],
      }}
    >
      {item.icon}
      {id === 'ufo' && <span style={{ position: 'absolute', left: '20%', top: '70%', width: '60%', height: '80%', background: 'linear-gradient(#67e8f988,transparent)', clipPath: 'polygon(30% 0,70% 0,100% 100%,0 100%)' }} />}
    </span>
  );
}

/** A player's name in their equipped colour, followed by their badge. */
export function PlayerName({ name, avatar, className = '', badge = true }: { name: ReactNode; avatar?: Avatar | null; className?: string; badge?: boolean }) {
  const st = avatar?.name ? NAME_STYLES[avatar.name] : undefined;
  const b = badge && avatar?.badge ? ITEM_MAP[`badge:${avatar.badge}`] : undefined;
  const isGrad = st?.css.startsWith('linear');
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span
        className={`truncate ${isGrad ? 'name-grad' : ''} ${st?.animated ? 'name-anim cosfx' : ''}`}
        style={st ? (isGrad ? { backgroundImage: st.css, filter: 'drop-shadow(0 0 6px rgba(255,255,255,.15))' } : { color: st.css, textShadow: `0 0 10px ${st.css}88` }) : undefined}
      >
        {name}
      </span>
      {b && (
        <span title={b.name} className="shrink-0 text-[0.9em] leading-none" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,.35))' }}>
          {b.icon}
        </span>
      )}
    </span>
  );
}

/** Background used for the profile banner. */
export function bannerStyle(bg?: string): CSSProperties | undefined {
  if (!bg || !BACKGROUNDS[bg]) return undefined;
  return { background: BACKGROUNDS[bg], backgroundSize: bg === 'grid' ? 'auto' : 'cover' };
}
