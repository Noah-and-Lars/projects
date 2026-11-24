import type { VoxelBody } from '../../body';
import { type PalFn, box, bricks, clear, flat, planks, shaded } from '../../build';
import { allComponents } from '../../connectivity';
import { MAT, pal } from '../../materials';
import { hash3 } from '../../rng';
import type { Sim } from '../../sim';
import { qyaw } from '../../vec';
import { VoxelGrid } from '../../voxels';

/**
 * Building kit: parametric multi-storey buildings and the geometry helpers level files use to author
 * their own structures (stairs, horizontal cylinders, steel lattice, railings), plus body placement helpers.
 * Grids are authored in local voxel coords; static bodies are anchored by their y == 0 layer, so every static
 * prefab starts with a foundation that reaches below grade.
 */

export interface BuildingSpec {
  /** footprint in voxels (x, z) */
  w: number;
  d: number;
  floors: number;
  /** storey height in voxels (default 30 = 3 m) */
  floorH?: number;
  /** structural wall material (brick / concrete / wood / sheetmetal ...) */
  wall: number;
  /** wall thickness in voxels (default 2) */
  wallT?: number;
  /** inner lining material (plaster) or 0 for none */
  lining?: number;
  /** slab material between storeys (default wood planks) */
  slab?: number;
  roof?: 'flat' | 'gable' | 'none';
  roofMat?: number;
  /** window width/height/sill in voxels, 0 width = no windows */
  winW?: number;
  winH?: number;
  sill?: number;
  /** spacing between windows (centre to centre) */
  winStep?: number;
  /** which sides get a ground-floor door: 'n' = z0 side, 's' = z1 side, 'w' = x0, 'e' = x1 */
  doors?: string;
  /** door width in voxels (default 10; 26+ for garage doors) */
  doorW?: number;
  doorH?: number;
  stairs?: boolean;
  /** interior partition walls (plaster) */
  partitions?: boolean;
  /** corner / perimeter columns of this material (concrete frame) */
  frame?: number;
  lamps?: boolean;
  seed?: number;
}

function wallFn(mat: number, seed: number): PalFn {
  if (mat === MAT.brick) return bricks(MAT.brick, seed);
  if (mat === MAT.wood) return planks(MAT.wood, 3, seed);
  if (mat === MAT.sheetmetal || mat === MAT.paintedmetal) return shaded(mat, 5, seed);
  return shaded(mat, 3, seed);
}

/**
 * Generic multi-storey building. Grid origin: y = 0 is the bottom of a 3-voxel foundation
 * (place the body 0.2 m below ground level so the ground floor sits 0.1 m above grade).
 */
export function makeBuilding(s: BuildingSpec): VoxelGrid {
  const fh = s.floorH ?? 30, t = s.wallT ?? 2, seed = s.seed ?? 1;
  const { w, d, floors } = s;
  const roofH = s.roof === 'gable' ? Math.ceil(d / 2) + 3 : s.roof === 'none' ? 0 : 5;
  const F = 3; // foundation
  const H = F + floors * fh + roofH + 1;
  const g = new VoxelGrid(w, H, d);
  const wf = wallFn(s.wall, seed);
  const slabFn: PalFn = s.slab === MAT.concrete ? shaded(MAT.concrete, 4, seed + 5) : s.slab ? shaded(s.slab, 3, seed + 5) : planks(MAT.wood, 4, seed + 5);
  const lin = s.lining ?? 0;
  box(g, 0, 0, 0, w, F, d, shaded(MAT.concrete, 4, seed + 9));
  const winW = s.winW ?? 12, winH = s.winH ?? 13, sill = s.sill ?? 9, step = s.winStep ?? 24;
  for (let f = 0; f < floors; f++) {
    const y0 = F + f * fh, y1 = y0 + fh;
    // walls
    box(g, 0, y0, 0, w, y1, t, wf); box(g, 0, y0, d - t, w, y1, d, wf);
    box(g, 0, y0, 0, t, y1, d, wf); box(g, w - t, y0, 0, w, y1, d, wf);
    if (lin) {
      const lf = shaded(lin, 6, seed + 3);
      box(g, t, y0, t, w - t, y1, t + 1, lf); box(g, t, y0, d - t - 1, w - t, y1, d - t, lf);
      box(g, t, y0, t, t + 1, y1, d - t, lf); box(g, w - t - 1, y0, t, w - t, y1, d - t, lf);
    }
    const tt = t + (lin ? 1 : 0);
    // slab above (the roof slab for the top storey)
    box(g, 0, y1 - 2, 0, w, y1, d, f === floors - 1 && s.roof === 'flat' ? shaded(s.roofMat ?? MAT.concrete, 4, seed + 7) : slabFn);
    // windows
    if (winW > 0) {
      const wy0 = y0 + sill, wy1 = Math.min(y1 - 5, wy0 + winH);
      for (let x = Math.max(8, tt + 4); x + winW < w - 6; x += step) {
        for (const z of [0, d - tt]) {
          clear(g, x, wy0, z, x + winW, wy1, z + tt);
          const zm = z === 0 ? Math.min(1, t - 1) : d - 1 - Math.min(1, t - 1);
          box(g, x, wy0, zm, x + winW, wy1, zm + 1, pal(MAT.glass, 2));
          box(g, x + (winW >> 1), wy0, zm, x + (winW >> 1) + 1, wy1, zm + 1, pal(MAT.wood, 1));
        }
      }
      for (let z = Math.max(8, tt + 4); z + winW < d - 6; z += step) {
        for (const x of [0, w - tt]) {
          clear(g, x, wy0, z, x + tt, wy1, z + winW);
          const xm = x === 0 ? Math.min(1, t - 1) : w - 1 - Math.min(1, t - 1);
          box(g, xm, wy0, z, xm + 1, wy1, z + winW, pal(MAT.glass, 2));
          box(g, xm, wy0, z + (winW >> 1), xm + 1, wy1, z + (winW >> 1) + 1, pal(MAT.wood, 1));
        }
      }
    }
    // partitions: one wall across with a doorway
    if (s.partitions && w > 50) {
      const px = Math.round(w * (0.4 + 0.2 * hash3(f, seed, 1)));
      box(g, px, y0, tt, px + 1, y1 - 2, d - tt, shaded(MAT.plaster, 6, seed + f));
      const dz = Math.round(d * (0.3 + 0.4 * hash3(f, seed, 2)));
      clear(g, px, y0, dz, px + 1, y0 + 21, dz + 9);
    }
    if (s.lamps) {
      box(g, (w >> 1) - 2, y1 - 4, (d >> 1) - 2, (w >> 1) + 2, y1 - 2, (d >> 1) + 2, pal(MAT.lamp));
    }
  }
  // frame columns
  if (s.frame) {
    const cf = shaded(s.frame, 3, seed + 11);
    const top = F + floors * fh;
    for (const [x, z] of [[0, 0], [w - 3, 0], [0, d - 3], [w - 3, d - 3]]) box(g, x, F, z, x + 3, top, z + 3, cf);
    for (let x = 36; x < w - 30; x += 36) { box(g, x, F, 0, x + 3, top, 3, cf); box(g, x, F, d - 3, x + 3, top, d, cf); }
  }
  // doors
  const doors = s.doors ?? 'n';
  const dw = s.doorW ?? 10, dh = s.doorH ?? 21, tt = t + (lin ? 1 : 0);
  const dx = Math.round(w / 2 - dw / 2), dz = Math.round(d / 2 - dw / 2);
  if (doors.includes('n')) clear(g, dx, F, 0, dx + dw, F + dh, tt);
  if (doors.includes('s')) clear(g, dx, F, d - tt, dx + dw, F + dh, d);
  if (doors.includes('w')) clear(g, 0, F, dz, tt, F + dh, dz + dw);
  if (doors.includes('e')) clear(g, w - tt, F, dz, w, F + dh, dz + dw);
  // stairs along the x1 wall, alternating direction per storey
  if (s.stairs !== false && floors > 1) {
    for (let f = 0; f < floors - 1; f++) {
      const y0 = F + f * fh;
      const steps = fh / 2;
      const run = 3;
      const sw = 9; // stair width
      const x1 = w - tt, x0 = x1 - sw;
      const len = steps * run;
      const zs = f % 2 === 0 ? tt + 6 : Math.min(d - tt - 6, tt + 6 + len);
      const dir = f % 2 === 0 ? 1 : -1;
      // opening in the slab above the whole flight: a 1.8 m player (radius 0.3) hit his head on the slab when
      // the opening started after step 4, and the stairs could not be climbed.
      const za = Math.min(zs, zs + dir * len), zb = Math.max(zs, zs + dir * len);
      clear(g, x0, y0 + fh - 2, Math.max(tt, za), x1, y0 + fh, Math.min(d - tt, zb));
      for (let i = 0; i < steps; i++) {
        const z = zs + dir * i * run;
        const zz0 = Math.min(z, z + dir * run), zz1 = Math.max(z, z + dir * run);
        if (zz0 < tt || zz1 > d - tt) break;
        box(g, x0, Math.max(y0, y0 + i * 2 - 2), zz0, x1, y0 + i * 2 + 2, zz1, planks(MAT.wood, 3, seed + 13, 'z'));
      }
    }
  }
  // roof
  const ry = F + floors * fh;
  if (s.roof === 'gable') {
    const rf = shaded(s.roofMat ?? MAT.tile, 2, seed + 21);
    const half = Math.ceil(d / 2);
    for (let i = 0; i < half; i++) {
      box(g, 0, ry + i, i, w, ry + i + 2, i + 2, rf);
      box(g, 0, ry + i, d - i - 2, w, ry + i + 2, d - i, rf);
      box(g, 0, ry, i, t, ry + i, d - i, wf);
      box(g, w - t, ry, i, w, ry + i, d - i, wf);
    }
  } else if (s.roof !== 'none') {
    // parapet
    const pf = wf;
    box(g, 0, ry, 0, w, ry + 4, 1, pf); box(g, 0, ry, d - 1, w, ry + 4, d, pf);
    box(g, 0, ry, 0, 1, ry + 4, d, pf); box(g, w - 1, ry, 0, w, ry + 4, d, pf);
  }
  g.recount();
  return g;
}

/** place a building grid so its ground floor is at `groundY` (+0.1 m); returns the static body */
export function placeBuilding(sim: Sim, g: VoxelGrid, x: number, groundY: number, z: number, name = 'building'): VoxelBody {
  return sim.addBody(g, { x, y: groundY - 0.2, z }, { name });
}

export type Paint = PalFn | number;

/** remove voxels not face-connected to the bottom layer (they would drop as debris at the first edit); returns count */
export function dropFloating(g: VoxelGrid): number {
  let n = 0;
  for (const c of allComponents(g)) if (c.min[1] > 0) { for (const i of c.indices) g.data[i] = 0; n += c.indices.length; }
  if (n) g.recount();
  return n;
}

/** add a static grid with its min corner at world (x, y, z) */
export function addStatic(sim: Sim, g: VoxelGrid, x: number, y: number, z: number, name: string, tags?: string[]): VoxelBody {
  g.recount();
  return sim.addBody(g, { x, y, z }, { name, tags });
}

/** add a dynamic prop; (x, y, z) is the grid's min corner before rotation (rotation is about that corner) */
export function addProp(sim: Sim, g: VoxelGrid, x: number, y: number, z: number, name: string, yaw = 0, tags?: string[]): VoxelBody {
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name, rot: qyaw(yaw), tags });
}

/**
 * Straight flight of stairs (0.2 m rise / 0.3 m run) climbing `rise` voxels from the floor surface `y0`
 * (the first empty layer above the floor). `axis` is the walking direction, `a0` the near edge of the first
 * step along it, `dir` +1/-1, [b0, b1) the width. Each step is a block `depth` voxels deep under its tread
 * (0 = solid down to y0) so the flight is one connected piece. Returns the far edge of the last step.
 */
export function stairs(g: VoxelGrid, axis: 'x' | 'z', a0: number, dir: 1 | -1, b0: number, b1: number, y0: number, rise: number, p: Paint, depth = 0): number {
  const n = Math.ceil(rise / 2);
  for (let i = 0; i < n; i++) {
    const top = Math.min(y0 + (i + 1) * 2, y0 + rise);
    const bot = depth > 0 ? Math.max(y0, top - depth) : y0;
    const s0 = dir > 0 ? a0 + i * 3 : a0 - (i + 1) * 3;
    if (axis === 'x') box(g, s0, bot, b0, s0 + 3, top, b1, p);
    else box(g, b0, bot, s0, b1, top, s0 + 3, p);
  }
  return dir > 0 ? a0 + n * 3 : a0 - n * 3;
}

/** horizontal cylinder along x (centre cy, cz) */
export function cylinderX(g: VoxelGrid, cy: number, cz: number, r: number, x0: number, x1: number, p: Paint, hollow = 0): void {
  const fn = typeof p === 'function' ? p : null;
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const d = Math.hypot(y + 0.5 - cy, z + 0.5 - cz);
      if (d > r || (hollow && d < r - hollow)) continue;
      for (let x = x0; x < x1; x++) g.set(x, y, z, fn ? fn(x, y, z) : (p as number));
    }
}

/** horizontal cylinder along z (centre cx, cy) */
export function cylinderZ(g: VoxelGrid, cx: number, cy: number, r: number, z0: number, z1: number, p: Paint, hollow = 0): void {
  const fn = typeof p === 'function' ? p : null;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r || (hollow && d < r - hollow)) continue;
      for (let z = z0; z < z1; z++) g.set(x, y, z, fn ? fn(x, y, z) : (p as number));
    }
}

/** steel lattice column: 4 corner angles (2x2) with horizontal ties and zig-zag diagonals on every face */
export function lattice(g: VoxelGrid, x0: number, z0: number, w: number, y0: number, y1: number, p: Paint = flat(MAT.steel), bay = 0): void {
  const x1 = x0 + w, z1 = z0 + w;
  for (const [cx, cz] of [[x0, z0], [x1 - 2, z0], [x0, z1 - 2], [x1 - 2, z1 - 2]]) box(g, cx, y0, cz, cx + 2, y1, cz + 2, p);
  const B = bay || w;
  for (let y = y0; y < y1; y += B) {
    const yt = Math.min(y1, y + B);
    box(g, x0, yt - 1, z0, x1, yt, z0 + 1, p); box(g, x0, yt - 1, z1 - 1, x1, yt, z1, p);
    box(g, x0, yt - 1, z0, x0 + 1, yt, z1, p); box(g, x1 - 1, yt - 1, z0, x1, yt, z1, p);
    // diagonals (1 voxel, made face-connected by stepping in x then y)
    const n = yt - y;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const a = Math.round(x0 + 1 + t * (w - 3)), b = Math.round(z0 + 1 + t * (w - 3));
      const up = (((y - y0) / B) | 0) % 2 === 0;
      const ya = up ? y + i : yt - 1 - i;
      box(g, a, ya, z0, a + 2, ya + 1, z0 + 1, p); box(g, a, ya, z1 - 1, a + 2, ya + 1, z1, p);
      box(g, x0, ya, b, x0 + 1, ya + 1, b + 2, p); box(g, x1 - 1, ya, b, x1, ya + 1, b + 2, p);
    }
  }
}

/** railing along x or z on top of a floor at y (posts every 12 voxels + top rail, 10 voxels high) */
export function railing(g: VoxelGrid, axis: 'x' | 'z', a0: number, a1: number, b: number, y: number, p: Paint, h = 10): void {
  for (let a = a0; a < a1; a++) {
    const post = (a - a0) % 12 === 0 || a === a1 - 1;
    const y1 = post ? y + h : y + 1;
    if (axis === 'x') { box(g, a, y + h - 1, b, a + 1, y + h, b + 1, p); if (post) box(g, a, y, b, a + 1, y1, b + 1, p); }
    else { box(g, b, y + h - 1, a, b + 1, y + h, a + 1, p); if (post) box(g, b, y, a, b + 1, y1, a + 1, p); }
  }
}
