/**
 * Mirrors the sim's static voxel bodies into an `Occupancy` volume (pure CPU, no three.js — testable in Node).
 * Dynamic / rotated bodies are not in the volume (they use the small shadow map instead).
 */
import type { VoxelBody } from '../sim/body';
import { PAL_EMISSIVE, PAL_GLASS, VOXEL } from '../sim/materials';
import type { Sim } from '../sim/sim';
import { Occupancy, planVolume, type UpdateResult, type VolumePlan } from './occupancy';

/** palette indices that block light: not glass, not lamps (so fixtures do not shadow their own light) */
export const OPAQUE = new Uint8Array(256);
for (let p = 1; p < 256; p++) OPAQUE[p] = PAL_GLASS[p] || PAL_EMISSIVE[p] >= 0.9 ? 0 : 1;

/** static, axis-aligned bodies live in the occupancy volume */
export function inVolume(body: VoxelBody): boolean {
  return !body.dynamic && body.identityRot && !body.removed;
}

const vox = (m: number) => Math.round(m / VOXEL);

export interface Bounds { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }

export class WorldOccupancy {
  readonly occ: Occupancy;
  private known = new Map<number, VoxelBody>();
  /** pending boxes, volume voxel coords, half-open, 6 numbers each */
  private queue: number[] = [];
  /** stats */
  lastUpdateMs = 0; lastUpdateVoxels = 0; totalUpdates = 0;

  private constructor(readonly plan: VolumePlan) {
    this.occ = new Occupancy(plan.nx, plan.ny, plan.nz, OPAQUE);
  }

  /** world position (metres) of the volume's min corner */
  get origin(): [number, number, number] { return [this.plan.ox * VOXEL, this.plan.oy * VOXEL, this.plan.oz * VOXEL]; }

  /** plan + allocate + stamp every static body currently in the sim */
  static create(sim: Sim, bounds: Bounds, maxTex = 2048, maxBytes = 96 * 1024 * 1024, focus?: { x: number; z: number }): WorldOccupancy {
    const c = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const b of sim.bodies.values()) {
      if (!inVolume(b)) continue;
      const t = b.rb.translation();
      const x = vox(t.x), y = vox(t.y), z = vox(t.z);
      c[0] = Math.min(c[0], x); c[1] = Math.min(c[1], y); c[2] = Math.min(c[2], z);
      c[3] = Math.max(c[3], x + b.grid.sx); c[4] = Math.max(c[4], y + b.grid.sy); c[5] = Math.max(c[5], z + b.grid.sz);
    }
    const bb = [vox(bounds.min.x), vox(bounds.min.y), vox(bounds.min.z), vox(bounds.max.x), vox(bounds.max.y), vox(bounds.max.z)];
    if (c[0] === Infinity) for (let i = 0; i < 6; i++) c[i] = bb[i];
    // headroom above the static content so cones / later additions near the top stay inside
    c[4] += 16;
    const plan = planVolume(c, bb, maxTex, maxBytes, focus ? [vox(focus.x), vox(focus.z)] : undefined);
    const w = new WorldOccupancy(plan);
    for (const b of sim.bodies.values()) if (inVolume(b)) w.register(b);
    w.queue.length = 0;
    w.occ.rebuildAll();
    return w;
  }

  private register(b: VoxelBody): void {
    const t = b.rb.translation();
    const s = { id: b.id, data: b.grid.data, sx: b.grid.sx, sy: b.grid.sy, sz: b.grid.sz, ox: vox(t.x) - this.plan.ox, oy: vox(t.y) - this.plan.oy, oz: vox(t.z) - this.plan.oz };
    this.occ.addSource(s);
    this.known.set(b.id, b);
    this.queue.push(s.ox, s.oy, s.oz, s.ox + s.sx, s.oy + s.sy, s.oz + s.sz);
    b.editBoxes.length = 0;
  }

  /** is this body currently stamped into the volume? */
  has(id: number): boolean { return this.known.has(id); }

  /** gather changes since the last call: new / removed static bodies and voxel edits */
  collect(sim: Sim): void {
    for (const [id, b] of this.known) {
      if (b.removed || sim.bodies.get(id) !== b) {
        const s = this.occ.removeSource(id)!;
        this.known.delete(id);
        this.queue.push(s.ox, s.oy, s.oz, s.ox + s.sx, s.oy + s.sy, s.oz + s.sz);
      }
    }
    for (const b of sim.bodies.values()) {
      if (b.dynamic) continue;
      if (!this.known.has(b.id)) { if (inVolume(b)) this.register(b); else b.editBoxes.length = 0; continue; }
      const e = b.editBoxes;
      if (e.length === 0) continue;
      const s = this.occ.sources.get(b.id)!;
      for (let i = 0; i < e.length; i += 6) this.queue.push(e[i] + s.ox, e[i + 1] + s.oy, e[i + 2] + s.oz, e[i + 3] + 1 + s.ox, e[i + 4] + 1 + s.oy, e[i + 5] + 1 + s.oz);
      e.length = 0;
    }
  }

  get pending(): number { return this.queue.length / 6; }

  /**
   * Recompute queued boxes; `onUpdate` receives the changed texel boxes of each (upload hook).
   * Stops after `maxVoxels` voxels worth of boxes (at least one box is always processed).
   */
  flush(onUpdate?: (r: UpdateResult) => void, maxVoxels = Infinity): number {
    const q = this.queue;
    if (q.length === 0) return 0;
    const t0 = performance.now();
    let done = 0, i = 0;
    for (; i < q.length; i += 6) {
      if (done > 0 && done >= maxVoxels) break;
      const r = this.occ.updateRegion(q[i], q[i + 1], q[i + 2], q[i + 3], q[i + 4], q[i + 5]);
      done += Math.max(0, (q[i + 3] - q[i]) * (q[i + 4] - q[i + 1]) * (q[i + 5] - q[i + 2]));
      if (r && onUpdate) onUpdate(r);
    }
    q.splice(0, i);
    this.lastUpdateMs = performance.now() - t0; this.lastUpdateVoxels = done; this.totalUpdates++;
    return done;
  }
}
