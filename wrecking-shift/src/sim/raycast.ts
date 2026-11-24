import type { VoxelBody } from './body';
import { VOXEL } from './materials';
import type { V3 } from './vec';

export interface RayHit {
  body: VoxelBody;
  /** voxel coords in body grid */
  vx: number; vy: number; vz: number;
  /** world-space hit point and normal */
  point: V3;
  normal: V3;
  dist: number;
  palette: number;
}

/** Amanatides–Woo traversal of one body's grid. */
export function rayGrid(body: VoxelBody, origin: V3, dir: V3, maxDist: number): RayHit | null {
  const g = body.grid;
  const o = body.toLocal(origin);
  const d = body.dirToLocal(dir);
  // clip against grid box (voxel units); t in voxel units
  let t0 = 0, t1 = maxDist / VOXEL;
  const size = [g.sx, g.sy, g.sz];
  const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  let enterAxis = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-12) {
      if (oo[a] < 0 || oo[a] >= size[a]) return null;
    } else {
      let ta = (0 - oo[a]) / dd[a], tb = (size[a] - oo[a]) / dd[a];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) { t0 = ta; enterAxis = a; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
  }
  const eps = 1e-5;
  let px = oo[0] + dd[0] * (t0 + eps), py = oo[1] + dd[1] * (t0 + eps), pz = oo[2] + dd[2] * (t0 + eps);
  let x = Math.min(g.sx - 1, Math.max(0, Math.floor(px)));
  let y = Math.min(g.sy - 1, Math.max(0, Math.floor(py)));
  let z = Math.min(g.sz - 1, Math.max(0, Math.floor(pz)));
  const stx = dd[0] > 0 ? 1 : -1, sty = dd[1] > 0 ? 1 : -1, stz = dd[2] > 0 ? 1 : -1;
  const idx = Math.abs(1 / (dd[0] || 1e-12)), idy = Math.abs(1 / (dd[1] || 1e-12)), idz = Math.abs(1 / (dd[2] || 1e-12));
  let tmx = t0 + (dd[0] > 0 ? x + 1 - px : px - x) * idx;
  let tmy = t0 + (dd[1] > 0 ? y + 1 - py : py - y) * idy;
  let tmz = t0 + (dd[2] > 0 ? z + 1 - pz : pz - z) * idz;
  let axis = enterAxis;
  let t = t0;
  const data = g.data, sx = g.sx, sy = g.sy;
  for (;;) {
    const p = data[x + sx * (y + sy * z)];
    if (p) {
      const n = { x: 0, y: 0, z: 0 };
      if (axis === 0) n.x = -stx; else if (axis === 1) n.y = -sty; else if (axis === 2) n.z = -stz;
      else { n.x = -dd[0]; n.y = -dd[1]; n.z = -dd[2]; }
      const dist = t * VOXEL;
      return {
        body, vx: x, vy: y, vz: z,
        point: { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist, z: origin.z + dir.z * dist },
        normal: body.dirToWorld(n),
        dist, palette: p,
      };
    }
    if (tmx < tmy && tmx < tmz) { x += stx; t = tmx; tmx += idx; axis = 0; if (x < 0 || x >= g.sx) return null; }
    else if (tmy < tmz) { y += sty; t = tmy; tmy += idy; axis = 1; if (y < 0 || y >= g.sy) return null; }
    else { z += stz; t = tmz; tmz += idz; axis = 2; if (z < 0 || z >= g.sz) return null; }
    if (t > t1) return null;
  }
}
