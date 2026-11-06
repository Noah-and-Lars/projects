// The sixth gun: a Xiri X4, a full-size pistol with an outside hammer,
// played as a 9 mm holding 15 rounds (assets/x4.glb, made by tools/blender/
// convert_retarget.py from "Xiri X4 Animations" by TheParaziT, see
// README.md, Credits). The download's arms were an engine's stock mannequin,
// which the game doesn't use: its clips were retargeted onto the soldier's
// own arms when the file was built, and that's what's in it (soldierRig.js).
// It's played by animatedGun.js, the clips as made.
//
// The file's root is the eye the clips were framed from (the download's
// camera, on the mannequin's head, which never moves): put it at the gun
// layer's camera and the gun is where its maker framed it, low and close.
// The game holds it further out and higher (its rig in viewmodel.js). Its
// points are in the `gun` node on the frame bone, which in the idle pose is
// gun space (metres, +X right, +Y up, -Z forward) moved to the frame bone
// (frame, below: where that is in the idle pose, in the file's space).
// Its maker holds it canted 15° (its top to the left as you look: cant,
// below); the gun layer levels it as it's aimed. Measured by the converter
// (its --report):
// - muzzle: the front of the barrel; port: the ejection port, on the right
//   of the slide, where the spent case leaves.
// - sights: the top of the rear sight (the front's is 1.3 mm lower), their
//   middle, and the back faces
//   of the rear and front sights.
//
// The clips (seconds), as made:
// - idle (6.67 s): a loop of the hands breathing.
// - shoot (0.55 s): the trigger is pulled from 0.017 s, the gun kicks back
//   from the start, the slide starts back at 0.067 (the shot), is fully
//   back at 0.083 and home at 0.1; the trigger's let go by 0.217.
//   shootLast: the same, the slide staying back.
// - afterShoot (0.83 s): the hand settling with the slide locked back, the
//   slide stop up; its last frame is the pose it rests in empty (idleEmpty,
//   a still), where the empty reload starts. (It doesn't start where
//   shootLast ends, so it isn't played through.)
// - dry (0.95 s): the trigger pulled on an empty chamber with the slide
//   forward. The slide only goes forward with a reload, so it isn't used.
// - reload (1.53 s), with rounds left: the magazine drops out at 0.28 s
//   (gone at 0.32), the fresh one's in the support hand from 0.53 and in at
//   0.7.
// - reloadEmpty (1.78 s), the slide locked back: the same, then the slide
//   stop is dropped and the slide goes home at 1.08 to 1.12.
// - inspect (2.8 s): the gun turned over and back. The slide stays forward,
//   so it's left out with the slide locked back.
// - walk (0.83 s) and run (0.67 s): loops played in place of the idle pose
//   walking and running. (Their start and end clips are left out: the gun
//   layer blends into and out of the loops.)
// - lower (0.33 s, the gun down to a low ready): left out; it has no draw or
//   put-away clips, so switching to and from it, the gun layer lowers and
//   raises it as it does the PF-9's, in the pose it rests in.

import { soldierRig } from './soldierRig.js';

export const MODEL_X4 = soldierRig({
  clips: {
    idle: 'idle', idleEmpty: 'afterShoot', shoot: 'shoot', shootLast: 'shootLast',
    reload: 'reload', reloadEmpty: 'reloadEmpty', inspect: 'inspect', walk: 'walk', run: 'run',
  },
  // (Rest clips held still at a time: 'end' is the clip's last frame.)
  stills: { idleEmpty: 'end' },
  bones: { frame: 'gun', slide: 'slide', trigger: 'trigger', hammer: 'hammer', slideStop: 'slide_stop', magazine: 'magazine' },
  // (In the `gun` node's space.)
  muzzle: [-0.0141, 0.055, -0.1623],
  port: [0.0017, 0.0677, -0.0059],
  sights: { x: -0.0134, height: 0.0757, rearZ: 0.0541, frontZ: -0.1542 },
  // Where the `gun` node is in the idle pose (the file's space).
  frame: [0.0421, -0.1428, -0.294],
  slideTravel: 0.0458,
  // How far it's held canted in the idle pose (degrees about the line of
  // sight, its top to the left as you look: its maker's hold), for the gun
  // layer to level as it's aimed (aimLevel in its rig, viewmodel.js).
  cant: 14.81,
  events: {
    shoot: { fire: 0.067 },
    shootLast: { fire: 0.067 },
  },
});
