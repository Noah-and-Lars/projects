// The eighth gun: an AR-15, a civilian semi-automatic rifle firing 5.56 mm
// from a 30-round magazine, with a long suppressor and a holographic sight
// with a magnifier behind it (assets/ar15.glb, made by tools/blender/
// convert_retarget.py from "AR-15 Animations Miniset" by TheParaziT, see
// README.md, Credits). As with the Xiri X4 (x4.js) and the MP7A1 (mp7.js),
// the download's arms were an engine's stock mannequin: its clips were
// retargeted onto the soldier's own arms when the file was built
// (soldierRig.js). It's played by animatedGun.js, the clips as made.
//
// The file's root is the eye the clips were framed from (the download has
// no camera of its own: the MP7A1's, put on this download's head, the same
// skeleton): put it at the gun layer's camera and the gun is where its
// maker framed it, low on the right. Its points are in the `gun` node on
// the frame bone, which in the idle pose is gun space (metres, +X right, +Y
// up, -Z forward) moved to the frame bone (frame, below: where that is in
// the idle pose, in the file's space). Its maker holds it canted 3.75° the
// other way from the X4 and the MP7A1 (its top to the right as you look:
// cant, below, negative); the gun layer levels it as it's aimed. Measured by
// the converter (its --report):
// - muzzle: the front of the suppressor; port: the ejection port, on the
//   right of the upper receiver, where the spent case leaves.
// - sights: it has no iron sights. It's aimed along the optic's axis (x,
//   height), from the magnifier's eyepiece (rearZ) through the holographic
//   sight's front window (frontZ). Neither moves in any clip (the magnifier
//   is never swung aside).
//
// Its maker made only four clips (seconds), all kept as made:
// - draw (0.72 s, its quick draw): up into view from low on the left, no
//   part moving; it ends in the idle pose, up in view by 0.3 and settled by
//   0.45. (Its other draw, drawFirst (1.95 s), is the first time it's taken
//   out: the head looks down at it, the support hand pulls the stock out
//   and the thumb puts the selector from safe to fire. It's left out: it
//   ends away from the idle pose, the elbow 11° off and the selector on
//   fire, which every other clip has on safe, so the hands and the lever
//   would jump at the end of it; and a gun switch is a quick draw.)
// - reload (2.5 s), with rounds left: the support hand fetches the fresh
//   magazine first (out of view, from the start), the release is pressed
//   at 0.77, the old magazine drops away from 0.85 (gone at 1.25) and the
//   fresh one is seated at 1.33. Nothing is done to the bolt.
// - reloadEmpty (2.6 s): the same from the bolt held open (the old
//   magazine gone at 0.97), then the support hand's palm slaps the bolt
//   catch at 1.77 and the bolt runs home at 1.8 to 1.83.
// - idle and idleEmpty: it has no idle clip, so the converter made them, a
//   frame of the maker's held still (no new pose): idle is the reload's
//   first frame (the ready pose both reloads start and end in, and the
//   quick draw ends in), idleEmpty the empty reload's (the same, with the
//   bolt held open on the bolt catch: after the last round).
// It has no shoot, inspect, walk or run clips: a shot is the gun layer's
// kick of the whole rig (as every gun has), and walking and running, the
// gun layer's sway, bob and sprint pose move it; it can't be inspected. No
// clip moves its trigger.

import { soldierRig } from './soldierRig.js';

export const MODEL_AR15 = soldierRig({
  clips: { idle: 'idle', idleEmpty: 'idleEmpty', draw: 'draw', reload: 'reload', reloadEmpty: 'reloadEmpty' },
  // (Its rest clips are one frame held: at their start.)
  stills: { idle: 0, idleEmpty: 0 },
  bones: { frame: 'gun', trigger: 'trigger', magazine: 'magazine' },
  // (In the `gun` node's space.)
  muzzle: [-0.0022, 0.0336, -0.6728],
  port: [0.0119, 0.0354, -0.1207],
  // (The optic's axis, from the magnifier's eyepiece to the holographic
  // sight's front window.)
  sights: { x: -0.0063, height: 0.0972, rearZ: 0.0485, frontZ: -0.1413 },
  // Where the `gun` node is in the idle pose (the file's space).
  frame: [0.0721, -0.1124, -0.2462],
  slideTravel: 0,
  // How far it's held canted in the idle pose (degrees about the line of
  // sight, positive its top to the left as you look: its maker's hold, here
  // to the right), for the gun layer to level as it's aimed (aimLevel in
  // its rig, viewmodel.js).
  cant: -3.75,
  events: {
    // It can fire once the draw has it settled in the idle pose.
    draw: { fire: 0.45 },
  },
});
