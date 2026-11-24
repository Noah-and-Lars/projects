import type RAPIER from '@dimforge/rapier3d-compat';
import type { VoxelBody } from '../body';
import type { RayHit, Sim } from '../sim';
import { qrot, type V3 } from '../vec';
import type { VoxelGrid } from '../voxels';
import { Anchor, fixJoint, quatUpY, removeJoint, setBodyMass } from './util';

/** A small tool body glued to the voxel it was placed on (fixed joint). */
export interface Sticky {
  body: VoxelBody;
  joint: RAPIER.ImpulseJoint | null;
  anchor: Anchor;
}

/**
 * Place `grid` on the surface of a ray hit: local +Y along the hit normal, the grid's bottom-centre
 * on the hit point, glued with a fixed joint (contacts with the partner disabled).
 */
export function placeSticky(sim: Sim, grid: VoxelGrid, hit: RayHit, viewDir: V3, opts: { name: string; mass: number; tags?: string[] }): Sticky {
  const rot = quatUpY(hit.normal, { x: -viewDir.x, y: -viewDir.y, z: -viewDir.z });
  const half = qrot(rot, { x: grid.sx * 0.05, y: 0, z: grid.sz * 0.05 });
  const lift = 0.005;
  const pos = {
    x: hit.point.x - half.x + hit.normal.x * lift,
    y: hit.point.y - half.y + hit.normal.y * lift,
    z: hit.point.z - half.z + hit.normal.z * lift,
  };
  const body = sim.addBody(grid, pos, { dynamic: true, kind: 'prop', name: opts.name, rot, tags: opts.tags });
  body.noSplit = true;
  setBodyMass(body, opts.mass);
  const joint = fixJoint(sim, hit.body, body, hit.point);
  return { body, joint, anchor: Anchor.fromHit(hit) };
}

/** drop the glue when the anchor voxel / partner body is gone. Call every few ticks. */
export function checkSticky(sim: Sim, s: Sticky): void {
  if (!s.joint) return;
  if (s.body.removed || !s.anchor.alive() || !s.joint.isValid()) {
    removeJoint(sim, s.joint);
    s.joint = null;
    if (!s.body.removed) s.body.rb.wakeUp();
  }
}
