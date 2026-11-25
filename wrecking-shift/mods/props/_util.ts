/**
 * Shared helpers for the built-in prop mods (not a mod itself: no `.mod.ts` suffix, so the registry skips it).
 */
import type { VoxelBody } from '../../src/sim/body';
import type { Sim } from '../../src/sim/sim';
import { qrot, qyaw, type V3 } from '../../src/sim/vec';
import { place, type PalFn, type VoxelGrid } from '../../src/mods/kit';

/**
 * place() with an offset in the prop's local frame (x right, z back, before yaw), so multi-body props
 * (rows of dominoes, stacks, pin racks) rotate as one arrangement around `pos`.
 */
export function placeLocal(sim: Sim, g: VoxelGrid, pos: V3, yaw: number, lx: number, ly: number, lz: number, name: string, opts: { static?: boolean; tags?: string[]; spin?: number } = {}): VoxelBody {
  const o = qrot(qyaw(yaw), { x: lx, y: 0, z: lz });
  return place(sim, g, { x: pos.x + o.x, y: pos.y + ly, z: pos.z + o.z }, yaw + (opts.spin ?? 0), name, opts);
}

const fnOf = (p: PalFn | number): PalFn => (typeof p === 'function' ? p : () => p);

/** solid / hollow cylinder along Z (axis at cx, cy), z0..z1 exclusive */
export function cylZ(g: VoxelGrid, cx: number, cy: number, r: number, z0: number, z1: number, p: PalFn | number, hollow = 0): void {
  const f = fnOf(p);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r || (hollow && d < r - hollow)) continue;
      for (let z = z0; z < z1; z++) g.set(x, y, z, f(x, y, z));
    }
}

/** solid / hollow cylinder along X (axis at cy, cz), x0..x1 exclusive */
export function cylX(g: VoxelGrid, cy: number, cz: number, r: number, x0: number, x1: number, p: PalFn | number, hollow = 0): void {
  const f = fnOf(p);
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const d = Math.hypot(y + 0.5 - cy, z + 0.5 - cz);
      if (d > r || (hollow && d < r - hollow)) continue;
      for (let x = x0; x < x1; x++) g.set(x, y, z, f(x, y, z));
    }
}

/** vertical body of revolution: radius(y) gives the radius at each layer (0 = nothing) */
export function lathe(g: VoxelGrid, cx: number, cz: number, y0: number, y1: number, radius: (y: number) => number, p: PalFn | number): void {
  const f = fnOf(p);
  for (let y = y0; y < y1; y++) {
    const r = radius(y);
    if (r <= 0) continue;
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r) g.set(x, y, z, f(x, y, z));
  }
}
