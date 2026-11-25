import RAPIER from '@dimforge/rapier3d-compat';
import type { RayHit, Sim } from '../sim';
import type { V3 } from '../vec';
import { onShot } from './gun';
import type { ToolContext } from './tool';
import { TwoPointTool } from './twopoint';
import { Anchor, bodyLocal, bodyWorld, emit, removeJoint } from './util';

export interface Rope {
  id: number;
  joint: RAPIER.ImpulseJoint | null;
  a: Anchor;
  b: Anchor;
  /** attachment points in each body's local frame (metres) */
  la: V3;
  lb: V3;
  length: number;
}

/**
 * Cable: rope between two clicked points on bodies (max 12 m), a Rapier rope joint (max-distance
 * constraint, no collision). Removed when an anchor voxel is destroyed or either body disappears.
 */
export class Cable extends TwoPointTool {
  readonly id: string = 'cable';
  readonly name: string = 'Cable';
  override hint = 'LMB first point, LMB second point';
  override ammo = 6;
  override maxAmmo = 6;
  override maxLen = 12;
  override reach = 6;
  readonly ropes: Rope[] = [];
  private nextId = 1;

  protected override accepts(a: RayHit, b: RayHit): boolean {
    // two points on the same body, or two static pieces, would do nothing
    return a.body !== b.body && (a.body.dynamic || b.body.dynamic);
  }

  protected place(ctx: ToolContext, a: RayHit, b: RayHit): boolean {
    if (!this.accepts(a, b)) return false;
    const len = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y, a.point.z - b.point.z);
    const la = bodyLocal(a.body, a.point), lb = bodyLocal(b.body, b.point);
    const joint = ctx.sim.world.createImpulseJoint(RAPIER.JointData.rope(Math.max(0.1, len), la, lb), a.body.rb, b.body.rb, true);
    this.ropes.push({ id: this.nextId++, joint, a: Anchor.fromHit(a), b: Anchor.fromHit(b), la, lb, length: len });
    return true;
  }

  /** world-space end points of every live rope (render each frame) */
  ends(): { id: number; a: V3; b: V3; length: number; taut: boolean }[] {
    const out = [];
    for (const r of this.ropes) {
      if (r.a.body.removed || r.b.body.removed) continue;
      const a = bodyWorld(r.a.body, r.la), b = bodyWorld(r.b.body, r.lb);
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      out.push({ id: r.id, a, b, length: r.length, taut: d > r.length * 0.97 });
    }
    return out;
  }

  override save(): any {
    return this.ropes.filter((r) => r.a.alive() && r.b.alive()).map((r) => ({
      a: r.a.body.id, av: [r.a.vx, r.a.vy, r.a.vz], b: r.b.body.id, bv: [r.b.vx, r.b.vy, r.b.vz], la: r.la, lb: r.lb, length: r.length,
    }));
  }
  override load(ctx: ToolContext, data: any): void {
    for (const r of data ?? []) {
      const a = ctx.sim.bodies.get(r.a), b = ctx.sim.bodies.get(r.b);
      if (!a || !b) continue;
      const joint = ctx.sim.world.createImpulseJoint(RAPIER.JointData.rope(Math.max(0.1, r.length), r.la, r.lb), a.rb, b.rb, true);
      this.ropes.push({ id: this.nextId++, joint, a: new Anchor(a, r.av[0], r.av[1], r.av[2]), b: new Anchor(b, r.bv[0], r.bv[1], r.bv[2]), la: r.la, lb: r.lb, length: r.length });
    }
  }

  /** cut ropes whose segment passes within `r` of a point (bullets, blasts) */
  cutNear(ctx: ToolContext, p: V3, r: number): number {
    let n = 0;
    for (const e of this.ends()) {
      const abx = e.b.x - e.a.x, aby = e.b.y - e.a.y, abz = e.b.z - e.a.z;
      const l2 = abx * abx + aby * aby + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - e.a.x) * abx + (p.y - e.a.y) * aby + (p.z - e.a.z) * abz) / l2));
      const d = Math.hypot(e.a.x + abx * t - p.x, e.a.y + aby * t - p.y, e.a.z + abz * t - p.z);
      if (d < r) { this.remove(ctx, e.id); n++; }
    }
    return n;
  }

  /** cut ropes passing within `r` of the segment o + d*[0, dist] */
  cutSegment(ctx: ToolContext, o: V3, d: V3, dist: number, r: number): number {
    let n = 0;
    for (const e of this.ends()) {
      if (segSegDist(o, d, dist, e.a, e.b) < r) { this.remove(ctx, e.id); n++; }
    }
    return n;
  }

  remove(ctx: ToolContext, id: number): void {
    const i = this.ropes.findIndex((r) => r.id === id);
    if (i < 0) return;
    const r = this.ropes[i];
    removeJoint(ctx.sim, r.joint);
    this.ropes.splice(i, 1);
    if (!r.a.body.removed && !r.b.body.removed) emit(ctx.sim, 'cable:break', { pos: bodyWorld(r.a.body, r.la) });
  }

  private hooked: Sim | null = null;

  override tick(ctx: ToolContext): void {
    if (this.hooked !== ctx.sim) {
      // bullets cut ropes they pass close to
      this.hooked = ctx.sim;
      onShot(ctx.sim, (o, d, dist) => { if (this.ropes.length) this.cutSegment(ctx, o, d, dist, 0.06); });
    }
    if (ctx.sim.tick % 10 !== 0) return;
    for (let i = this.ropes.length - 1; i >= 0; i--) {
      const r = this.ropes[i];
      if (!r.joint || !r.joint.isValid() || !r.a.alive() || !r.b.alive()) this.remove(ctx, r.id);
    }
  }
}

/** distance between segment o + d*[0,len] (d unit) and segment a..b */
function segSegDist(o: V3, d: V3, len: number, a: V3, b: V3): number {
  const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
  const rx = o.x - a.x, ry = o.y - a.y, rz = o.z - a.z;
  const ee = ex * ex + ey * ey + ez * ez || 1e-9;
  const de = d.x * ex + d.y * ey + d.z * ez;
  const dr = d.x * rx + d.y * ry + d.z * rz;
  const er = ex * rx + ey * ry + ez * rz;
  const den = ee - de * de;
  let s = den > 1e-9 ? (de * er - ee * dr) / den : 0;
  s = Math.max(0, Math.min(len, s));
  let t = (er + s * de) / ee;
  t = Math.max(0, Math.min(1, t));
  s = Math.max(0, Math.min(len, t * de - dr));
  const px = o.x + d.x * s - (a.x + ex * t), py = o.y + d.y * s - (a.y + ey * t), pz = o.z + d.z * s - (a.z + ez * t);
  return Math.hypot(px, py, pz);
}
