// The shooting hand's shapes: its thumb comes down off the side of the frame
// onto the magazine release and presses it (the finger joints themselves are
// in handRig.js).

import * as THREE from 'three';
import { rightHandPose } from './arms.js';
import { HandRig, reach } from './handRig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The magazine release button, on the left of the frame just behind the
// trigger guard (gun space): the middle of its face (the tops of its grip
// ridges), and how far it presses in (towards +X). The Blender pistol
// (build_pistol.py) matches.
export const MAG_RELEASE = { face: V(-0.0139, -0.04, -0.0229), travel: 0.0015 };

export class ShootingHand extends HandRig {
  constructor() {
    super('right', rightHandPose());
    this.addRelease('', MAG_RELEASE);
    this.set('grip');
  }

  // The thumb on another gun's magazine release (`release` as MAG_RELEASE):
  // poses 'onRelease' + suffix and 'pressRelease' + suffix. The thumb's
  // tip, pad down on the button, then pressing it in; the rest of the hand
  // stays as it is (`fingers`: its finger joints, as modelled if not given).
  addRelease(suffix, release, fingers = this.rest.fingers.map((f) => f.joints)) {
    const thumb = this.rest.thumb;
    const tip = thumb.radii[3] * 0.92;
    const onButton = release.face.clone().add(V(-tip, 0, 0));
    const pressed = onButton.clone().add(V(release.travel, 0, 0));
    this.addPose('onRelease' + suffix, [...fingers, reach(thumb.joints, onButton)]);
    this.addPose('pressRelease' + suffix, [...fingers, reach(thumb.joints, pressed)]);
  }

  // Where the index finger, as modelled, touches a trigger: the point where
  // it crosses the gun's middle (x = 0), moved back by the finger's
  // thickness there (gun space).
  restTriggerContact(joints = this.rest.fingers[0].joints) {
    const index = this.rest.fingers[0];
    for (let k = 0; k < 3; k++) {
      const a = joints[k];
      const b = joints[k + 1];
      if ((a.x > 0) === (b.x > 0)) continue;
      const t = a.x / (a.x - b.x);
      const at = a.clone().lerp(b, t);
      const radius = index.radii[k] + (index.radii[k + 1] - index.radii[k]) * t;
      return at.add(V(0, 0, radius));
    }
    return joints[3].clone();
  }

  // The hand on a gun whose trigger's front face is at `face` (gun space):
  // poses 'grip' + suffix (the index finger's pad on the trigger) and
  // 'squeeze' + suffix (pulling it back `travel`), and the thumb on its
  // magazine release (as addRelease) with the finger on the trigger.
  addGun(suffix, face, travel, release) {
    const index = this.rest.fingers[0];
    // Where the fingertip goes so the pad just touches the trigger: the
    // finger bends as the tip moves, so this is found by trying a few times.
    const touch = face.clone().add(V(0, 0, -0.0005));
    const fit = (at) => {
      const tip = index.joints[3].clone().add(at.clone().sub(this.restTriggerContact()).setX(0));
      let joints = reach(index.joints, tip);
      for (let pass = 0; pass < 8; pass++) {
        const miss = at.clone().sub(this.restTriggerContact(joints)).setX(0);
        if (miss.length() < 0.0002) break;
        tip.add(miss);
        joints = reach(index.joints, tip);
      }
      return joints;
    };
    const onTrigger = fit(touch);
    const pulled = fit(touch.clone().add(V(0, 0, travel)));
    const others = this.rest.fingers.slice(1).map((f) => f.joints);
    const thumb = this.rest.thumb.joints;
    this.addPose('grip' + suffix, [onTrigger, ...others, thumb]);
    this.addPose('squeeze' + suffix, [pulled, ...others, thumb]);
    this.addRelease(suffix, release, [onTrigger, ...others]);
    this.fingersOn = this.fingersOn || {};
    this.fingersOn[suffix] = [onTrigger, ...others];
  }

  // The thumb on a gun's slide stop, to push it down and let the slide go
  // after an empty reload: poses 'onStop' + suffix (the tip on top of the
  // tab, which is up with the slide locked back; `top`: the middle of its
  // top, gun space) and 'pressStop' + suffix (pushed down `travel`).
  addSlideStop(suffix, top, travel = 0.003) {
    const thumb = this.rest.thumb;
    const tip = thumb.radii[3] * 0.92;
    const on = top.clone().add(V(-tip * 0.35, tip, 0));
    const fingers = (this.fingersOn && this.fingersOn[suffix]) || this.rest.fingers.map((f) => f.joints);
    this.addPose('onStop' + suffix, [...fingers, reach(thumb.joints, on)]);
    this.addPose('pressStop' + suffix, [...fingers, reach(thumb.joints, on.clone().add(V(0, -travel, 0)))]);
  }
}
