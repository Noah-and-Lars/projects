import { hash3 } from './rng';

/**
 * Fracture patterns: voxels are grouped into pseudo-random staggered blocks ("cells"). Carving uses the
 * cells to cut crack seams (explosions) and to break removed material into loose chunks (hammer hits).
 */
export function cellId(x: number, y: number, z: number, c: number, s: number): number {
  const jx = (hash3((y / c) | 0, (z / c) | 0, 0, s) * c) | 0;
  const cx = ((x + jx) / c) | 0;
  const jy = (hash3(cx, (z / c) | 0, 1, s) * c) | 0;
  const cy = ((y + jy) / c) | 0;
  const jz = (hash3(cx, cy, 2, s) * c) | 0;
  return cx + 1024 * cy + 1048576 * (((z + jz) / c) | 0);
}
/** staggered-block crack pattern: true on the 1-voxel seams between pseudo-random blocks */
export function isCrack(x: number, y: number, z: number, c: number, s: number): boolean {
  const id = cellId(x, y, z, c, s);
  return id !== cellId(x + 1, y, z, c, s) || id !== cellId(x, y + 1, z, c, s) || id !== cellId(x, y, z + 1, c, s);
}
