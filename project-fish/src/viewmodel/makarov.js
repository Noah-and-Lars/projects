// The ninth gun: a Makarov PM, a 9x18 mm Makarov pistol holding 8 rounds,
// which comes with its own gloved arms and its own animations (assets/
// makarov.glb, made by tools/blender/convert_makarov.py from "Makarov PM
// FPS animations" by Cransh, see README.md, Credits). It's played by
// animatedGun.js, its clips as its maker made them. (The download's
// suppressor and red dot sight are left out: a plain PM has neither.)
//
// The file's root is the eye its maker framed it from (the download's own
// camera): put it at the gun layer's camera and the gun is where its maker
// framed it, its sights just under the eye. The game holds it lower and to
// the right at the hip, as the other pistols are (its RIG in
// viewmodel.js). Its points are in the `gun` node on the frame bone, which
// over the idle loop is, on average, gun space (metres, +X right, +Y up,
// -Z forward) moved to the frame bone (frame, below: where that is then,
// in the file's space). The gun is held turned 4° onto its right side
// (cant) and 1.3° to the left, so its sights are a little left of the bore
// and its front sight's blade a little left of where the rear sight's
// notch looks; aimed, the gun layer turns the whole rig back level and
// straight (aimLevel, and sights.front: see sightLine in viewmodel.js), so
// the front blade sits in the notch.
// Measured by the converter, which prints them (MAKAROV ...):
// - muzzle: the front of the barrel; port: the ejection port, on the right
//   of the slide, where the spent case leaves.
// - sights: the top of the rear sight, their middle, and the back faces of
//   the rear and front sights; front: the top of the front blade.
//
// The clips (seconds), all five as made, each starting and ending in the
// pose it rests in:
// - idle (MK_Idle, 1.98 s): a loop of the hands breathing. There's no pose
//   with the slide locked back: its slide goes home after every shot, the
//   last one too.
// - walk (MK_walk, 0.98 s): a loop of the hands' sway, played in place of
//   the idle pose while walking (and running: there's no run clip).
// - shoot (MK_Shot, 0.31 s): the shot goes off at once (the slide starts
//   back at 0.017 s, pushing the cocked hammer back with it), the slide is
//   fully back at 0.041 and home at 0.066, and the hands have settled by
//   the end.
// - reload (MK_ReloadFast, 2.23 s), with rounds left: the magazine comes
//   out at 0.66 s, is swapped at the belt (back from it at 1.06) and in at
//   1.72; the support hand is back on the grip at 1.98. The slide doesn't
//   move.
// - reloadEmpty (MK_ReloadFull, 2.98 s): the same until the magazine is in,
//   then the support hand reaches over the slide, pulls it back (2.21 to
//   2.41 s) and lets it go (home at 2.43), and is back on the grip at 2.92.
// No draw, put-away, inspect or run clips: switching to and from it, the
// gun layer lowers and raises it as it does the other guns, held in its
// idle pose, and it has no inspect.

export const MODEL_MAKAROV = {
  clips: { idle: 'idle', walk: 'walk', shoot: 'shoot', reload: 'reload', reloadEmpty: 'reloadEmpty' },
  bones: {
    frame: 'gun', slide: 'slide_j', trigger: 'trigger_j', hammer: 'hammer_j', magazine: 'mag_j',
    shootingHand: 'hand_R', supportHand: 'hand_L',
  },
  meshes: { arms: ['makarov_arms'] },
  // (In the `gun` node's space.)
  muzzle: [-0.0095, 0.091, -0.124],
  port: [0.0011, 0.0965, -0.0378],
  sights: { x: -0.0074, height: 0.1039, rearZ: 0.0084, frontZ: -0.1131, front: { x: -0.0102, height: 0.1037 } },
  // (How far it's held turned about its bore: degrees, its top towards the
  // left; it's aimed level.)
  cant: -4.22,
  // Where the `gun` node is at rest (the file's space).
  frame: [0.038, -0.1127, -0.3182],
  slideTravel: 0.0225,
  events: {
    shoot: { fire: 0 },
  },
};
