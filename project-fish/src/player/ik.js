// Inverse kinematics for the body's limbs.

import * as THREE from 'three';

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const u = new THREE.Vector3();
const v = new THREE.Vector3();
const knee = new THREE.Vector3();
const q = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();
const ownTurn = new THREE.Quaternion();

// Turns `bone` (in the world) by the smallest turn that takes direction
// `from` to `to`.
export function swing(bone, from, to) {
  q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  bone.parent.getWorldQuaternion(parentTurn);
  bone.getWorldQuaternion(ownTurn);
  bone.quaternion.copy(parentTurn).invert().multiply(q).multiply(ownTurn);
  bone.updateMatrixWorld(true);
}

// Two-bone IK: turns `upper` and `lower` (a thigh and calf, or upper arm and
// forearm) so that `end` (the foot or hand joint) reaches `target` (world),
// bending in the plane the limb bends in now (or towards `pole`, a world
// point, if given). If the target is out of reach, the limb points straight
// at it.
export function twoBoneIK(upper, lower, end, target, pole = null) {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  const la = a.distanceTo(b);
  const lb = b.distanceTo(c);
  const d = THREE.MathUtils.clamp(a.distanceTo(target), Math.abs(la - lb) + 1e-4, (la + lb) * 0.999);
  u.subVectors(target, a).normalize();
  v.copy(pole ? pole : b).sub(a);
  v.addScaledVector(u, -v.dot(u));
  if (v.lengthSq() < 1e-10) v.set(0, 0, 1).addScaledVector(u, -u.z);
  v.normalize();
  const cosA = THREE.MathUtils.clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
  knee.copy(a).addScaledVector(u, la * cosA).addScaledVector(v, la * Math.sqrt(1 - cosA * cosA));
  swing(upper, b.clone().sub(a), knee.clone().sub(a));
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  swing(lower, c.clone().sub(b), target.clone().sub(b));
}
