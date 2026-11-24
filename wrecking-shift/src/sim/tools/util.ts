import RAPIER from '@dimforge/rapier3d-compat';
import type { VoxelBody } from '../body';
import type { RayHit, Sim } from '../sim';
import { qconj, qrot, vcross, vdot, vnorm, type Quat, type V3 } from '../vec';
import { computeMassProps } from '../voxels';

/** Shared helpers for tool implementations (pure sim code). */

export function emit(sim: Sim, name: string, data: any): void {
  sim.out.push({ type: 'custom', name, data });
}


/** rotation whose columns are the given orthonormal basis vectors (local X,Y,Z -> world) */
export function quatFromBasis(X: V3, Y: V3, Z: V3): Quat {
  const m00 = X.x, m10 = X.y, m20 = X.z;
  const m01 = Y.x, m11 = Y.y, m21 = Y.z;
  const m02 = Z.x, m12 = Z.y, m22 = Z.z;
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w) || 1;
  return { x: x / l, y: y / l, z: z / l, w: w / l };
}

/** orientation whose local +X points along `dir`, local +Y as close to `up` as possible */
export function quatLookX(dir: V3, up: V3 = { x: 0, y: 1, z: 0 }, fallbackUp: V3 = { x: 1, y: 0, z: 0 }): Quat {
  const X = vnorm(dir);
  let u = up;
  if (Math.abs(vdot(X, u)) > 0.97) u = fallbackUp;
  const Z = vnorm(vcross(X, u));
  const Y = vcross(Z, X);
  return quatFromBasis(X, Y, Z);
}

/** orientation whose local +Y points along `n` (surface normal), local +Z toward `fwd` projected */
export function quatUpY(n: V3, fwd: V3): Quat {
  const Y = vnorm(n);
  let f = fwd;
  if (Math.abs(vdot(Y, f)) > 0.97) f = Math.abs(Y.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const X = vnorm(vcross(Y, f));
  const Z = vcross(X, Y);
  return quatFromBasis(X, Y, Z);
}

/** world point -> rigid-body-local metres (joint anchors are in this frame) */
export function bodyLocal(body: VoxelBody, p: V3): V3 {
  const t = body.rb.translation();
  return qrot(qconj(body.rb.rotation()), { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z });
}
/** rigid-body-local metres -> world */
export function bodyWorld(body: VoxelBody, l: V3): V3 {
  const t = body.rb.translation();
  const w = qrot(body.rb.rotation(), l);
  return { x: w.x + t.x, y: w.y + t.y, z: w.z + t.z };
}

/** a voxel of a body that something is attached to; dead when the voxel or body is gone */
export class Anchor {
  constructor(public body: VoxelBody, public vx: number, public vy: number, public vz: number) {}
  static fromHit(h: RayHit): Anchor { return new Anchor(h.body, h.vx, h.vy, h.vz); }
  /** nearest solid voxel of `body` around a world point (within 1 voxel) */
  static near(body: VoxelBody, p: V3): Anchor | null {
    const l = body.toLocal(p);
    const bx = Math.floor(l.x), by = Math.floor(l.y), bz = Math.floor(l.z);
    let best: Anchor | null = null, bd = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx, y = by + dy, z = bz + dz;
      if (!body.grid.get(x, y, z)) continue;
      const d = (x + 0.5 - l.x) ** 2 + (y + 0.5 - l.y) ** 2 + (z + 0.5 - l.z) ** 2;
      if (d < bd) { bd = d; best = new Anchor(body, x, y, z); }
    }
    return best;
  }
  alive(): boolean { return !this.body.removed && this.body.grid.get(this.vx, this.vy, this.vz) !== 0; }
  world(): V3 { return this.body.toWorld({ x: this.vx + 0.5, y: this.vy + 0.5, z: this.vz + 0.5 }); }
}

/** fixed joint keeping the current relative pose of two bodies, attached at world point `p` */
export function fixJoint(sim: Sim, a: VoxelBody, b: VoxelBody, p: V3): RAPIER.ImpulseJoint {
  const data = RAPIER.JointData.fixed(bodyLocal(a, p), qconj(a.rb.rotation()), bodyLocal(b, p), qconj(b.rb.rotation()));
  const j = sim.world.createImpulseJoint(data, a.rb, b.rb, true);
  j.setContactsEnabled(false);
  return j;
}

export function removeJoint(sim: Sim, j: RAPIER.ImpulseJoint | null): void {
  if (j && j.isValid()) sim.world.removeImpulseJoint(j, true);
}

/** override the mass of a small dynamic tool body (keeps the shape's inertia distribution) */
export function setBodyMass(body: VoxelBody, mass: number): void {
  const mp = computeMassProps(body.grid);
  if (mp.mass <= 0) return;
  const k = mass / mp.mass;
  body.rb.setAdditionalMassProperties(mass, mp.com, { x: mp.inertia.x * k, y: mp.inertia.y * k, z: mp.inertia.z * k }, mp.frame, true);
  body.mass = mass;
}

/** world centre of a body's voxel box */

