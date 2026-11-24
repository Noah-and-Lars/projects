import type RAPIER from '@dimforge/rapier3d-compat';
import type { VoxelBody } from '../body';
import { MAT, pal } from '../materials';
import type { RayHit, Sim } from '../sim';
import { qrot, type V3 } from '../vec';
import { VoxelGrid } from '../voxels';
import type { ToolContext } from './tool';
import { TwoPointTool } from './twopoint';
import { Anchor, bodyLocal, bodyWorld, emit, fixJoint, quatLookX, removeJoint } from './util';

/** one glued end of a plank */
export interface PlankLink {
  plank: VoxelBody;
  joint: RAPIER.ImpulseJoint | null;
  /** voxel of the partner body the end rests on */
  partner: Anchor;
  /** end voxel of the plank itself */
  own: Anchor;
  /** joint point in each body's local frame (stretch check) */
  la: V3;
  lb: V3;
}

export const PLANK_WIDTH = 3;
export const PLANK_THICK = 1;

/** axis-aligned plank grid: length along X, thickness Y, width Z */
export function plankGrid(n: number, seed = 0): VoxelGrid {
  const g = new VoxelGrid(n, PLANK_THICK, PLANK_WIDTH);
  for (let z = 0; z < PLANK_WIDTH; z++) for (let y = 0; y < PLANK_THICK; y++) for (let x = 0; x < n; x++) {
    // grain: long streaks along x, darker ends
    const s = x === 0 || x === n - 1 ? 0 : ((z * 7 + seed + ((x / 9) | 0)) % 4) + 1;
    g.set(x, y, z, pal(MAT.wood, s));
  }
  return g;
}

/**
 * Plank: click two points (max 4 m). Creates a dynamic wooden plank body between them, glued with
 * fixed joints to whatever it touches at each end (static world pieces included). The glue lets go
 * when the end voxel (on either side) is destroyed, the partner body disappears, or it is torn apart.
 */
export class Plank extends TwoPointTool {
  readonly id = 'plank';
  readonly name = 'Plank';
  override hint = 'LMB first point, LMB second point';
  override ammo = 8;
  override maxAmmo = 8;
  override maxLen = 4;
  /** joint points further apart than this tear the glue (m) */
  tearDist = 0.35;
  readonly links: PlankLink[] = [];
  readonly planks: VoxelBody[] = [];

  protected place(ctx: ToolContext, a: RayHit, b: RayHit): boolean {
    const plank = buildPlank(ctx.sim, a.point, b.point, a.normal, b.normal, this.planks.length);
    if (!plank) return false;
    this.planks.push(plank.body);
    for (const end of [{ hit: a, p: plank.a, own: 0 }, { hit: b, p: plank.b, own: plank.n - 1 }]) {
      const partner = Anchor.fromHit(end.hit);
      if (!partner.alive() || partner.body === plank.body) continue;
      const joint = fixJoint(ctx.sim, end.hit.body, plank.body, end.p);
      this.links.push({
        plank: plank.body, joint, partner,
        own: new Anchor(plank.body, end.own, 0, 1),
        la: bodyLocal(end.hit.body, end.p), lb: bodyLocal(plank.body, end.p),
      });
    }
    return true;
  }

  private hooked: Sim | null = null;

  /** a plank was cut: glued ends that went with the cut-off piece move their joint to it */
  private onSplit = (parent: VoxelBody, child: VoxelBody, off: [number, number, number]): void => {
    if (!parent.tags.has('plank')) return;
    const sim = this.hooked;
    if (!sim) return;
    for (const l of this.links) {
      if (l.plank !== parent) continue;
      const x = l.own.vx - off[0], y = l.own.vy - off[1], z = l.own.vz - off[2];
      if (!child.grid.get(x, y, z) || !l.partner.alive()) continue;
      removeJoint(sim, l.joint);
      const p = bodyWorld(parent, l.lb);
      l.plank = child;
      l.own = new Anchor(child, x, y, z);
      l.joint = fixJoint(sim, l.partner.body, child, p);
      l.la = bodyLocal(l.partner.body, p);
      l.lb = bodyLocal(child, p);
      child.tags.add('plank');
      this.planks.push(child);
    }
  };

  override tick(ctx: ToolContext): void {
    const sim = ctx.sim;
    if (this.hooked !== sim) { this.hooked = sim; sim.onSplit.push(this.onSplit); }
    if (sim.tick % 10 !== 0 || this.links.length === 0) return;
    for (let i = this.links.length - 1; i >= 0; i--) {
      const l = this.links[i];
      let broken = !l.joint || !l.joint.isValid() || !l.partner.alive() || !l.own.alive();
      if (!broken) {
        const pa = bodyWorld(l.partner.body, l.la), pb = bodyWorld(l.plank, l.lb);
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) > this.tearDist) broken = true;
      }
      if (broken) {
        removeJoint(sim, l.joint);
        l.joint = null;
        this.links.splice(i, 1);
        if (!l.plank.removed) { l.plank.rb.wakeUp(); emit(sim, 'plank:break', { pos: bodyWorld(l.plank, l.lb) }); }
      }
    }
    for (let i = this.planks.length - 1; i >= 0; i--) if (this.planks[i].removed) this.planks.splice(i, 1);
  }
}

/**
 * Rasterise an oriented plank between two surface points: an axis-aligned grid (length along X)
 * placed with a rotation. The centre line runs from a to b, raised half a thickness off the surfaces.
 */
export function buildPlank(sim: Sim, a0: V3, b0: V3, na: V3, nb: V3, seed = 0): { body: VoxelBody; a: V3; b: V3; n: number } | null {
  const lift = PLANK_THICK * 0.05;
  const a = { x: a0.x + na.x * lift, y: a0.y + na.y * lift, z: a0.z + na.z * lift };
  const b = { x: b0.x + nb.x * lift, y: b0.y + nb.y * lift, z: b0.z + nb.z * lift };
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.1) return null;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  // overlap 5 cm into each surface
  const ext = 0.05;
  const n = Math.max(2, Math.round((len + 2 * ext) / 0.1));
  const rot = quatLookX(dir, { x: 0, y: 1, z: 0 }, { x: -dir.z, y: 0, z: dir.x });
  const start = { x: a.x - dir.x * (n * 0.1 - len) / 2, y: a.y - dir.y * (n * 0.1 - len) / 2, z: a.z - dir.z * (n * 0.1 - len) / 2 };
  const off = qrot(rot, { x: 0, y: PLANK_THICK * 0.05, z: PLANK_WIDTH * 0.05 });
  const pos = { x: start.x - off.x, y: start.y - off.y, z: start.z - off.z };
  const body = sim.addBody(plankGrid(n, seed), pos, { dynamic: true, kind: 'prop', name: 'plank', rot, tags: ['plank', 'tool'] });
  return { body, a, b, n };
}
