// The support hand's shapes, so it can let go of the gun, take hold of a
// magazine, and take hold of the gun again (the finger joints themselves are
// in handRig.js), and how it holds a magazine.

import * as THREE from 'three';
import { GRIP, MAGAZINE, SLIDE } from './pistol.js';
import { leftHandPose, handShapes } from './arms.js';
import { HandRig, reach, chained } from './handRig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RIGHT = V(1, 0, 0);
const DEG = Math.PI / 180;

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

// Where the hand goes to hold the magazine `gap` metres short of fully home
// (for a magazine that slides in along `down`; most follow the grip).
// `seat`: how much higher this gun's magazine bottom is than the grip's
// usual one (metres along the grip), so the palm meets it.
export function holdingAt(gap, down = GRIP.down, seat = 0) {
  return SEATED.clone().addScaledVector(GRIP.down, -seat).addScaledVector(down, gap);
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

// --- Easing the slide back (the press check in an inspect) -------------------
//
// Over the slide in front of the ejection port: the palm against its left
// side, the index and middle fingers up over the top and down its right side
// by the front serrations, the thumb along its left side, the other fingers
// curled under. The forearm comes up from below and behind on the left.
export const OVER_TURN = frameOf(V(0.1, 0.85, -0.5), V(1, 0, 0)).multiply(frameOf(ALONG, PALM_NORMAL).invert());

// How far a point (gun space) is outside the slide (or the frame's dust cover
// under its front), with the slide pulled back `back` metres.
export function outsideSlide(p, back = 0) {
  const box = (halfWidth, y0, y1, z0, z1, r) => {
    const qx = Math.abs(p.x) - (halfWidth - r);
    const qy = Math.abs(p.y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
    const across = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const along = Math.max(z0 - p.z, p.z - z1);
    return Math.hypot(Math.max(across, 0), Math.max(along, 0)) + Math.min(Math.max(across, along), 0);
  };
  return Math.min(
    box(SLIDE.halfWidth, SLIDE.bottom, SLIDE.top, SLIDE.front + back, SLIDE.back + back, 0.0015),
    box(SLIDE.halfWidth - 0.0005, -0.027, SLIDE.bottom, -0.137, -0.03, 0.001),
  );
}

// Where the hand goes (offset from where it holds the gun) to take hold of
// the slide: its middle knuckle a little above and to the left of the
// slide's top left edge, just behind the front serrations. (Found by trying:
// the palm then rests against the slide's side without going into it, and
// the index and middle fingers reach over onto its right side.)
export const OVER_SLIDE = (() => {
  const knuckle = REST.fingers[1].joints[0];
  const target = V(-SLIDE.halfWidth - 0.03, SLIDE.top + 0.009, (SLIDE.frontSerrations[0] + SLIDE.frontSerrations[1]) / 2 + 0.012);
  return target.clone().sub(WRIST).sub(knuckle.clone().sub(WRIST).applyQuaternion(OVER_TURN));
})();

const rotated = (v, axis, angle) => v.clone().applyAxisAngle(axis, angle);
const lerp = (a, b, t) => a + (b - a) * t;

export class SupportHand extends HandRig {
  constructor() {
    super('left', REST);
    this.makePoses();
    this.set('grip');
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
    // How far a finger (its joints, as modelled) is from touching something
    // (`outside`, gun space) with the hand placed by `held`.
    const clearance = (joints, radii, held, outside) => {
      let least = Infinity;
      for (let k = 0; k < 3; k++) {
        for (let t = 0; t <= 1.001; t += 0.125) {
          const p = joints[k].clone().lerp(joints[k + 1], t).applyMatrix4(held);
          least = Math.min(least, outside(p) - lerp(radii[k], radii[k + 1], t) * 0.92);
        }
      }
      return least;
    };
    // Closes a finger (make(0) open, make(1) as closed as it goes) until it
    // just touches.
    const closeOn = (make, radii, held, outside) => {
      let open = 0;
      let shut = 1;
      if (clearance(make(1), radii, held, outside) > 0) return make(1);
      for (let i = 0; i < 20; i++) {
        const mid = (open + shut) / 2;
        if (clearance(make(mid), radii, held, outside) > 0.0004) open = mid;
        else shut = mid;
      }
      return make(open);
    };
    const FIST = [[115, 40, 18], [110, 70, 38], [110, 80, 44], [110, 90, 50]];
    const START = [[10, 8, 4], [12, 10, 5], [14, 12, 6], [16, 14, 7]];
    const onMagazine = handMatrix(holdingAt(0), HOLD_TURN);
    const heldFingers = fingers.map((chain, i) => closeOn(
      (s) => bent(i, SPREAD[i] * 0.4, START[i].map((a, j) => lerp(a, FIST[i][j], s))), chain.radii, onMagazine, outsideMagazine,
    ));
    const heldThumb = closeOn((s) => thumbOut(lerp(18, -30, s), lerp(-10, 55, s)), thumb.radii, onMagazine, outsideMagazine);
    this.addPose('magazine', [...heldFingers, heldThumb]);

    // Holding the slide: the fingers close over its top and down its right
    // side, and the thumb comes down its left side.
    const onSlide = handMatrix(OVER_SLIDE, OVER_TURN);
    const outside = (p) => outsideSlide(p);
    // The index and middle fingers pinch it with the thumb: round something
    // this narrow they bend mostly at the middle joints, across the top and
    // down the far side. The ring and little fingers curl up under them.
    const SLIDE_FIST = [[95, 110, 60], [95, 115, 65], [110, 80, 44], [110, 90, 50]];
    const slideFingers = fingers.map((chain, i) => closeOn(
      (s) => bent(i, SPREAD[i] * 0.3, [10, 10, 5].map((a, j) => lerp(a, SLIDE_FIST[i][j], s))), chain.radii, onSlide, outside,
    ));
    const slideThumb = closeOn((s) => thumbOut(lerp(-80, -80, s), lerp(-25, 5, s)), thumb.radii, onSlide, outside);
    this.addPose('slide', [...slideFingers, slideThumb]);
    // Pushing it in: the fingers slide off its front as it goes up into the
    // grip, leaving the palm to push.
    this.addBlend('pushing', 'magazine', 'flat', 0.48);
  }

  // A finger (index) or the thumb reaching out to press an attachment's
  // switch at `at` (gun space): hand shape `name`, the rest of the hand
  // holding on as it does.
  addSwitch(name, at, finger = 'index') {
    const chains = [...this.rest.fingers, this.rest.thumb].map((c) => c.joints);
    const c = finger === 'thumb' ? 4 : 0;
    const tip = (finger === 'thumb' ? this.rest.thumb : this.rest.fingers[0]).radii[3] * 0.9;
    const to = at.clone().add(new THREE.Vector3(-tip, 0, 0));
    chains[c] = reach(chains[c], to);
    this.addPose(name, chains);
  }
}
