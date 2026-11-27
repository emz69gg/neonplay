/* Neon City — world generation (deterministic) */

export const WORLD = 4000;
export const TILE = 20;
export const NT = WORLD / TILE; // tiles per side
export const BLOCK = 400;
export const ROAD_W = 80;
export const HWY_W = 120;
export const ROAD_KS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const PLAZA = { x0: 1600, y0: 1600, x1: 2400, y1: 2400 };
export const WATER_X = 3770;

export const enum T {
  GRASS = 0,
  ROAD = 1,
  WALK = 2,
  WATER = 4,
  PLAZA = 5,
  DOCK = 6,
  HWY = 7,
  PATH = 8,
  LOT = 9,
}

export type District = 'downtown' | 'midtown' | 'docks' | 'park' | 'plaza' | 'industrial';

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
  color: string; // wall base
  roof: string;
  edge: string; // neon trim
  district: District;
  heli: boolean;
  vents: { x: number; y: number; w: number; h: number }[];
  antenna: { x: number; y: number } | null;
  sign: { text: string; color: string; side: 0 | 1 | 2 | 3 } | null;
  windows: string;
  kind: 'tower' | 'warehouse' | 'container' | 'kiosk';
}
export interface Circle {
  x: number;
  y: number;
  r: number;
  kind: 'tree' | 'fountain' | 'pillar' | 'bollard';
  color: string;
}
export interface Lamp {
  x: number;
  y: number;
  color: string;
}
export interface Spot {
  x: number;
  y: number;
  a: number;
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const roadWidth = (k: number) => (k === 1 || k === 9 ? HWY_W : ROAD_W);
export const inPlaza = (x: number, y: number) => x > PLAZA.x0 + 40 && x < PLAZA.x1 - 40 && y > PLAZA.y0 + 40 && y < PLAZA.y1 - 40;

export interface World {
  tiles: Uint8Array;
  buildings: Building[];
  circles: Circle[];
  lamps: Lamp[];
  shardSpots: { x: number; y: number; where: string }[];
  parking: { spot: Spot; type: 'hover' | 'truck' | 'bike' }[];
  repair: { x: number; y: number }[];
  /** solids spatial hash: cell -> indices; rects are buildings, circles offset by 100000 */
  hash: Map<number, number[]>;
  district: (x: number, y: number) => District;
}

const HCELL = 200;
const hkey = (cx: number, cy: number) => cy * 1000 + cx;

export const tileAt = (w: World, x: number, y: number) => {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= NT || ty >= NT) return T.WATER;
  return w.tiles[ty * NT + tx];
};

export function querySolids(w: World, x0: number, y0: number, x1: number, y1: number, out: number[]) {
  out.length = 0;
  const cx0 = Math.max(0, Math.floor(x0 / HCELL));
  const cy0 = Math.max(0, Math.floor(y0 / HCELL));
  const cx1 = Math.min(WORLD / HCELL - 1, Math.floor(x1 / HCELL));
  const cy1 = Math.min(WORLD / HCELL - 1, Math.floor(y1 / HCELL));
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const l = w.hash.get(hkey(cx, cy));
      if (l) for (const i of l) if (!out.includes(i)) out.push(i);
    }
  return out;
}

const SIGNS = ['NEON', 'CYBER', 'RAMEN', 'HOTEL', 'BAR', 'DATA', 'SYNTH', '24/7', 'ARCADE', 'NOODLE', 'CLUB', 'TECH', 'VOID', 'PIXEL', 'LOFT', 'SUSHI', 'GRID', 'NOVA'];
const NEON = ['#f0abfc', '#22d3ee', '#a855f7', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185'];

export function generate(seed = 1337): World {
  const R = rng(seed);
  const pick = <V,>(a: V[]) => a[Math.floor(R() * a.length)];
  const tiles = new Uint8Array(NT * NT);
  const buildings: Building[] = [];
  const circles: Circle[] = [];
  const lamps: Lamp[] = [];
  const shardSpots: World['shardSpots'] = [];
  const alleys: { x: number; y: number }[] = [];

  const district = (x: number, y: number): District => {
    if (x >= PLAZA.x0 && x < PLAZA.x1 && y >= PLAZA.y0 && y < PLAZA.y1) return 'plaza';
    if (x >= 2800) return 'docks';
    if ((x < 1200 && y > 2400) || x < 360 || y > 3640) return 'park';
    if (y < 360) return 'industrial';
    if (Math.abs(x - 2000) < 1250 && Math.abs(y - 2000) < 1250) return 'downtown';
    return 'midtown';
  };

  // 1. base surfaces
  for (let ty = 0; ty < NT; ty++)
    for (let tx = 0; tx < NT; tx++) {
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      let t: T = T.WALK;
      const d = district(x, y);
      if (x > WATER_X) t = T.WATER;
      else if (d === 'park') t = T.GRASS;
      else if (d === 'docks' || d === 'industrial') t = T.LOT;
      else if (d === 'plaza') t = T.PLAZA;
      tiles[ty * NT + tx] = t;
    }
  const setRect = (x0: number, y0: number, x1: number, y1: number, t: T) => {
    for (let ty = Math.max(0, Math.floor(y0 / TILE)); ty < Math.min(NT, Math.ceil(y1 / TILE)); ty++)
      for (let tx = Math.max(0, Math.floor(x0 / TILE)); tx < Math.min(NT, Math.ceil(x1 / TILE)); tx++) tiles[ty * NT + tx] = t;
  };

  // 2. roads (grid inside the highway ring, plus spokes out to the edges)
  for (const k of ROAD_KS) {
    const c = k * BLOCK;
    const hw = roadWidth(k) / 2;
    const t = k === 1 || k === 9 ? T.HWY : T.ROAD;
    setRect(c - hw, BLOCK - HWY_W / 2, c + hw, 9 * BLOCK + HWY_W / 2, t); // vertical
    setRect(BLOCK - HWY_W / 2, c - hw, 9 * BLOCK + HWY_W / 2, c + hw, t); // horizontal
  }
  for (const k of [3, 5, 7]) {
    const c = k * BLOCK;
    setRect(c - 40, 0, c + 40, BLOCK, T.ROAD); // north spoke
    setRect(c - 40, 9 * BLOCK, c + 40, WORLD, T.ROAD); // south spoke
    setRect(0, c - 40, BLOCK, c + 40, T.ROAD); // west spoke
    setRect(9 * BLOCK, c - 40, WATER_X, c + 40, T.ROAD); // east spoke to the docks
  }
  // plaza is pedestrian (cars may still drive on it)
  setRect(PLAZA.x0 + 40, PLAZA.y0 + 40, PLAZA.x1 - 40, PLAZA.y1 - 40, T.PLAZA);

  // 3. piers into the water
  const piers: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 420 + i * 560 + R() * 120;
    const p = { x0: WATER_X - 10, y0: y, x1: WATER_X + 150 + R() * 60, y1: y + 70 };
    piers.push(p);
    setRect(p.x0, p.y0, p.x1, p.y1, T.DOCK);
  }
  setRect(3620, 0, WATER_X, WORLD, T.LOT); // quay

  // pond in the park
  const pond = { x: 760, y: 3060, r: 150 };
  for (let ty = 0; ty < NT; ty++)
    for (let tx = 0; tx < NT; tx++) {
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (Math.hypot((x - pond.x) / 1.3, y - pond.y) < pond.r) tiles[ty * NT + tx] = T.WATER;
    }

  const addBuilding = (x: number, y: number, w: number, h: number, d: District, kind: Building['kind'] = 'tower') => {
    const tall = d === 'downtown' ? 70 + R() * 90 : d === 'midtown' ? 34 + R() * 46 : d === 'docks' || d === 'industrial' ? 18 + R() * 16 : 20 + R() * 20;
    const height = kind === 'container' ? 10 + R() * 6 : kind === 'kiosk' ? 12 : tall;
    const hue = d === 'downtown' ? pick(['#1b1433', '#141a33', '#21132c', '#13202c']) : d === 'docks' || d === 'industrial' ? pick(['#1e2230', '#22201c', '#1a2027']) : pick(['#1c1830', '#1a1d2e', '#251a2a']);
    const vents: Building['vents'] = [];
    const nv = kind === 'tower' || kind === 'warehouse' ? Math.floor(R() * 4) : 0;
    for (let i = 0; i < nv; i++) {
      const vw = 10 + R() * 18;
      const vh = 10 + R() * 14;
      vents.push({ x: 6 + R() * Math.max(1, w - vw - 12), y: 6 + R() * Math.max(1, h - vh - 12), w: vw, h: vh });
    }
    const heli = kind === 'tower' && d === 'downtown' && w > 110 && h > 110 && R() < 0.45;
    buildings.push({
      x,
      y,
      w,
      h,
      height,
      color: hue,
      roof: kind === 'container' ? pick(['#7c2d12', '#155e75', '#4d7c0f', '#6b21a8', '#9f1239', '#1e40af']) : hue,
      edge: pick(NEON),
      district: d,
      heli,
      vents: heli ? [] : vents,
      antenna: kind === 'tower' && R() < 0.5 ? { x: 8 + R() * (w - 16), y: 8 + R() * (h - 16) } : null,
      sign: kind === 'tower' && (d === 'downtown' || d === 'midtown') && R() < 0.55 && w > 60 ? { text: pick(SIGNS), color: pick(NEON), side: Math.floor(R() * 4) as 0 | 1 | 2 | 3 } : null,
      windows: pick(['#fde68a', '#67e8f9', '#f0abfc', '#a5b4fc']),
      kind,
    });
  };

  // 4. city blocks
  for (let cx = 0; cx < 10; cx++)
    for (let cy = 0; cy < 10; cy++) {
      const left = cx === 0 ? 0 : cx * BLOCK + roadWidth(cx) / 2;
      const right = cx === 9 ? 3620 : (cx + 1) * BLOCK - roadWidth(cx + 1) / 2;
      const top = cy === 0 ? 0 : cy * BLOCK + roadWidth(cy) / 2;
      const bottom = cy === 9 ? WORLD : (cy + 1) * BLOCK - roadWidth(cy + 1) / 2;
      const mx = (left + right) / 2;
      const my = (top + bottom) / 2;
      const d = district(mx, my);
      if (cx === 9) continue; // quay handled separately
      if (d === 'plaza') continue;
      const m = 26; // sidewalk
      const x0 = left + m;
      const y0 = top + m;
      const x1 = right - m;
      const y1 = bottom - m;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;

      if (d === 'park') {
        // trees, paths and glowing bollards
        const n = 7 + Math.floor(R() * 7);
        for (let i = 0; i < n; i++) {
          const tx = x0 + 20 + R() * (x1 - x0 - 40);
          const ty = y0 + 20 + R() * (y1 - y0 - 40);
          if (tileAt({ tiles } as World, tx, ty) === T.WATER) continue;
          if (circles.some((c) => Math.hypot(c.x - tx, c.y - ty) < 50)) continue;
          circles.push({ x: tx, y: ty, r: 14 + R() * 12, kind: 'tree', color: pick(['#34d399', '#22d3ee', '#a3e635', '#f0abfc']) });
        }
        // path across the block
        if (R() < 0.7) {
          const vertical = R() < 0.5;
          if (vertical) setRect(mx - 12, top, mx + 12, bottom, T.PATH);
          else setRect(left, my - 12, right, my + 12, T.PATH);
        }
        shardSpots.push({ x: x0 + 30 + R() * (x1 - x0 - 60), y: y0 + 30 + R() * (y1 - y0 - 60), where: 'park' });
        continue;
      }

      if (d === 'docks' || d === 'industrial') {
        // warehouse + container rows
        const ww = (x1 - x0) * (0.5 + R() * 0.2);
        const wh = (y1 - y0) * (0.45 + R() * 0.2);
        addBuilding(x0, y0, ww, wh, d, 'warehouse');
        const rows = 3;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < 3; c++) {
            const cw = 46;
            const ch = 20;
            const bx = x0 + ww + 24 + c * (cw + 10);
            const by = y0 + 10 + r * (ch + 26);
            if (bx + cw < x1 && by + ch < y1) addBuilding(bx, by, cw, ch, d, 'container');
          }
        for (let c = 0; c < 4; c++) {
          const bx = x0 + 6 + c * 56;
          const by = y0 + wh + 30;
          if (bx + 46 < x1 && by + 20 < y1) addBuilding(bx, by, 46, 20, d, 'container');
        }
        shardSpots.push({ x: x0 + ww + 12, y: y0 + wh + 14, where: 'docks' });
        continue;
      }

      // downtown / midtown: split into lots separated by alleys
      const gap = 30;
      const split = R();
      const lots: [number, number, number, number][] = [];
      if (split < 0.25) lots.push([x0, y0, x1, y1]);
      else if (split < 0.55) {
        const sx = x0 + (x1 - x0) * (0.4 + R() * 0.2);
        lots.push([x0, y0, sx - gap / 2, y1], [sx + gap / 2, y0, x1, y1]);
        alleys.push({ x: sx, y: y0 + (y1 - y0) * (0.25 + R() * 0.5) });
      } else if (split < 0.8) {
        const sy = y0 + (y1 - y0) * (0.4 + R() * 0.2);
        lots.push([x0, y0, x1, sy - gap / 2], [x0, sy + gap / 2, x1, y1]);
        alleys.push({ x: x0 + (x1 - x0) * (0.25 + R() * 0.5), y: sy });
      } else {
        const sx = (x0 + x1) / 2;
        const sy = (y0 + y1) / 2;
        lots.push([x0, y0, sx - gap / 2, sy - gap / 2], [sx + gap / 2, y0, x1, sy - gap / 2], [x0, sy + gap / 2, sx - gap / 2, y1], [sx + gap / 2, sy + gap / 2, x1, y1]);
        alleys.push({ x: sx, y: sy });
      }
      for (const [a, b, c, e] of lots) {
        const ins = 4 + R() * 6;
        addBuilding(a + ins, b + ins, c - a - ins * 2, e - b - ins * 2, d);
      }
    }

  // quay: containers, cranes (as tall thin "towers"), kiosks
  for (let y = 60; y < WORLD - 120; y += 160) {
    if (Math.abs(((y + 40) % BLOCK) - 0) < 70 || [3, 5, 7].some((k) => Math.abs(y + 20 - k * BLOCK) < 90)) continue;
    if (R() < 0.75) addBuilding(3650, y, 46, 20, 'docks', 'container');
    if (R() < 0.5) addBuilding(3650, y + 34, 46, 20, 'docks', 'container');
  }
  for (const p of piers) {
    shardSpots.push({ x: p.x1 - 24, y: (p.y0 + p.y1) / 2, where: 'docks' });
    for (let i = 0; i < 3; i++) circles.push({ x: p.x0 + 30 + i * 45, y: p.y0 + 6, r: 5, kind: 'bollard', color: '#fbbf24' });
  }

  // plaza: fountain and holo pillars
  circles.push({ x: 2000, y: 2000, r: 70, kind: 'fountain', color: '#22d3ee' });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circles.push({ x: 2000 + Math.cos(a) * 250, y: 2000 + Math.sin(a) * 250, r: 12, kind: 'pillar', color: NEON[i % NEON.length] });
  }
  shardSpots.push({ x: 2000, y: 1850, where: 'plaza' });

  // street lamps along the roads
  for (const k of ROAD_KS) {
    const c = k * BLOCK;
    const off = roadWidth(k) / 2 + 12;
    for (let t = BLOCK + 100; t < 9 * BLOCK; t += 200) {
      if (t % BLOCK === 0) continue;
      const col = NEON[(k + Math.floor(t / 200)) % NEON.length];
      lamps.push({ x: c - off, y: t, color: col }, { x: c + off, y: t + 100 > 9 * BLOCK ? t : t + 100, color: col });
      lamps.push({ x: t, y: c - off, color: col }, { x: t + 100 > 9 * BLOCK ? t : t + 100, y: c + off, color: col });
    }
  }
  for (const p of piers) lamps.push({ x: p.x1 - 8, y: p.y0 + 8, color: '#fbbf24' }, { x: p.x1 - 8, y: p.y1 - 8, color: '#fbbf24' });

  // 25 data shards: alleys, docks, park, plaza
  const shuffled = (arr: { x: number; y: number }[]) => arr.map((v) => ({ v, k: R() })).sort((a, b) => a.k - b.k).map((o) => o.v);
  const alleyShards = shuffled(alleys).slice(0, 11).map((a) => ({ ...a, where: 'alley' }));
  const dockShards = shuffled(shardSpots.filter((s) => s.where === 'docks')).slice(0, 7) as World['shardSpots'];
  const parkShards = shuffled(shardSpots.filter((s) => s.where === 'park')).slice(0, 6) as World['shardSpots'];
  const plazaShard = shardSpots.filter((s) => s.where === 'plaza');
  const finalShards = [...alleyShards, ...dockShards, ...parkShards, ...plazaShard].slice(0, 25);
  while (finalShards.length < 25) {
    const a = alleys[Math.floor(R() * alleys.length)];
    finalShards.push({ x: a.x + (R() - 0.5) * 10, y: a.y + 40, where: 'alley' });
  }

  // parked vehicles (on the sidewalk edge of roads)
  // parked on the road shoulder: vertical road k=i at distance d below node (i,j)
  const vSpot = (i: number, j: number, d: number, side = 1): Spot => ({ x: i * BLOCK + side * (roadWidth(i) / 2 - 14), y: j * BLOCK + d, a: Math.PI / 2 });
  const hSpot = (i: number, j: number, d: number, side = 1): Spot => ({ x: i * BLOCK + d, y: j * BLOCK + side * (roadWidth(j) / 2 - 14), a: 0 });
  const parking: World['parking'] = [
    { spot: { x: 1900, y: 2290, a: 0 }, type: 'hover' },
    { spot: { x: 2100, y: 2290, a: Math.PI }, type: 'bike' },
    { spot: vSpot(3, 3, 200), type: 'truck' },
    { spot: vSpot(8, 5, 150, -1), type: 'truck' },
    { spot: hSpot(6, 3, 200), type: 'hover' },
    { spot: hSpot(2, 6, 200, -1), type: 'bike' },
    { spot: vSpot(4, 7, 220), type: 'hover' },
    { spot: hSpot(7, 8, 160), type: 'bike' },
    { spot: hSpot(5, 2, 260, -1), type: 'truck' },
    { spot: vSpot(2, 2, 180, -1), type: 'hover' },
  ];
  // repair bays sit on road shoulders
  const repair = [hSpot(3, 3, 120, -1), hSpot(8, 7, 280, -1), vSpot(1, 5, 120, 1)].map(({ x, y }) => ({ x, y }));

  // solids hash
  const hash = new Map<number, number[]>();
  const add = (idx: number, x0: number, y0: number, x1: number, y1: number) => {
    for (let cy = Math.floor(y0 / HCELL); cy <= Math.floor(y1 / HCELL); cy++)
      for (let cx = Math.floor(x0 / HCELL); cx <= Math.floor(x1 / HCELL); cx++) {
        const k = hkey(cx, cy);
        const l = hash.get(k);
        if (l) l.push(idx);
        else hash.set(k, [idx]);
      }
  };
  buildings.forEach((b, i) => add(i, b.x, b.y, b.x + b.w, b.y + b.h));
  circles.forEach((c, i) => add(100000 + i, c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r));

  return { tiles, buildings, circles, lamps, shardSpots: finalShards, parking, repair, hash, district };
}

/* ---------------- Road graph for traffic and races ---------------- */
export const node = (i: number, j: number) => ({ x: i * BLOCK, y: j * BLOCK });
/** Edges inside the plaza are closed to traffic. */
export function edgeOpen(i: number, j: number, di: number, dj: number) {
  const ni = i + di;
  const nj = j + dj;
  if (ni < 1 || nj < 1 || ni > 9 || nj > 9) return false;
  const mx = ((i + ni) / 2) * BLOCK;
  const my = ((j + nj) / 2) * BLOCK;
  return !(mx > PLAZA.x0 && mx < PLAZA.x1 && my > PLAZA.y0 && my < PLAZA.y1);
}
