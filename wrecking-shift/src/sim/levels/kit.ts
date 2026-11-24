import { bricks, box, clear, cylinderY, flat, planks, shaded, sphere, type PalFn } from '../build';
import type { VoxelBody } from '../body';
import { MAT, pal } from '../materials';
import { hash3 } from '../rng';
import type { Sim } from '../sim';
import { qyaw } from '../vec';
import { VoxelGrid } from '../voxels';

/** ------------------------------------------------------------------ buildings */

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
      // opening in the slab above
      const za = Math.min(zs, zs + dir * len), zb = Math.max(zs, zs + dir * len);
      clear(g, x0, y0 + fh - 2, Math.max(tt, za + (dir > 0 ? 12 : 0)), x1, y0 + fh, Math.min(d - tt, zb - (dir > 0 ? 0 : 12)));
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

/** ------------------------------------------------------------------ static scenery */

export function tree(sim: Sim, x: number, y: number, z: number, seed = 0, scale = 1): VoxelBody {
  const R = Math.round(17 * scale), trunk = Math.round((34 + hash3(seed, 1, 2) * 16) * scale);
  const S = R * 2 + 6;
  const g = new VoxelGrid(S, trunk + R * 2 + 2, S);
  const c = S / 2;
  cylinderY(g, c, c, 2.4 * scale + 0.4, 0, trunk + R, shaded(MAT.wood, 2, seed));
  sphere(g, c, trunk + R, c, R, shaded(MAT.leaves, 2, seed), 0.5, seed);
  cylinderY(g, c, c, 2.0 * scale + 0.3, trunk - 4, trunk + R - 3, shaded(MAT.wood, 2, seed));
  g.recount();
  return sim.addBody(g, { x: x - c * 0.1, y: y - 0.3, z: z - c * 0.1 }, { name: 'tree' });
}

export function pine(sim: Sim, x: number, y: number, z: number, seed = 0): VoxelBody {
  const h = 60 + ((hash3(seed, 3, 4) * 30) | 0);
  const g = new VoxelGrid(30, h + 4, 30);
  cylinderY(g, 15, 15, 1.8, 0, h - 6, shaded(MAT.wood, 2, seed));
  for (let y0 = 14; y0 < h; y0 += 7) {
    const r = 13 * (1 - (y0 - 14) / (h - 8)) + 2;
    cylinderY(g, 15, 15, r, y0, y0 + 3, shaded(MAT.leaves, 2, seed + y0));
    cylinderY(g, 15, 15, r * 0.7, y0 + 3, y0 + 5, shaded(MAT.leaves, 2, seed + y0 + 1));
  }
  g.recount();
  return sim.addBody(g, { x: x - 1.5, y: y - 0.3, z: z - 1.5 }, { name: 'pine' });
}

export function rock(sim: Sim, x: number, y: number, z: number, r = 10, seed = 0): VoxelBody {
  const g = new VoxelGrid(r * 2 + 2, r + 4, r * 2 + 2);
  sphere(g, r + 1, 2, r + 1, r, shaded(MAT.rock, 3, seed), 0.35, seed);
  g.recount();
  return sim.addBody(g, { x: x - r * 0.1, y: y - 0.3, z: z - r * 0.1 }, { name: 'rock' });
}

/** straight fence / wall segment along x (yaw 0) or z (yaw 90deg) */
export function fence(sim: Sim, x: number, y: number, z: number, length: number, alongZ: boolean, mat: number = MAT.wood, height = 14): VoxelBody {
  const L = Math.round(length * 10);
  const g = alongZ ? new VoxelGrid(2, height + 3, L) : new VoxelGrid(L, height + 3, 2);
  const solid = mat === MAT.brick || mat === MAT.concrete;
  for (let i = 0; i < L; i++) {
    const post = i % 12 === 0 || i === L - 1;
    for (let yy = 0; yy < height + 3; yy++) {
      const rail = yy === height - 2 + 3 || yy === 7;
      if (!(solid || post || rail || (mat === MAT.sheetmetal && yy > 3))) continue;
      const p = solid ? (mat === MAT.brick ? bricks()(i, yy, 0) : pal(mat, (hash3(i >> 2, yy >> 2, 0) * 5) | 0)) : pal(mat, post ? 0 : 2);
      for (let k = 0; k < (solid || post ? 2 : 1); k++) alongZ ? g.set(k, yy, i, p) : g.set(i, yy, k, p);
    }
  }
  g.recount();
  return sim.addBody(g, { x, y: y - 0.3, z }, { name: 'fence' });
}

export function lampPost(sim: Sim, x: number, y: number, z: number): VoxelBody {
  const g = new VoxelGrid(8, 46, 3);
  box(g, 0, 0, 0, 2, 44, 2, flat(MAT.steel));
  box(g, 0, 43, 0, 8, 44, 2, flat(MAT.steel));
  box(g, 5, 41, 0, 8, 43, 3, pal(MAT.lamp));
  g.recount();
  return sim.addBody(g, { x, y: y - 0.3, z }, { name: 'lamppost' });
}

/** shipping container (static until cut loose): sheet-metal shell on a steel frame */
export function container(sim: Sim, x: number, y: number, z: number, color: number = MAT.paintedmetal, alongZ = false, dynamic = false): VoxelBody {
  const L = 60, W = 24, H = 26;
  const g = alongZ ? new VoxelGrid(W, H, L) : new VoxelGrid(L, H, W);
  const [sx, sz] = alongZ ? [W, L] : [L, W];
  const f = shaded(color, 4, x * 7 + z * 13);
  box(g, 0, 0, 0, sx, 1, sz, flat(MAT.steel)); box(g, 0, H - 1, 0, sx, H, sz, f);
  box(g, 0, 0, 0, sx, H, 1, f); box(g, 0, 0, sz - 1, sx, H, sz, f);
  box(g, 0, 0, 0, 1, H, sz, f); box(g, sx - 1, 0, 0, sx, H, sz, f);
  for (const [cx, cz] of [[0, 0], [sx - 2, 0], [0, sz - 2], [sx - 2, sz - 2]]) box(g, cx, 0, cz, cx + 2, H, cz + 2, flat(MAT.steel));
  g.recount();
  return sim.addBody(g, { x, y, z }, dynamic ? { dynamic: true, kind: 'prop', name: 'container' } : { name: 'container' });
}

/** wooden pier: deck on posts. Deck top at `deckY`; posts go down `depth` metres. */
export function pier(sim: Sim, x: number, deckY: number, z: number, length: number, width: number, alongZ: boolean, depth = 3): VoxelBody {
  const L = Math.round(length * 10), W = Math.round(width * 10), D = Math.round(depth * 10);
  const [sx, sz] = alongZ ? [W, L] : [L, W];
  const g = new VoxelGrid(sx, D + 2, sz);
  box(g, 0, D, 0, sx, D + 2, sz, planks(MAT.wood, 3, 5, alongZ ? 'x' : 'z'));
  for (let a = 2; a < L; a += 24) for (const b of [1, W - 4]) {
    const [px, pz] = alongZ ? [b, a] : [a, b];
    box(g, px, 0, pz, px + 3, D, pz + 3, shaded(MAT.wood, 2, 8));
  }
  g.recount();
  return sim.addBody(g, { x, y: deckY - (D + 2) * 0.1, z }, { name: 'pier' });
}

/** cylindrical storage tank on legs (explosive if `fuel`) */
export function tank(sim: Sim, x: number, y: number, z: number, r = 14, h = 40, fuel = false): VoxelBody {
  const g = new VoxelGrid(r * 2 + 2, h + 14, r * 2 + 2);
  const c = r + 1;
  for (const [lx, lz] of [[c - r * 0.6, c - r * 0.6], [c + r * 0.6, c - r * 0.6], [c - r * 0.6, c + r * 0.6], [c + r * 0.6, c + r * 0.6]])
    box(g, Math.round(lx) - 1, 0, Math.round(lz) - 1, Math.round(lx) + 2, 12, Math.round(lz) + 2, flat(MAT.steel));
  cylinderY(g, c, c, r, 12, 12 + h, shaded(fuel ? MAT.paintedmetal : MAT.sheetmetal, 6, 3), 1);
  cylinderY(g, c, c, r, 12, 13, shaded(MAT.sheetmetal, 6, 3));
  cylinderY(g, c, c, r, 11 + h, 12 + h, shaded(MAT.sheetmetal, 6, 3));
  if (fuel) cylinderY(g, c, c, r - 3, 14, 12 + h - 6, pal(MAT.explosive, 2), 2);
  g.recount();
  const b = sim.addBody(g, { x: x - c * 0.1, y: y - 0.2, z: z - c * 0.1 }, { name: fuel ? 'fuel tank' : 'tank' });
  return b;
}

/** ------------------------------------------------------------------ dynamic props */

export function crate(sim: Sim, x: number, y: number, z: number, n = 8, yaw = 0): VoxelBody {
  const g = new VoxelGrid(n, n, n);
  box(g, 0, 0, 0, n, n, n, pal(MAT.wood, 0));
  for (let a = 1; a < n - 1; a++) for (let b = 1; b < n - 1; b++) {
    const p = pal(MAT.crate, (hash3(a >> 1, 0, 0, n) * 5) | 0);
    g.set(a, b, 0, p); g.set(a, b, n - 1, p); g.set(0, a, b, p); g.set(n - 1, a, b, p); g.set(a, 0, b, p); g.set(a, n - 1, b, p);
  }
  clear(g, 2, 2, 2, n - 2, n - 2, n - 2);
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'crate', rot: qyaw(yaw) });
}

export function barrel(sim: Sim, x: number, y: number, z: number, explosive = true): VoxelBody {
  const g = new VoxelGrid(6, 9, 6);
  const m = explosive ? MAT.explosive : MAT.sheetmetal;
  cylinderY(g, 3, 3, 3, 0, 9, pal(m, 2));
  for (const yy of [2, 6]) for (let xx = 0; xx < 6; xx++) for (let zz = 0; zz < 6; zz++) if (g.get(xx, yy, zz)) g.set(xx, yy, zz, pal(m, 0));
  g.recount();
  const b = sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: explosive ? 'fuel barrel' : 'barrel' });
  if (explosive) b.tags.add('explosive');
  return b;
}

export function table(sim: Sim, x: number, y: number, z: number, w = 14, d = 8): VoxelBody {
  const g = new VoxelGrid(w, 8, d);
  box(g, 0, 7, 0, w, 8, d, planks(MAT.wood, 2, 4));
  for (const [lx, lz] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) box(g, lx, 0, lz, lx + 1, 7, lz + 1, pal(MAT.wood, 0));
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'table' });
}

export function shelf(sim: Sim, x: number, y: number, z: number, alongZ = false): VoxelBody {
  const L = 20;
  const g = alongZ ? new VoxelGrid(5, 20, L) : new VoxelGrid(L, 20, 5);
  const [sx, sz] = alongZ ? [5, L] : [L, 5];
  for (const yy of [0, 6, 12, 19]) box(g, 0, yy, 0, sx, yy + 1, sz, flat(MAT.sheetmetal));
  for (const [lx, lz] of [[0, 0], [sx - 1, 0], [0, sz - 1], [sx - 1, sz - 1]]) box(g, lx, 0, lz, lx + 1, 20, lz + 1, flat(MAT.steel));
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'shelf' });
}

/** small rowing boat hull (floats: wood) */
export function boat(sim: Sim, x: number, y: number, z: number, yaw = 0): VoxelBody {
  const g = new VoxelGrid(30, 6, 12);
  for (let xx = 0; xx < 30; xx++) {
    const taper = xx < 6 ? (6 - xx) * 0.8 : 0;
    const z0 = Math.round(taper), z1 = 12 - Math.round(taper);
    box(g, xx, 0, z0, xx + 1, 1, z1, planks(MAT.wood, 2, 3, 'z'));
    box(g, xx, 1, z0, xx + 1, 6, z0 + 1, pal(MAT.wood, 1)); box(g, xx, 1, z1 - 1, xx + 1, 6, z1, pal(MAT.wood, 1));
  }
  box(g, 29, 1, 0, 30, 6, 12, pal(MAT.wood, 1));
  box(g, 12, 3, 1, 15, 4, 11, pal(MAT.wood, 3));
  g.recount();
  return sim.addBody(g, { x, y, z }, { dynamic: true, kind: 'prop', name: 'boat', rot: qyaw(yaw) });
}
