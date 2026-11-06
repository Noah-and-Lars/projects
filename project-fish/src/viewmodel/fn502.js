// The fourth gun: an FN 502 Tactical, a .22 LR pistol (a threaded barrel and
// a slide cut for an optic, under a cover plate), which comes with its own
// gloved arms and its own animations (assets/fn502.glb, made by tools/
// blender/convert_fn502.py from "FPS animations FN 502 Tactical" by Cransh,
// see README.md, Credits). It's played by animatedGun.js, its clips as its
// maker made them.
//
// The file's root is the eye its maker framed it from (the download's own
// camera): put it at the gun layer's camera and the gun is where its maker
// framed it. The game holds it a little further out and lower than that,
// as far as its arms' cut-off ends stay out of view (its RIG in
// viewmodel.js). Its points are in the `gun` node on
// the frame bone, which in the idle pose is gun space (metres, +X right, +Y
// up, -Z forward) moved to the frame bone (frame, below: where that is in
// the idle pose, in the file's space). The gun is held turned 7.5° onto its
// left side, so the sights are a little left of the bore. Measured by the
// converter, which prints them (FN502 ...):
// - muzzle: the front of the thread protector; port: the ejection port, on
//   the right of the slide, where the spent case leaves.
// - sights: the top of the rear sight (the front blade's is 1.8 mm lower),
//   their middle, and the back faces of the rear and front sights.
//
// The clips (seconds), all five as made, each starting and ending in the
// pose it rests in:
// - idle: a still, the first frame of the shot (the pose every clip starts
//   in). There's no pose with the slide locked back: its slide always goes
//   home after a shot, empty or not.
// - shoot (FN_Shot, 0.48 s): the shot goes off at once (the slide starts
//   back at 0.008 s), the slide is home at 0.19 and the hands have settled
//   by the end.
// - reload (FN_Reload, 1.98 s), with rounds left: the magazine comes out at
//   0.23 s, is swapped at the belt (back from it at 0.62) and in at 1.33;
//   the support hand is back on the grip at 1.61. The slide doesn't move.
// - reloadEmpty (FN_ReloadFull, 2.98 s): the same until the magazine is in,
//   then the support hand reaches over the slide, pulls it back (1.83 to
//   1.93 s) and lets it go (1.98, home at 2.06), and is back on the grip at
//   2.59.
// - walk (FN_Walk, 1.32 s) and run (FN_Run, 0.65 s): loops of the hands'
//   sway, played in place of the idle pose while walking and running.
// No draw, put-away or inspect clips: switching to and from it, the gun
// layer lowers and raises it as it does the other guns, held in its idle
// pose, and it has no inspect.

export const MODEL_FN502 = {
  clips: { idle: 'idle', shoot: 'shoot', reload: 'reload', reloadEmpty: 'reloadEmpty', walk: 'walk', run: 'run' },
  bones: {
    frame: 'gun', slide: 'slide_j', trigger: 'trigger_j', hammer: 'hammer_j', magazine: 'mag_j',
    shootingHand: 'hand_R', supportHand: 'hand_L',
  },
  meshes: { arms: ['fn502_arms'] },
  // (In the `gun` node's space.)
  muzzle: [-0.0024, 0.0186, -0.0467],
  port: [0.0064, 0.0338, 0.0453],
  sights: { x: -0.0053, height: 0.0404, rearZ: 0.1203, frontZ: -0.0176 },
  // Where the `gun` node is in the idle pose (the file's space).
  frame: [0.0457, -0.0619, -0.3628],
  slideTravel: 0.0335,
  events: {
    shoot: { fire: 0 },
  },
};
