// The fifth gun: a Browning Hi-Power, a 9 mm holding 13 rounds, which comes
// with its own gloved arms and its own animations (assets/hipistol.glb, made
// by tools/blender/convert_hipistol.py from "FPS Character Animation Pack
// Pistol" by Cristian David Duque Camacho, see README.md, Credits). It's
// played by animatedGun.js, its clips as its maker made them, and it's the
// only one whose maker made its aiming too: aimIdle, aimWalk and aimShoot
// play in place of idle, walk and shoot as the gun layer brings it up to
// the sights.
//
// (The download calls it "HIpistol". By its shape it's a Hi-Power: a ring
// hammer; the front third of the slide stepped down, narrower and lower;
// one thumb safety, at the back of the frame on the left; a round magazine
// catch behind the trigger guard; a short tang and no grip safety; one
// screw in each grip panel.)
//
// The file's root is the eye its maker framed it for (its arms' head
// bone): put it at the gun layer's camera and the gun is where its maker
// framed it. The game holds it a little further out and lower than that
// (its RIG in viewmodel.js). Its points are in the `gun` node on
// the frame bone, which in the aimed idle pose (aimIdle, where it's held
// straight) is gun space (metres, +X right, +Y up, -Z forward) moved to the
// frame bone (frame, below: where that is in the aimed idle pose, in the
// file's space, so the gun layer's aim lines up the sights of that pose).
// Measured by the converter, which prints them (HIPISTOL ...):
// - muzzle: the front of the barrel; port: the ejection port, on the right
//   of the slide, where the spent case leaves.
// - sights: the top of the rear sight (the front blade's is 0.7 mm higher),
//   their middle, and the back faces of the rear and front sights.
//
// The clips (seconds), all as made:
// - idle (Idle, 2.46 s) and aimIdle (Aim_Idle, 2.46 s): loops of the hands
//   breathing at the hip and aimed.
// - walk, aimWalk (Walk, Aim_Walk, 0.96 s) and run (Run, 0.75 s): loops
//   played in place of the idle (or aimed idle) pose walking and running.
//   Its run lowers the gun and swings it in across the chest: its maker's
//   sprint pose.
// - shoot (Fire) and aimShoot (Aim_Fire), 0.58 s each: the shot goes off at
//   once (the slide starts back at 0.008 s), the slide is fully back at
//   0.083 and home at 0.2. There's no pose with the slide locked back: its
//   slide goes home after every shot, the last one too.
// - reload (Reload, 2.71 s), the only one, for both: the magazine comes out
//   at 0.43 s, the support hand takes a fresh one at the belt (back from it
//   at 0.88), it's in at 1.8, and the support hand is back on the grip at
//   2.23. The slide doesn't move.
// - draw (Equip, 1.58 s): up from below, the support hand racking the slide
//   on the way (0.59 to 1.03 s); it's settled on target at 1.53.
// - hide (Hold, 0.5 s): straight down out of view.
// (The download's Change, 0.5 s, is a quick raise, Hold backwards; it's
// left out. There's no inspect.)

export const MODEL_HIPISTOL = {
  clips: {
    idle: 'idle', aimIdle: 'aimIdle', walk: 'walk', aimWalk: 'aimWalk', run: 'run',
    shoot: 'shoot', aimShoot: 'aimShoot', reload: 'reload', draw: 'draw', hide: 'hide',
  },
  bones: {
    frame: 'gun', slide: 'slide_j', trigger: 'trigger_j', hammer: 'hammer_j', magazine: 'mag_j',
    shootingHand: 'hand_R', supportHand: 'hand_L',
  },
  meshes: { arms: ['hipistol_gloves', 'hipistol_sleeves'] },
  // (In the `gun` node's space.)
  muzzle: [0, 0.0242, -0.1146],
  port: [0.0076, 0.0307, -0.0039],
  sights: { x: 0, height: 0.037, rearZ: 0.0581, frontZ: -0.0983 },
  // Where the `gun` node is in the aimed idle pose (the file's space).
  frame: [0, -0.0462, -0.4046],
  slideTravel: 0.038,
  events: {
    shoot: { fire: 0 }, // (aimShoot's too)
    // It can fire once the draw has it settled on target.
    draw: { fire: 1.525 },
  },
};
