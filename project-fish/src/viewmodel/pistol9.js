// Points on the PF-9 as converted from the downloaded model (gun space,
// metres; measured by tools/blender/convert_pistol9.py, which prints them).
// The built-in fallback pistol (pistol.js) has its own, in viewmodel.js.
//
// - muzzle, port: where the flash and smoke come from and where the spent case
//   leaves the slide.
// - sights: the top of the sights, and the rear and front sights' z.
// - slideTravel: how far the slide goes back (locked back, it stays there);
//   slideTop and slideHalfWidth: the slide's top and half width, for the hand
//   that takes hold of it to check the chamber.
// - barrel: how far it follows the slide back, and how far it tips (radians)
//   about its pivot as it unlocks, muzzle up and its back end down.
// - slideStop: how far it turns up (radians) about its pivot (the trigger
//   pin) when the slide locks back empty.
// - magRelease: the outside of its button on the left, and how far it
//   presses in, for the shooting hand's thumb.
// - magDown: the way the magazine slides out (its own axis, a little steeper
//   than the grip line the hands are posed round).
//
// attachments: what each attachment (src/attachments.js) changes, by id.
// - sights: the aim line through a red dot (height of the dot, the back of
//   the sight, a point ahead on the line, and how far the eye is from the
//   back of the sight; the gun sits about as far from the eye as with the
//   iron sights).
// - muzzle: the suppressors' fronts.
// - lens / emitter: where a light's beam and the laser come from (they point
//   straight ahead, along -Z); switch: where the support hand presses to
//   switch it on or off.
// - on: the mounts each can sit on (the node is moved by `offset` for a
//   mount other than the one it's modelled on).
// - slide: the rail cover's top and half width (the chamber check takes
//   hold of it there).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const MODEL9 = {
  muzzle: [0, -0.0117, -0.1333],
  port: [0.008, -0.0025, -0.0493],
  sights: { height: 0.0022, rearZ: 0.0312, frontZ: -0.1203 },
  slideTravel: 0.034,
  slideTop: -0.002,
  slideHalfWidth: 0.0127,
  barrel: { travel: 0.003, tilt: 0.032, pivot: V(0, -0.0102, -0.0978) },
  slideStop: { lift: -0.04, pivot: V(0, -0.0328, -0.0422) },
  hammer: null,
  magRelease: { face: V(-0.0139, -0.0564, -0.0163), travel: 0.0018 },
  magDown: V(0, -0.9244, 0.3814),
  attachments: {
    reddot: {
      // On the clamp mount (as modelled), or moved onto the rail cover.
      sights: {
        clamp: { height: 0.0229, rearZ: -0.0282, frontZ: -0.0675, eyeRelief: 0.29 },
        cover: { height: 0.0218, rearZ: 0.0049, frontZ: -0.0344, eyeRelief: 0.27 },
      },
      on: { clamp: { offset: [0, 0, 0] }, cover: { parent: 'slide', offset: [0, -0.00115, 0.0331] } },
    },
    cover: { slide: { top: 0.0054, halfWidth: 0.0149 } },
    can_short: { muzzle: [0, -0.0117, -0.2573] },
    can_long: { muzzle: [0, -0.0117, -0.3148] },
    can_box: {
      muzzle: [0, -0.0117, -0.3085],
      // With the rail cover on, it sits a little further forward.
      on: { cover: { offset: [0, 0, -0.0018] } },
    },
    light_long: {
      // Modelled on the clamp mount's bottom rail.
      lens: [0, -0.0667, -0.1543],
      switch: [-0.009, -0.058, -0.084], // the support hand's index finger flicks it
      on: { clamp: { offset: [0, 0, 0] }, frame: { offset: [0, 0.0115, 0] }, can_box: { offset: [0, -0.0243, 0] } },
    },
    light_compact: {
      // Modelled on the frame's rail.
      lens: [0, -0.049, -0.1326],
      switch: [-0.0125, -0.05, -0.073], // its paddle beside the trigger guard
      on: { frame: { offset: [0, 0, 0] }, clamp: { offset: [0, -0.0115, 0] }, can_box: { offset: [0, -0.0358, 0] } },
    },
    laser: { emitter: [-0.0303, -0.0209, -0.121], switch: [-0.027, -0.036, -0.063] }, // at its lower back corner
  },
};
