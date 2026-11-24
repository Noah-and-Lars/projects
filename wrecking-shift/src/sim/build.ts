import { MAT, pal } from './materials';
import { hash3 } from './rng';
import { VoxelGrid } from './voxels';

/** Small voxel-authoring helpers used by the level generators. */
export type PalFn = (x: number, y: number, z: number) => number;

/** material with pseudo-random shade variation (0..4), optionally in coarse blocks */
export function shaded(mat: number, block = 1, seed = 0): PalFn {
  return (x, y, z) => pal(mat, (hash3((x / block) | 0, (y / block) | 0, (z / block) | 0, seed + mat) * 5) | 0);
}
/** brick pattern: staggered rows with darker mortar-ish variation */
export function bricks(mat: number = MAT.brick, seed = 0): PalFn {
  return (x, y, z) => {
    const row = (y / 2) | 0;
    const off = row % 2 ? 2 : 0;
    const bx = ((x + z + off) / 4) | 0;
    return pal(mat, (hash3(bx, row, 0, seed) * 5) | 0);
  };
}
/** vertical planks */
export function planks(mat: number = MAT.wood, width = 3, seed = 0, axis: 'x' | 'y' | 'z' = 'x'): PalFn {
  return (x, y, z) => {
    const c = axis === 'x' ? x + z : axis === 'y' ? y : z;
    return pal(mat, (hash3((c / width) | 0, 0, 0, seed) * 5) | 0);
  };
}
export const flat = (mat: number, shade = 2): PalFn => () => pal(mat, shade);

export function box(g: VoxelGrid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: PalFn | number): void {
  g.fill(x0, y0, z0, x1, y1, z1, p as any);
}
/** hollow box: walls of thickness t (no floor/ceiling unless given) */
export function shell(g: VoxelGrid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, p: PalFn | number): void {
  box(g, x0, y0, z0, x1, y1, z0 + t, p);
  box(g, x0, y0, z1 - t, x1, y1, z1, p);
  box(g, x0, y0, z0, x0 + t, y1, z1, p);
  box(g, x1 - t, y0, z0, x1, y1, z1, p);
}
export function clear(g: VoxelGrid, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  g.fill(x0, y0, z0, x1, y1, z1, 0);
}
/** window: hole with a glass pane in the middle of the wall thickness. axis = wall normal */
export function windowX(g: VoxelGrid, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, frame = MAT.wood): void {
  // wall spans z0..z1 thickness, opening x0..x1,y0..y1
  clear(g, x0, y0, z0, x1, y1, z1);
  const zm = (z0 + z1) >> 1;
  box(g, x0, y0, zm, x1, y1, zm + 1, pal(MAT.glass, 2));
  const mx = (x0 + x1) >> 1;
  box(g, mx, y0, zm, mx + 1, y1, zm + 1, pal(frame, 1));
}
export function windowZ(g: VoxelGrid, z0: number, z1: number, y0: number, y1: number, x0: number, x1: number, frame = MAT.wood): void {
  clear(g, x0, y0, z0, x1, y1, z1);
  const xm = (x0 + x1) >> 1;
  box(g, xm, y0, z0, xm + 1, y1, z1, pal(MAT.glass, 2));
  const mz = (z0 + z1) >> 1;
  box(g, xm, y0, mz, xm + 1, y1, mz + 1, pal(frame, 1));
}
/** gable roof along x: ridge parallel to x axis */
export function gableRoofX(g: VoxelGrid, x0: number, x1: number, y0: number, z0: number, z1: number, p: PalFn | number, thickness = 2): void {
  const half = (z1 - z0) / 2;
  for (let i = 0; i < half; i++) {
    box(g, x0, y0 + i, z0 + i, x1, y0 + i + thickness, z0 + i + 2, p);
    box(g, x0, y0 + i, z1 - i - 2, x1, y0 + i + thickness, z1 - i, p);
  }
}
export function cylinderY(g: VoxelGrid, cx: number, cz: number, r: number, y0: number, y1: number, p: PalFn | number, hollow = 0): void {
  const fn = typeof p === 'function' ? p : null;
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > r || (hollow && d < r - hollow)) continue;
      for (let y = y0; y < y1; y++) g.set(x, y, z, fn ? fn(x, y, z) : (p as number));
    }
}
export function sphere(g: VoxelGrid, cx: number, cy: number, cz: number, r: number, p: PalFn | number, noise = 0, seed = 0): void {
  const fn = typeof p === 'function' ? p : null;
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
        if (d > r * (1 - noise * hash3(x >> 1, y >> 1, z >> 1, seed))) continue;
        g.set(x, y, z, fn ? fn(x, y, z) : (p as number));
      }
}
/** crop a grid to its solid bounding box; returns new grid and the offset of its origin */
export function cropped(g: VoxelGrid): { grid: VoxelGrid; off: [number, number, number] } {
  let x0 = g.sx, y0 = g.sy, z0 = g.sz, x1 = -1, y1 = -1, z1 = -1;
  for (let z = 0; z < g.sz; z++) for (let y = 0; y < g.sy; y++) for (let x = 0; x < g.sx; x++)
    if (g.data[g.idx(x, y, z)]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  if (x1 < 0) return { grid: new VoxelGrid(1, 1, 1), off: [0, 0, 0] };
  const n = new VoxelGrid(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    n.data[n.idx(x - x0, y - y0, z - z0)] = g.data[g.idx(x, y, z)];
  n.recount();
  return { grid: n, off: [x0, y0, z0] };
}
