import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AVATAR_COLORS, levelProgress } from '../lib/progression';
import type { Avatar } from '../lib/types';

export function Spinner({ size = 36, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-muted" role="status">
      <div
        className="animate-spin rounded-full border-[3px] border-line border-t-neon-purple border-r-neon-blue"
        style={{ width: size, height: size }}
      />
      {label && <span className="text-sm font-medium">{label}</span>}
    </div>
  );
}

export function AvatarBubble({ avatar, size = 40, ring = false }: { avatar: Avatar; size?: number; ring?: boolean }) {
  const [a, b] = AVATAR_COLORS[avatar.color] ?? AVATAR_COLORS.violet;
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full ${ring ? 'ring-2 ring-neon-purple/70 ring-offset-2 ring-offset-bg' : ''}`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: size * 0.5 }}
      aria-hidden
    >
      <span style={{ lineHeight: 1 }}>{avatar.emoji}</span>
    </div>
  );
}

export function XPBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const p = levelProgress(xp);
  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted">
          <span>Level {p.level}</span>
          <span>
            {p.current.toLocaleString()} / {p.needed.toLocaleString()} XP
          </span>
        </div>
      )}
      <div className={`${compact ? 'h-1.5' : 'h-2.5'} overflow-hidden rounded-full bg-surface2`}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-cyan transition-[width] duration-700"
          style={{ width: `${p.pct}%` }}
        />
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-up" onClick={onClose} />
      <div className={`card relative max-h-[92vh] w-full overflow-y-auto rounded-b-none p-6 shadow-2xl animate-fade-up sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mb-5 flex items-center justify-between gap-4">
          {title && <h2 className="font-display text-xl font-bold">{title}</h2>}
          <button onClick={onClose} className="btn-ghost ml-auto h-9 w-9 !p-0" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function SectionHeader({ title, icon, action, sub }: { title: string; icon?: string; action?: ReactNode; sub?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-bold sm:text-2xl">
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-gradient-to-r from-neon-purple to-neon-blue' : 'bg-line'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

export function Coin({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`inline-block h-4 w-4 ${className}`} aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="#ca8a04" strokeWidth="1" />
    </svg>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="font-display text-lg font-bold">{title}</div>
      {desc && <p className="max-w-sm text-sm text-muted">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
