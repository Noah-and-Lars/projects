/**
 * Local lights for emissive voxels: clusters of `lamp`-like voxels in static bodies get a PointLight.
 * A fixed pool of N lights (no shadow maps) is assigned to the clusters nearest to the camera, so the
 * light count (and with it every lit shader) stays constant during a level.
 */
import * as THREE from 'three';
import type { VoxelBody } from '../sim/body';
import { PAL_EMISSIVE, PAL_RGB, VOXEL } from '../sim/materials';
import type { Sim } from '../sim/sim';

export interface LampCluster {
  body: VoxelBody;
  /** world position (metres) */
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  /** emissive voxel count at creation */
  count: number;
  /** a few member voxels (grid indices) used to notice destruction */
  samples: number[];
  /** 0..1 fraction still alive */
  alive: number;
}

const MIN_EMISSIVE = 0.45;
const CELL = 8; // voxels

/** find clusters of emissive voxels in one static body (cheap: one pass + coarse binning) */
export function findLampClusters(body: VoxelBody, out: LampCluster[] = []): LampCluster[] {
  const g = body.grid, d = g.data, { sx, sy, sz } = g;
  const bins = new Map<number, { n: number; x: number; y: number; z: number; r: number; g: number; b: number; samples: number[]; e: number }>();
  const n = d.length;
  for (let i = 0; i < n; i++) {
    const p = d[i];
    if (p === 0 || PAL_EMISSIVE[p] < MIN_EMISSIVE) continue;
    const x = i % sx, y = ((i / sx) | 0) % sy, z = (i / (sx * sy)) | 0;
    const key = ((x / CELL) | 0) + 64 * (((y / CELL) | 0) + 64 * ((z / CELL) | 0));
    let b = bins.get(key);
    if (!b) { b = { n: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, samples: [], e: 0 }; bins.set(key, b); }
    b.n++; b.x += x + 0.5; b.y += y + 0.5; b.z += z + 0.5; b.e += PAL_EMISSIVE[p];
    b.r += PAL_RGB[p * 3]; b.g += PAL_RGB[p * 3 + 1]; b.b += PAL_RGB[p * 3 + 2];
    if (b.samples.length < 4 || (b.n & 15) === 0) { if (b.samples.length >= 6) b.samples.shift(); b.samples.push(i); }
  }
  void sz;
  // merge neighbouring bins (a fixture straddling a cell border should be one light)
  const merged: (typeof bins extends Map<number, infer V> ? V : never)[] = [];
  for (const b of bins.values()) {
    const cx = b.x / b.n, cy = b.y / b.n, cz = b.z / b.n;
    let m = null;
    for (const o of merged) {
      if (Math.abs(o.x / o.n - cx) < 10 && Math.abs(o.y / o.n - cy) < 10 && Math.abs(o.z / o.n - cz) < 10) { m = o; break; }
    }
    if (m) { m.n += b.n; m.x += b.x; m.y += b.y; m.z += b.z; m.r += b.r; m.g += b.g; m.b += b.b; m.e += b.e; m.samples.push(...b.samples.slice(0, 3)); }
    else merged.push({ ...b, samples: b.samples.slice() });
  }
  const t = body.rb.translation();
  for (const b of merged) {
    if (b.n < 2) continue;
    out.push({
      body, x: t.x + (b.x / b.n) * VOXEL, y: t.y + (b.y / b.n) * VOXEL, z: t.z + (b.z / b.n) * VOXEL,
      r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, count: b.n * (b.e / b.n), samples: b.samples, alive: 1,
    });
  }
  return out;
}

export class LampLights {
  readonly group = new THREE.Group();
  clusters: LampCluster[] = [];
  private pool: THREE.PointLight[] = [];
  private recheck = 0;
  private sorted: LampCluster[] = [];
  /** base intensity (set from the time-of-day preset) */
  intensity = 6;
  /** metres */
  range = 9;

  /** scan the level's static bodies and (re)build the pool with at most `max` lights */
  build(sim: Sim, max: number): void {
    this.clusters = [];
    for (const b of sim.bodies.values()) if (!b.dynamic && b.identityRot) findLampClusters(b, this.clusters);
    this.resize(max);
  }

  resize(max: number): void {
    const n = Math.min(max, this.clusters.length);
    while (this.pool.length > n) { const l = this.pool.pop()!; this.group.remove(l); l.dispose(); }
    while (this.pool.length < n) {
      const l = new THREE.PointLight(0xffffff, 0, this.range, 2);
      l.castShadow = false;
      this.pool.push(l); this.group.add(l);
    }
  }

  get activeLights(): number { return this.pool.length; }

  update(camera: THREE.Vector3, frame: number): void {
    if (this.pool.length === 0) return;
    // periodically check whether the lamp voxels still exist
    if (frame % 12 === 0 && this.clusters.length) {
      for (let k = 0; k < 8; k++) {
        const c = this.clusters[this.recheck++ % this.clusters.length];
        if (c.body.removed) { c.alive = 0; continue; }
        let ok = 0;
        const d = c.body.grid.data;
        for (const i of c.samples) if (PAL_EMISSIVE[d[i]] >= MIN_EMISSIVE) ok++;
        c.alive = ok / c.samples.length;
      }
    }
    const s = this.sorted;
    s.length = 0;
    for (const c of this.clusters) if (c.alive > 0) s.push(c);
    const d2 = (c: LampCluster) => (c.x - camera.x) ** 2 + (c.y - camera.y) ** 2 + (c.z - camera.z) ** 2;
    if (s.length > this.pool.length) s.sort((a, b) => d2(a) - d2(b));
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], c = s[i];
      if (!c) { l.intensity = 0; continue; }
      l.position.set(c.x, c.y, c.z);
      // warm the palette colour a little; bigger fixtures are brighter (sub-linear)
      l.color.setRGB(c.r, c.g * 0.92, c.b * 0.72, THREE.SRGBColorSpace);
      l.intensity = this.intensity * c.alive * Math.min(2.2, 0.45 + 0.14 * Math.sqrt(c.count));
      l.distance = this.range;
    }
  }

  clear(): void {
    this.clusters = [];
    this.resize(0);
  }
}
