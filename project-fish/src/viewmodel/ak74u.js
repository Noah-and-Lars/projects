// The eleventh gun: an AK-74U (by its shape an AKS-74U: a cylindrical
// muzzle booster, the front sight close behind it, a flip rear sight on the
// hinged top cover, a triangular stock folding to the side, a 5.45 mm
// magazine), fully automatic, which comes with its own arms in a hoodie (a
// Mixamo character's) and its own animations (assets/ak74u.glb, made by
// tools/blender/convert_ak74u.py from "AK74U | FREE ANIMATION." by BURNER,
// see README.md, Credits; the same maker as the Beretta's). It's played by
// animatedGun.js, its clips as its maker made them.
//
// The download has no camera: the file's root is an eye put straight above
// the arms' neck, where the head would be. Put it at the gun layer's camera
// and the carbine is held where its maker posed it, level. Its points are
// in the `gun` node on the frame bone, which in the idle pose is gun space
// (metres, +X right, +Y up, -Z forward) moved to the frame bone (frame,
// below: where that is then, in the file's space). Measured by the
// converter (its report):
// - muzzle: the front of the muzzle booster; port: the ejection port, on
//   the right of the receiver, where the spent case leaves.
// - sights: the top of the rear sight (its notch's bottom is 2.1 mm lower:
//   the front post's top is held level with the rear sight's top), the
//   middle, and the rear sight and the front post along the gun; front: the
//   top of the front post. (The sights look 1.9° lower than the bore: the
//   gun layer aims by them.)
//
// The clips (seconds), all seven as made, each starting and ending in the
// idle pose but for the start of draw and the end of hide:
// - idle (IDLE, 16.5 s): a long loop of the hands breathing; the support
//   hand shifts its grip once (6.84 to 6.98 s).
// - draw (DRAW, 0.8 s): up into view, settled at 0.52. hide (OLSER, 0.47
//   s): down out of view.
// - inspect (INSPEC, 4.63 s): the carbine is turned over to look at, the
//   support hand off it from 2.05 to 3.9 s.
// - shoot (SHOOT, 0.47 s): the shot goes off at once, the carbine kicks
//   back 32 mm (furthest at 0.033 s) and its muzzle climbs 3° (at 0.1),
//   settling by 0.32. The bolt doesn't move.
// - reload (RELOAD1, 2.23 s), with rounds left: the magazine catch is
//   pressed (0.38 s), the old magazine comes out (0.43), the fresh one is
//   in at 1.47, and the support hand is back at 1.92. The bolt doesn't
//   move.
// - reloadEmpty (RELOAD2, 3.47 s): a fresh magazine is in the support hand
//   from 0.13 s; the empty one (a second magazine, mag2) is knocked out of
//   the well at 0.68 and dropped, the fresh one is in at 1.27, then the
//   charging handle is pulled back (2.21 to 2.43 s) and let go (home at
//   2.63).
// No walk or run clips: it takes the gun layer's walking bob and sprint
// pose, as the PF-9 does.

export const MODEL_AK74U = {
  clips: {
    idle: 'idle', draw: 'draw', hide: 'hide', inspect: 'inspect', shoot: 'shoot',
    reload: 'reload', reloadEmpty: 'reloadEmpty',
  },
  bones: {
    frame: 'gun', slide: 'bolt_j', trigger: 'trigger_j', magazine: 'mag_j',
    shootingHand: 'hand_R', supportHand: 'hand_L',
  },
  meshes: { arms: ['ak74u_hands', 'ak74u_sleeves'] },
  // (In the `gun` node's space.)
  muzzle: [0, 0.0237, -0.4414],
  port: [0.0178, 0.0487, -0.1413],
  sights: { x: 0, height: 0.0795, rearZ: -0.125, frontZ: -0.3552, front: { x: 0.0003, height: 0.072 } },
  // Where the `gun` node is in the idle pose (the file's space).
  frame: [0.0748, -0.1054, -0.2055],
  // Aimed, its idle is held at its start, where its sights were lined up
  // (its long idle loop turns it by up to 4°).
  aimStill: 0,
  slideTravel: 0.122,
  events: {
    shoot: { fire: 0 },
    // It can fire once the draw has it settled.
    draw: { fire: 0.517 },
  },
};
