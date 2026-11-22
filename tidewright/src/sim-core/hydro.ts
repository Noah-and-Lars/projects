// Hull analysis (sealed / open-top interior air), buoyancy sample points, basic flooding,
// hydrodynamic drag, propellers and rudders.
import { VehicleGrid, partCells, cellKey, keyToCell } from './grid';
import { CELL, partDef } from './parts';
import type { Vec3 } from './math';

export interface HullPoint {
  local: Vec3; // body-local metres
  vol: number; // displaced volume when fully submerged, m^3
  halfH: number; // half vertical extent (m) for partial submersion
  region: number; // open-top interior region index, -1 if solid or sealed
}
export interface OpenRegion { rim: Vec3; volume: number } // representative gunwale point (local) and air volume
export interface HullModel {
  points: HullPoint[];
  regions: OpenRegion[];
  solidVolume: number;
  sealedVolume: number;
  openVolume: number;
  /** Max buoyant force (N) with everything submerged and no flooding. */
  maxBuoyancy: number;
  sealedCells: number[]; // cell keys of sealed interior (for overlays)
  openCells: number[];
}

export const MAX_HULL_POINTS = 160;

export function analyseHull(grid: VehicleGrid, rho = 1025): HullModel {
  const cellVol = CELL * CELL * CELL;
  const solidFrac = new Map<number, number>(); // cell -> displaced fraction
  const porous = new Set<number>();
  for (const p of grid.parts.values()) {
    const def = partDef(p.type);
    for (const c of partCells(p)) {
      const k = cellKey(c[0], c[1], c[2]);
      solidFrac.set(k, def.displace);
      if (def.porous) porous.add(k);
    }
  }
  const b = grid.bounds();
  const empty: HullModel = { points: [], regions: [], solidVolume: 0, sealedVolume: 0, openVolume: 0, maxBuoyancy: 0, sealedCells: [], openCells: [] };
  if (!b) return empty;
  const lo = [b[0][0] - 1, b[0][1] - 1, b[0][2] - 1], hi = [b[1][0] + 1, b[1][1] + 1, b[1][2] + 1];
  const inBox = (x: number, y: number, z: number) => x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1] && z >= lo[2] && z <= hi[2];
  const passable = (k: number) => !solidFrac.has(k) || porous.has(k);

  // Pass 1: water floods from outside sideways and upward only (open tops stay dry until overtopped).
  // Pass 2: all six directions (anything reached now but not in pass 1 is an open-top interior).
  const flood = (moves: number[][]): Set<number> => {
    const seen = new Set<number>();
    const stack: number[][] = [];
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      if (x === lo[0] || x === hi[0] || y === lo[1] || y === hi[1] || z === lo[2] || z === hi[2]) {
        const k = cellKey(x, y, z);
        if (passable(k) && !seen.has(k)) { seen.add(k); stack.push([x, y, z]); }
      }
    }
    while (stack.length) {
      const [x, y, z] = stack.pop()!;
      for (const [dx, dy, dz] of moves) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!inBox(nx, ny, nz)) continue;
        const k = cellKey(nx, ny, nz);
        if (seen.has(k) || !passable(k)) continue;
        seen.add(k); stack.push([nx, ny, nz]);
      }
    }
    return seen;
  };
  const side = flood([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]);
  const all = flood([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]);
  const sealedCells: number[] = [], openCells: number[] = [];
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    const k = cellKey(x, y, z);
    if (!passable(k) || side.has(k)) continue;
    if (solidFrac.has(k)) continue; // porous solid inside: ignore
    if (all.has(k)) openCells.push(k); else sealedCells.push(k);
  }

  // Group open-top cells into connected regions, each with a gunwale (rim) point.
  const regionOf = new Map<number, number>();
  const regions: OpenRegion[] = [];
  const openSet = new Set(openCells);
  for (const start of openCells) {
    if (regionOf.has(start)) continue;
    const id = regions.length;
    const cells: number[] = [];
    const stack = [start];
    regionOf.set(start, id);
    while (stack.length) {
      const k = stack.pop()!;
      cells.push(k);
      const [x, y, z] = keyToCell(k);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nk = cellKey(x + dx, y + dy, z + dz);
        if (openSet.has(nk) && !regionOf.has(nk)) { regionOf.set(nk, id); stack.push(nk); }
      }
    }
    let sx = 0, sz = 0, top = -1e9;
    for (const k of cells) { const c = keyToCell(k); sx += c[0]; sz += c[2]; top = Math.max(top, c[1]); }
    regions.push({ rim: [((sx / cells.length) + 0.5) * CELL, (top + 1) * CELL, ((sz / cells.length) + 0.5) * CELL], volume: cells.length * cellVol });
  }

  // Cluster displacing cells into sample points.
  type Acc = { sx: number; sy: number; sz: number; vol: number; region: number };
  const build = (C: number) => {
    const clusters = new Map<string, Acc>();
    const add = (k: number, vol: number, region: number) => {
      if (vol <= 0) return;
      const [x, y, z] = keyToCell(k);
      const key = `${Math.floor(x / C)},${Math.floor(y / C)},${Math.floor(z / C)},${region}`;
      let a = clusters.get(key);
      if (!a) { a = { sx: 0, sy: 0, sz: 0, vol: 0, region }; clusters.set(key, a); }
      a.sx += (x + 0.5) * vol; a.sy += (y + 0.5) * vol; a.sz += (z + 0.5) * vol; a.vol += vol;
    };
    for (const [k, f] of solidFrac) add(k, f * cellVol, -1);
    for (const k of sealedCells) add(k, cellVol, -1);
    for (const k of openCells) add(k, cellVol, regionOf.get(k)!);
    return clusters;
  };
  let C = 2;
  let clusters = build(C);
  while (clusters.size > MAX_HULL_POINTS && C < 32) { C *= 2; clusters = build(C); }
  const points: HullPoint[] = [...clusters.values()].map((a) => ({
    local: [(a.sx / a.vol) * CELL, (a.sy / a.vol) * CELL, (a.sz / a.vol) * CELL], vol: a.vol, halfH: (C * CELL) / 2, region: a.region,
  }));
  let solidVolume = 0;
  for (const f of solidFrac.values()) solidVolume += f * cellVol;
  const sealedVolume = sealedCells.length * cellVol, openVolume = openCells.length * cellVol;
  return { points, regions, solidVolume, sealedVolume, openVolume, maxBuoyancy: rho * 9.81 * (solidVolume + sealedVolume + openVolume), sealedCells, openCells };
}

/** Normal-force coefficient of a flat plate vs angle of attack, with a soft stall. */
export function plateCoefficient(alpha: number): number {
  const a = Math.abs(alpha);
  const pre = 2 * Math.PI * Math.sin(a) * Math.cos(a) * 0.6; // thin-foil slope, derated
  const post = 1.1 * Math.sin(a);
  const t = Math.min(1, Math.max(0, (a - 0.25) / 0.2));
  return Math.sign(alpha) * (pre * (1 - t) + post * t);
}

/** Static thrust from momentum theory: T = (2 rho A P^2)^(1/3). */
export function staticThrust(power: number, diameter: number, rho = 1025): number {
  const A = Math.PI * (diameter / 2) ** 2;
  return Math.cbrt(2 * rho * A * power * power);
}
