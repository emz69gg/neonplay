/* =====================================================================
   NEON CITY — a top-down open-world courier game on Canvas 2D.
   Zero external assets: every texture, sprite and sound is generated here.

   Public API:
     initGame(container, options) → controller
     destroyGame()
   ===================================================================== */
import {
  BLOCK,
  edgeOpen,
  generate,
  inPlaza,
  node,
  NT,
  querySolids,
  roadWidth,
  T,
  TILE,
  tileAt,
  WATER_X,
  WORLD,
  type Building,
  type World,
} from './world';

/* ---------------- Public types ---------------- */
export type Medal = 'gold' | 'silver' | 'bronze' | null;
export interface CitySave {
  credits: number;
  earned: number;
  deliveries: number;
  failed: number;
  shards: number[];
  best: Record<string, number>;
  medals: Record<string, Exclude<Medal, null>>;
}
export type CityEvent =
  | { type: 'shard'; count: number; total: number }
  | { type: 'delivery'; reward: number; deliveries: number; earned: number; onTime: boolean }
  | { type: 'delivery-failed' }
  | { type: 'race'; route: string; name: string; time: number; medal: Medal; best: number; newBest: boolean }
  | { type: 'save' };
export interface InitOptions {
  save?: Partial<CitySave> | null;
  onEvent?: (e: CityEvent, save: CitySave) => void;
  muted?: boolean;
  volume?: number;
  reducedMotion?: boolean;
}
export interface CityController {
  setMuted(m: boolean, volume?: number): void;
  getSave(): CitySave;
  pause(p: boolean): void;
}

export const newSave = (): CitySave => ({ credits: 0, earned: 0, deliveries: 0, failed: 0, shards: [], best: {}, medals: {} });

let current: Game | null = null;
export function initGame(container: HTMLElement, opts: InitOptions = {}): CityController {
  destroyGame();
  const g = new Game(container, opts);
  current = g;
  // test hook (development builds only)
  if (import.meta.env.DEV) (window as unknown as { __city?: Game }).__city = g;
  return { setMuted: (m, v) => g.audio.setMuted(m, v), getSave: () => g.save, pause: (p) => g.setPaused(p) };
}
export function destroyGame() {
  current?.destroy();
  current = null;
}

/* ---------------- Helpers ---------------- */
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* ---------------- Vehicles ---------------- */
type VType = 'hover' | 'truck' | 'bike';
interface Spec {
  name: string;
  len: number;
  wid: number;
  max: number;
  accel: number;
  brake: number;
  turn: number;
  grip: number;
  driftGrip: number;
  hp: number;
  r: number;
  colors: string[];
  cone: number; // headlight length
  pitch: number;
}
const SPECS: Record<VType, Spec> = {
  hover: { name: 'Hover Car', len: 46, wid: 24, max: 640, accel: 560, brake: 950, turn: 2.9, grip: 5.2, driftGrip: 1.3, hp: 100, r: 19, colors: ['#22d3ee', '#f472b6', '#a855f7', '#fbbf24'], cone: 260, pitch: 1 },
  truck: { name: 'Heavy Truck', len: 68, wid: 30, max: 410, accel: 290, brake: 700, turn: 1.85, grip: 7.5, driftGrip: 3, hp: 230, r: 26, colors: ['#fb923c', '#60a5fa', '#a3e635'], cone: 300, pitch: 0.6 },
  bike: { name: 'Neon Bike', len: 36, wid: 14, max: 580, accel: 820, brake: 1050, turn: 3.9, grip: 4.3, driftGrip: 1.05, hp: 70, r: 12, colors: ['#f0abfc', '#34d399', '#f43f5e'], cone: 220, pitch: 1.35 },
};
interface Vehicle {
  id: number;
  type: VType;
  spec: Spec;
  color: string;
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  hp: number;
  boost: number;
  disabled: number; // seconds until respawn (0 = usable)
  home: { x: number; y: number; a: number };
  lastSkid: [number, number, number, number] | null;
  repairing: number;
}

function vehicleSprite(type: VType, color: string): HTMLCanvasElement {
  const s = SPECS[type];
  const pad = 6;
  const c = makeCanvas(s.len + pad * 2, s.wid + pad * 2);
  const g = c.getContext('2d')!;
  g.translate(pad, pad);
  const L = s.len;
  const W = s.wid;
  const body = g.createLinearGradient(0, 0, 0, W);
  body.addColorStop(0, '#2a2140');
  body.addColorStop(0.5, '#120d20');
  body.addColorStop(1, '#2a2140');
  if (type === 'bike') {
    g.fillStyle = '#0b0b12';
    g.fillRect(2, W / 2 - 2, L - 4, 4); // wheels axis
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(L / 2, W / 2, L / 2.3, W / 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.fillRect(L * 0.25, W / 2 - 1.5, L * 0.5, 3);
    g.fillStyle = '#1f2937';
    g.beginPath();
    g.arc(L * 0.42, W / 2, 4.5, 0, Math.PI * 2); // rider helmet
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(L * 0.45, W / 2, 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0f2fe';
    g.fillRect(L - 3, W / 2 - 2, 3, 4);
    g.fillStyle = '#ef4444';
    g.fillRect(0, W / 2 - 1.5, 2, 3);
    return c;
  }
  // chassis
  const r = type === 'truck' ? 4 : 9;
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(0, 0, L, W, r);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.stroke();
  if (type === 'truck') {
    // cargo box + cab
    g.fillStyle = '#1e1b2e';
    g.fillRect(2, 2, L * 0.64, W - 4);
    g.strokeStyle = `${color}aa`;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(2 + (i * L * 0.64) / 6, 3);
      g.lineTo(2 + (i * L * 0.64) / 6, W - 3);
      g.stroke();
    }
    g.fillStyle = '#334155';
    g.fillRect(L * 0.7, 3, L * 0.28, W - 6);
    g.fillStyle = '#7dd3fc';
    g.globalAlpha = 0.75;
    g.fillRect(L * 0.86, 5, L * 0.1, W - 10);
    g.globalAlpha = 1;
  } else {
    // hover car: cockpit + fins
    const glass = g.createLinearGradient(L * 0.45, 0, L * 0.85, 0);
    glass.addColorStop(0, '#0e7490');
    glass.addColorStop(1, '#a5f3fc');
    g.fillStyle = glass;
    g.beginPath();
    g.ellipse(L * 0.6, W / 2, L * 0.2, W * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.fillRect(4, 3, L * 0.3, 2.5);
    g.fillRect(4, W - 5.5, L * 0.3, 2.5);
    g.fillRect(L * 0.86, W / 2 - 1, L * 0.12, 2);
  }
  // lights
  g.fillStyle = '#f0f9ff';
  g.fillRect(L - 3, 3, 3, 4);
  g.fillRect(L - 3, W - 7, 3, 4);
  g.fillStyle = '#f43f5e';
  g.fillRect(0, 3, 2.5, 4);
  g.fillRect(0, W - 7, 2.5, 4);
  return c;
}

/* ---------------- Traffic ---------------- */
interface Seg {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  len: number;
  curve: boolean;
}
interface TrafficCar {
  x: number;
  y: number;
  a: number;
  speed: number;
  target: number;
  seg: Seg;
  t: number;
  i: number; // next node
  j: number;
  di: number;
  dj: number;
  sprite: HTMLCanvasElement;
  color: string;
  wait: number;
  honk: number;
}
const laneOff = (k: number) => (k === 1 || k === 9 ? 30 : 20);
/** point in the lane for travel direction (di,dj) on the road through node (i,j), at distance d from the node center (negative = before) */
function lanePoint(i: number, j: number, di: number, dj: number, d: number) {
  const n = node(i, j);
  // right-hand traffic: lane is to the right of the travel direction (screen y points down)
  const k = di !== 0 ? j : i;
  const off = laneOff(k);
  const rx = -dj;
  const ry = di;
  return { x: n.x + di * d + rx * off, y: n.y + dj * d + ry * off };
}

/* ---------------- Races ---------------- */
interface Route {
  id: string;
  name: string;
  pts: { x: number; y: number }[];
  par: [number, number, number];
}
const P = (i: number, j: number) => ({ x: i * BLOCK, y: j * BLOCK });
function mkRoute(id: string, name: string, pts: { x: number; y: number }[]): Route {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  return { id, name, pts, par: [L / 470, L / 390, L / 310] };
}
const ROUTES: Route[] = [
  mkRoute('loop', 'Highway Loop', [P(3, 1), P(5, 1), P(7, 1), P(9, 1), P(9, 3), P(9, 5), P(9, 7), P(9, 9), P(7, 9), P(5, 9), P(3, 9), P(1, 9), P(1, 7), P(1, 5), P(1, 3), P(1, 1), P(2.6, 1)]),
  mkRoute('downtown', 'Downtown Dash', [P(3, 6.5), P(3, 5), P(3, 3), P(5, 3), P(7, 3), P(7, 5), P(6, 5), { x: 2240, y: 2000 }, { x: 1760, y: 2000 }, P(4, 5), P(4, 7), P(3, 7), P(3, 6.6)]),
  mkRoute('docks', 'Dockside Drift', [P(7, 2), P(8, 2), P(8, 4), P(7, 4), P(7, 6), P(8, 6), P(8, 8), P(9, 8), P(9, 7), { x: 3700, y: 2800 }]),
];

/* ---------------- Audio (Web Audio, all procedural) ---------------- */
class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  rain: GainNode | null = null;
  screech: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  noise: AudioBuffer | null = null;
  muted = false;
  volume = 0.6;

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * 0.8;
    this.master.connect(ctx.destination);
    // white noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // engine hum
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain, filter };
    // rain bed
    const rs = ctx.createBufferSource();
    rs.buffer = buf;
    rs.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 2500;
    const rg = ctx.createGain();
    rg.gain.value = 0.05;
    rs.connect(rf);
    rf.connect(rg);
    rg.connect(this.master);
    rs.start();
    this.rain = rg;
    // tyre screech
    const ss = ctx.createBufferSource();
    ss.buffer = buf;
    ss.loop = true;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 1800;
    sf.Q.value = 6;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    ss.connect(sf);
    sf.connect(sg);
    sg.connect(this.master);
    ss.start();
    this.screech = { gain: sg, filter: sf };
  }
  setMuted(m: boolean, v?: number) {
    this.muted = m;
    if (v !== undefined) this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume * 0.8, this.ctx.currentTime, 0.05);
  }
  suspend() {
    void this.ctx?.suspend();
  }
  update(inCar: boolean, speedN: number, pitch: number, slip: number, boost: boolean) {
    if (!this.ctx || !this.engine || !this.screech) return;
    const t = this.ctx.currentTime;
    const f = (45 + speedN * 120) * pitch;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(300 + speedN * 1400 + (boost ? 900 : 0), t, 0.1);
    this.engine.gain.gain.setTargetAtTime(inCar ? 0.05 + speedN * 0.07 : 0, t, 0.12);
    this.screech.gain.gain.setTargetAtTime(inCar ? clamp(slip, 0, 1) * 0.16 : 0, t, 0.05);
    this.screech.filter.frequency.setTargetAtTime(1400 + slip * 900, t, 0.1);
  }
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0, slide = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private burst(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }
  chime() {
    [880, 1175, 1568, 2093].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, i * 0.07));
  }
  success() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 'square', 0.06, i * 0.09));
  }
  fail() {
    this.tone(330, 0.5, 'sawtooth', 0.08, 0, -180);
  }
  crash(intensity: number) {
    this.burst(0.25 + intensity * 0.3, 500, 0.25 + intensity * 0.35);
    this.tone(80, 0.25, 'sine', 0.2 * intensity, 0, -40);
  }
  dash() {
    this.burst(0.18, 2400, 0.12, 'bandpass');
  }
  beep(high = false) {
    this.tone(high ? 1320 : 660, high ? 0.45 : 0.18, 'square', 0.08);
  }
  door() {
    this.tone(220, 0.08, 'square', 0.06);
    this.tone(330, 0.08, 'square', 0.05, 0.06);
  }
  honk() {
    this.tone(392, 0.22, 'square', 0.04);
    this.tone(311, 0.22, 'square', 0.04);
  }
  setRain(v: number) {
    if (this.rain && this.ctx) this.rain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }
  close() {
    void this.ctx?.close();
    this.ctx = null;
  }
}

/* ---------------- Particles ---------------- */
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2 | 3; // 0 glow dot, 1 spark line, 2 smoke (normal blend), 3 ring
}

/* ---------------- Missions ---------------- */
interface Zone {
  x: number;
  y: number;
}
interface Delivery {
  kind: 'delivery';
  cargo: string;
  pickup: Zone;
  drop: Zone;
  timeLeft: number;
  total: number;
  dist: number;
  hits: number;
}
interface Race {
  kind: 'race';
  route: Route;
  idx: number;
  time: number;
  countdown: number;
}
const CARGO = ['Encrypted drive', 'Synth noodles', 'Prototype chip', 'Neon bonsai', 'Holo-cat', 'Vintage cassette', 'Quantum battery', 'Mystery crate'];

/* ---------------- Input ---------------- */
interface Input {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dash: boolean;
  brake: boolean;
  joyX: number;
  joyY: number;
  joyActive: boolean;
}

/* =====================================================================
   The game
   ===================================================================== */
class Game {
  container: HTMLElement;
  opts: InitOptions;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  overlay: HTMLDivElement;
  audio = new Audio();
  world: World;
  save: CitySave;
  w = 0;
  h = 0;
  dpr = 1;
  zoom = 1;
  camX = 2000;
  camY = 2200;
  raf = 0;
  last = 0;
  time = 0;
  started = false;
  paused = false;
  showMap = false;
  reduced = false;
  touch = false;

  input: Input = { up: false, down: false, left: false, right: false, dash: false, brake: false, joyX: 0, joyY: 0, joyActive: false };
  mouse = { x: 0, y: 0, wx: 0, wy: 0, inside: false };

  // player
  px = 2000;
  py = 2200;
  pvx = 0;
  pvy = 0;
  pa = -Math.PI / 2;
  dashT = 0;
  dashCd = 0;
  walk = 0;
  inCar: Vehicle | null = null;

  vehicles: Vehicle[] = [];
  traffic: TrafficCar[] = [];
  drones: { cx: number; cy: number; r: number; a: number; sp: number; alt: number; x: number; y: number }[] = [];
  parts: Part[] = [];
  skids: { x0: number; y0: number; x1: number; y1: number; t: number }[] = [];
  skidHead = 0;
  rain: { x: number; y: number; l: number; s: number }[] = [];
  motes: { x: number; y: number; vx: number; vy: number; p: number }[] = [];
  splashes: { x: number; y: number; t: number }[] = [];
  shards: { x: number; y: number; taken: boolean }[] = [];
  pickups: Zone[] = [];
  mission: Delivery | Race | null = null;
  msgs: { text: string; sub?: string; t: number; color: string }[] = [];
  slip = 0;
  shake = 0;
  hint: string | null = null;

  // caches
  chunks = new Map<number, HTMLCanvasElement>();
  chunkOrder: number[] = [];
  glowSprites = new Map<string, HTMLCanvasElement>();
  cone: HTMLCanvasElement;
  minimap: HTMLCanvasElement;
  vignette: HTMLCanvasElement | null = null;
  noise: HTMLCanvasElement;
  tmpIdx: number[] = [];

  ro: ResizeObserver;
  cleanup: (() => void)[] = [];

  constructor(container: HTMLElement, opts: InitOptions) {
    this.container = container;
    this.opts = opts;
    this.reduced = !!opts.reducedMotion;
    this.save = { ...newSave(), ...(opts.save ?? {}) };
    this.save.shards = [...(this.save.shards ?? [])];
    this.audio.muted = !!opts.muted;
    this.audio.volume = opts.volume ?? 0.6;

    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.style.userSelect = 'none';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;cursor:crosshair';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Neon City game');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    container.appendChild(this.overlay);

    this.world = generate(20261127);
    this.shards = this.world.shardSpots.map((s, i) => ({ x: s.x, y: s.y, taken: this.save.shards.includes(i) }));
    this.world.parking.forEach((p, i) => {
      const spec = SPECS[p.type];
      const color = spec.colors[i % spec.colors.length];
      this.vehicles.push({ id: i, type: p.type, spec, color, sprite: vehicleSprite(p.type, color), x: p.spot.x, y: p.spot.y, a: p.spot.a, vx: 0, vy: 0, hp: spec.hp, boost: 1, disabled: 0, home: { ...p.spot }, lastSkid: null, repairing: 0 });
    });
    this.spawnTraffic(22);
    for (let i = 0; i < 9; i++) {
      const cx = rand(600, 3400);
      const cy = rand(600, 3400);
      this.drones.push({ cx, cy, r: rand(150, 420), a: rand(0, 6.28), sp: rand(0.12, 0.3) * (Math.random() < 0.5 ? -1 : 1), alt: rand(160, 230), x: cx, y: cy });
    }
    for (let i = 0; i < 3; i++) this.pickups.push(this.randomRoadSpot());
    for (let i = 0; i < 220; i++) this.rain.push({ x: Math.random(), y: Math.random(), l: rand(10, 22), s: rand(0.9, 1.4) });
    for (let i = 0; i < 70; i++) this.motes.push({ x: rand(0, WORLD), y: rand(0, WORLD), vx: rand(-6, 6), vy: rand(-6, 6), p: rand(0, 6.28) });

    this.noise = this.makeNoise();
    this.cone = this.makeCone();
    this.minimap = this.makeMinimap();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.bindInput();
    this.buildTouchUI();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ---------------- lifecycle ---------------- */
  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.audio.close();
    this.canvas.remove();
    this.overlay.remove();
    this.chunks.clear();
  }
  setPaused(p: boolean) {
    if (!this.started) return;
    this.paused = p;
    if (p) this.audio.suspend();
    else {
      this.audio.start();
      this.last = performance.now();
    }
  }
  emit(e: CityEvent) {
    this.opts.onEvent?.(e, this.save);
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(200, r.width);
    this.h = Math.max(200, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.w * this.h > 1.4e6 ? 1.25 : 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    const v = makeCanvas(this.w, this.h);
    const g = v.getContext('2d')!;
    const grad = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(4,0,14,0.72)');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.w, this.h);
    this.vignette = v;
  }

  /* ---------------- input ---------------- */
  bindInput() {
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, target: Window | HTMLElement = window, o?: AddEventListenerOptions) => {
      target.addEventListener(t, f as EventListener, o);
      this.cleanup.push(() => target.removeEventListener(t, f as EventListener, o));
    };
    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const visible = () => this.canvas.isConnected && this.canvas.getBoundingClientRect().bottom > 0;
    const set = (e: KeyboardEvent, v: boolean) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.input.up = v;
      else if (k === 's' || k === 'arrowdown') this.input.down = v;
      else if (k === 'a' || k === 'arrowleft') this.input.left = v;
      else if (k === 'd' || k === 'arrowright') this.input.right = v;
      else if (k === 'shift') this.input.dash = v;
      else if (k === ' ') this.input.brake = v;
      else return false;
      return true;
    };
    on('keydown', (e) => {
      if (typing(e) || !visible()) return;
      if (!this.started) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.start();
        }
        return;
      }
      if (set(e, true)) e.preventDefault();
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k === 'e' || k === 'f') this.interact();
      else if (k === 'm') this.showMap = !this.showMap;
      else if (k === 'r') this.recover();
      else if (k === 'escape' || k === 'p') this.setPaused(!this.paused);
      else if (k === 'x') this.cancelMission();
    });
    on('keyup', (e) => {
      set(e, false);
    });
    on('blur', () => {
      Object.assign(this.input, { up: false, down: false, left: false, right: false, dash: false, brake: false });
      if (this.started && !this.paused) this.setPaused(true);
    });
    const vis = () => {
      if (document.hidden && this.started && !this.paused) this.setPaused(true);
    };
    document.addEventListener('visibilitychange', vis);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', vis));
    on(
      'pointermove',
      (e) => {
        const r = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - r.left;
        this.mouse.y = e.clientY - r.top;
        this.mouse.inside = e.pointerType === 'mouse';
      },
      this.canvas,
    );
    on(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'mouse') this.touch = true;
        this.canvas.focus({ preventScroll: true });
        if (!this.started) {
          this.start();
          return;
        }
        if (this.paused) {
          this.setPaused(false);
          return;
        }
        if (this.showMap) {
          this.showMap = false;
          return;
        }
        if (e.pointerType === 'mouse' && e.button === 0) this.interact(true);
      },
      this.canvas,
    );
    on('contextmenu', (e) => e.preventDefault(), this.canvas);
  }

  buildTouchUI() {
    const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!coarse) return;
    this.touch = true;
    const css = (el: HTMLElement, s: string) => {
      el.style.cssText = s;
      return el;
    };
    const joy = css(document.createElement('div'), 'position:absolute;left:14px;bottom:14px;width:136px;height:136px;border-radius:50%;background:rgba(168,85,247,.12);border:2px solid rgba(168,85,247,.45);pointer-events:auto;touch-action:none;box-shadow:0 0 24px rgba(168,85,247,.3)');
    const knob = css(document.createElement('div'), 'position:absolute;left:43px;top:43px;width:50px;height:50px;border-radius:50%;background:rgba(34,211,238,.55);box-shadow:0 0 18px rgba(34,211,238,.7)');
    joy.appendChild(knob);
    this.overlay.appendChild(joy);
    let jid = -1;
    const jmove = (e: PointerEvent) => {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const max = 50;
      if (d > max) {
        dx = (dx / d) * max;
        dy = (dy / d) * max;
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.input.joyX = dx / max;
      this.input.joyY = dy / max;
      this.input.joyActive = true;
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.started) this.start();
      jid = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      jmove(e);
    });
    joy.addEventListener('pointermove', (e) => e.pointerId === jid && jmove(e));
    const jend = (e: PointerEvent) => {
      if (e.pointerId !== jid) return;
      jid = -1;
      knob.style.transform = '';
      this.input.joyX = 0;
      this.input.joyY = 0;
      this.input.joyActive = false;
    };
    joy.addEventListener('pointerup', jend);
    joy.addEventListener('pointercancel', jend);

    const btn = (label: string, right: number, bottom: number, size: number, color: string, down: () => void, up?: () => void) => {
      const b = css(
        document.createElement('button'),
        `position:absolute;right:${right}px;bottom:${bottom}px;width:${size}px;height:${size}px;border-radius:50%;border:2px solid ${color};background:rgba(10,6,24,.55);color:#fff;font:700 ${size > 60 ? 13 : 11}px Inter,system-ui,sans-serif;pointer-events:auto;touch-action:none;box-shadow:0 0 16px ${color}66;backdrop-filter:blur(4px)`,
      );
      b.textContent = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.started) this.start();
        b.style.background = `${color}55`;
        down();
      });
      const rel = () => {
        b.style.background = 'rgba(10,6,24,.55)';
        up?.();
      };
      b.addEventListener('pointerup', rel);
      b.addEventListener('pointercancel', rel);
      b.addEventListener('pointerleave', rel);
      this.overlay.appendChild(b);
    };
    btn('ENTER', 16, 96, 66, '#22d3ee', () => this.interact());
    btn('BOOST', 92, 26, 66, '#f472b6', () => (this.input.dash = true), () => (this.input.dash = false));
    btn('DRIFT', 16, 20, 66, '#fbbf24', () => (this.input.brake = true), () => (this.input.brake = false));
    btn('MAP', 100, 112, 46, '#a855f7', () => (this.showMap = !this.showMap));
  }

  start() {
    // on phones, bring the whole play area into view (clear of the sticky header and bottom bar)
    if (this.touch) this.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.started = true;
    this.paused = false;
    this.audio.start();
    this.audio.setMuted(this.audio.muted);
    this.last = performance.now();
    this.message('Welcome to Neon City', 'Grab a ride, find data shards, take courier jobs and race the streets', '#22d3ee');
  }

  /* ---------------- world helpers ---------------- */
  randomRoadSpot(minFrom?: Zone, minD = 0, maxD = Infinity): Zone {
    for (let tries = 0; tries < 200; tries++) {
      const i = 1 + Math.floor(Math.random() * 9);
      const j = 1 + Math.floor(Math.random() * 9);
      const horiz = Math.random() < 0.5;
      const d = rand(90, 310) * (Math.random() < 0.5 ? -1 : 1);
      const k = horiz ? j : i;
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = side * (roadWidth(k) / 2 - 16);
      const x = horiz ? i * BLOCK + d : i * BLOCK + off;
      const y = horiz ? j * BLOCK + off : j * BLOCK + d;
      const t = tileAt(this.world, x, y);
      if (t !== T.ROAD && t !== T.HWY) continue;
      if (minFrom) {
        const dist = Math.hypot(x - minFrom.x, y - minFrom.y);
        if (dist < minD || dist > maxD) continue;
      }
      if (this.pickups.some((p) => Math.hypot(p.x - x, p.y - y) < 400)) continue;
      return { x, y };
    }
    return { x: 2000, y: 1600 };
  }

  spawnTraffic(n: number) {
    const colors = ['#60a5fa', '#f87171', '#fbbf24', '#e5e7eb', '#a78bfa', '#34d399', '#fb7185'];
    for (let c = 0; c < n; c++) {
      let i = 1 + Math.floor(Math.random() * 9);
      let j = 1 + Math.floor(Math.random() * 9);
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([di, dj]) => edgeOpen(i, j, di, dj));
      if (!dirs.length) continue;
      const [di, dj] = dirs[Math.floor(Math.random() * dirs.length)];
      const color = colors[c % colors.length];
      const car: TrafficCar = { x: 0, y: 0, a: Math.atan2(dj, di), speed: 0, target: rand(170, 250), seg: null as unknown as Seg, t: 0, i, j, di, dj, sprite: vehicleSprite('hover', color), color, wait: 0, honk: 0 };
      // start on the straight from (i,j) to (i+di,j+dj)
      i += di;
      j += dj;
      car.i = i;
      car.j = j;
      this.straight(car, i - di, j - dj);
      car.t = Math.random() * car.seg.len * 0.8;
      this.traffic.push(car);
    }
  }
  /** set the car on the straight from node (fi,fj) towards node (car.i,car.j) */
  straight(car: TrafficCar, fi: number, fj: number) {
    const k0 = car.di !== 0 ? Math.max(roadWidth(fi), 0) : roadWidth(fj);
    const kk = car.di !== 0 ? roadWidth(car.i) : roadWidth(car.j);
    const p0 = lanePoint(fi, fj, car.di, car.dj, k0 / 2 + 4);
    const p1 = lanePoint(fi, fj, car.di, car.dj, BLOCK - kk / 2 - 4);
    car.seg = { x0: p0.x, y0: p0.y, cx: 0, cy: 0, x1: p1.x, y1: p1.y, len: Math.hypot(p1.x - p0.x, p1.y - p0.y), curve: false };
    car.t = 0;
  }
  turn(car: TrafficCar) {
    const opts = [
      [car.di, car.dj],
      [-car.dj, car.di],
      [car.dj, -car.di],
    ].filter(([di, dj]) => edgeOpen(car.i, car.j, di, dj));
    let [di, dj] = opts.length ? opts[Math.floor(Math.random() * opts.length)] : [-car.di, -car.dj];
    if (opts.length && Math.random() < 0.45 && edgeOpen(car.i, car.j, car.di, car.dj)) [di, dj] = [car.di, car.dj];
    const w = roadWidth(car.di !== 0 ? car.i : car.j);
    const w2 = roadWidth(di !== 0 ? car.i : car.j);
    const a = lanePoint(car.i, car.j, car.di, car.dj, -w2 / 2 - 4);
    const b = lanePoint(car.i, car.j, di, dj, w / 2 + 4);
    let cx = (a.x + b.x) / 2;
    let cy = (a.y + b.y) / 2;
    if (di !== car.di || dj !== car.dj) {
      // control point where the two lane lines cross
      cx = car.di !== 0 ? b.x : a.x;
      cy = car.di !== 0 ? a.y : b.y;
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y) * (di !== car.di || dj !== car.dj ? 1.2 : 1);
    car.seg = { x0: a.x, y0: a.y, cx, cy, x1: b.x, y1: b.y, len: Math.max(1, len), curve: true };
    car.t = 0;
    car.di = di;
    car.dj = dj;
  }

  /* ---------------- interaction ---------------- */
  nearestVehicle(maxD: number) {
    let best: Vehicle | null = null;
    let bd = maxD;
    for (const v of this.vehicles) {
      if (v.disabled > 0) continue;
      const d = Math.hypot(v.x - this.px, v.y - this.py);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }
  interact(fromClick = false) {
    if (!this.started || this.paused) return;
    if (this.inCar) {
      if (fromClick) return;
      this.exitCar();
      return;
    }
    const v = this.nearestVehicle(fromClick ? 90 : 80);
    if (!v) return;
    if (fromClick && Math.hypot(v.x - this.mouse.wx, v.y - this.mouse.wy) > 70) return;
    this.inCar = v;
    this.audio.door();
    this.message(v.spec.name, 'W/S drive · A/D steer · Space drift · Shift boost · E exit', v.color, 2.2);
  }
  exitCar() {
    const v = this.inCar;
    if (!v) return;
    if (this.mission?.kind === 'race' && this.mission.countdown <= 0) {
      this.mission = null;
      this.message('Race abandoned', undefined, '#f87171');
    } else if (this.mission?.kind === 'race') this.mission = null;
    const sides = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
    for (const s of sides) {
      const x = v.x + Math.cos(v.a + s) * (v.spec.wid / 2 + 16);
      const y = v.y + Math.sin(v.a + s) * (v.spec.wid / 2 + 16);
      if (!this.blocked(x, y, 9)) {
        this.px = x;
        this.py = y;
        break;
      }
    }
    this.pvx = v.vx * 0.3;
    this.pvy = v.vy * 0.3;
    this.inCar = null;
    this.audio.door();
  }
  recover() {
    const v = this.inCar;
    if (!v) return;
    // nearest road lane
    const i = clamp(Math.round(v.x / BLOCK), 1, 9);
    const j = clamp(Math.round(v.y / BLOCK), 1, 9);
    const nx = i * BLOCK;
    const ny = j * BLOCK;
    if (Math.abs(v.x - nx) < Math.abs(v.y - ny)) {
      v.x = nx + 20;
      v.a = Math.PI / 2;
    } else {
      v.y = ny + 20;
      v.a = 0;
    }
    if (inPlaza(v.x, v.y)) {
      v.x = 2000;
      v.y = 2250;
    }
    v.vx = v.vy = 0;
    this.message('Vehicle recovered', undefined, '#a5b4fc', 1.2);
  }
  cancelMission() {
    if (!this.mission) return;
    if (this.mission.kind === 'delivery') {
      this.save.failed++;
      this.pickups.push(this.randomRoadSpot());
    }
    this.mission = null;
    this.message('Mission cancelled', undefined, '#f87171', 1.5);
  }
  message(text: string, sub?: string, color = '#f0abfc', t = 3) {
    this.msgs = this.msgs.filter((m) => m.text !== text);
    this.msgs.push({ text, sub, t, color });
    if (this.msgs.length > 3) this.msgs.shift();
  }

  /* ---------------- collision ---------------- */
  blocked(x: number, y: number, r: number) {
    return this.collide({ x, y, vx: 0, vy: 0 }, r, true) > 0;
  }
  /** pushes the body out of solids; returns impact speed (0 = no contact) */
  collide(b: { x: number; y: number; vx: number; vy: number }, r: number, probe = false): number {
    let impact = 0;
    const W = this.world;
    const push = (nx: number, ny: number, pen: number) => {
      if (probe) {
        impact = 1;
        return;
      }
      b.x += nx * pen;
      b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        b.vx -= 1.35 * vn * nx;
        b.vy -= 1.35 * vn * ny;
        b.vx *= 0.88;
        b.vy *= 0.88;
      }
    };
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      const cx = clamp(b.x, x0, x1);
      const cy = clamp(b.y, y0, y1);
      let dx = b.x - cx;
      let dy = b.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return;
      if (d2 === 0) {
        // centre inside: push out along the shortest axis
        const l = b.x - x0;
        const rr = x1 - b.x;
        const t = b.y - y0;
        const bt = y1 - b.y;
        const m = Math.min(l, rr, t, bt);
        if (m === l) push(-1, 0, l + r);
        else if (m === rr) push(1, 0, rr + r);
        else if (m === t) push(0, -1, t + r);
        else push(0, 1, bt + r);
        return;
      }
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      push(dx, dy, r - d);
    };
    querySolids(W, b.x - r - 2, b.y - r - 2, b.x + r + 2, b.y + r + 2, this.tmpIdx);
    for (const idx of this.tmpIdx) {
      if (idx >= 100000) {
        const c = W.circles[idx - 100000];
        const dx = b.x - c.x;
        const dy = b.y - c.y;
        const d = Math.hypot(dx, dy);
        const rr = c.r + r;
        if (d < rr && d > 0) push(dx / d, dy / d, rr - d);
      } else {
        const bd = W.buildings[idx];
        rect(bd.x, bd.y, bd.x + bd.w, bd.y + bd.h);
      }
    }
    // water tiles and the world edge
    const tx0 = Math.floor((b.x - r) / TILE);
    const tx1 = Math.floor((b.x + r) / TILE);
    const ty0 = Math.floor((b.y - r) / TILE);
    const ty1 = Math.floor((b.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || ty < 0 || tx >= NT || ty >= NT || W.tiles[ty * NT + tx] === T.WATER) rect(tx * TILE, ty * TILE, tx * TILE + TILE, ty * TILE + TILE);
      }
    return impact;
  }

  /* ---------------- update ---------------- */
  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    this.prewarm();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started && !this.paused && !this.showMap) {
      // two sub-steps keep fast cars from tunnelling
      this.update(dt / 2);
      this.update(dt / 2);
    } else if (this.started && this.showMap) {
      this.time += dt * 0.2;
    } else {
      // attract mode: slow camera drift over the city
      this.time += dt;
      this.camX = 2000 + Math.cos(this.time * 0.05) * 700;
      this.camY = 2000 + Math.sin(this.time * 0.07) * 600;
      this.updateTraffic(dt);
      this.updateAmbient(dt);
    }
    this.render();
  };

  update(dt: number) {
    this.time += dt;
    const I = this.input;
    let ax = (I.right ? 1 : 0) - (I.left ? 1 : 0);
    let ay = (I.down ? 1 : 0) - (I.up ? 1 : 0);
    if (I.joyActive) {
      ax = I.joyX;
      ay = I.joyY;
    }
    // mouse world position
    this.mouse.wx = this.camX + (this.mouse.x - this.w / 2) / this.zoom;
    this.mouse.wy = this.camY + (this.mouse.y - this.h / 2) / this.zoom;

    const v = this.inCar;
    if (v) {
      // joystick: up = throttle, sideways = steer
      const steer = I.joyActive ? clamp(I.joyX * 1.4, -1, 1) : ax;
      const throttle = I.joyActive ? clamp(-I.joyY * 1.3, -1, 1) : -ay;
      this.drive(v, dt, throttle, steer, I.brake, I.dash);
      this.px = v.x;
      this.py = v.y;
    } else {
      this.walkUpdate(dt, ax, ay);
    }

    // vehicles not being driven: coast, respawn wrecks, regain boost
    for (const o of this.vehicles) {
      if (o.disabled > 0) {
        o.disabled -= dt;
        if (Math.random() < 0.3) this.spawn(o.x + rand(-10, 10), o.y + rand(-10, 10), rand(-10, 10), rand(-30, -10), 1.5, rand(6, 12), '#3f3f46', 2);
        if (o.disabled <= 0) {
          Object.assign(o, { x: o.home.x, y: o.home.y, a: o.home.a, vx: 0, vy: 0, hp: o.spec.hp, boost: 1, disabled: 0 });
        }
        continue;
      }
      if (o !== v) {
        o.vx *= 1 - Math.min(1, dt * 2.5);
        o.vy *= 1 - Math.min(1, dt * 2.5);
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (Math.abs(o.vx) + Math.abs(o.vy) > 1) this.collide(o, o.spec.r);
        o.boost = Math.min(1, o.boost + dt * 0.08);
      }
    }

    this.updateTraffic(dt);
    this.updateAmbient(dt);
    this.updateMissions(dt);

    // camera
    const look = v ? 0.45 : 0.15;
    const vx = v ? v.vx : this.pvx;
    const vy = v ? v.vy : this.pvy;
    const tx = this.px + vx * look;
    const ty = this.py + vy * look;
    this.camX = lerp(this.camX, tx, Math.min(1, dt * 4.5));
    this.camY = lerp(this.camY, ty, Math.min(1, dt * 4.5));
    const base = clamp(Math.min(this.w, this.h) / 820, 0.55, 1.25);
    const sp = v ? Math.hypot(v.vx, v.vy) / v.spec.max : 0;
    const zt = base * (v ? 1.0 - sp * 0.28 : 1.15);
    this.zoom = lerp(this.zoom, zt, Math.min(1, dt * 2));
    this.shake = Math.max(0, this.shake - dt * 3);

    // audio
    this.audio.update(!!v, v ? clamp(Math.hypot(v.vx, v.vy) / v.spec.max, 0, 1.4) : 0, v ? v.spec.pitch : 1, this.slip, !!v && I.dash && v.boost > 0.02);
  }

  walkUpdate(dt: number, ax: number, ay: number) {
    const len = Math.hypot(ax, ay);
    if (len > 1) {
      ax /= len;
      ay /= len;
    }
    const sp = 190;
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.input.dash && this.dashCd <= 0 && (len > 0.1 || this.dashT <= 0)) {
      this.dashT = 0.2;
      this.dashCd = 0.85;
      const dir = len > 0.1 ? Math.atan2(ay, ax) : this.pa;
      this.pvx = Math.cos(dir) * 620;
      this.pvy = Math.sin(dir) * 620;
      this.audio.dash();
      for (let i = 0; i < 14; i++) this.spawn(this.px, this.py, rand(-60, 60), rand(-60, 60), 0.4, rand(2, 4), '#22d3ee', 0);
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.spawn(this.px + rand(-4, 4), this.py + rand(-4, 4), 0, 0, 0.3, 3, '#a855f7', 0);
    } else {
      this.pvx = lerp(this.pvx, ax * sp, Math.min(1, dt * 12));
      this.pvy = lerp(this.pvy, ay * sp, Math.min(1, dt * 12));
    }
    const b = { x: this.px + this.pvx * dt, y: this.py + this.pvy * dt, vx: this.pvx, vy: this.pvy };
    this.collide(b, 10);
    this.px = b.x;
    this.py = b.y;
    // aim: mouse, else movement direction
    if (this.mouse.inside && !this.touch) this.pa = Math.atan2(this.mouse.wy - this.py, this.mouse.wx - this.px);
    else if (len > 0.1) this.pa = Math.atan2(ay, ax);
    if (len > 0.1) this.walk += dt * 10;
    // traffic bumps the courier aside
    for (const c of this.traffic) {
      const dx = this.px - c.x;
      const dy = this.py - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 28 && d > 0) {
        this.px = c.x + (dx / d) * 28;
        this.py = c.y + (dy / d) * 28;
        c.wait = 0.8;
        if (c.honk <= 0) {
          this.audio.honk();
          c.honk = 3;
        }
      }
    }
  }

  drive(v: Vehicle, dt: number, throttle: number, steer: number, hb: boolean, boostKey: boolean) {
    const s = v.spec;
    const race = this.mission?.kind === 'race' ? this.mission : null;
    if (race && race.countdown > 0) {
      v.vx *= 0.8;
      v.vy *= 0.8;
      return;
    }
    const fx = Math.cos(v.a);
    const fy = Math.sin(v.a);
    const rx = -fy;
    const ry = fx;
    let vf = v.vx * fx + v.vy * fy;
    let vr = v.vx * rx + v.vy * ry;
    const boosting = boostKey && v.boost > 0.02 && throttle >= 0;
    const max = s.max * (boosting ? 1.38 : 1) * (v.hp < s.hp * 0.25 ? 0.75 : 1);
    if (boosting) {
      v.boost = Math.max(0, v.boost - dt * 0.35);
      vf += s.accel * 0.9 * dt;
      const bx = v.x - fx * (s.len / 2 + 4);
      const by = v.y - fy * (s.len / 2 + 4);
      for (let i = 0; i < 2; i++) this.spawn(bx + rand(-3, 3), by + rand(-3, 3), -fx * rand(120, 260) + rand(-30, 30), -fy * rand(120, 260) + rand(-30, 30), rand(0.15, 0.3), rand(3, 6), Math.random() < 0.5 ? '#f472b6' : '#fbbf24', 0);
    } else v.boost = Math.min(1, v.boost + dt * 0.05);
    if (throttle > 0) vf += s.accel * throttle * dt * (vf < 0 ? 2 : 1);
    else if (throttle < 0) {
      if (vf > 20) vf -= s.brake * -throttle * dt;
      else vf = Math.max(-s.max * 0.35, vf + s.accel * 0.55 * throttle * dt);
    }
    vf -= vf * (throttle === 0 ? 0.9 : 0.25) * dt;
    if (vf > max) vf = lerp(vf, max, Math.min(1, dt * 3));
    // lateral grip (drift when handbraking)
    const grip = hb ? s.driftGrip : s.grip;
    vr -= vr * Math.min(1, grip * dt);
    if (hb) vf -= vf * 0.35 * dt;
    // steering scales with speed
    const speed = Math.hypot(v.vx, v.vy);
    const steerAmt = s.turn * steer * clamp(Math.abs(vf) / 160, 0, 1) * Math.sign(vf || 1) * (1 - 0.3 * clamp(speed / s.max, 0, 1)) * (hb ? 1.3 : 1);
    v.a += steerAmt * dt;
    v.vx = fx * vf + rx * vr;
    v.vy = fy * vf + ry * vr;
    v.x += v.vx * dt;
    v.y += v.vy * dt;

    // drifting → skid marks, screech
    this.slip = clamp((Math.abs(vr) - 60) / 220, 0, 1);
    if ((this.slip > 0.05 || (hb && speed > 160)) && v.type !== 'hover') {
      const bx = v.x - fx * s.len * 0.35;
      const by = v.y - fy * s.len * 0.35;
      const w = s.wid * 0.4;
      const seg: [number, number, number, number] = [bx + rx * w, by + ry * w, bx - rx * w, by - ry * w];
      if (v.lastSkid) {
        this.addSkid(v.lastSkid[0], v.lastSkid[1], seg[0], seg[1]);
        if (v.type !== 'bike') this.addSkid(v.lastSkid[2], v.lastSkid[3], seg[2], seg[3]);
      }
      v.lastSkid = seg;
      if (Math.random() < 0.3) this.spawn(bx, by, rand(-20, 20), rand(-20, 20), 0.8, rand(6, 12), '#52525b', 2);
    } else if (this.slip > 0.05 && v.type === 'hover') {
      // hover cars leave ion streaks instead of rubber
      const bx = v.x - fx * s.len * 0.4;
      const by = v.y - fy * s.len * 0.4;
      this.spawn(bx, by, rand(-10, 10), rand(-10, 10), 0.6, 3, v.color, 0);
      v.lastSkid = null;
    } else v.lastSkid = null;

    // collisions with the city
    const impact = this.collide(v, s.r);
    if (impact > 0) this.hitVehicle(v, impact);
    // traffic
    for (const c of this.traffic) {
      const dx = v.x - c.x;
      const dy = v.y - c.y;
      const d = Math.hypot(dx, dy);
      const rr = s.r + 18;
      if (d < rr && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        v.x = c.x + nx * rr;
        v.y = c.y + ny * rr;
        const vn = v.vx * nx + v.vy * ny;
        if (vn < 0) {
          v.vx -= 1.4 * vn * nx;
          v.vy -= 1.4 * vn * ny;
          this.hitVehicle(v, -vn);
        }
        c.wait = 1.2;
        if (c.honk <= 0) {
          this.audio.honk();
          c.honk = 3;
        }
      }
    }
    // parked vehicles get shoved
    for (const o of this.vehicles) {
      if (o === v || o.disabled > 0) continue;
      const dx = v.x - o.x;
      const dy = v.y - o.y;
      const d = Math.hypot(dx, dy);
      const rr = s.r + o.spec.r;
      if (d < rr && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        const vn = v.vx * nx + v.vy * ny;
        v.x = o.x + nx * rr;
        v.y = o.y + ny * rr;
        if (vn < 0) {
          o.vx += vn * nx * 0.8;
          o.vy += vn * ny * 0.8;
          v.vx -= 1.2 * vn * nx;
          v.vy -= 1.2 * vn * ny;
          this.hitVehicle(v, -vn * 0.6);
        }
      }
    }
    // repair bays
    for (const r of this.world.repair) {
      if (Math.hypot(v.x - r.x, v.y - r.y) < 46 && speed < 140 && v.hp < s.hp) {
        v.hp = Math.min(s.hp, v.hp + s.hp * dt * 0.6);
        v.boost = Math.min(1, v.boost + dt * 0.5);
        if (Math.random() < 0.4) this.spawn(v.x + rand(-20, 20), v.y + rand(-20, 20), 0, -30, 0.6, 3, '#34d399', 0);
        if (v.hp >= s.hp) {
          this.message('Fully repaired', undefined, '#34d399', 1.5);
          this.audio.chime();
        }
      }
    }
  }

  hitVehicle(v: Vehicle, impact: number) {
    if (impact < 120) return;
    const dmg = (impact - 120) * 0.065 * (v.type === 'truck' ? 0.6 : 1);
    v.hp -= dmg;
    this.shake = Math.min(1, this.shake + impact / 700);
    this.audio.crash(clamp(impact / 600, 0.1, 1));
    for (let i = 0; i < Math.min(30, impact / 12); i++) this.spawn(v.x + rand(-10, 10), v.y + rand(-10, 10), rand(-260, 260), rand(-260, 260), rand(0.2, 0.5), rand(1.5, 3), Math.random() < 0.5 ? '#fde68a' : '#fb923c', 1);
    if (this.mission?.kind === 'delivery' && this.inCar === v) this.mission.hits += 1;
    if (v.hp <= 0) {
      // wrecked: eject, explode, respawn later
      for (let i = 0; i < 60; i++) this.spawn(v.x, v.y, rand(-380, 380), rand(-380, 380), rand(0.3, 0.9), rand(2, 5), Math.random() < 0.5 ? '#f97316' : '#fde047', Math.random() < 0.3 ? 1 : 0);
      for (let i = 0; i < 4; i++) this.spawn(v.x, v.y, 0, 0, 0.6 + i * 0.15, 20 + i * 18, '#fb923c', 3);
      this.audio.crash(1);
      this.shake = 1;
      if (this.inCar === v) {
        this.exitCar();
        this.message(`${v.spec.name} wrecked!`, 'It will be towed back to its spot', '#f87171');
      }
      v.disabled = 15;
      v.vx = v.vy = 0;
    }
  }

  addSkid(x0: number, y0: number, x1: number, y1: number) {
    if (Math.hypot(x1 - x0, y1 - y0) > 40) return;
    const max = 1400;
    const s = { x0, y0, x1, y1, t: this.time };
    if (this.skids.length < max) this.skids.push(s);
    else {
      this.skids[this.skidHead] = s;
      this.skidHead = (this.skidHead + 1) % max;
    }
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: Part['kind']) {
    if (this.parts.length > 900) return;
    this.parts.push({ x, y, vx, vy, life, max: life, size, color, kind });
  }

  updateTraffic(dt: number) {
    for (const c of this.traffic) {
      c.honk -= dt;
      if (c.wait > 0) {
        c.wait -= dt;
        c.speed = lerp(c.speed, 0, Math.min(1, dt * 6));
      } else {
        // slow down behind another car or the player
        let target = c.target;
        const fx = Math.cos(c.a);
        const fy = Math.sin(c.a);
        const ahead = (x: number, y: number, range: number) => {
          const dx = x - c.x;
          const dy = y - c.y;
          const f = dx * fx + dy * fy;
          return f > 0 && f < range && Math.abs(-dx * fy + dy * fx) < 22;
        };
        for (const o of this.traffic) if (o !== c && ahead(o.x, o.y, 70)) target = Math.min(target, o.speed * 0.8);
        if (ahead(this.px, this.py, 90)) target = 0;
        c.speed = lerp(c.speed, target, Math.min(1, dt * 2.5));
      }
      c.t += c.speed * dt;
      while (c.t >= c.seg.len) {
        const over = c.t - c.seg.len;
        if (c.seg.curve) {
          this.straight(c, c.i, c.j);
          c.i += c.di;
          c.j += c.dj;
        } else this.turn(c);
        c.t = over;
      }
      const u = c.t / c.seg.len;
      const s = c.seg;
      let nx: number;
      let ny: number;
      if (s.curve) {
        const a = (1 - u) * (1 - u);
        const b = 2 * (1 - u) * u;
        const d = u * u;
        nx = a * s.x0 + b * s.cx + d * s.x1;
        ny = a * s.y0 + b * s.cy + d * s.y1;
      } else {
        nx = lerp(s.x0, s.x1, u);
        ny = lerp(s.y0, s.y1, u);
      }
      if (Math.hypot(nx - c.x, ny - c.y) > 0.5) c.a = Math.atan2(ny - c.y, nx - c.x);
      c.x = nx;
      c.y = ny;
    }
  }

  updateAmbient(dt: number) {
    for (const d of this.drones) {
      d.a += d.sp * dt;
      d.x = d.cx + Math.cos(d.a) * d.r;
      d.y = d.cy + Math.sin(d.a) * d.r * 0.7;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2;
      p.vy *= 1 - dt * 2;
    }
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.time + m.p) * 6) * dt;
      m.y += (m.vy + Math.cos(this.time * 0.7 + m.p) * 6) * dt;
      // keep motes around the camera
      const vw = this.w / this.zoom;
      const vh = this.h / this.zoom;
      if (m.x < this.camX - vw) m.x += vw * 2;
      if (m.x > this.camX + vw) m.x -= vw * 2;
      if (m.y < this.camY - vh) m.y += vh * 2;
      if (m.y > this.camY + vh) m.y -= vh * 2;
    }
    if (!this.reduced) {
      for (let k = 0; k < 2; k++)
        if (Math.random() < dt * 40) this.splashes.push({ x: this.camX + rand(-0.5, 0.5) * (this.w / this.zoom), y: this.camY + rand(-0.5, 0.5) * (this.h / this.zoom), t: 0 });
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].t += dt;
      if (this.splashes[i].t > 0.5) this.splashes.splice(i, 1);
    }
  }

  updateMissions(dt: number) {
    const v = this.inCar;
    const speed = v ? Math.hypot(v.vx, v.vy) : Math.hypot(this.pvx, this.pvy);
    this.hint = null;

    // data shards
    this.shards.forEach((s, i) => {
      if (s.taken) return;
      if (Math.hypot(s.x - this.px, s.y - this.py) < (v ? 34 : 26)) {
        s.taken = true;
        this.save.shards.push(i);
        this.audio.chime();
        for (let k = 0; k < 30; k++) this.spawn(s.x, s.y, rand(-200, 200), rand(-200, 200), rand(0.4, 0.8), rand(2, 4), '#67e8f9', 0);
        const n = this.save.shards.length;
        this.message(`Data shard ${n}/25`, n === 25 ? 'Every shard recovered — the city has no secrets left!' : this.world.shardSpots[i].where === 'alley' ? 'Found in a back alley' : this.world.shardSpots[i].where === 'docks' ? 'Found at the docks' : 'Found in the park', '#67e8f9');
        this.emit({ type: 'shard', count: n, total: 25 });
      }
    });

    // vehicle prompt
    if (!v) {
      const near = this.nearestVehicle(80);
      if (near) this.hint = `${this.touch ? 'Tap ENTER' : 'Press E'} — drive ${near.spec.name}`;
    }

    const m = this.mission;
    if (!m) {
      // start a delivery
      for (let i = 0; i < this.pickups.length; i++) {
        const p = this.pickups[i];
        if (Math.hypot(p.x - this.px, p.y - this.py) < 50 && speed < 260) {
          const drop = this.randomRoadSpot(p, 900, 2400);
          const dist = Math.hypot(drop.x - p.x, drop.y - p.y);
          const total = Math.round(dist / 290 + 14 + (v ? 0 : 25));
          this.mission = { kind: 'delivery', cargo: CARGO[Math.floor(Math.random() * CARGO.length)], pickup: p, drop, timeLeft: total, total, dist, hits: 0 };
          this.pickups.splice(i, 1);
          this.audio.beep(true);
          this.message('Contract accepted', `Deliver the ${this.mission.cargo.toLowerCase()} in ${total}s`, '#fbbf24');
          break;
        }
      }
      // start a race
      if (!this.mission && v)
        for (const r of ROUTES) {
          if (Math.hypot(r.pts[0].x - this.px, r.pts[0].y - this.py) < 60) {
            this.mission = { kind: 'race', route: r, idx: 1, time: 0, countdown: 3 };
            this.audio.beep();
            this.message(r.name, `Gold ${fmtTime(r.par[0])} · checkpoints ${r.pts.length - 1}`, '#f472b6', 2.5);
            break;
          }
        }
      else if (!this.mission && !v) for (const r of ROUTES) if (Math.hypot(r.pts[0].x - this.px, r.pts[0].y - this.py) < 70) this.hint = `${r.name}: get in a vehicle and drive through the start gate`;
      return;
    }

    if (m.kind === 'delivery') {
      m.timeLeft -= dt;
      if (Math.hypot(m.drop.x - this.px, m.drop.y - this.py) < 55 && speed < 320) {
        const onTime = m.timeLeft > 0;
        const reward = Math.max(40, Math.round((150 + m.dist / 10 + Math.max(0, m.timeLeft) * 6) * (onTime ? 1 : 0.4) * Math.max(0.5, 1 - m.hits * 0.04)));
        this.save.credits += reward;
        this.save.earned += reward;
        this.save.deliveries++;
        this.mission = null;
        this.pickups.push(this.randomRoadSpot());
        this.audio.success();
        for (let k = 0; k < 50; k++) this.spawn(this.px, this.py, rand(-300, 300), rand(-300, 300), rand(0.5, 1), rand(2, 4), Math.random() < 0.5 ? '#fbbf24' : '#34d399', 0);
        this.message(onTime ? `Delivered! +${reward} ¢` : `Late delivery +${reward} ¢`, m.hits > 3 ? 'The cargo took a beating…' : onTime ? `${Math.ceil(m.timeLeft)}s to spare` : 'Customer is not impressed', '#34d399');
        this.emit({ type: 'delivery', reward, deliveries: this.save.deliveries, earned: this.save.earned, onTime });
      } else if (m.timeLeft < -20) {
        this.mission = null;
        this.save.failed++;
        this.pickups.push(this.randomRoadSpot());
        this.audio.fail();
        this.message('Contract failed', 'The customer cancelled the order', '#f87171');
        this.emit({ type: 'delivery-failed' });
      } else if (m.timeLeft <= 0 && m.timeLeft + dt > 0) {
        this.audio.fail();
        this.message('Out of time!', 'Deliver anyway for a reduced fee', '#fb923c', 2);
      }
      return;
    }

    // race
    if (!v) {
      this.mission = null;
      return;
    }
    if (m.countdown > 0) {
      const before = Math.ceil(m.countdown);
      m.countdown -= dt;
      const after = Math.ceil(m.countdown);
      if (after !== before) {
        if (after > 0) this.audio.beep();
        else this.audio.beep(true);
      }
      return;
    }
    m.time += dt;
    const g = m.route.pts[m.idx];
    if (Math.hypot(g.x - this.px, g.y - this.py) < 75) {
      m.idx++;
      this.audio.chime();
      for (let k = 0; k < 24; k++) this.spawn(g.x, g.y, rand(-220, 220), rand(-220, 220), 0.5, 3, '#f472b6', 0);
      if (m.idx >= m.route.pts.length) {
        const r = m.route;
        const t = m.time;
        const medal: Medal = t <= r.par[0] ? 'gold' : t <= r.par[1] ? 'silver' : t <= r.par[2] ? 'bronze' : null;
        const prev = this.save.best[r.id];
        const newBest = prev === undefined || t < prev;
        if (newBest) this.save.best[r.id] = t;
        const rank = { gold: 3, silver: 2, bronze: 1 };
        if (medal && (!this.save.medals[r.id] || rank[medal] > rank[this.save.medals[r.id]])) this.save.medals[r.id] = medal;
        const prize = medal === 'gold' ? 400 : medal === 'silver' ? 250 : medal === 'bronze' ? 150 : 60;
        this.save.credits += prize;
        this.save.earned += prize;
        this.mission = null;
        this.audio.success();
        this.message(`${medal ? medal.toUpperCase() + ' — ' : ''}${fmtTime(t)}`, `${r.name} · +${prize} ¢${newBest ? ' · new personal best!' : ''}`, medal === 'gold' ? '#fde047' : medal === 'silver' ? '#e2e8f0' : medal === 'bronze' ? '#fdba74' : '#a5b4fc', 4);
        this.emit({ type: 'race', route: r.id, name: r.name, time: t, medal, best: this.save.best[r.id], newBest });
      }
    }
  }

  /* =====================================================================
     Rendering
     ===================================================================== */
  makeNoise() {
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d')!;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  makeCone() {
    const c = makeCanvas(300, 160);
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(0, 80, 4, 0, 80, 300);
    grad.addColorStop(0, 'rgba(220,240,255,0.55)');
    grad.addColorStop(0.5, 'rgba(160,200,255,0.16)');
    grad.addColorStop(1, 'rgba(120,160,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 80);
    g.lineTo(300, 0);
    g.lineTo(300, 160);
    g.closePath();
    g.fill();
    return c;
  }
  glow(color: string, size = 128) {
    const key = color + size;
    let c = this.glowSprites.get(key);
    if (!c) {
      c = makeCanvas(size, size);
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, color);
      grad.addColorStop(0.25, color + 'aa');
      grad.addColorStop(1, color + '00');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      this.glowSprites.set(key, c);
    }
    return c;
  }

  makeMinimap() {
    const S = 0.1;
    const c = makeCanvas(WORLD * S, WORLD * S);
    const g = c.getContext('2d')!;
    const col: Record<number, string> = { [T.GRASS]: '#0f2f22', [T.ROAD]: '#3b3b55', [T.WALK]: '#1c1c2a', [T.WATER]: '#071a33', [T.PLAZA]: '#3b2466', [T.DOCK]: '#4a3524', [T.HWY]: '#1e5a74', [T.PATH]: '#2e4a3a', [T.LOT]: '#20212b' };
    for (let ty = 0; ty < NT; ty++)
      for (let tx = 0; tx < NT; tx++) {
        g.fillStyle = col[this.world.tiles[ty * NT + tx]] ?? '#000';
        g.fillRect(tx * TILE * S, ty * TILE * S, TILE * S + 0.5, TILE * S + 0.5);
      }
    for (const b of this.world.buildings) {
      g.fillStyle = b.kind === 'container' ? '#3a2a3a' : '#2a2140';
      g.fillRect(b.x * S, b.y * S, b.w * S, b.h * S);
    }
    for (const t of this.world.circles) {
      g.fillStyle = t.kind === 'fountain' ? '#22d3ee' : '#1f6b4a';
      g.beginPath();
      g.arc(t.x * S, t.y * S, Math.max(1, t.r * S), 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  /** Ground chunk: wet asphalt, markings, sidewalks, grass, docks, water base. */
  chunk(cx: number, cy: number): HTMLCanvasElement {
    const key = cy * 100 + cx;
    const hit = this.chunks.get(key);
    if (hit) {
      // LRU bump
      const i = this.chunkOrder.indexOf(key);
      if (i >= 0) this.chunkOrder.splice(i, 1);
      this.chunkOrder.push(key);
      return hit;
    }
    const CS = 500;
    const c = makeCanvas(CS, CS);
    const g = c.getContext('2d')!;
    const ox = cx * CS;
    const oy = cy * CS;
    const W = this.world;
    const seed = (x: number, y: number) => {
      const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };
    const base: Record<number, string> = { [T.GRASS]: '#0a1c16', [T.ROAD]: '#121320', [T.WALK]: '#1a1a27', [T.WATER]: '#050f1d', [T.PLAZA]: '#181330', [T.DOCK]: '#2a1d15', [T.HWY]: '#0f1019', [T.PATH]: '#262630', [T.LOT]: '#17181f' };
    for (let ty = 0; ty < CS / TILE; ty++)
      for (let tx = 0; tx < CS / TILE; tx++) {
        const wx = ox + tx * TILE;
        const wy = oy + ty * TILE;
        const t = tileAt(W, wx + 1, wy + 1);
        const r = seed(wx, wy);
        g.fillStyle = base[t];
        g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        if (t === T.WALK || t === T.PLAZA) {
          g.strokeStyle = t === T.PLAZA ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.045)';
          g.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
          if (t === T.PLAZA && (Math.floor(wx / TILE) + Math.floor(wy / TILE)) % 2 === 0) {
            g.fillStyle = 'rgba(168,85,247,0.06)';
            g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
          }
        } else if (t === T.GRASS) {
          g.fillStyle = `rgba(52,211,153,${0.03 + r * 0.05})`;
          g.fillRect(tx * TILE + r * 10, ty * TILE + ((r * 7) % 10), 6, 6);
        } else if (t === T.DOCK) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(tx * TILE, ty * TILE + 9, TILE, 1);
          g.fillRect(tx * TILE, ty * TILE + 19, TILE, 1);
        } else if (t === T.LOT && r < 0.08) {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.arc(tx * TILE + 10, ty * TILE + 10, 6 + r * 50, 0, Math.PI * 2);
          g.fill();
        } else if ((t === T.ROAD || t === T.HWY) && r < 0.12) {
          // wet patches catch the light
          g.fillStyle = `rgba(120,140,255,${0.03 + r * 0.2})`;
          g.beginPath();
          g.ellipse(tx * TILE + 10, ty * TILE + 10, 12 + r * 60, 5 + r * 20, r * 6, 0, Math.PI * 2);
          g.fill();
        }
      }
    // asphalt grain
    g.fillStyle = g.createPattern(this.noise, 'repeat')!;
    g.globalAlpha = 0.6;
    g.fillRect(0, 0, CS, CS);
    g.globalAlpha = 1;

    g.translate(-ox, -oy);
    // road markings
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const c0 = k * BLOCK;
      const hw = roadWidth(k) / 2;
      const hwy = k === 1 || k === 9;
      for (let j = 1; j < 9; j++) {
        const a = j * BLOCK + roadWidth(j) / 2;
        const b = (j + 1) * BLOCK - roadWidth(j + 1) / 2;
        for (const vertical of [true, false]) {
          const seg = (x0: number, y0: number, x1: number, y1: number) => (vertical ? [x0, y0, x1, y1] : [y0, x0, y1, x1]) as [number, number, number, number];
          const midX = vertical ? c0 : (a + b) / 2;
          const midY = vertical ? (a + b) / 2 : c0;
          if (inPlaza(midX, midY)) continue;
          // centre line
          g.lineWidth = hwy ? 2.5 : 2;
          g.setLineDash(hwy ? [] : [18, 16]);
          g.strokeStyle = hwy ? 'rgba(34,211,238,0.55)' : 'rgba(250,204,21,0.55)';
          let [x0, y0, x1, y1] = seg(c0 - (hwy ? 3 : 0), a, c0 - (hwy ? 3 : 0), b);
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.stroke();
          if (hwy) {
            [x0, y0, x1, y1] = seg(c0 + 3, a, c0 + 3, b);
            g.beginPath();
            g.moveTo(x0, y0);
            g.lineTo(x1, y1);
            g.stroke();
            // lane dividers
            g.setLineDash([14, 18]);
            g.strokeStyle = 'rgba(255,255,255,0.25)';
            for (const o of [-30, 30]) {
              [x0, y0, x1, y1] = seg(c0 + o, a, c0 + o, b);
              g.beginPath();
              g.moveTo(x0, y0);
              g.lineTo(x1, y1);
              g.stroke();
            }
          }
          // curbs
          g.setLineDash([]);
          g.strokeStyle = hwy ? 'rgba(244,114,182,0.5)' : 'rgba(255,255,255,0.12)';
          g.lineWidth = hwy ? 2 : 1.5;
          for (const o of [-hw, hw]) {
            [x0, y0, x1, y1] = seg(c0 + o, a, c0 + o, b);
            g.beginPath();
            g.moveTo(x0, y0);
            g.lineTo(x1, y1);
            g.stroke();
          }
        }
      }
      // crosswalks at each intersection approach
      for (let j = 1; j <= 9; j++) {
        const n = { x: c0, y: j * BLOCK };
        if (inPlaza(n.x, n.y) || hwy) continue;
        g.fillStyle = 'rgba(255,255,255,0.32)';
        const hwj = roadWidth(j) / 2;
        for (let s = -hw + 6; s < hw - 4; s += 10) {
          g.fillRect(n.x + s, n.y - hwj - 16, 6, 12); // north
          g.fillRect(n.x + s, n.y + hwj + 4, 6, 12); // south
        }
        for (let s = -hwj + 6; s < hwj - 4; s += 10) {
          g.fillRect(n.x - hw - 16, n.y + s, 12, 6);
          g.fillRect(n.x + hw + 4, n.y + s, 12, 6);
        }
      }
    }
    g.setLineDash([]);
    // plaza rings
    g.strokeStyle = 'rgba(168,85,247,0.35)';
    g.lineWidth = 3;
    for (const r of [130, 250, 330]) {
      g.beginPath();
      g.arc(2000, 2000, r, 0, Math.PI * 2);
      g.stroke();
    }
    // quay edge
    g.strokeStyle = 'rgba(251,191,36,0.6)';
    g.lineWidth = 3;
    g.setLineDash([20, 12]);
    g.beginPath();
    g.moveTo(WATER_X, 0);
    g.lineTo(WATER_X, WORLD);
    g.stroke();
    g.setLineDash([]);

    this.chunks.set(key, c);
    this.chunkOrder.push(key);
    while (this.chunkOrder.length > 40) this.chunks.delete(this.chunkOrder.shift()!);
    return c;
  }

  /** build one not-yet-cached ground chunk near the camera per frame, so driving never stalls */
  prewarm() {
    const cx0 = Math.floor(this.camX / 500);
    const cy0 = Math.floor(this.camY / 500);
    for (let r = 0; r <= 2; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const cx = cx0 + dx;
          const cy = cy0 + dy;
          if (cx < 0 || cy < 0 || cx > 7 || cy > 7 || this.chunks.has(cy * 100 + cx)) continue;
          this.chunk(cx, cy);
          return;
        }
  }

  render() {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    const z = this.zoom;
    const sh = this.shake * 6 * (this.reduced ? 0 : 1);
    const camX = this.camX + rand(-sh, sh);
    const camY = this.camY + rand(-sh, sh);
    const vw = w / z;
    const vh = h / z;
    const L = camX - vw / 2;
    const Tp = camY - vh / 2;
    const Rt = L + vw;
    const B = Tp + vh;
    const vis = (x: number, y: number, m = 60) => x > L - m && x < Rt + m && y > Tp - m && y < B + m;
    const t = this.time;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05030c';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - camX * z), dpr * (h / 2 - camY * z));
    ctx.imageSmoothingEnabled = true;

    /* 1. ground chunks */
    const CS = 500;
    for (let cy = Math.max(0, Math.floor(Tp / CS)); cy <= Math.min(7, Math.floor(B / CS)); cy++)
      for (let cx = Math.max(0, Math.floor(L / CS)); cx <= Math.min(7, Math.floor(Rt / CS)); cx++) ctx.drawImage(this.chunk(cx, cy), cx * CS, cy * CS);

    // water ripples
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(56,189,248,0.18)';
    ctx.lineWidth = 1.5;
    const step = 40;
    for (let y = Math.floor(Tp / step) * step; y < B; y += step)
      for (let x = Math.floor(L / step) * step; x < Rt; x += step) {
        if (tileAt(this.world, x + 20, y + 20) !== T.WATER) continue;
        const ph = Math.sin(t * 1.6 + x * 0.05 + y * 0.03);
        ctx.beginPath();
        ctx.moveTo(x + 6 + ph * 6, y + 20 + ph * 3);
        ctx.lineTo(x + 24 + ph * 6, y + 20 + ph * 3);
        ctx.stroke();
      }
    ctx.globalCompositeOperation = 'source-over';

    // skid marks (fade over 14 s)
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.5;
    for (const s of this.skids) {
      const age = t - s.t;
      if (age > 14 || !vis(s.x0, s.y0)) continue;
      ctx.strokeStyle = `rgba(0,0,0,${0.55 * (1 - age / 14)})`;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
    // rain splashes
    ctx.strokeStyle = 'rgba(165,180,252,0.28)';
    ctx.lineWidth = 1;
    for (const s of this.splashes) {
      ctx.globalAlpha = 1 - s.t / 0.5;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 2 + s.t * 16, 1 + s.t * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* 2. reflections of neon on the wet street */
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.world.lamps) {
      if (!vis(l.x, l.y, 120)) continue;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.glow(l.color, 128), l.x - 64, l.y - 50, 128, 128);
      ctx.globalAlpha = 0.18;
      ctx.drawImage(this.glow(l.color, 64), l.x - 8, l.y + 10, 16, 60);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // ground objectives: repair bays, pickups, drop zone, race gates, shards
    this.drawZones(ctx, vis, t);

    /* 3. shadows */
    const SX = 0.45;
    const SY = 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    const blds: Building[] = [];
    for (let i = 0; i < this.world.buildings.length; i++) {
      const b = this.world.buildings[i];
      if (b.x + b.w < L - 260 || b.x > Rt + 260 || b.y + b.h < Tp - 260 || b.y > B + 260) continue;
      blds.push(b);
      const dx = b.height * SX;
      const dy = b.height * SY;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + b.w, b.y);
      ctx.lineTo(b.x + b.w + dx, b.y + dy);
      ctx.lineTo(b.x + b.w + dx, b.y + b.h + dy);
      ctx.lineTo(b.x + dx, b.y + b.h + dy);
      ctx.lineTo(b.x, b.y + b.h);
      ctx.closePath();
      ctx.fill();
    }
    for (const c of this.world.circles) {
      if (!vis(c.x, c.y, 80)) continue;
      ctx.beginPath();
      ctx.ellipse(c.x + c.r * 0.5, c.y + c.r * 0.7, c.r, c.r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const carShadow = (x: number, y: number, a: number, l: number, wd: number) => {
      ctx.save();
      ctx.translate(x + 5, y + 7);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.roundRect(-l / 2, -wd / 2, l, wd, 6);
      ctx.fill();
      ctx.restore();
    };
    for (const v of this.vehicles) if (vis(v.x, v.y)) carShadow(v.x, v.y, v.a, v.spec.len, v.spec.wid);
    for (const c of this.traffic) if (vis(c.x, c.y)) carShadow(c.x, c.y, c.a, 46, 24);
    for (const d of this.drones) if (vis(d.x, d.y, 150)) {
      ctx.beginPath();
      ctx.ellipse(d.x + d.alt * SX * 0.5, d.y + d.alt * SY * 0.5, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 4. entities at street level */
    for (const v of this.vehicles) if (vis(v.x, v.y)) this.drawVehicle(ctx, v);
    for (const c of this.traffic) if (vis(c.x, c.y)) this.drawSprite(ctx, c.sprite, c.x, c.y, c.a);
    if (!this.inCar) this.drawPlayer(ctx);

    // street furniture: trees, fountain, pillars
    for (const c of this.world.circles) if (vis(c.x, c.y, 80)) this.drawCircleProp(ctx, c, t, camX, camY);

    /* 5. buildings with 2.5D parallax roofs, far first */
    const PAR = 0.00085;
    blds.sort((a, b) => Math.hypot(b.x + b.w / 2 - camX, b.y + b.h / 2 - camY) - Math.hypot(a.x + a.w / 2 - camX, a.y + a.h / 2 - camY));
    const glows: (() => void)[] = [];
    for (const b of blds) this.drawBuilding(ctx, b, camX, camY, PAR, glows, t);

    // drones (above roofs)
    for (const d of this.drones) {
      if (!vis(d.x, d.y, 200)) continue;
      const ox = (d.x - camX) * d.alt * PAR;
      const oy = (d.y - camY) * d.alt * PAR;
      const x = d.x + ox;
      const y = d.y + oy;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.a);
      ctx.fillStyle = '#1e1b2e';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      ctx.lineTo(10, 10);
      ctx.moveTo(10, -10);
      ctx.lineTo(-10, 10);
      ctx.stroke();
      for (const [a, b2] of [[-10, -10], [10, 10], [10, -10], [-10, 10]]) {
        ctx.beginPath();
        ctx.arc(a, b2, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(148,163,184,0.25)';
        ctx.fill();
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      glows.push(() => {
        const blink = Math.sin(t * 6 + d.cx) > 0.3;
        if (blink) ctx.drawImage(this.glow('#ef4444', 32), x - 10, y - 10, 20, 20);
        // searchlight on the ground
        ctx.globalAlpha = 0.25;
        ctx.drawImage(this.glow('#a5f3fc', 128), d.x - 50, d.y - 40, 100, 80);
        ctx.globalAlpha = 1;
      });
    }

    /* 6. lighting & glow pass (additive) */
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.world.lamps) {
      if (!vis(l.x, l.y, 40)) continue;
      ctx.drawImage(this.glow(l.color, 32), l.x - 7, l.y - 7, 14, 14);
    }
    glows.forEach((f) => f());
    // headlights, underglow, taillights
    const lights = (x: number, y: number, a: number, len: number, wid: number, color: string, cone: number, strong: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = strong ? 0.9 : 0.55;
      ctx.drawImage(this.cone, len / 2 - 4, -cone * 0.27, cone, cone * 0.54);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glow(color, 64), -len / 2 - 6, -wid / 2 - 8, len + 12, wid + 16);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.glow('#f43f5e', 32), -len / 2 - 10, -wid / 2 - 4, 16, 16);
      ctx.drawImage(this.glow('#f43f5e', 32), -len / 2 - 10, wid / 2 - 12, 16, 16);
      ctx.restore();
      ctx.globalAlpha = 1;
    };
    for (const c of this.traffic) if (vis(c.x, c.y, 300)) lights(c.x, c.y, c.a, 46, 24, c.color, 180, false);
    for (const v of this.vehicles) if (v.disabled <= 0 && vis(v.x, v.y, 300)) {
      if (v === this.inCar) lights(v.x, v.y, v.a, v.spec.len, v.spec.wid, v.color, v.spec.cone, true);
      else {
        ctx.globalAlpha = 0.35 + Math.sin(t * 2 + v.id) * 0.1;
        ctx.drawImage(this.glow(v.color, 64), v.x - v.spec.len / 2 - 8, v.y - v.spec.len / 2 - 8, v.spec.len + 16, v.spec.len + 16);
        ctx.globalAlpha = 1;
      }
    }
    if (!this.inCar) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glow('#22d3ee', 64), this.px - 26, this.py - 26, 52, 52);
      ctx.globalAlpha = 1;
    }
    // particles
    for (const p of this.parts) {
      if (!vis(p.x, p.y)) continue;
      const k = p.life / p.max;
      if (p.kind === 2) continue;
      if (p.kind === 1) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = k;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === 3) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = k;
        ctx.lineWidth = 4 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k) * 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = k;
        const s = p.size * 4;
        ctx.drawImage(this.glow(p.color, 32), p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    // dust motes
    for (const m of this.motes) {
      if (!vis(m.x, m.y)) continue;
      ctx.globalAlpha = 0.35 + Math.sin(t * 2 + m.p) * 0.25;
      ctx.drawImage(this.glow(['#f0abfc', '#67e8f9', '#c4b5fd'][Math.floor(m.p) % 3], 16), m.x - 3, m.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // smoke (normal blend, on top)
    for (const p of this.parts) {
      if (p.kind !== 2 || !vis(p.x, p.y)) continue;
      ctx.globalAlpha = (p.life / p.max) * 0.35;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2 - p.life / p.max), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* 7. weather (screen space) */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.reduced) {
      ctx.strokeStyle = 'rgba(180,190,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of this.rain) {
        d.y += 0.016 * d.s * 1.6;
        d.x += 0.016 * d.s * 0.25;
        if (d.y > 1.05) {
          d.y = -0.05;
          d.x = Math.random();
        }
        if (d.x > 1.05) d.x -= 1.1;
        const x = d.x * w;
        const y = d.y * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x - d.l * 0.25, y - d.l);
      }
      ctx.stroke();
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);

    /* 8. HUD */
    this.drawHUD(ctx, camX, camY);
    if (this.showMap) this.drawBigMap(ctx);
    if (!this.started) this.drawTitle(ctx);
    else if (this.paused) this.drawPause(ctx);
  }

  drawSprite(ctx: CanvasRenderingContext2D, sp: HTMLCanvasElement, x: number, y: number, a: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
    ctx.restore();
  }
  drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle) {
    if (v.disabled > 0) {
      ctx.globalAlpha = 0.55;
      ctx.filter = 'grayscale(1) brightness(0.5)';
      this.drawSprite(ctx, v.sprite, v.x, v.y, v.a);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      return;
    }
    if (v.type === 'hover') {
      // hover cars bob slightly above their shadow
      const bob = Math.sin(this.time * 3 + v.id) * 1.5;
      this.drawSprite(ctx, v.sprite, v.x, v.y - 3 + bob, v.a);
    } else this.drawSprite(ctx, v.sprite, v.x, v.y, v.a);
  }
  drawPlayer(ctx: CanvasRenderingContext2D) {
    const x = this.px;
    const y = this.py;
    const bob = Math.sin(this.walk) * 1.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(this.pa);
    // legs
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(-4 + bob, -7, 8, 4);
    ctx.fillRect(-4 - bob, 3, 8, 4);
    // backpack with glowing strip
    ctx.fillStyle = '#312e81';
    ctx.fillRect(-12, -7, 7, 14);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(-11, -1.5, 5, 3);
    // body
    ctx.fillStyle = '#4c1d95';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f0abfc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // head + visor
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(1, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(3, -3.5, 3, 7);
    ctx.restore();
  }
  drawCircleProp(ctx: CanvasRenderingContext2D, c: World['circles'][number], t: number, camX: number, camY: number) {
    if (c.kind === 'tree') {
      const ox = (c.x - camX) * 26 * 0.00085;
      const oy = (c.y - camY) * 26 * 0.00085;
      ctx.fillStyle = '#052e1f';
      ctx.beginPath();
      ctx.arc(c.x + ox, c.y + oy, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c.color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(c.x + ox - c.r * 0.25, c.y + oy - c.r * 0.25, c.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (c.kind === 'fountain') {
      ctx.fillStyle = '#0b1e33';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const r = ((t * 30 + i * 22) % 66) + 2;
        ctx.strokeStyle = `rgba(34,211,238,${0.5 * (1 - r / 68)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.7;
      ctx.drawImage(this.glow('#22d3ee', 128), c.x - 60, c.y - 60, 120, 120);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else if (c.kind === 'pillar') {
      const ox = (c.x - camX) * 60 * 0.00085;
      const oy = (c.y - camY) * 60 * 0.00085;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.r * 1.4;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + ox, c.y + oy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0f0a1f';
      ctx.beginPath();
      ctx.arc(c.x + ox, c.y + oy, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + Math.sin(t * 2 + c.x) * 0.3;
      ctx.drawImage(this.glow(c.color, 64), c.x + ox - 26, c.y + oy - 26, 52, 52);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBuilding(ctx: CanvasRenderingContext2D, b: Building, camX: number, camY: number, PAR: number, glows: (() => void)[], t: number) {
    const ox = (b.x + b.w / 2 - camX) * b.height * PAR;
    const oy = (b.y + b.h / 2 - camY) * b.height * PAR;
    const x0 = b.x;
    const y0 = b.y;
    const x1 = b.x + b.w;
    const y1 = b.y + b.h;
    const rows = Math.min(5, Math.max(1, Math.floor(b.height / 24)));
    const wall = (ax: number, ay: number, bx: number, by: number, shade: number) => {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + ox, by + oy);
      ctx.lineTo(ax + ox, ay + oy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fill();
      if (b.kind === 'tower') {
        // rows of lit windows
        ctx.strokeStyle = b.windows;
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 6]);
        for (let r = 1; r <= rows; r++) {
          const k = r / (rows + 1);
          ctx.beginPath();
          ctx.moveTo(ax + ox * k, ay + oy * k);
          ctx.lineTo(bx + ox * k, by + oy * k);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    };
    if (ox > 0) wall(x0, y0, x0, y1, 0.35);
    if (ox < 0) wall(x1, y0, x1, y1, 0.35);
    if (oy > 0) wall(x0, y0, x1, y0, 0.15);
    if (oy < 0) wall(x0, y1, x1, y1, 0.5);
    // roof
    const rx = x0 + ox;
    const ry = y0 + oy;
    ctx.fillStyle = b.roof;
    ctx.fillRect(rx, ry, b.w, b.h);
    if (b.kind === 'container') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let i = 4; i < b.w; i += 5) {
        ctx.beginPath();
        ctx.moveTo(rx + i, ry + 1);
        ctx.lineTo(rx + i, ry + b.h - 1);
        ctx.stroke();
      }
      return;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(rx + 3, ry + 3, b.w - 6, b.h - 6);
    ctx.strokeStyle = b.edge;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(rx + 0.8, ry + 0.8, b.w - 1.6, b.h - 1.6);
    ctx.globalAlpha = 1;
    // roof details
    for (const v of b.vents) {
      ctx.fillStyle = '#0d0b17';
      ctx.fillRect(rx + v.x, ry + v.y, v.w, v.h);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + v.x + 0.5, ry + v.y + 0.5, v.w - 1, v.h - 1);
      ctx.beginPath();
      ctx.arc(rx + v.x + v.w / 2, ry + v.y + v.h / 2, Math.min(v.w, v.h) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (b.heli) {
      const cx = rx + b.w / 2;
      const cy = ry + b.h / 2;
      const r = Math.min(b.w, b.h) * 0.32;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.font = `900 ${r}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', cx, cy + 1);
      glows.push(() => {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          if (Math.floor(t * 3) % 8 === i) ctx.drawImage(this.glow('#fde047', 32), cx + Math.cos(a) * r - 8, cy + Math.sin(a) * r - 8, 16, 16);
        }
      });
    }
    if (b.antenna) {
      const ax = rx + b.antenna.x;
      const ay = ry + b.antenna.y;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + ox * 0.15, ay + oy * 0.15);
      ctx.stroke();
      glows.push(() => {
        if (Math.sin(t * 3 + b.x) > 0.6) ctx.drawImage(this.glow('#ef4444', 32), ax + ox * 0.15 - 8, ay + oy * 0.15 - 8, 16, 16);
      });
    }
    // glowing roof edge and neon sign
    glows.push(() => {
      ctx.strokeStyle = b.edge;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 5;
      ctx.strokeRect(rx, ry, b.w, b.h);
      ctx.globalAlpha = 1;
    });
    if (b.sign) {
      const s = b.sign;
      const size = clamp(Math.min(b.w, b.h) * 0.2, 9, 22);
      let sx = rx + b.w / 2;
      let sy = ry + b.h / 2;
      let rot = 0;
      if (s.side === 0) sy = ry + size * 0.8;
      else if (s.side === 2) sy = ry + b.h - size * 0.8;
      else if (s.side === 1) {
        sx = rx + b.w - size * 0.8;
        rot = Math.PI / 2;
      } else {
        sx = rx + size * 0.8;
        rot = -Math.PI / 2;
      }
      const flicker = Math.sin(t * 13 + b.x) > -0.95;
      glows.push(() => {
        if (!flicker) return;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rot);
        ctx.font = `800 ${size}px "Space Grotesk", Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(this.glow(s.color, 64), -size * 2.2, -size * 1.1, size * 4.4, size * 2.2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.45;
        ctx.strokeText(s.text, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.6;
        ctx.fillText(s.text, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      });
    }
  }

  drawZones(ctx: CanvasRenderingContext2D, vis: (x: number, y: number, m?: number) => boolean, t: number) {
    const ring = (x: number, y: number, r: number, color: string, label?: string) => {
      if (!vis(x, y, r + 40)) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glow(color, 128), x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      if (label) {
        ctx.font = '700 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(label, x, y - r - 8);
      }
      ctx.restore();
    };
    for (const r of this.world.repair) {
      ring(r.x, r.y, 40, '#34d399', '🔧 REPAIR');
    }
    const m = this.mission;
    if (!m) for (const p of this.pickups) ring(p.x, p.y, 44 + Math.sin(t * 3) * 4, '#fbbf24', '📦 JOB');
    if (m?.kind === 'delivery') ring(m.drop.x, m.drop.y, 50 + Math.sin(t * 4) * 5, '#22d3ee', '⬇ DROP-OFF');
    // race gates
    if (m?.kind === 'race') {
      const pts = m.route.pts;
      for (let i = m.idx; i < Math.min(pts.length, m.idx + 2); i++) this.drawGate(ctx, pts[i], pts[i - 1], i === m.idx, i === pts.length - 1, t);
    } else if (!m)
      for (const r of ROUTES) {
        const p = r.pts[0];
        if (!vis(p.x, p.y, 120)) continue;
        this.drawGate(ctx, p, r.pts[1], true, false, t, true);
        ctx.font = '800 14px "Space Grotesk", Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f472b6';
        ctx.fillText(`🏁 ${r.name.toUpperCase()}`, p.x, p.y - 72);
      }
    // shards
    for (const s of this.shards) {
      if (s.taken || !vis(s.x, s.y)) continue;
      const bob = Math.sin(t * 3 + s.x) * 3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glow('#67e8f9', 64), s.x - 24, s.y - 24 + bob, 48, 48);
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(s.x, s.y + bob);
      ctx.rotate(t * 1.5);
      ctx.fillStyle = '#a5f3fc';
      ctx.strokeStyle = '#ecfeff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  drawGate(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, prev: { x: number; y: number }, active: boolean, finish: boolean, t: number, start = false) {
    const a = Math.atan2(p.y - prev.y, p.x - prev.x) + (start ? Math.PI : 0);
    const half = 58;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const color = finish || start ? '#fde047' : active ? '#f472b6' : 'rgba(244,114,182,0.35)';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = active ? 5 : 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = active && !start ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(p.x + nx * half, p.y + ny * half);
    ctx.lineTo(p.x - nx * half, p.y - ny * half);
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (const s of [1, -1]) {
      ctx.globalAlpha = 0.8 + Math.sin(t * 5) * 0.2;
      ctx.drawImage(this.glow(finish || start ? '#fde047' : '#f472b6', 64), p.x + nx * half * s - 16, p.y + ny * half * s - 16, 32, 32);
    }
    ctx.restore();
    if (finish || start) {
      // checkered strip
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      for (let i = -half; i < half; i += 8)
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = ((i / 8 + r) & 1) === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
          ctx.fillRect(-8 + r * 8, i, 8, 8);
        }
      ctx.restore();
    }
  }

  objective(): { x: number; y: number; label: string; color: string } | null {
    const m = this.mission;
    if (m?.kind === 'delivery') return { ...m.drop, label: 'DROP-OFF', color: '#22d3ee' };
    if (m?.kind === 'race') {
      const p = m.route.pts[Math.min(m.idx, m.route.pts.length - 1)];
      return { ...p, label: m.idx === m.route.pts.length - 1 ? 'FINISH' : `GATE ${m.idx}/${m.route.pts.length - 1}`, color: '#f472b6' };
    }
    let best: Zone | null = null;
    let bd = Infinity;
    for (const p of this.pickups) {
      const d = Math.hypot(p.x - this.px, p.y - this.py);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { ...best, label: 'NEAREST JOB', color: '#fbbf24' } : null;
  }

  drawHUD(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    if (!this.started) return;
    const { w, h } = this;
    const small = w < 640;
    const panel = (x: number, y: number, pw: number, ph: number) => {
      ctx.fillStyle = 'rgba(10,6,24,0.62)';
      ctx.strokeStyle = 'rgba(168,85,247,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, 12);
      ctx.fill();
      ctx.stroke();
    };
    const font = (s: number, wgt = 700, fam = 'Inter, system-ui, sans-serif') => (ctx.font = `${wgt} ${s}px ${fam}`);

    // top-left stats
    panel(12, 12, small ? 150 : 190, small ? 58 : 66);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    font(small ? 18 : 22, 800, '"JetBrains Mono", ui-monospace, monospace');
    ctx.fillStyle = '#fde68a';
    ctx.fillText(`¢ ${this.save.credits.toLocaleString()}`, 24, small ? 38 : 42);
    font(small ? 11 : 12, 600);
    ctx.fillStyle = '#a5f3fc';
    ctx.fillText(`💠 ${this.save.shards.length}/25 shards   📦 ${this.save.deliveries}`, 24, small ? 58 : 64);

    // objective arrow around the player
    const obj = this.objective();
    const psx = (this.px - camX) * this.zoom + w / 2;
    const psy = (this.py - camY) * this.zoom + h / 2;
    if (obj) {
      const a = Math.atan2(obj.y - this.py, obj.x - this.px);
      const dist = Math.hypot(obj.x - this.px, obj.y - this.py);
      if (dist > 90) {
        const r = this.inCar ? 64 : 42;
        ctx.save();
        ctx.translate(psx + Math.cos(a) * r, psy + Math.sin(a) * r);
        ctx.rotate(a);
        ctx.fillStyle = obj.color;
        ctx.shadowColor = obj.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-6, -8);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-6, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // edge marker with distance
        const ex = clamp(psx + Math.cos(a) * 9999, 60, w - 60);
        const ey = clamp(psy + Math.sin(a) * 9999, 90, h - 70);
        const sx = (obj.x - camX) * this.zoom + w / 2;
        const sy = (obj.y - camY) * this.zoom + h / 2;
        const onScreen = sx > 0 && sx < w && sy > 0 && sy < h;
        if (!onScreen) {
          const k = Math.min(Math.abs((w / 2 - 50) / (Math.cos(a) || 1e-6)), Math.abs((h / 2 - 70) / (Math.sin(a) || 1e-6)));
          const label = `${obj.label} · ${Math.round(dist / 10)}m`;
          font(11, 800);
          const half = ctx.measureText(label).width / 2 + 8;
          const mx = clamp(w / 2 + Math.cos(a) * k, half, w - half);
          const my = clamp(h / 2 + Math.sin(a) * k, small ? 160 : 90, h - 60);
          ctx.textAlign = 'center';
          ctx.fillStyle = obj.color;
          ctx.fillText(label, mx, my);
          void ex;
          void ey;
        }
      }
    }

    // mission panel (top centre)
    const m = this.mission;
    if (m) {
      const pw = small ? 220 : 300;
      const x = w / 2 - pw / 2;
      panel(x, 12, pw, 58);
      ctx.textAlign = 'center';
      if (m.kind === 'delivery') {
        font(12, 700);
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(`📦 ${m.cargo.toUpperCase()}`, w / 2, 32);
        font(22, 800, '"JetBrains Mono", ui-monospace, monospace');
        ctx.fillStyle = m.timeLeft < 10 ? (Math.floor(this.time * 4) % 2 ? '#f87171' : '#fecaca') : '#fff';
        ctx.fillText(m.timeLeft > 0 ? fmtTime(m.timeLeft) : `LATE ${fmtTime(-m.timeLeft)}`, w / 2, 58);
      } else {
        font(12, 700);
        ctx.fillStyle = '#f472b6';
        ctx.fillText(`🏁 ${m.route.name.toUpperCase()} · ${Math.min(m.idx, m.route.pts.length - 1)}/${m.route.pts.length - 1}`, w / 2, 32);
        font(22, 800, '"JetBrains Mono", ui-monospace, monospace');
        ctx.fillStyle = '#fff';
        ctx.fillText(fmtTime(m.time), w / 2, 58);
        if (m.countdown > 0) {
          font(Math.min(140, w / 5), 900, '"Space Grotesk", Inter, sans-serif');
          ctx.fillStyle = '#fde047';
          ctx.shadowColor = '#f472b6';
          ctx.shadowBlur = 30;
          ctx.fillText(String(Math.ceil(m.countdown)), w / 2, h / 2);
          ctx.shadowBlur = 0;
        }
      }
    }

    // minimap
    const R = small ? 56 : 82;
    const mx = w - R - 14;
    const my = R + 14;
    this.drawMinimap(ctx, mx, my, R);

    // vehicle gauges (bottom)
    const v = this.inCar;
    const bx = this.touch ? w / 2 - 110 : 16;
    const by = h - (this.touch ? 66 : 84);
    if (v) {
      panel(bx, by, 220, this.touch ? 54 : 70);
      const sp = Math.hypot(v.vx, v.vy);
      const kmh = Math.round(sp * 0.36);
      // speed arc
      const cx = bx + 40;
      const cy = by + (this.touch ? 30 : 38);
      const rr = this.touch ? 20 : 26;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, Math.PI * 0.75, Math.PI * 2.25);
      ctx.stroke();
      const k = clamp(sp / (v.spec.max * 1.38), 0, 1);
      const grad = ctx.createLinearGradient(cx - rr, cy, cx + rr, cy);
      grad.addColorStop(0, '#22d3ee');
      grad.addColorStop(1, '#f472b6');
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * k);
      ctx.stroke();
      font(13, 800, '"JetBrains Mono", ui-monospace, monospace');
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(kmh), cx, cy + 4);
      font(8, 700);
      ctx.fillStyle = '#a1a1aa';
      ctx.fillText('KM/H', cx, cy + 15);
      // bars
      const bar = (y: number, label: string, val: number, c1: string, c2: string) => {
        const x = bx + 80;
        font(9, 700);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#a1a1aa';
        ctx.fillText(label, x, y - 3);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, 124, 6);
        const g = ctx.createLinearGradient(x, 0, x + 124, 0);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 124 * clamp(val, 0, 1), 6);
      };
      const hpk = v.hp / v.spec.hp;
      bar(by + (this.touch ? 20 : 24), `INTEGRITY ${Math.ceil(hpk * 100)}%`, hpk, hpk < 0.3 ? '#ef4444' : '#22c55e', hpk < 0.3 ? '#f97316' : '#a3e635');
      bar(by + (this.touch ? 42 : 52), 'BOOST', v.boost, '#f472b6', '#fbbf24');
    } else if (!this.touch) {
      panel(bx, by + 30, 150, 40);
      font(10, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#a1a1aa';
      ctx.fillText('DASH', bx + 12, by + 54);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(bx + 50, by + 47, 88, 6);
      ctx.fillStyle = this.dashCd <= 0 ? '#22d3ee' : '#6366f1';
      ctx.fillRect(bx + 50, by + 47, 88 * (1 - this.dashCd / 0.85), 6);
    }

    // hint + messages
    ctx.textAlign = 'center';
    if (this.hint) {
      font(small ? 12 : 14, 700);
      const tw = ctx.measureText(this.hint).width + 28;
      panel(w / 2 - tw / 2, h - (this.touch ? 190 : 130), tw, 30);
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText(this.hint, w / 2, h - (this.touch ? 170 : 110));
    }
    let y = small ? (m ? 150 : 160) : m ? 110 : 84;
    const fit = (text: string, size: number, wgt: number, fam?: string) => {
      font(size, wgt, fam);
      const tw = ctx.measureText(text).width;
      if (tw > w - 24) font(Math.max(9, Math.floor((size * (w - 24)) / tw)), wgt, fam);
    };
    for (const msg of this.msgs) {
      msg.t -= 0.016;
      const a = clamp(msg.t, 0, 1);
      ctx.globalAlpha = a;
      fit(msg.text, small ? 18 : 24, 900, '"Space Grotesk", Inter, sans-serif');
      ctx.fillStyle = msg.color;
      ctx.shadowColor = msg.color;
      ctx.shadowBlur = 16;
      ctx.fillText(msg.text, w / 2, y);
      ctx.shadowBlur = 0;
      if (msg.sub) {
        fit(msg.sub, small ? 11 : 13, 600);
        ctx.fillStyle = '#e4e4e7';
        ctx.fillText(msg.sub, w / 2, y + 20);
      }
      y += msg.sub ? 50 : 34;
    }
    ctx.globalAlpha = 1;
    this.msgs = this.msgs.filter((x) => x.t > 0);

    // key help
    if (!this.touch && !small) {
      font(11, 600);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(228,228,231,0.55)';
      ctx.fillText(this.inCar ? 'WASD drive · Space drift · Shift boost · E exit · R recover · M map · Esc pause' : 'WASD move · Mouse aim · Shift dash · E / click enter vehicle · M map · Esc pause', w - 14, h - 12);
    }
  }

  drawMinimap(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
    const scale = R / 900; // world units shown in the radius
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(5,3,12,0.85)';
    ctx.fill();
    ctx.clip();
    const S = 0.1;
    const k = scale / S;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.minimap, cx - this.px * S * k, cy - this.py * S * k, this.minimap.width * k, this.minimap.height * k);
    ctx.globalAlpha = 1;
    const dot = (x: number, y: number, r: number, color: string, pulse = false) => {
      let sx = cx + (x - this.px) * scale;
      let sy = cy + (y - this.py) * scale;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d > R - 6) {
        // pin to the rim
        sx = cx + ((sx - cx) / d) * (R - 6);
        sy = cy + ((sy - cy) / d) * (R - 6);
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, r + (pulse ? Math.sin(this.time * 6) * 1.2 : 0), 0, Math.PI * 2);
      ctx.fill();
    };
    for (const r of this.world.repair) if (Math.hypot(r.x - this.px, r.y - this.py) < 900) dot(r.x, r.y, 2.5, '#34d399');
    for (const v of this.vehicles) if (v !== this.inCar && v.disabled <= 0 && Math.hypot(v.x - this.px, v.y - this.py) < 900) dot(v.x, v.y, 2.2, '#e5e7eb');
    for (const s of this.shards) if (!s.taken && Math.hypot(s.x - this.px, s.y - this.py) < 520) dot(s.x, s.y, 2.2, '#67e8f9', true);
    if (!this.mission) {
      for (const p of this.pickups) dot(p.x, p.y, 3.2, '#fbbf24', true);
      for (const r of ROUTES) dot(r.pts[0].x, r.pts[0].y, 3, '#f472b6');
    }
    const obj = this.objective();
    if (obj && this.mission) dot(obj.x, obj.y, 4, obj.color, true);
    ctx.restore();
    // player arrow
    const a = this.inCar ? this.inCar.a : this.pa;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(168,85,247,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '700 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText(this.world.district(this.px, this.py).toUpperCase(), cx, cy + R + 13);
  }

  drawBigMap(ctx: CanvasRenderingContext2D) {
    const { w, h } = this;
    ctx.fillStyle = 'rgba(4,2,12,0.9)';
    ctx.fillRect(0, 0, w, h);
    const size = Math.min(w, h) - 70;
    const x0 = (w - size) / 2;
    const y0 = (h - size) / 2 + 10;
    const k = size / WORLD;
    ctx.drawImage(this.minimap, x0, y0, size, size);
    ctx.strokeStyle = 'rgba(168,85,247,0.8)';
    ctx.strokeRect(x0, y0, size, size);
    const dot = (x: number, y: number, r: number, c: string) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x0 + x * k, y0 + y * k, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const r of this.world.repair) dot(r.x, r.y, 4, '#34d399');
    for (const v of this.vehicles) if (v.disabled <= 0) dot(v.x, v.y, 3, '#e5e7eb');
    if (!this.mission) for (const p of this.pickups) dot(p.x, p.y, 5, '#fbbf24');
    for (const r of ROUTES) {
      dot(r.pts[0].x, r.pts[0].y, 5, '#f472b6');
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f9a8d4';
      const best = this.save.best[r.id];
      const medal = this.save.medals[r.id];
      ctx.fillText(`${r.name}${best ? ` · ${fmtTime(best)}` : ''}${medal ? ` · ${medal === 'gold' ? '🥇' : medal === 'silver' ? '🥈' : '🥉'}` : ''}`, x0 + r.pts[0].x * k, y0 + r.pts[0].y * k - 9);
    }
    const obj = this.objective();
    if (obj && this.mission) dot(obj.x, obj.y, 6, obj.color);
    ctx.save();
    ctx.translate(x0 + this.px * k, y0 + this.py * k);
    ctx.rotate(this.inCar ? this.inCar.a : this.pa);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = '800 18px "Space Grotesk", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0abfc';
    ctx.fillText('NEON CITY', w / 2, y0 - 14);
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#a1a1aa';
    ctx.fillText('🟡 jobs · 🩷 race starts · 🟢 repair · ⚪ vehicles · shards stay hidden until you are close · M / tap to close', w / 2, y0 + size + 22);
    const labels: [string, number, number][] = [
      ['DOWNTOWN', 1400, 1150],
      ['NEON PLAZA', 2000, 2480],
      ['DOCKS', 3300, 1000],
      ['CYBER-PARK', 780, 2700],
      ['HIGHWAY LOOP', 2000, 330],
    ];
    ctx.font = '800 12px "Space Grotesk", Inter, sans-serif';
    ctx.fillStyle = 'rgba(196,181,253,0.85)';
    for (const [t, x, y] of labels) ctx.fillText(t, x0 + x * k, y0 + y * k);
  }

  drawTitle(ctx: CanvasRenderingContext2D) {
    const { w, h } = this;
    ctx.fillStyle = 'rgba(5,3,12,0.55)';
    ctx.fillRect(0, 0, w, h);
    const bw = Math.min(w - 24, 640);
    ctx.fillStyle = 'rgba(8,4,20,0.82)';
    ctx.strokeStyle = 'rgba(244,114,182,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(w / 2 - bw / 2, h / 2 - 120, bw, 240, 18);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    const s = Math.min(78, w / 7);
    ctx.font = `900 ${s}px "Space Grotesk", Inter, sans-serif`;
    ctx.shadowColor = '#f472b6';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#fff';
    ctx.fillText('NEON CITY', w / 2, h / 2 - 40);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${Math.min(16, w / 30)}px Inter, sans-serif`;
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText('Courier jobs · street sprints · 25 hidden data shards', w / 2, h / 2);
    const pulse = 0.6 + Math.sin(performance.now() / 300) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.font = `800 ${Math.min(20, w / 22)}px Inter, sans-serif`;
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(this.touch ? 'TAP TO START' : 'CLICK OR PRESS ENTER TO START', w / 2, h / 2 + 48);
    ctx.globalAlpha = 1;
    ctx.font = `500 ${Math.min(12, w / 40)}px Inter, sans-serif`;
    ctx.fillStyle = '#a1a1aa';
    ctx.fillText(this.touch ? 'Left stick to move · ENTER to get in a vehicle · BOOST · DRIFT · MAP' : 'WASD / arrows move · Mouse aim · Shift dash · E enter/exit · Space drift · M map', w / 2, h / 2 + 80);
    if (this.save.earned > 0) ctx.fillText(`Welcome back — ¢${this.save.credits.toLocaleString()} · ${this.save.shards.length}/25 shards · ${this.save.deliveries} deliveries`, w / 2, h / 2 + 100);
  }
  drawPause(ctx: CanvasRenderingContext2D) {
    const { w, h } = this;
    ctx.fillStyle = 'rgba(5,3,12,0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.min(56, w / 9)}px "Space Grotesk", Inter, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', w / 2, h / 2 - 20);
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText(this.touch ? 'Tap to continue' : 'Click or press Esc to continue', w / 2, h / 2 + 16);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 12px Inter, sans-serif';
    ctx.fillText('X cancels the current job or race · R puts your vehicle back on the road', w / 2, h / 2 + 42);
  }
}
