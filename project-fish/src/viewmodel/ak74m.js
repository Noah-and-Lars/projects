// The tenth gun: an AK-74M, a 5.45x39 mm assault rifle with a 30-round
// magazine, fully automatic, which comes with its own gloved arms and its
// own animations (assets/ak74m.glb, made by tools/blender/convert_ak74m.py
// from "FPS AK-74m animations" by Cransh, see README.md, Credits; the same
// maker's arms as the FN 502's and the Makarov's). It's played by
// animatedGun.js, its clips as its maker made them.
//
// The file's root is the eye its maker framed it from (the download's own
// camera): put it at the gun layer's camera and the rifle is where its
// maker framed it, shouldered. Its points are in the `gun` node on the
// frame bone, which in the idle pose is gun space (metres, +X right, +Y up,
// -Z forward) moved to the frame bone (frame, below: where that is then, in
// the file's space). The rifle is held turned 6.2° onto its left side
// (cant) and 1.5° to the left, so its front sight is a little left of
// where its rear sight's notch looks; aimed, the gun layer turns the whole
// rig back level and straight (aimLevel, and sights.front: see sightLine in
// viewmodel.js), so the front post sits in the notch. Measured by the
// converter, which prints them (AK74M ...):
// - muzzle: the middle of the muzzle brake's front face; port: the
//   ejection port, on the right of the receiver, where the spent case
//   leaves.
// - sights: the top of the rear sight's leaf (the notch's bottom is 2.1 mm
//   lower: the front post's top is held level with the leaf's top), the
//   notch's middle, and the back faces of the rear leaf and the front post;
//   front: the top of the front post.
//
// The clips (seconds), all eight as made, each starting and ending in the
// pose it rests in:
// - idle (AK_Idle, 1.98 s): a loop of the hands breathing.
// - walk (AK_Walk, 0.98 s) and run (AK_Run, 0.4 s): loops played in place
//   of the idle pose walking and running. Its run is its maker's sprint
//   carry, the rifle swung in close across the view.
// - draw (AK_Draw, 0.65 s): up into view; the support hand is on the
//   handguard at 0.44 and the shooting hand settled at 0.58.
// - shoot (AK_Shot, 0.32 s): the shot goes off at once (the bolt carrier
//   starts back at 0.017 s), it's fully back at 0.058 and home at 0.116,
//   and the kick has settled by 0.15. A burst plays it again from its
//   start with every round, the carrier still part way back.
// - reload (AK_Reload, 2.65 s), with rounds left: the support hand fetches
//   a fresh magazine and knocks the old one out with it (1.15 s), and it's
//   seated at 1.9; the hand is back on the handguard at 2.18. (The fresh
//   magazine is a second one, mag2, till it's seated; then the rifle's own
//   takes its place, 2 mm off.)
// - reload2 (AK_Reload_var2, 2.82 s), with rounds left, taking turns with
//   the first (see reloadTurns in src/shared/config.js): the old magazine
//   is pulled first (0.95 s) and stowed, the fresh one seated at 1.64; the
//   hand is back at 2.55. (The swap back to the rifle's own magazine, at
//   2.25, moves it 5 mm.)
// - reloadEmpty (AK_Reload_full, 3.5 s): as the first until the fresh
//   magazine is in, then the support hand reaches over and pulls the
//   charging handle back (2.47 to 2.49 s) and lets it go (home at 2.62),
//   and is back on the handguard at 3.12.
// No put-away, inspect or empty-rest clips: put away, it's lowered out of
// view as the other guns are, held in its idle pose, and it has no
// inspect. (Its bolt goes home after every shot, the last one too.)

export const MODEL_AK74M = {
  clips: {
    idle: 'idle', draw: 'draw', walk: 'walk', run: 'run', shoot: 'shoot',
    reload: 'reload', reload2: 'reload2', reloadEmpty: 'reloadEmpty',
  },
  bones: {
    frame: 'gun', slide: 'bolt_j', trigger: 'trigger_j', magazine: 'mag_j',
    shootingHand: 'hand_R', supportHand: 'hand_L',
  },
  meshes: { arms: ['ak74m_arms'] },
  // (In the `gun` node's space.)
  muzzle: [-0.0126, -0.0014, -0.4946],
  port: [0.0157, 0.0213, -0.0034],
  sights: { x: -0.0063, height: 0.0486, rearZ: -0.0382, frontZ: -0.3952, front: { x: -0.015, height: 0.0447 } },
  // (How far it's held turned about its bore: degrees, as the Makarov's;
  // it's aimed level.)
  cant: -6.23,
  // Where the `gun` node is at rest (the file's space).
  frame: [0.0301, -0.0794, -0.2356],
  slideTravel: 0.081,
  events: {
    shoot: { fire: 0 },
    // It can fire once the draw has the shooting hand settled.
    draw: { fire: 0.582 },
  },
};
