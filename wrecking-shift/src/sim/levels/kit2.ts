import { box, clear, cylinderY, flat, planks, shaded, sphere, type PalFn } from '../build';
import type { VoxelBody } from '../body';
import { MAT, pal } from '../materials';
import { hash3 } from '../rng';
import type { Sim } from '../sim';
import { qyaw } from '../vec';
import { VoxelGrid } from '../voxels';
import { Heightmap, smoothstep } from './terrain';
import { allComponents } from '../connectivity';

/**
 * Shared prefab helpers for the Kestrel Ridge and Brackwater Works maps (additions to kit.ts).
 * Conventions as in kit.ts: grids are authored in local voxel coords, static bodies are anchored by
 * their y == 0 layer, so every static prefab starts with a foundation that reaches below grade.
 */

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

/** ------------------------------------------------------------------ terrain with sloped roads */

export interface RoadPt { x: number; z: number; y: number }
interface Road { pts: RoadPt[]; half: number; blend: number; surface: number; x0: number; z0: number; x1: number; z1: number }

/**
 * Heightmap with sloped road ribbons applied after the flat pads: inside `half` metres of a road's
 * centre line the ground is set to the road height (interpolated along the polyline), blending back
 * to the terrain over `blend` metres. Road surface material wins over the natural surface but not
 * over pads that set their own surface.
 */
export class RoadHeightmap extends Heightmap {
  roads: Road[] = [];
  addRoad(pts: RoadPt[], half = 3, blend = 3.5, surface: number = MAT.asphalt): this {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const m = half + blend;
    this.roads.push({ pts, half, blend, surface, x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m });
    return this;
  }
  /** nearest road centre line: distance, road height there, road */
  nearestRoad(x: number, z: number): { d: number; y: number; road: Road } | null {
    let best: { d: number; y: number; road: Road } | null = null;
    for (const r of this.roads) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const ex = b.x - a.x, ez = b.z - a.z;
        const l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
        const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
        if (!best || d < best.d) best = { d, y: a.y + (b.y - a.y) * t, road: r };
      }
    }
    return best;
  }
  /**
   * Roads apply in order like pads: a later road overrides earlier ones inside its half width and blends over
   * its `blend` band. (Taking only the nearest road left a vertical step along the line where the nearest road
   * changes: on Kestrel Ridge the switchback leaving the shore lane grew a 1.4 m cliff across the carriageway
   * that stopped every vehicle; tests/unit/ridgeRoads.test.ts.)
   */
  override height(x: number, z: number): number {
    let h = super.height(x, z);
    for (const road of this.roads) {
      if (x < road.x0 || x > road.x1 || z < road.z0 || z > road.z1) continue;
      let d = Infinity, y = 0;
      for (let i = 0; i + 1 < road.pts.length; i++) {
        const a = road.pts[i], b = road.pts[i + 1];
        const ex = b.x - a.x, ez = b.z - a.z;
        const l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
        const di = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
        if (di < d) { d = di; y = a.y + (b.y - a.y) * t; }
      }
      if (d >= road.half + road.blend) continue;
      h = y + (h - y) * smoothstep(road.half, road.half + road.blend, d);
    }
    return h;
  }
  override padSurface(x: number, z: number): number | undefined {
    const s = super.padSurface(x, z);
    if (s !== undefined) return s;
    const r = this.nearestRoad(x, z);
    return r && r.d < r.road.half ? r.road.surface : undefined;
  }
}

/** ------------------------------------------------------------------ static scenery */

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

/** street lamp (steel pole with an arm) — taller than kit.lampPost, arm along +x rotated by `armZ` */
export function streetLamp(sim: Sim, x: number, y: number, z: number, armZ = false): VoxelBody {
  const g = armZ ? new VoxelGrid(3, 52, 9) : new VoxelGrid(9, 52, 3);
  box(g, 0, 0, 0, 2, 50, 2, flat(MAT.paintedmetal, 0));
  if (armZ) { box(g, 0, 49, 0, 2, 50, 9, flat(MAT.steel)); box(g, 0, 47, 6, 3, 49, 9, pal(MAT.lamp)); }
  else { box(g, 0, 49, 0, 9, 50, 2, flat(MAT.steel)); box(g, 6, 47, 0, 9, 49, 3, pal(MAT.lamp)); }
  return addStatic(sim, g, x - 0.1, y - 0.3, z - 0.1, 'lamppost');
}

/** ------------------------------------------------------------------ dynamic props */

export function sofa(sim: Sim, x: number, y: number, z: number, yaw = 0, color: number = MAT.fabric): VoxelBody {
  const g = new VoxelGrid(20, 8, 9);
  box(g, 0, 0, 0, 20, 4, 9, pal(color, 1));
  box(g, 0, 4, 6, 20, 8, 9, pal(color, 2));
  box(g, 0, 4, 0, 2, 6, 6, pal(color, 3)); box(g, 18, 4, 0, 20, 6, 6, pal(color, 3));
  return addProp(sim, g, x, y, z, 'sofa', yaw);
}

export function bed(sim: Sim, x: number, y: number, z: number, yaw = 0): VoxelBody {
  const g = new VoxelGrid(16, 9, 21);
  box(g, 0, 0, 0, 16, 4, 21, planks(MAT.wood, 2, 3));
  box(g, 1, 4, 1, 15, 6, 20, pal(MAT.fabric, 4));
  box(g, 2, 6, 15, 14, 7, 19, pal(MAT.plaster, 3));
  box(g, 0, 0, 20, 16, 9, 21, pal(MAT.wood, 0));
  return addProp(sim, g, x, y, z, 'bed', yaw);
}

export function chair(sim: Sim, x: number, y: number, z: number, yaw = 0): VoxelBody {
  const g = new VoxelGrid(5, 10, 5);
  box(g, 0, 4, 0, 5, 5, 5, pal(MAT.wood, 2));
  for (const [lx, lz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) box(g, lx, 0, lz, lx + 1, 4, lz + 1, pal(MAT.wood, 0));
  box(g, 0, 5, 4, 5, 10, 5, pal(MAT.wood, 1));
  return addProp(sim, g, x, y, z, 'chair', yaw);
}

export function bookcase(sim: Sim, x: number, y: number, z: number, yaw = 0, seed = 0): VoxelBody {
  const g = new VoxelGrid(16, 20, 4);
  box(g, 0, 0, 0, 16, 20, 4, pal(MAT.wood, 0));
  clear(g, 1, 1, 1, 15, 19, 4);
  for (const yy of [6, 12]) box(g, 1, yy, 1, 15, yy + 1, 4, pal(MAT.wood, 0));
  for (const y0 of [1, 7, 13]) for (let i = 1; i < 15; i++) {
    const h = 3 + ((hash3(i, y0, seed) * 3) | 0);
    const m = hash3(i, y0, seed + 1) < 0.5 ? MAT.fabric : MAT.plastic;
    if (hash3(i, y0, seed + 2) < 0.12) continue;
    box(g, i, y0, 1, i + 1, y0 + h, 3, pal(m, (hash3(i >> 1, y0, seed + 3) * 5) | 0));
  }
  return addProp(sim, g, x, y, z, 'bookcase', yaw);
}

/** small art object meant to stand on a plinth: 0 marble bust, 1 gold statuette, 2 glass vase, 3 bronze-ish abstract */
export function sculpture(sim: Sim, x: number, y: number, z: number, kind = 0): VoxelBody {
  const g = new VoxelGrid(6, 9, 6);
  if (kind === 0) { box(g, 1, 0, 1, 5, 2, 5, pal(MAT.marble, 1)); box(g, 2, 2, 2, 4, 4, 4, pal(MAT.marble, 2)); sphere(g, 3, 6, 3, 2.6, pal(MAT.marble, 3)); }
  else if (kind === 1) { box(g, 1, 0, 1, 5, 1, 5, pal(MAT.gold, 0)); box(g, 2, 1, 2, 4, 7, 4, pal(MAT.gold, 2)); box(g, 1, 5, 2, 5, 6, 4, pal(MAT.gold, 3)); sphere(g, 3, 7.5, 3, 1.4, pal(MAT.gold, 1)); }
  else if (kind === 2) { cylinderY(g, 3, 3, 2.2, 0, 7, pal(MAT.glass, 1), 1); cylinderY(g, 3, 3, 2.2, 0, 1, pal(MAT.glass, 1)); cylinderY(g, 3, 3, 1.5, 7, 9, pal(MAT.glass, 3), 1); }
  else { box(g, 2, 0, 2, 4, 9, 4, pal(MAT.paintedmetal, 0)); box(g, 0, 4, 2, 6, 6, 4, pal(MAT.paintedmetal, 1)); box(g, 2, 6, 0, 4, 8, 6, pal(MAT.paintedmetal, 2)); }
  return addProp(sim, g, x, y, z, ['bust', 'statuette', 'vase', 'sculpture'][kind & 3], 0, ['art']);
}

/** potted plant: plastic pot with a leafy top */
export function plant(sim: Sim, x: number, y: number, z: number, seed = 0): VoxelBody {
  const g = new VoxelGrid(6, 10, 6);
  cylinderY(g, 3, 3, 2.4, 0, 4, pal(MAT.plastic, 1));
  sphere(g, 3, 6, 3, 3, pal(MAT.leaves, 1 + (seed % 3)), 0.3, seed);
  return addProp(sim, g, x, y, z, 'plant');
}

/** bent sheet-metal scrap piece */
export function scrap(sim: Sim, x: number, y: number, z: number, seed = 0): VoxelBody {
  const L = 8 + ((hash3(seed, 1, 2) * 10) | 0), W = 5 + ((hash3(seed, 3, 4) * 6) | 0);
  const bend = 2 + ((hash3(seed, 5, 6) * 4) | 0);
  const g = new VoxelGrid(L, bend + 2, W);
  const m = hash3(seed, 7, 8) < 0.6 ? MAT.sheetmetal : hash3(seed, 9, 1) < 0.5 ? MAT.paintedmetal : MAT.steel;
  for (let i = 0; i < L; i++) {
    const yy = i < L * 0.6 ? 0 : Math.min(bend, i - Math.floor(L * 0.6));
    box(g, i, yy, 0, i + 1, yy + 1, W, pal(m, (hash3(i >> 2, seed, 0) * 5) | 0));
    if (yy > 0) box(g, i, yy - 1, 0, i + 1, yy, W, pal(m, 1));
  }
  return addProp(sim, g, x, y, z, 'scrap', hash3(seed, 11, 12) * 6.28);
}

/** wooden cable drum / spool (dynamic, can be rolled) */
export function spool(sim: Sim, x: number, y: number, z: number): VoxelBody {
  const g = new VoxelGrid(10, 10, 8);
  cylinderZ(g, 5, 5, 5, 0, 1, pal(MAT.wood, 1)); cylinderZ(g, 5, 5, 5, 7, 8, pal(MAT.wood, 1));
  cylinderZ(g, 5, 5, 3, 1, 7, pal(MAT.wire, 2));
  return addProp(sim, g, x, y, z, 'spool');
}
