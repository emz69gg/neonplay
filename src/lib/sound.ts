import type { SoundName } from './types';

/** Tiny synthesized sound engine — no audio files to download. */
let ctx: AudioContext | null = null;
let muted = false;
let volume = 0.6;

export function setSoundConfig(opts: { muted: boolean; volume: number }) {
  muted = opts.muted;
  volume = opts.volume;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Tone = { f: number; t?: number; d: number; type?: OscillatorType; g?: number; slide?: number };

const SOUNDS: Record<SoundName, Tone[]> = {
  click: [{ f: 520, d: 0.05, type: 'triangle', g: 0.25 }],
  tick: [{ f: 900, d: 0.03, type: 'square', g: 0.08 }],
  move: [{ f: 300, d: 0.06, type: 'triangle', g: 0.18, slide: 380 }],
  flip: [{ f: 660, d: 0.06, type: 'sine', g: 0.2, slide: 880 }],
  point: [
    { f: 660, d: 0.07, type: 'square', g: 0.12 },
    { f: 990, t: 0.06, d: 0.09, type: 'square', g: 0.12 },
  ],
  coin: [
    { f: 988, d: 0.06, type: 'square', g: 0.1 },
    { f: 1319, t: 0.06, d: 0.16, type: 'square', g: 0.1 },
  ],
  jump: [{ f: 380, d: 0.12, type: 'sine', g: 0.22, slide: 720 }],
  error: [{ f: 180, d: 0.18, type: 'sawtooth', g: 0.12, slide: 120 }],
  lose: [
    { f: 392, d: 0.15, type: 'triangle', g: 0.22 },
    { f: 311, t: 0.15, d: 0.15, type: 'triangle', g: 0.22 },
    { f: 233, t: 0.3, d: 0.35, type: 'triangle', g: 0.22, slide: 180 },
  ],
  win: [
    { f: 523, d: 0.1, type: 'triangle', g: 0.22 },
    { f: 659, t: 0.1, d: 0.1, type: 'triangle', g: 0.22 },
    { f: 784, t: 0.2, d: 0.1, type: 'triangle', g: 0.22 },
    { f: 1047, t: 0.3, d: 0.3, type: 'triangle', g: 0.22 },
  ],
  level: [
    { f: 440, d: 0.08, type: 'square', g: 0.1 },
    { f: 554, t: 0.08, d: 0.08, type: 'square', g: 0.1 },
    { f: 659, t: 0.16, d: 0.08, type: 'square', g: 0.1 },
    { f: 880, t: 0.24, d: 0.4, type: 'square', g: 0.1 },
  ],
};

export function playSound(name: SoundName) {
  if (muted || volume <= 0) return;
  const a = ac();
  if (!a) return;
  const now = a.currentTime;
  for (const tone of SOUNDS[name]) {
    const start = now + (tone.t ?? 0);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.f, start);
    if (tone.slide) osc.frequency.exponentialRampToValueAtTime(tone.slide, start + tone.d);
    const peak = (tone.g ?? 0.2) * volume;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.d);
    osc.connect(gain).connect(a.destination);
    osc.start(start);
    osc.stop(start + tone.d + 0.02);
  }
}
