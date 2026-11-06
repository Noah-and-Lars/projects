// The third gun, the PF-23: a big double-action .45 in the style of the
// special forces pistols made to take a suppressor, with a long slide, a
// barrel threaded past its front, an exposed hammer, a decocking lever and a
// slide stop on the left, and a polymer frame. 245 mm long.
//
// Unlike the other two guns it brings its own arms. Its model
// (assets/pistol23.glb) is made from a downloaded first-person model by
// tools/blender/convert_pistol23.py: bare forearms and fingerless gloves on
// one skeleton with the gun, and that skeleton's own animations, which the
// game plays (with its sway, bob and breathing on top). While it's held the
// soldier's arms and the gloves model aren't drawn.
//
// The file's root is the eye the arms were posed for: put it at the gun
// layer's camera and the gun is where its maker framed it (a little right of
// the middle, the sights just under the eye, the rear sight 0.29 m ahead).
// The game holds it lower, further right and further out than that at the
// hip, where the PF-45 is held (RIG in viewmodel.js).
// Its bones are turned the game's way round, so in the idle pose the gun's
// bones are gun space moved to their pivots (metres, +X right, +Y up, -Z
// forward). The bones the game uses:
// - frame_j: the whole gun (frame, barrel, and the parts below); the
//   animations move it, and the slide and magazine with it.
// - slide_j: the slide with its sights; it goes back along +Z.
// - mag_j: the magazine.
// - trigger_j, hammer_j, slidestop_j: the trigger (pivots at its top), the
//   hammer (on its pin; modelled cocked) and the slide stop (on its pin at
//   its front end), at rest in the gun. No animation moves them; they turn
//   about X (a negative turn pulls the trigger and lowers the hammer, a
//   positive one lifts the slide stop's back end).
// - hand_L, hand_R: the support and shooting hands' wrists.
//
// The animations, each starting at 0:
// - idle: the pose the gun rests in (one frame; the end of draw is the same).
// - shoot: one shot. The slide goes back from the first frame, is fully back
//   at 0.1 s (49 mm) and home at 0.19; the gun kicks 25 mm back, 4 mm up and
//   tips up 6 degrees, and is back where it was by 0.3. The support hand
//   stays on the grip, wrapped round the shooting hand, and rides it out.
// - reload: an empty reload, slide locked back from the start (49 mm, easing
//   on to 66 mm as the hand works; the game keeps it at 49, where the slide
//   stop holds it). The gun comes up and over to the left;
//   the support hand lets go at 0.1 s and drops to the belt (out of sight
//   from 0.35); the magazine is let go at 0.54 and falls clear (out of sight
//   at 0.63); the new one is in the support hand at 0.97 (the same magazine,
//   moved there out of sight), comes up into view at about 1.6 to 1.75,
//   reaches the well at 2.23 and is home at 2.36. The support hand is back on
//   the grip at 2.75,
//   the shooting hand's thumb drops the slide at 3.07 (home at 3.17) and the
//   gun dips with it and settles back by the end, 3.73.
// - draw: the gun comes up from low and turned in front of the chest, both
//   hands already on it; in sight from 0.11 s, up and on target at 0.33, a
//   small dip and settled at the end, 0.83. It can fire from 0.5 s on (a
//   shot then plays on top of the rest of the draw).
// - hide: the reverse, both hands on it: it leaves at once, is out of sight
//   at 0.28 s and down at 0.37.
// (In sight means inside the game's 62 degree gun layer view.)

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const MODEL23 = {
  ownArms: true,
  clips: { idle: 'idle', draw: 'draw', hide: 'hide', shoot: 'shoot', reload: 'reload' },
  durations: { idle: 0.0333, draw: 0.8333, hide: 0.3667, shoot: 0.3333, reload: 3.7333 },
  bones: {
    frame: 'frame_j', slide: 'slide_j', magazine: 'mag_j',
    trigger: 'trigger_j', hammer: 'hammer_j', slideStop: 'slidestop_j',
    supportHand: 'hand_L', shootingHand: 'hand_R',
  },
  meshes: { arms: ['hands', 'gloves'], gun: ['frame', 'slide', 'magazine'] },

  // In the idle pose, from the eye (the file's root): where the gun's bones
  // are, and its sights: the tops of the rear sight's two blades and of the
  // front blade (nearly level; the rear notch is 3.4 mm wide and 3.8 mm
  // deep), their x, and the back faces of both blades.
  idle: { frame: V(0.0388, -0.1039, -0.3131), slide: V(0.0388, -0.0288, -0.3189), magazine: V(0.0388, -0.1134, -0.3056) },
  sights: { x: 0.0357, height: -0.0034, rearTop: -0.0031, frontTop: -0.0037, notchBottom: -0.0069, rearZ: -0.2926, frontZ: -0.4783 },

  // In the frame's bone space: the muzzle (the front of the threaded barrel;
  // bore radius 7.4 mm), and the way the magazine first drops out (along the
  // grip, a little back). In the slide's: the middle of the ejection port's
  // opening on the right, and the slide's top and half width.
  muzzle: [-0.0029, 0.08, -0.1908],
  magDown: V(-0.005, -0.963, 0.271),
  port: [0.0136, 0.0105, -0.0681],
  slideTop: 0.016,
  slideHalfWidth: 0.0167,
  slideTravel: 0.0489, // how far the shot sends it back (and where it locks back empty)

  // When things happen in each animation (seconds from its start).
  events: {
    shoot: { slideBack: 0.1, slideHome: 0.192, recovered: 0.3 },
    reload: {
      supportHandOff: 0.1, supportHandOutOfSight: 0.35, magReleased: 0.542, magOutOfSight: 0.633, newMagInHand: 0.967, newMagInSight: 1.75,
      newMagAtWell: 2.225, magSeated: 2.358, supportHandBack: 2.75, slideReleased: 3.067, slideHome: 3.167,
    },
    // (It can fire from `fire` on: on target and through the small dip.)
    draw: { inSight: 0.108, ready: 0.333, fire: 0.5 },
    hide: { outOfSight: 0.275 },
  },

  // A reload with rounds left (the slide is forward the whole time, so
  // there's nothing for the thumb to drop) plays the reload animation till
  // just after the support hand is back on the grip, before the shooting
  // thumb starts for the slide stop (`leave`, seconds), and then eases from
  // that pose into the idle pose, done at `length` (PISTOL23.reloadTime in
  // src/shared/config.js).
  reloadWithRounds: { leave: 2.77, length: 3.2 },
};
