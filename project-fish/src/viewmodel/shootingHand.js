// The shooting hand's shapes: its thumb comes down off the side of the frame
// onto the magazine release and presses it (the finger joints themselves are
// in handRig.js).

import * as THREE from 'three';
import { rightHandPose } from './arms.js';
import { HandRig } from './handRig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The magazine release button, on the left of the frame just behind the
// trigger guard (gun space): the middle of its face, and how far it presses
// in (towards +X). The Blender pistol (build_pistol.py) matches.
export const MAG_RELEASE = { face: V(-0.01355, -0.04, -0.0229), travel: 0.0015 };

// Moves a chain of joints so its end reaches `target`, keeping every bone its
// length and the first joint where it is, changing it as little as it can
// (FABRIK: pull the chain to the target from the tip, then back to its root,
// a few times over).
function reach(joints, target) {
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

export class ShootingHand extends HandRig {
  constructor() {
    super('right', rightHandPose());
    // The thumb's tip, pad down on the button, then pressing it in. The rest
    // of the hand stays as it is.
    const thumb = this.rest.thumb;
    const tip = thumb.radii[3] * 0.92;
    const onButton = MAG_RELEASE.face.clone().add(V(-tip, 0, 0));
    const pressed = onButton.clone().add(V(MAG_RELEASE.travel, 0, 0));
    const fingers = this.rest.fingers.map((f) => f.joints);
    this.addPose('onRelease', [...fingers, reach(thumb.joints, onButton)]);
    this.addPose('pressRelease', [...fingers, reach(thumb.joints, pressed)]);
    this.set('grip');
  }
}
