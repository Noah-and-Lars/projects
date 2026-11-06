// The seventh gun: an MP7A1, a compact sub-machine gun firing 4.6x30 mm
// from a 40-round magazine, fully automatic at about 950 rounds a minute,
// with a suppressor, a red dot sight (its maker's name rubbed off) and
// folding iron sights (assets/mp7.glb, made by tools/blender/
// convert_retarget.py from "MP7A1 Animations" by TheParaziT, see README.md,
// Credits). As with the Xiri X4 (x4.js), the download's arms were an
// engine's stock mannequin: its clips were retargeted onto the soldier's
// own arms when the file was built (soldierRig.js). It's played by
// animatedGun.js, the clips as made.
//
// The file's root is the eye the clips were framed from (the download's
// camera): put it at the gun layer's camera and the gun is where its maker
// framed it, shouldered, the red dot a little right of the eye. Its points
// are in the `gun` node on the frame bone, which in the idle pose is gun
// space (metres, +X right, +Y up, -Z forward) moved to the frame bone
// (frame, below: where that is in the idle pose, in the file's space).
// Its maker holds it canted 5.5° (its top to the left as you look: cant,
// below); the gun layer levels it as it's aimed. Measured by the converter
// (its --report):
// - muzzle: the front of the suppressor; port: the ejection port, on the
//   right of the receiver, where the spent case leaves.
// - sights: the red dot's lens: its middle (height, x), and the back and
//   front of its body (rearZ, frontZ). It's aimed through that (the iron
//   sights, folded down under it, are left alone).
//
// The clips (seconds), as made:
// - idle (6.67 s): a loop of the hands breathing.
// - draw (0.83 s, "show"): up into view; it's settled in the idle pose by
//   0.5. hide (0.5 s): down out of view.
// - shoot (0.55 s): the trigger is pulled from 0.017 s and the gun kicks
//   back from the start (furthest back at 0.05), then settles. Each shot
//   plays it from 0.033 s (the trigger nearly back, the kick under way), so
//   in a burst it starts again with every round.
// - afterShoot (0.83 s): the hands settling after a burst, from where shoot
//   ends to the idle pose: played after the last shot of a burst.
// - dry (0.95 s): the trigger pulled with the magazine empty.
// - reload (2.32 s), with rounds left: the magazine comes out at 0.35 s, is
//   put away and a fresh one is in the support hand from 1.15 and in at
//   1.4.
// - reloadEmpty (2.72 s): the empty one drops at 0.27 s, the fresh one's in
//   the hand from 0.77 and in at 1.08, then the charging handle is pulled
//   (1.65 to 1.77 s) and let go (home at 1.82).
// - inspect (2.8 s).
// - walk (0.83 s) and run (1.33 s): loops played in place of the idle pose
//   walking and running (their start and end clips are left out: the gun
//   layer blends into and out of the loops). Its run is its maker's
//   sprint pose, the gun held low across the chest.
// - safetyOn, safetyOff (0.88 s): the thumb turns the selector. Left out:
//   every other clip, the shot too, has the selector where the idle pose
//   has it, so after safetyOff it would jump back at the next clip. lower
//   (0.33 s): left out (it has its own draw and hide).
// No clip has the bolt held open on an empty magazine, so it rests in its
// idle pose when it's empty too.

import { soldierRig } from './soldierRig.js';

export const MODEL_MP7 = soldierRig({
  clips: {
    idle: 'idle', draw: 'draw', hide: 'hide', shoot: 'shoot', afterShot: 'afterShoot', dry: 'dry',
    reload: 'reload', reloadEmpty: 'reloadEmpty', inspect: 'inspect', walk: 'walk', run: 'run',
  },
  bones: { frame: 'gun', trigger: 'trigger', magazine: 'magazine', redDot: 'red_dot' },
  // (In the `gun` node's space.)
  muzzle: [-0.0048, 0.0488, -0.4693],
  port: [0.0193, 0.0689, 0.012],
  // (The red dot: the middle of its lens, and the back and front of its
  // tube. The middle is the tube's, measured from its rings in the game: the
  // converter's, -0.0069 across, is its body's with the knob on its right.)
  sights: { x: -0.0135, height: 0.1332, rearZ: 0.0169, frontZ: -0.0502 },
  // Where the `gun` node is in the idle pose (the file's space).
  frame: [0.076, -0.1413, -0.2699],
  slideTravel: 0,
  // How far it's held canted in the idle pose (degrees about the line of
  // sight, its top to the left as you look: its maker's hold), for the gun
  // layer to level as it's aimed (aimLevel in its rig, viewmodel.js).
  cant: 5.53,
  events: {
    shoot: { fire: 0.033 },
    // It can fire once the draw has it settled in the idle pose.
    draw: { fire: 0.5 },
  },
});
