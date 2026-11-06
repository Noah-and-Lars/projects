// The third gun: a Beretta 92FS, which comes with its own arms and its own
// animations (assets/beretta.glb, made by tools/blender/convert_beretta.py
// from "Beretta Pistol FPS ANIMATION" by BURNER, see README.md, Credits; the
// arms are a Mixamo character's). It's played by animatedGun.js, its clips
// as its maker made them. (A 92FS: an open-topped slide, the safety and
// decocker lever on the slide, a recurved trigger guard and no rail under
// the barrel, so not the railed 92A1, M9A1 or 92X.)
//
// The file's root is the eye the arms were posed for: put it at the gun
// layer's camera and the gun is where its maker framed it, low and a little
// right. The game holds it where the M1911's held at the hip (its RIG in
// viewmodel.js). Its points are in the `gun` node on the frame bone, which
// in the idle pose is gun space (metres, +X right, +Y up, -Z forward) moved
// to the frame bone (frame, below: where that is in the idle pose, in the
// file's space). Measured by the converter, which prints them (BERETTA ...):
// - muzzle: the front of the barrel; port: the ejection port, on the right
//   of the slide in front of the rear sight, where the spent case leaves.
// - sights: the tops of both sights (level with each other: the front
//   blade's top lines up with the rear's), their middle, and the back faces
//   of the rear and front sights.
//
// The clips (seconds; cut from the download's one 16.8 s timeline, where
// the gun holds still in its idle pose between them):
// - idle: a still (1.5 s on the timeline). idleEmpty: a still with the
//   slide locked back (11.93 s), where shootLast ends.
// - draw (0.03-1.33 s): the gun comes up from low on the left, out of
//   sight at first, the support hand racks the slide on the way (0.01 to
//   0.36 s), and it's on target at 0.98 and settled at 1.1.
// - inspect (1.67-6.7 s): the gun is turned to show its right side, then
//   its left, and back. Nothing else moves.
// - shoot (7.5-8.13 s): the trigger is pulled, the shot goes off at 0.067 s
//   (the slide starts back), the slide is home at 0.18 and the hands have
//   settled at the end. shootLast (11.33-11.87 s): the same, going off at
//   0.033 s, the slide staying back.
// - reload (8.33-11.03 s), with rounds left: the magazine comes out at
//   0.34 s, is swapped at the belt and back in at 1.43; the hands are back
//   in the idle pose by the end.
// - reloadEmpty (12.0-16.03 s), slide locked back: the magazine is let go
//   at 0.1 s and falls away, the fresh one is in the support hand from about 0.65 and
//   in at 1.76; the support hand pulls the slide back the last bit (2.62)
//   and lets it go (2.77, home at 2.86), and the hands settle by the end.
// - hide (16.33-16.83 s): the gun leaves at once and is down out of sight
//   at the end.

export const MODEL_BERETTA = {
  clips: {
    idle: 'idle', idleEmpty: 'idleEmpty', draw: 'draw', hide: 'hide', inspect: 'inspect',
    shoot: 'shoot', shootLast: 'shootLast', reload: 'reload', reloadEmpty: 'reloadEmpty',
  },
  bones: {
    frame: 'gun', slide: 'slide_j', trigger: 'trigger_j', magazine: 'mag_j',
    shootingHand: 'hand_R', supportHand: 'hand_L',
  },
  meshes: { arms: ['arms'] },
  // (In the `gun` node's space.)
  muzzle: [0, 0.0182, -0.1235],
  port: [0.0134, 0.0202, 0.0129],
  sights: { x: 0, height: 0.0312, rearZ: 0.0579, frontZ: -0.1104 },
  // Where the `gun` node is in the idle pose (the file's space).
  frame: [0.0341, -0.1135, -0.3423],
  slideTravel: 0.0444,
  events: {
    shoot: { fire: 0.067 },
    shootLast: { fire: 0.033 },
    // It can fire once the draw has it settled on target.
    draw: { fire: 1.1 },
  },
};
