// The support hand's finger joints, so it can let go of the gun, take hold of
// a magazine, and take hold of the gun again.
//
// The gloves are modelled holding the gun. When the game loads, the support
// glove gets a skeleton: a bone for each finger and thumb joint. Every point
// on the glove follows the bones nearest it, shared between the two bones
// either side of a joint, so knuckles bend smoothly instead of folding.
// A hand shape (a "pose") says where each joint goes; the reload moves the
// hand from one to the next. Joints only bend: a finger never twists round
// its own length, whatever the shape.

import * as THREE from 'three';
import { GRIP, MAGAZINE } from './pistol.js';
import { leftHandPose, handShapes } from './arms.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RIGHT = V(1, 0, 0);
const DEG = Math.PI / 180;
const CHAINS = ['index', 'middle', 'ring', 'little', 'thumb'];

// The support hand as modelled (holding the gun): its wrist, which way its
// palm faces, and which way the hand runs (wrist to knuckles).
const REST = leftHandPose();
const REST_SHAPES = handShapes(REST, { pads: false });
export const WRIST = REST.wrist.clone();
const PALM_NORMAL = REST_SHAPES.frame.back.clone().negate();
const ALONG = REST_SHAPES.frame.along.clone();

// --- Holding the fresh magazine ----------------------------------------------
//
// The way it's held to push it in: baseplate in the palm, index finger along
// its front, the other fingers closed round it and the thumb against its
// side. The hand is palm up, fingers pointing forward and a little right, so
// the forearm comes from below and behind, and the palm pushes the magazine
// home in one stroke.

const frameOf = (x, y) => {
  const X = x.clone().normalize();
  const Z = new THREE.Vector3().crossVectors(X, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, new THREE.Vector3().crossVectors(Z, X), Z));
};
const UP_GRIP = GRIP.down.clone().negate();
const POINTING = RIGHT.clone().multiplyScalar(0.3).addScaledVector(GRIP.front, 0.9).addScaledVector(GRIP.down, 0.08);
// How the hand is turned (about its wrist) to hold the magazine.
export const HOLD_TURN = frameOf(POINTING, UP_GRIP).multiply(frameOf(ALONG, PALM_NORMAL).invert());
// Roughly where on the palm the baseplate sits (as modelled): the middle of
// the palm, a little towards the wrist.
const PALM_SPOT = REST_SHAPES.frame.palmCenter.clone()
  .addScaledVector(PALM_NORMAL, 0.0105)
  .addScaledVector(ALONG, -0.016);
const PRESS = 0.001; // the palm gives this much where it pushes

// The hand's placement (a matrix: hand as modelled → gun space) for an offset and turn.
export function handMatrix(offset, turn) {
  const position = WRIST.clone().applyQuaternion(turn).negate().add(WRIST).add(offset);
  return new THREE.Matrix4().compose(position, turn, V(1, 1, 1));
}

// Where the hand is (offset from where it holds the gun) with the magazine
// fully home in it. The palm is cupped, so the baseplate rests on whatever is
// highest under it (mostly the muscle at the base of the thumb): this feels
// for the glove's surface under the baseplate and settles the hand so the
// baseplate just presses on it.
const SEATED = (() => {
  const base = GRIP.top.clone().addScaledVector(GRIP.front, MAGAZINE.forward).addScaledVector(GRIP.down, MAGAZINE.base);
  const spot = PALM_SPOT.clone().sub(WRIST).applyQuaternion(HOLD_TURN).add(WRIST);
  const offset = base.clone().sub(spot);
  const toHand = handMatrix(offset, HOLD_TURN).invert();
  const glove = REST_SHAPES.glove;
  const p = new THREE.Vector3();
  let highest = Infinity; // smallest distance down the grip at which the glove is met
  for (let i = -3; i <= 3; i++) {
    for (let j = -5; j <= 5; j++) {
      const column = GRIP.top.clone()
        .addScaledVector(RIGHT, (i / 3) * MAGAZINE.baseHalfWidth * 0.9)
        .addScaledVector(GRIP.front, MAGAZINE.forward + (j / 5) * MAGAZINE.baseHalfDepth * 0.9);
      for (let u = MAGAZINE.base - 0.03; u < MAGAZINE.base + 0.04; u += 0.0005) {
        p.copy(column).addScaledVector(GRIP.down, u).applyMatrix4(toHand);
        if (glove(p.x, p.y, p.z) < 0) {
          highest = Math.min(highest, u);
          break;
        }
      }
    }
  }
  return offset.addScaledVector(GRIP.down, MAGAZINE.base - PRESS - highest);
})();

// Where the hand goes to hold the magazine `gap` metres short of fully home.
export function holdingAt(gap) {
  return SEATED.clone().addScaledVector(GRIP.down, gap);
}

// How far a point (gun space) is outside the seated magazine: its body, and
// the wider baseplate at the bottom.
export function outsideMagazine(p) {
  const rel = p.clone().sub(GRIP.top);
  const u = rel.dot(GRIP.down);
  const x = rel.dot(RIGHT);
  const y = rel.dot(GRIP.front) - MAGAZINE.forward;
  const box = (halfWidth, halfDepth, r, u0, u1) => {
    const qx = Math.abs(x) - (halfWidth - r);
    const qy = Math.abs(y) - (halfDepth - r);
    const across = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const along = Math.max(u0 - u, u - u1);
    return Math.hypot(Math.max(across, 0), Math.max(along, 0)) + Math.min(Math.max(across, along), 0);
  };
  return Math.min(
    box(MAGAZINE.halfWidth, MAGAZINE.halfDepth, MAGAZINE.cornerRadius, MAGAZINE.top, MAGAZINE.bottom),
    box(MAGAZINE.baseHalfWidth, MAGAZINE.baseHalfDepth, 0.003, MAGAZINE.bottom, MAGAZINE.base),
  );
}

// How the blending across each joint is shared between the bones either side
// of it, in metres: the knuckle, the middle joint and the last joint.
const FINGER_BLEND = [0.0065, 0.0045, 0.0035];
const THUMB_BLEND = [0.011, 0.0055, 0.004];
const SHARE = 0.0008; // how softly a point between two fingers is shared between them

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const rotated = (v, axis, angle) => v.clone().applyAxisAngle(axis, angle);
const lerp = (a, b, t) => a + (b - a) * t;

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

    // Each finger bends about the line it curls round in the model: the
    // fingers round the grip, the thumb in the plane it's curled in.
    const t = this.rest.thumb.joints;
    this.hinges = this.chains.map((chain, c) => (c < 4
      ? GRIP.down.clone()
      : new THREE.Vector3().crossVectors(t[2].clone().sub(t[1]), t[3].clone().sub(t[2])).normalize()));
    this.poses = { grip: this.chains.map(() => [0, 1, 2].map(() => new THREE.Quaternion())) };
    this.makePoses();
    this.set('grip');
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
      let dir = chain.joints[0].clone().sub(this.shapes.metacarpalBases[i]).normalize();
      dir = rotated(dir, palm, -spread * DEG);
      const axis = new THREE.Vector3().crossVectors(dir, palm).normalize();
      let total = 0;
      return chained(chain, bend.map((b) => rotated(dir, axis, (total += b) * DEG)));
    };

    // The thumb moved out from beside the index finger (in the plane of the
    // palm) by `out` degrees and over the palm by `over` degrees, mostly at
    // its two outer joints (its base is buried in the palm).
    const thumb = this.rest.thumb;
    const thumbOut = (out, over) => {
      const d = [0, 1, 2].map((k) => thumb.joints[k + 1].clone().sub(thumb.joints[k]));
      const overAxis = new THREE.Vector3().crossVectors(d[1], palm).normalize();
      const share = [0.3, 1, 1];
      return chained(thumb, d.map((v, k) => rotated(rotated(v, palm, out * DEG * share[k]), overAxis, over * DEG * share[k])));
    };

    // The back of the hand slopes down from the wrist to the knuckles, so a
    // finger only looks straight with its knuckle bent a little; and a hand
    // at rest never straightens its fingers fully (the little finger curls
    // most). Bends are knuckle, middle joint, last joint, in degrees.
    const SPREAD = [-10, -3, 5, 12];
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
    // Flat under the magazine as the palm pushes it home: fingers forward,
    // out of the way of the grip, still a little curved.
    this.addPose('flat', [
      bent(0, -6, [12, 14, 7]), bent(1, -2, [13, 15, 7]), bent(2, 3, [15, 17, 8]), bent(3, 8, [18, 20, 9]),
      thumbOut(14, 0),
    ]);
    // Loosened off the grip: the fingers lift off the shooting hand before
    // they open, and come back down onto it.
    this.addBlend('loose', 'grip', 'open', 0.3);
    // Coming back to the grip: half open, ready to wrap round it.
    this.addBlend('reaching', 'relaxed', 'open', 0.45);

    // Holding the magazine: each finger closes until it touches it (the index
    // finger stays nearly straight along its front), and the thumb comes over
    // until it touches its side.
    const held = handMatrix(holdingAt(0), HOLD_TURN);
    const clearance = (joints, radii) => {
      let least = Infinity;
      for (let k = 0; k < 3; k++) {
        for (let t = 0; t <= 1.001; t += 0.125) {
          const p = joints[k].clone().lerp(joints[k + 1], t).applyMatrix4(held);
          least = Math.min(least, outsideMagazine(p) - lerp(radii[k], radii[k + 1], t) * 0.92);
        }
      }
      return least;
    };
    // Closes a finger (make(0) open, make(1) as closed as it goes) until it
    // just touches.
    const closeOn = (make, radii) => {
      let open = 0;
      let shut = 1;
      if (clearance(make(1), radii) > 0) return make(1);
      for (let i = 0; i < 20; i++) {
        const mid = (open + shut) / 2;
        if (clearance(make(mid), radii) > 0.0004) open = mid;
        else shut = mid;
      }
      return make(open);
    };
    const FIST = [[115, 40, 18], [110, 70, 38], [110, 80, 44], [110, 90, 50]];
    const START = [[10, 8, 4], [12, 10, 5], [14, 12, 6], [16, 14, 7]];
    const heldFingers = fingers.map((chain, i) => closeOn(
      (s) => bent(i, SPREAD[i] * 0.4, START[i].map((a, j) => lerp(a, FIST[i][j], s))), chain.radii,
    ));
    const heldThumb = closeOn((s) => thumbOut(lerp(18, -30, s), lerp(-10, 55, s)), thumb.radii);
    this.addPose('magazine', [...heldFingers, heldThumb]);
    // Pushing it in: the fingers slide off its front as it goes up into the
    // grip, leaving the palm to push.
    this.addBlend('pushing', 'magazine', 'flat', 0.48);
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
