// Finger joints for a glove, so it can change hand shape.
//
// The gloves are modelled holding the gun. When the game loads, a glove can
// get a skeleton: a bone for each finger and thumb joint. Every point on the
// glove follows the bones nearest it, shared between the two bones either
// side of a joint, so knuckles bend smoothly instead of folding. A hand shape
// (a "pose") says where each joint goes, and the hand can be put part of the
// way between any two. Joints only bend: a finger never twists round its own
// length, whatever the shape. The hand can also bend at the wrist: the cuff of
// the glove stays with the sleeve on a forearm bone, and the rest follows the
// hand. supportHand.js and shootingHand.js have the
// shapes for each hand.

import * as THREE from 'three';
import { GRIP } from './pistol.js';
import { handShapes } from './arms.js';

const CHAINS = ['index', 'middle', 'ring', 'little', 'thumb'];

// How the blending across each joint is shared between the bones either side
// of it, in metres: the knuckle, the middle joint and the last joint.
const FINGER_BLEND = [0.0065, 0.0045, 0.0035];
const THUMB_BLEND = [0.011, 0.0055, 0.004];
const SHARE = 0.0008; // how softly a point between two fingers is shared between them
// The glove's cuff follows the forearm from this far up from the wrist
// (metres), blending into the hand over the wrist.
const CUFF = [0.002, 0.02];

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// The joints of a finger or thumb that's one bone after another, each bone
// pointing along `dirs` with the length it has in `chain`.
export function chained(chain, dirs) {
  const joints = [chain.joints[0].clone()];
  for (let k = 0; k < 3; k++) {
    const length = chain.joints[k + 1].distanceTo(chain.joints[k]);
    joints.push(joints[k].clone().addScaledVector(dirs[k].clone().normalize(), length));
  }
  return joints;
}

// Moves a chain of joints so its end reaches `target`, keeping every bone its
// length and the first joint where it is, changing it as little as it can
// (FABRIK: pull the chain to the target from the tip, then back to its root,
// a few times over).
export function reach(joints, target) {
  const lengths = joints.slice(1).map((j, i) => j.distanceTo(joints[i]));
  const out = joints.map((j) => j.clone());
  const root = out[0].clone();
  for (let pass = 0; pass < 30; pass++) {
    out[out.length - 1].copy(target);
    for (let i = out.length - 2; i >= 0; i--) {
      const along = out[i].clone().sub(out[i + 1]).setLength(lengths[i]);
      out[i].copy(out[i + 1]).add(along);
    }
    out[0].copy(root);
    for (let i = 0; i < out.length - 1; i++) {
      const along = out[i + 1].clone().sub(out[i]).setLength(lengths[i]);
      out[i + 1].copy(out[i]).add(along);
    }
  }
  return out;
}

export class HandRig {
  // side: 'left' or 'right'. rest: the hand's pose as modelled (arms.js).
  constructor(side, rest) {
    this.side = side;
    this.rest = rest;
    this.shapes = handShapes(rest, { pads: false });
    this.chains = [...rest.fingers, rest.thumb];

    // The skeleton: the root at the wrist (it doesn't move; the whole arm
    // does), then each finger and thumb from its base joint to its tip.
    this.root = new THREE.Bone();
    this.root.name = `${side}_hand`;
    this.root.position.copy(rest.wrist);
    this.bones = this.chains.map((chain, c) => {
      let parent = this.root;
      let from = rest.wrist;
      return chain.joints.map((joint, k) => {
        const bone = new THREE.Bone();
        bone.name = `${side}_${CHAINS[c]}_${k}`;
        bone.position.copy(joint).sub(from);
        parent.add(bone);
        parent = bone;
        from = joint;
        return bone;
      });
    });
    // The forearm: the glove's cuff stays with it when the wrist bends.
    this.forearmBone = new THREE.Bone();
    this.forearmBone.name = `${side}_forearm`;
    this.forearmBone.position.copy(rest.wrist);
    this.forearm = this.shapes.forearm.clone();
    this.skeleton = null;

    // Each finger bends about the line it curls round in the model (the
    // fingers wrapped round the grip curl round the grip), the thumb in the
    // plane it's curled in.
    this.hinges = this.chains.map((chain, c) => {
      const j = chain.joints;
      const [a, b] = c < 4 ? [0, 1] : [1, 2];
      const n = new THREE.Vector3().crossVectors(j[a + 1].clone().sub(j[a]), j[b + 1].clone().sub(j[b]));
      return n.lengthSq() > 1e-10 ? n.normalize() : GRIP.down.clone();
    });
    this.poses = { grip: this.chains.map(() => [0, 1, 2].map(() => new THREE.Quaternion())) };
  }

  // A hand shape from where each joint goes (for each finger, then the
  // thumb), stored as how far each bone turns from how it's modelled: first
  // bending about its hinge, then the little bit of sideways swing left over,
  // so it never twists.
  addPose(name, shape) {
    this.poses[name] = shape.map((joints, c) => [0, 1, 2].map((k) => {
      const chain = this.chains[c];
      const d = chain.joints[k + 1].clone().sub(chain.joints[k]).normalize();
      const target = joints[k + 1].clone().sub(joints[k]).normalize();
      const n = this.hinges[c];
      const dp = d.clone().projectOnPlane(n).normalize();
      const tp = target.clone().projectOnPlane(n);
      if (tp.lengthSq() < 1e-6) return new THREE.Quaternion().setFromUnitVectors(d, target);
      tp.normalize();
      const bend = new THREE.Quaternion().setFromAxisAngle(n, Math.atan2(new THREE.Vector3().crossVectors(dp, tp).dot(n), dp.dot(tp)));
      return new THREE.Quaternion().setFromUnitVectors(d.clone().applyQuaternion(bend), target).multiply(bend);
    }));
  }

  // A hand shape part of the way (k) from one to another.
  addBlend(name, a, b, k) {
    this.poses[name] = this.poses[a].map((bones, c) => bones.map((q, i) => new THREE.Quaternion().slerpQuaternions(q, this.poses[b][c][i], k)));
  }

  // Moves the fingers part of the way (k, 0..1) from hand shape a to hand
  // shape b, and then part of the way (w) from there to hand shape `toward`
  // (for going back to holding the gun from anywhere in between).
  // `squeeze` (a hand shape) with s (0..1) takes the index finger alone that
  // far towards it (the trigger finger pulling).
  set(a, b = a, k = 0, toward = null, w = 0, squeeze = null, s = 0) {
    const A = this.poses[a];
    const B = this.poses[b];
    const C = toward && w > 0 ? this.poses[toward] : null;
    const D = squeeze && s > 0 ? this.poses[squeeze] : null;
    const world = new THREE.Quaternion();
    const parent = new THREE.Quaternion();
    this.bones.forEach((bones, c) => {
      parent.identity();
      for (let i = 0; i < 3; i++) {
        world.slerpQuaternions(A[c][i], B[c][i], k);
        if (C) world.slerp(C[c][i], w);
        if (D && c === 0) world.slerp(D[c][i], s);
        bones[i].quaternion.copy(parent).invert().multiply(world);
        parent.copy(world);
      }
    });
  }

  // Turns the support glove into a mesh that bends with the bones, and puts
  // the skeleton in the glove's parent (the support arm).
  skin(mesh) {
    const parent = mesh.parent;
    parent.add(this.root, this.forearmBone);
    parent.updateMatrixWorld(true);
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const p = new THREE.Vector3();
    const count = position.count;
    const index = new Uint16Array(count * 4);
    const weight = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) {
      p.fromBufferAttribute(position, v).applyMatrix4(mesh.matrix);
      const w = this.weightsAt(p);
      for (let j = 0; j < 4; j++) {
        index[v * 4 + j] = w[j] ? w[j][0] : 0;
        weight[v * 4 + j] = w[j] ? w[j][1] : 0;
      }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));

    const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
    skinned.name = mesh.name;
    skinned.position.copy(mesh.position);
    skinned.quaternion.copy(mesh.quaternion);
    skinned.scale.copy(mesh.scale);
    skinned.castShadow = mesh.castShadow;
    skinned.receiveShadow = mesh.receiveShadow;
    skinned.frustumCulled = false;
    parent.add(skinned);
    parent.remove(mesh);
    this.set('grip');
    this.skeleton = new THREE.Skeleton([this.root, ...this.bones.flat(), this.forearmBone]);
    parent.updateMatrixWorld(true);
    skinned.bind(this.skeleton);
    return skinned;
  }

  // Bends the hand at the wrist: turns it by `turn` (a quaternion, in the
  // arm's space) about the wrist, leaving the cuff with the forearm.
  bendWrist(turn) {
    this.root.quaternion.copy(turn);
  }

  // Which bones a point on the glove follows, and how much: [[bone, weight], ...]
  // (at most four, largest first). Bone 0 is the hand itself; the last is the
  // forearm.
  weightsAt(p) {
    const shares = new Map();
    const add = (bone, w) => shares.set(bone, (shares.get(bone) || 0) + w);
    // How far the point is from each finger and the thumb, and where along it.
    const near = this.chains.map((chain) => {
      let d = Infinity;
      let s = 0;
      let start = 0;
      const ab = new THREE.Vector3();
      const q = new THREE.Vector3();
      for (let k = 0; k < 3; k++) {
        const a = chain.joints[k];
        ab.copy(chain.joints[k + 1]).sub(a);
        const length = ab.length();
        const t = q.copy(p).sub(a).dot(ab) / (length * length);
        const tc = Math.min(1, Math.max(0, t));
        const dist = q.copy(a).addScaledVector(ab, tc).distanceTo(p) - (chain.radii[k] + (chain.radii[k + 1] - chain.radii[k]) * tc);
        if (dist < d) {
          d = dist;
          // Before the knuckle counts as the palm; past the tip as the tip.
          s = start + (k === 0 ? Math.min(t, 1) : k === 2 ? Math.max(t, 0) : tc) * length;
        }
        start += length;
      }
      return { d, s };
    });
    const palm = this.shapes.palmBodyFn(p.x, p.y, p.z);
    const closest = Math.min(palm, ...near.map((n) => n.d));
    const palmShare = Math.exp(-(palm - closest) / SHARE);
    const chainShares = near.map((n) => Math.exp(-(n.d - closest) / SHARE));
    const total = palmShare + chainShares.reduce((a, b) => a + b, 0);
    add(0, palmShare / total);
    this.chains.forEach((chain, c) => {
      const share = chainShares[c] / total;
      if (share < 1e-4) return;
      const blendWidth = c === 4 ? THUMB_BLEND : FINGER_BLEND;
      const at = [0, chain.joints[1].distanceTo(chain.joints[0])];
      at.push(at[1] + chain.joints[2].distanceTo(chain.joints[1]));
      const S = at.map((L, j) => smoothstep(L - blendWidth[j], L + blendWidth[j], near[c].s));
      add(0, share * (1 - S[0]));
      add(1 + c * 4, share * (S[0] - S[1]));
      add(2 + c * 4, share * (S[1] - S[2]));
      add(3 + c * 4, share * S[2]);
    });
    // Up the forearm from the wrist, the cuff follows the forearm instead.
    const up = smoothstep(CUFF[0], CUFF[1], p.clone().sub(this.rest.wrist).dot(this.forearm));
    if (up > 0) {
      for (const [bone, w] of shares) shares.set(bone, w * (1 - up));
      add(1 + this.chains.length * 4, up);
    }
    const list = [...shares].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((a, [, w]) => a + w, 0);
    return list.map(([bone, w]) => [bone, w / sum]);
  }
}
