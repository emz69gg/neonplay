import { useEffect, useRef } from 'react';
import type { GameApi } from '../lib/types';

export interface GameProps {
  api: GameApi;
  /** true when the player pressed Restart (ignore saved state). */
  fresh: boolean;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

/** Arrow keys / WASD → direction. Prevents page scroll while the game is mounted. */
export function useDirectionKeys(onDir: (d: Dir) => void, enabled = true) {
  const cb = useRef(onDir);
  cb.current = onDir;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const d = KEY_DIRS[e.key];
      if (d) {
        e.preventDefault();
        cb.current(d);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]);
}

/** Swipe detection on an element. */
export function useSwipe(ref: React.RefObject<HTMLElement>, onDir: (d: Dir) => void, threshold = 24) {
  const cb = useRef(onDir);
  cb.current = onDir;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sx = 0, sy = 0, active = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; active = true;
    };
    const move = (e: TouchEvent) => {
      if (active) e.preventDefault();
    };
    const end = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
      cb.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
    };
  }, [ref, threshold]);
}

/** Generic keydown handler that ignores typing in inputs. */
export function useKey(handler: (e: KeyboardEvent) => void, enabled = true) {
  const cb = useRef(handler);
  cb.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      cb.current(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]);
}

export const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Read a CSS custom property colour from the document (for canvas drawing). */
export const cssVar = (name: string, alpha = 1) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).join(',');
  return `rgba(${v},${alpha})`;
};
