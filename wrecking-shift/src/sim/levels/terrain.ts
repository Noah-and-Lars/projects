import { MAT, VOXEL, pal } from '../materials';
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
  // coarse (16x16 voxel) block minimum heights: the hollow underside of the shell is flat per block,
  // so it meshes into a handful of quads instead of mirroring every bump of the surface
  const CB = 16;
  const cw = Math.ceil(W / CB) + 2, cd = Math.ceil(D / CB) + 2;
  const cmin = new Int16Array(cw * cd).fill(32767);
  for (let iz = -1; iz <= D; iz++)
    for (let ix = -1; ix <= W; ix++) {
      const h = H(ix, iz);
      // a column also lowers its neighbouring blocks when it sits on a block edge (keeps side walls closed)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = (Math.floor((ix + dx) / CB) + 1) + cw * (Math.floor((iz + dz) / CB) + 1);
        if (h < cmin[c]) cmin[c] = h;
      }
    }
  const CMIN = (ix: number, iz: number) => cmin[(Math.floor(ix / CB) + 1) + cw * (Math.floor(iz / CB) + 1)];
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
          const bottom = Math.max(0, Math.min(nmin, CMIN(ix, iz)) - SOIL - 2 - base);
          const soilFrom = top - 1 - SOIL;
          const soilMat = surf === MAT.sand ? MAT.sand : surf === MAT.rock || surf === MAT.asphalt || surf === MAT.concrete ? MAT.rock : MAT.dirt;
          const shadeTop = Math.min(4, (noise2(ix * 0.045, iz * 0.045, seed + 40) * 5) | 0);
          const col = x + T * sy * z;
          for (let y = bottom; y < top; y++) {
            let p: number;
            // large uniform colour patches (the renderer adds per-voxel grain) keep greedy quads big
            if (y === top - 1) p = pal(surf, shadeTop);
            else if (y >= soilFrom && soilMat !== MAT.rock) p = pal(soilMat, 2);
            else p = pal(MAT.bedrock, 2);
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
