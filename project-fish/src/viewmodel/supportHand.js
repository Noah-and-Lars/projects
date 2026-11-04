// The support hand's finger joints, so it can let go of the gun, take hold of
// a magazine, close round it, and take hold of the gun again.
//
// The gloves are modelled holding the gun. When the game loads, the support
// glove gets a skeleton: a bone for each finger and thumb joint. Every point
// on the glove follows the bones nearest it, shared between the two bones
// either side of a joint, so knuckles bend smoothly instead of folding.
// A hand shape (a "pose") says which way each bone points; the reload moves
// the hand from one to the next.

import * as THREE from 'three';
import { GRIP, MAGAZINE } from './pistol.js';
import { leftHandPose, handShapes, curlRound } from './arms.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RIGHT = V(1, 0, 0);
const DEG = Math.PI / 180;
const CHAINS = ['index', 'middle', 'ring', 'little', 'thumb'];

// Where the fresh magazine sits in the support hand, relative to where it sits
// in the gun when the hand is on the grip. Something this thin is held at the
// base of the fingers, not in the palm: the fingers lie along its left side
// and wrap round the front, the fingertips on its right side. It's held low,
// so the fingers wrap its body just above the baseplate and the top is clear
// to go into the gun.
export const MAG_IN_HAND = new THREE.Vector3()
  .addScaledVector(RIGHT, -0.026)
  .addScaledVector(GRIP.front, 0.0137)
  .addScaledVector(GRIP.down, 0.013);

// The support hand as modelled (holding the gun): its wrist, which way its
// forearm runs, which way its palm faces, and the heel of its palm.
const REST = leftHandPose();
const REST_SHAPES = handShapes(REST, { pads: false });
export const WRIST = REST.wrist.clone();
export const FOREARM = REST_SHAPES.forearm.clone();
export const PALM_NORMAL = REST_SHAPES.frame.back.clone().negate();
export const ALONG = REST_SHAPES.frame.along.clone(); // wrist to knuckles
export const PALM_HEEL = REST_SHAPES.frame.palmCenter.clone()
  .addScaledVector(REST_SHAPES.frame.along, -0.02)
  .addScaledVector(PALM_NORMAL, 0.0105);

// The magazine held in the hand, as a section the fingers close round (see arms.js).
const MAG_SECTION = {
  top: GRIP.top.clone().addScaledVector(GRIP.front, MAGAZINE.forward).add(MAG_IN_HAND),
  down: GRIP.down,
  front: GRIP.front,
  halfWidth: MAGAZINE.halfWidth,
  halfDepth: MAGAZINE.halfDepth,
  cornerRadius: MAGAZINE.cornerRadius,
};

// How widely each joint's bend is shared between the bones either side of it,
// in metres: the knuckle, the middle joint and the last joint.
const FINGER_BLEND = [0.0065, 0.0045, 0.0035];
const THUMB_BLEND = [0.011, 0.0055, 0.004];
const SHARE = 0.0008; // how softly a point between two fingers is shared between them

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// A bone's orientation: X along the bone, Y out of the back of the finger.
function frame(dir, back) {
  const x = dir.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, back).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// The direction out of the back of a finger wrapped round a section: away from
// the section's centre line.
function awayFrom(section, a, b) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const rel = mid.clone().sub(section.top);
  return rel.addScaledVector(section.down, -rel.dot(section.down));
}

const rotated = (v, axis, angle) => v.clone().applyAxisAngle(axis, angle);

// The joints of a finger or thumb that's one bone after another, each bone
// pointing along `dirs` with the length it has in `chain`.
function chained(chain, dirs) {
  const joints = [chain.joints[0].clone()];
  for (let k = 0; k < 3; k++) {
    const length = chain.joints[k + 1].distanceTo(chain.joints[k]);
    joints.push(joints[k].clone().addScaledVector(dirs[k].clone().normalize(), length));
  }
  return joints;
}

export class SupportHand {
  constructor() {
    this.rest = REST;
    this.shapes = REST_SHAPES;
    this.chains = [...this.rest.fingers, this.rest.thumb];

    // The skeleton: the root at the wrist (it doesn't move; the whole arm
    // does), then each finger and thumb from its base joint to its tip.
    this.root = new THREE.Bone();
    this.root.name = 'left_hand';
    this.root.position.copy(this.rest.wrist);
    this.bones = this.chains.map((chain, c) => {
      let parent = this.root;
      let from = this.rest.wrist;
      return chain.joints.map((joint, k) => {
        const bone = new THREE.Bone();
        bone.name = `left_${CHAINS[c]}_${k}`;
        bone.position.copy(joint).sub(from);
        parent.add(bone);
        parent = bone;
        from = joint;
        return bone;
      });
    });
    this.skeleton = null;

    this.restFrames = this.chains.map((chain) => [0, 1, 2].map((k) => frame(
      chain.joints[k + 1].clone().sub(chain.joints[k]),
      awayFrom(GRIP, chain.joints[k], chain.joints[k + 1]),
    )));
    this.poses = { grip: this.chains.map(() => [0, 1, 2].map(() => new THREE.Quaternion())) };
    this.makePoses();
    this.set('grip');
  }

  // A hand shape from where each joint goes and which way the back of each
  // bone faces: stored as how far each bone turns from how it's modelled.
  addPose(name, shape) {
    this.poses[name] = shape.map(({ joints, backs }, c) => [0, 1, 2].map((k) => frame(
      joints[k + 1].clone().sub(joints[k]), backs[k],
    ).multiply(this.restFrames[c][k].clone().invert())));
  }

  makePoses() {
    const { back } = this.shapes.frame;
    const palm = back.clone().negate();
    const fingers = this.rest.fingers;

    // A finger straightened out along its metacarpal (the bone in the palm
    // running to its knuckle), spread `spread` degrees sideways (towards the
    // little finger; negative towards the thumb), then bent `bend` degrees at
    // the knuckle, middle and last joints.
    const bent = (i, spread, bend) => {
      const chain = fingers[i];
      const base = this.shapes.metacarpalBases[i];
      let dir = chain.joints[0].clone().sub(base).normalize();
      dir = rotated(dir, palm, -spread * DEG); // + spreads away from the middle finger on the little-finger side
      const backOf = back.clone().addScaledVector(dir, -back.dot(dir)).normalize();
      const axis = new THREE.Vector3().crossVectors(dir, palm).normalize();
      let total = 0;
      const dirs = [];
      const backs = [];
      for (const b of bend) {
        total += b * DEG;
        dirs.push(rotated(dir, axis, total));
        backs.push(rotated(backOf, axis, total));
      }
      return { joints: chained(chain, dirs), backs };
    };

    // The thumb moved out from beside the index finger (in the plane of the
    // palm) by `out` degrees and forward over the palm by `forward` degrees,
    // mostly at its two outer joints (its base is buried in the palm).
    const thumbRest = this.rest.thumb;
    const thumbBacks = [0, 1, 2].map((k) => awayFrom(GRIP, thumbRest.joints[k], thumbRest.joints[k + 1]));
    const thumbOut = (out, forward) => {
      const d = [0, 1, 2].map((k) => thumbRest.joints[k + 1].clone().sub(thumbRest.joints[k]));
      const over = new THREE.Vector3().crossVectors(d[1], palm).normalize();
      const share = [0.3, 1, 1];
      const turn = (v, k) => rotated(rotated(v, palm, out * DEG * share[k]), over, forward * DEG * share[k]);
      return { joints: chained(thumbRest, d.map(turn)), backs: thumbBacks.map(turn) };
    };

    // The back of the hand slopes down from the wrist to the knuckles, so a
    // finger only looks straight with its knuckle bent a little; and a hand
    // at rest never straightens its fingers fully (the little finger curls
    // most). Bends below are knuckle, middle joint, last joint, in degrees.
    // Open, reaching to take hold of something: fingers spread and gently curved, thumb out.
    this.addPose('open', [
      bent(0, -10, [18, 22, 10]), bent(1, -3, [20, 25, 12]), bent(2, 5, [23, 28, 13]), bent(3, 12, [27, 32, 15]),
      thumbOut(20, 8),
    ]);
    // Relaxed, as the hand moves: a natural half curl.
    this.addPose('relaxed', [
      bent(0, -4, [34, 40, 20]), bent(1, -1, [37, 44, 22]), bent(2, 2, [40, 48, 24]), bent(3, 5, [44, 52, 26]),
      thumbOut(7, 6),
    ]);
    // Flat, pushing the magazine home with the heel of the hand: fingers out
    // of the way, still a little curved.
    this.addPose('flat', [
      bent(0, -8, [15, 17, 8]), bent(1, -2, [16, 18, 9]), bent(2, 4, [18, 20, 10]), bent(3, 10, [21, 24, 11]),
      thumbOut(24, 0),
    ]);

    // Fingers wrapped round a section (the grip, a magazine), `under` metres
    // off its surface (each finger's own, or one for all).
    const wrapped = (section, under) => fingers.map((chain, i) => {
      const lengths = [0, 1, 2].map((k) => chain.joints[k + 1].distanceTo(chain.joints[k]));
      const { joints } = curlRound(section, chain.joints[0], lengths, chain.radii, -1, Array.isArray(under) ? under[i] : under, null, true);
      return { joints, backs: [0, 1, 2].map((k) => awayFrom(section, joints[k], joints[k + 1])) };
    });
    // Loosened round the grip, just off it: the fingers lift off the shooting
    // hand's before they open, and close back down onto it.
    const OVER = 0.0195; // as in leftHandPose(): the shooting hand's fingers are this thick
    this.addPose('loose', [...wrapped(GRIP, [OVER, OVER, OVER, OVER * 0.8].map((u) => u + 0.013)), thumbOut(5, -7)]);

    // Round the magazine: fingers closed round the front of its body, thumb
    // pressed along its side.
    this.addPose('magazine', [...wrapped(MAG_SECTION, 0), this.thumbOnMagazine(0)]);
    // Pushing it into the gun: the thumb comes off its side, just enough to
    // clear the side of the grip as the magazine goes in.
    this.addPose('feeding', [...wrapped(MAG_SECTION, 0), this.thumbOnMagazine(0.009)]);
    // Letting go of it: fingers opened off it, so the hand can drop away.
    this.addPose('released', [...wrapped(MAG_SECTION, 0.017), this.thumbOnMagazine(0.016)]);
  }

  // The thumb lying forward along the left side of the magazine, above the
  // index finger, or lifted `lift` metres off it. (u here is from the top of
  // the magazine's centre line in the hand, MAG_SECTION.top.)
  thumbOnMagazine(lift) {
    const t = this.rest.thumb;
    const side = MAG_SECTION.top.clone().addScaledVector(RIGHT, -(MAGAZINE.halfWidth + t.radii[2] * 0.95 + lift));
    const at = (u, front) => side.clone().addScaledVector(GRIP.down, u).addScaledVector(GRIP.front, front);
    const targets = [null, null, at(-0.006, -0.018), at(-0.011, 0.008)];
    const joints = [t.joints[0].clone(), t.joints[1].clone()];
    for (let k = 2; k < 4; k++) {
      const length = t.joints[k].distanceTo(t.joints[k - 1]);
      joints.push(joints[k - 1].clone().addScaledVector(targets[k].clone().sub(joints[k - 1]).normalize(), length));
    }
    const out = RIGHT.clone().negate();
    return { joints, backs: [0, 1, 2].map((k) => (k === 0 ? awayFrom(GRIP, joints[0], joints[1]) : out)) };
  }

  // Moves the fingers part of the way (k, 0..1) from hand shape a to hand shape b.
  set(a, b = a, k = 0) {
    const A = this.poses[a];
    const B = this.poses[b];
    const world = new THREE.Quaternion();
    const parent = new THREE.Quaternion();
    this.bones.forEach((bones, c) => {
      parent.identity();
      for (let i = 0; i < 3; i++) {
        world.slerpQuaternions(A[c][i], B[c][i], k);
        bones[i].quaternion.copy(parent).invert().multiply(world);
        parent.copy(world);
      }
    });
  }

  // Turns the support glove into a mesh that bends with the bones, and puts
  // the skeleton in the glove's parent (the support arm).
  skin(mesh) {
    const parent = mesh.parent;
    parent.add(this.root);
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
    this.skeleton = new THREE.Skeleton([this.root, ...this.bones.flat()]);
    parent.updateMatrixWorld(true);
    skinned.bind(this.skeleton);
    return skinned;
  }

  // Which bones a point on the glove follows, and how much: [[bone, weight], ...]
  // (at most four, largest first). Bone 0 is the hand itself.
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
    const list = [...shares].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((a, [, w]) => a + w, 0);
    return list.map(([bone, w]) => [bone, w / sum]);
  }
}
