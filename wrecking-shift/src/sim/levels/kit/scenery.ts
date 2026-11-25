import type { VoxelBody } from '../../body';
import { type PalFn, box, bricks, cylinderY, flat, planks, shaded, sphere } from '../../build';
import { MAT, pal } from '../../materials';
import { hash3 } from '../../rng';
import type { Sim } from '../../sim';
import { VoxelGrid } from '../../voxels';
import { addStatic, dropFloating } from './buildings';

/** Static scenery prefabs: trees, rocks, fences and walls, lamps, containers, piers, tanks. */

/** static scenery must sit on the 0.1 m voxel grid: the lighting volume stamps bodies at whole voxels */
const onGrid = (v: number) => Math.round(v * 10) / 10;

export function tree(sim: Sim, x: number, y: number, z: number, seed = 0, scale = 1): VoxelBody {
  const R = Math.round(17 * scale), trunk = Math.round((34 + hash3(seed, 1, 2) * 16) * scale);
  const S = R * 2 + 6;
  const g = new VoxelGrid(S, trunk + R * 2 + 2, S);
  const c = S / 2;
  cylinderY(g, c, c, 2.4 * scale + 0.4, 0, trunk + R, shaded(MAT.wood, 2, seed));
  sphere(g, c, trunk + R, c, R, shaded(MAT.leaves, 2, seed), 0.5, seed);
  cylinderY(g, c, c, 2.0 * scale + 0.3, trunk - 4, trunk + R - 3, shaded(MAT.wood, 2, seed));
  dropFloating(g);
  g.recount();
  return sim.addBody(g, { x: onGrid(x - c * 0.1), y: onGrid(y - 0.3), z: onGrid(z - c * 0.1) }, { name: 'tree' });
}

export function pine(sim: Sim, x: number, y: number, z: number, seed = 0): VoxelBody {
  const h = 60 + ((hash3(seed, 3, 4) * 30) | 0);
  const g = new VoxelGrid(30, h + 4, 30);
  cylinderY(g, 15, 15, 1.8, 0, h - 1, shaded(MAT.wood, 2, seed)); // trunk reaches the top tier (tiers are only joined through it)
  for (let y0 = 14; y0 < h; y0 += 7) {
    const r = 13 * (1 - (y0 - 14) / (h - 8)) + 2;
    cylinderY(g, 15, 15, r, y0, y0 + 3, shaded(MAT.leaves, 2, seed + y0));
    cylinderY(g, 15, 15, r * 0.7, y0 + 3, y0 + 5, shaded(MAT.leaves, 2, seed + y0 + 1));
  }
  dropFloating(g);
  g.recount();
  return sim.addBody(g, { x: onGrid(x - 1.5), y: onGrid(y - 0.3), z: onGrid(z - 1.5) }, { name: 'pine' });
}

export function rock(sim: Sim, x: number, y: number, z: number, r = 10, seed = 0): VoxelBody {
  const g = new VoxelGrid(r * 2 + 2, r + 4, r * 2 + 2);
  sphere(g, r + 1, 2, r + 1, r, shaded(MAT.rock, 3, seed), 0.35, seed);
  dropFloating(g);
  g.recount();
  return sim.addBody(g, { x: onGrid(x - r * 0.1), y: onGrid(y - 0.3), z: onGrid(z - r * 0.1) }, { name: 'rock' });
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

/** lamp post: pole at (x, z), arm and lamp head toward -x (all call sites stand on the +x side of their road) */
export function lampPost(sim: Sim, x: number, y: number, z: number): VoxelBody {
  // the arm used to point to +x, away from every road it was meant to light (user report); turned 180 degrees with
  // the pole kept where it was
  const g = new VoxelGrid(8, 46, 3);
  box(g, 6, 0, 1, 8, 44, 3, flat(MAT.steel));
  box(g, 0, 43, 1, 8, 44, 3, flat(MAT.steel));
  box(g, 0, 41, 0, 3, 43, 3, pal(MAT.lamp));
  g.recount();
  return sim.addBody(g, { x: x - 0.6, y: y - 0.3, z: z - 0.1 }, { name: 'lamppost' });
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
  if (fuel) cylinderY(g, c, c, r - 3, 13, 12 + h - 6, pal(MAT.explosive, 2), 2); // starts on the bottom plate (was floating from y 14)
  g.recount();
  const b = sim.addBody(g, { x: x - c * 0.1, y: y - 0.2, z: z - c * 0.1 }, { name: fuel ? 'fuel tank' : 'tank' });
  return b;
}

/**
 * run of `wallSeg` pieces (each <= `maxSeg` m). `y` may be a ground-height function: each piece then sits
 * at the lowest ground under it and grows by the height difference so its top follows the slope in steps.
 */
export function wallRun(sim: Sim, x: number, y: number | ((x: number, z: number) => number), z: number, length: number, alongZ: boolean, height = 1.6, t = 3, mat: number = MAT.brick, cap: number = MAT.concrete, maxSeg = 6): VoxelBody[] {
  const out: VoxelBody[] = [];
  const n = Math.ceil(length / maxSeg);
  const seg = Math.round((length / n) * 10) / 10;
  for (let i = 0; i < n; i++) {
    const sx = alongZ ? x : x + i * seg, sz = alongZ ? z + i * seg : z;
    let lo = 1e9, hi = -1e9;
    if (typeof y === 'function') for (let k = 0; k <= 4; k++) { const h = alongZ ? y(sx + 0.2, sz + (seg * k) / 4) : y(sx + (seg * k) / 4, sz + 0.2); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    else lo = hi = y;
    out.push(wallSeg(sim, sx, lo, sz, i === n - 1 ? length - i * seg : seg, alongZ, height + (hi - lo), t, mat, cap));
  }
  return out;
}

/** clipped hedge block (leaves), sunk 0.2 m into the ground */
export function hedge(sim: Sim, x: number, y: number, z: number, lx: number, lz: number, h = 1.3): VoxelBody {
  const sx = Math.round(lx * 10), sz = Math.round(lz * 10), sy = Math.round(h * 10) + 2;
  const g = new VoxelGrid(sx, sy, sz);
  box(g, 0, 0, 0, sx, sy, sz, shaded(MAT.leaves, 8, (x * 3 + z) | 0));
  // soft rounded top edge
  for (let i = 0; i < sx; i++) for (const k of [0, sz - 1]) g.set(i, sy - 1, k, 0);
  for (let k = 0; k < sz; k++) for (const i of [0, sx - 1]) g.set(i, sy - 1, k, 0);
  return addStatic(sim, g, x, y - 0.2, z, 'hedge');
}

/** solid garden / boundary wall with a coping course; foundation 0.3 m below `y` */
export function wallSeg(sim: Sim, x: number, y: number, z: number, length: number, alongZ: boolean, height = 1.6, t = 3, mat: number = MAT.brick, cap: number = MAT.concrete): VoxelBody {
  const L = Math.round(length * 10), H = Math.round(height * 10) + 3;
  const g = alongZ ? new VoxelGrid(t + 2, H + 1, L) : new VoxelGrid(L, H + 1, t + 2);
  const f = mat === MAT.brick ? bricksFn(mat) : shaded(mat, 8, 7);
  if (alongZ) { box(g, 1, 0, 0, t + 1, H, L, f); box(g, 0, H - 1, 0, t + 2, H + 1, L, flat(cap, 1)); }
  else { box(g, 0, 0, 1, L, H, t + 1, f); box(g, 0, H - 1, 0, L, H + 1, t + 2, flat(cap, 1)); }
  return addStatic(sim, g, x, y - 0.3, z, 'wall');
}

function bricksFn(mat: number): PalFn {
  return (x, y, z) => { const row = (y / 2) | 0; const bx = ((x + z + (row % 2 ? 2 : 0)) / 4) | 0; return pal(mat, (hash3(bx >> 1, row >> 1, 0, 9) * 3) | 0); };
}

/**
 * street lamp (steel pole with an arm) — taller than kit.lampPost. The pole stands at (x, z); the arm reaches toward
 * -x (or -z with `armZ`), over the road: every call site stands on the + side of its road. (It used to point to +x /
 * +z, away from the road; turned 180 degrees with the pole kept in place.)
 */
export function streetLamp(sim: Sim, x: number, y: number, z: number, armZ = false): VoxelBody {
  const g = armZ ? new VoxelGrid(3, 52, 9) : new VoxelGrid(9, 52, 3);
  if (armZ) { box(g, 1, 0, 7, 3, 50, 9, flat(MAT.paintedmetal, 0)); box(g, 1, 49, 0, 3, 50, 9, flat(MAT.steel)); box(g, 0, 47, 0, 3, 49, 3, pal(MAT.lamp)); }
  else { box(g, 7, 0, 1, 9, 50, 3, flat(MAT.paintedmetal, 0)); box(g, 0, 49, 1, 9, 50, 3, flat(MAT.steel)); box(g, 0, 47, 0, 3, 49, 3, pal(MAT.lamp)); }
  return armZ ? addStatic(sim, g, x - 0.2, y - 0.3, z - 0.8, 'lamppost') : addStatic(sim, g, x - 0.8, y - 0.3, z - 0.2, 'lamppost');
}
