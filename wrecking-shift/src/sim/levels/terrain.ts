import { MAT, pal, VOXEL } from '../materials';
import { hash3 } from '../rng';
import type { Sim } from '../sim';
import { VoxelGrid } from '../voxels';
import type { VoxelBody } from '../body';

/** smooth value noise in 2D, range 0..1 */
export function noise2(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash3(xi, 0, zi, seed), b = hash3(xi + 1, 0, zi, seed), c = hash3(xi, 0, zi + 1, seed), d = hash3(xi + 1, 0, zi + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export function fbm2(x: number, z: number, seed = 0, octaves = 4): number {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) { v += noise2(x * f, z * f, seed + o * 17) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return v / norm;
}
export const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface Pad {
  /** world rect (metres) that is flattened to `y`, blending out over `blend` metres */
  x0: number; z0: number; x1: number; z1: number; y: number; blend: number;
  /** optional surface material inside the pad */
  surface?: number;
}

/**
 * Height field description used to voxelise terrain tiles.
 * `base(x,z)` gives the natural height in metres; pads flatten building plots / roads.
 */
export class Heightmap {
  pads: Pad[] = [];
  constructor(public base: (x: number, z: number) => number) {}

  addPad(x0: number, z0: number, x1: number, z1: number, y: number, blend = 3, surface?: number): this {
    this.pads.push({ x0, z0, x1, z1, y, blend, surface });
    return this;
  }
  /** a straight road as a chain of pads following the natural height is level-specific; this adds one flat strip */
  height(x: number, z: number): number {
    let h = this.base(x, z);
    for (const p of this.pads) {
      const dx = Math.max(p.x0 - x, 0, x - p.x1), dz = Math.max(p.z0 - z, 0, z - p.z1);
      const d = Math.hypot(dx, dz);
      if (d >= p.blend) continue;
      const t = 1 - smoothstep(0, p.blend, d);
      h = h + (p.y - h) * t;
    }
    return h;
  }
  padSurface(x: number, z: number): number | undefined {
    for (let i = this.pads.length - 1; i >= 0; i--) {
      const p = this.pads[i];
      if (p.surface !== undefined && x >= p.x0 && x < p.x1 && z >= p.z0 && z < p.z1) return p.surface;
    }
    return undefined;
  }
}

export interface TerrainOptions {
  /** world position of the terrain's min corner (x,z); tiles extend +x/+z */
  x0: number;
  z0: number;
  tilesX: number;
  tilesZ: number;
  /** tile edge in voxels (<= 256) */
  tile?: number;
  heightmap: Heightmap;
  /** surface material id for a column (after pads); default grass / sand under water / rock on steep slopes */
  surface?: (x: number, z: number, h: number, slope: number) => number;
  waterLevel?: number | null;
  seed?: number;
}

export interface Terrain {
  bodies: VoxelBody[];
  /** terrain surface height (top of the top voxel) in metres at world x,z */
  heightAt(x: number, z: number): number;
}

/**
 * Voxelise a heightmap into static ground tiles: 1 surface voxel, ~0.5 m of diggable soil, then an
 * unbreakable bedrock shell (hollow underneath to keep voxel counts low).
 */
export function buildTerrain(sim: Sim, o: TerrainOptions): Terrain {
  const T = o.tile ?? 256;
  const hm = o.heightmap;
  const seed = o.seed ?? 0;
  const W = o.tilesX * T, D = o.tilesZ * T;
  // integer voxel heights for the whole terrain (+1 border)
  const hv = new Int16Array((W + 2) * (D + 2));
  const H = (ix: number, iz: number) => hv[(ix + 1) + (W + 2) * (iz + 1)];
  for (let iz = -1; iz <= D; iz++)
    for (let ix = -1; ix <= W; ix++)
      hv[(ix + 1) + (W + 2) * (iz + 1)] = Math.round(hm.height(o.x0 + (ix + 0.5) * VOXEL, o.z0 + (iz + 0.5) * VOXEL) / VOXEL);
  const SOIL = 5;
  const bodies: VoxelBody[] = [];
  const wl = o.waterLevel ?? null;
  for (let tz = 0; tz < o.tilesZ; tz++)
    for (let tx = 0; tx < o.tilesX; tx++) {
      let lo = 1e9, hi = -1e9;
      for (let iz = tz * T - 1; iz <= (tz + 1) * T; iz++)
        for (let ix = tx * T - 1; ix <= (tx + 1) * T; ix++) { const h = H(ix, iz); if (h < lo) lo = h; if (h > hi) hi = h; }
      const base = lo - SOIL - 3; // voxel y of grid layer 0
      const sy = Math.min(256, hi - base);
      const g = new VoxelGrid(T, sy, T);
      const d = g.data;
      for (let z = 0; z < T; z++)
        for (let x = 0; x < T; x++) {
          const ix = tx * T + x, iz = tz * T + z;
          const h = H(ix, iz);
          const n0 = H(ix - 1, iz), n1 = H(ix + 1, iz), n2 = H(ix, iz - 1), n3 = H(ix, iz + 1);
          const nmin = Math.min(h, n0, n1, n2, n3);
          const slope = Math.max(Math.abs(n1 - n0), Math.abs(n3 - n2)) / 2;
          const wx = o.x0 + (ix + 0.5) * VOXEL, wz = o.z0 + (iz + 0.5) * VOXEL;
          let surf = hm.padSurface(wx, wz);
          if (surf === undefined) {
            if (o.surface) surf = o.surface(wx, wz, h * VOXEL, slope);
            else surf = wl !== null && h * VOXEL < wl + 0.25 ? MAT.sand : slope > 1.6 ? MAT.rock : MAT.grass;
          }
          const top = Math.min(sy, h - base); // exclusive
          const bottom = Math.max(0, nmin - SOIL - 2 - base);
          const soilFrom = top - 1 - SOIL;
          const soilMat = surf === MAT.sand ? MAT.sand : surf === MAT.rock || surf === MAT.asphalt || surf === MAT.concrete ? MAT.rock : MAT.dirt;
          const col = x + T * sy * z;
          for (let y = bottom; y < top; y++) {
            let p: number;
            if (y === top - 1) p = pal(surf, (hash3(ix >> 1, 0, iz >> 1, seed) * 5) | 0);
            else if (y >= soilFrom && soilMat !== MAT.rock) p = pal(soilMat, (hash3(ix >> 2, y, iz >> 2, seed + 1) * 5) | 0);
            else p = pal(MAT.bedrock, (hash3(ix >> 2, y >> 1, iz >> 2, seed + 2) * 5) | 0);
            d[col + T * y] = p;
          }
        }
      g.recount();
      const b = sim.addBody(g, { x: o.x0 + tx * T * VOXEL, y: base * VOXEL, z: o.z0 + tz * T * VOXEL }, { name: 'ground' });
      b.noFracture = true; b.impactProof = true; b.noSplit = true;
      b.tags.add('terrain');
      bodies.push(b);
    }
  return {
    bodies,
    heightAt(x: number, z: number): number {
      const ix = Math.max(-1, Math.min(W, Math.floor((x - o.x0) / VOXEL)));
      const iz = Math.max(-1, Math.min(D, Math.floor((z - o.z0) / VOXEL)));
      return H(ix, iz) * VOXEL;
    },
  };
}
