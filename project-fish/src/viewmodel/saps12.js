// The twelfth gun: a Franchi SPAS-12, a 12-gauge combat shotgun (the
// download calls it "Saps-12"; its own skeleton is named for the SPAS-12,
// and by its shape it's one: a pump fore-end over a tube magazine under the
// barrel, a perforated heat shield over the barrel, a stamped steel stock
// folded over the top with its hook at the front, a pistol grip, and a
// loading port with a shell lifter underneath). It comes with its own
// gloved arms (the Hi-Power's maker's) and its own animations (assets/
// saps12.glb, made by tools/blender/convert_saps12.py from "FPS Character
// Animation Pack Saps-12" by Cristian David Duque Camacho, see README.md,
// Credits). It's played by animatedGun.js, its clips as its maker made
// them.
//
// The file's root is the eye its maker framed it from (the download's own
// camera). Its points are in the `gun` node on the receiver bone, which
// turns with the gun: its space is gun space (metres, +X right, +Y up, -Z
// forward) wherever the gun is. In the idle pose it's at `frame` (the
// file's space), held turned `hold` from straight ahead (a quaternion: 1.7°
// to the left, 3° down and 9.1° onto its left side); aimed, the gun layer
// turns the whole rig back by that (and lines up the sights: see sightLine
// in viewmodel.js), so it's aimed straight and level. Measured by the
// converter, which prints them (SAPS12 ...):
// - muzzle: the middle of the barrel's front face; port: the ejection
//   port, on the right of the receiver, where the spent hull leaves.
// - sights: the top of the rear sight (a blade on the receiver), the
//   middle, and the back faces of the rear and front sights; front: the top
//   of the front post (4.1 mm lower than the rear's).
//
// The clips (seconds), all ten as made:
// - idle (Idle, 2.5 s), walk (Walk, 0.96 s) and run (Run, 0.79 s): loops.
//   Its run is its maker's sprint carry, the gun swung across the body.
// - shoot (Fire, 1.63 s): a semi-automatic shot: the bolt starts back at
//   0.05 s (the shot goes off: each shot plays it from there), is fully
//   back at 0.125 (the hull flies out) and home at 0.24, while the gun
//   rocks up in its recoil and settles by 1.17.
// - pump (Accion_Fire, 1.25 s): the fore-end pumped, no shot: back at
//   0.125 s, forward from 0.5 and home at 0.58. Played after loading an
//   empty gun, to chamber the first shell.
// - reloadStart (IdleToReload, 1.0 s): the support hand leaves the fore-end
//   and the gun is turned onto its side, its loading port to the hand.
// - reload (Reload, 1.67 s): one shell pushed into the tube (in at 1.16 s),
//   the hand going back for the next; played once for each shell.
// - reloadEnd (ReloadToIdle, 0.92 s): turned back, the hand on the fore-end
//   at 0.61.
// - draw (Equip, 1.17 s): up into view, settled at 1.11. hide (Hold, 0.58
//   s): down out of view.
// (The reload clips don't quite join up: the hand moves 16 to 28 cm
// between the end of one and the start of the next, which animatedGun.js's
// fade from one clip to another smooths over.) No inspect.

export const MODEL_SAPS12 = {
  clips: {
    idle: 'idle', walk: 'walk', run: 'run', shoot: 'shoot', pump: 'pump',
    reloadStart: 'reloadStart', reload: 'reload', reloadEnd: 'reloadEnd', draw: 'draw', hide: 'hide',
  },
  bones: {
    frame: 'gun', slide: 'bolt_j', trigger: 'trigger_j', pump: 'pump_j',
    shootingHand: 'hand_R', supportHand: 'hand_L',
  },
  meshes: { arms: ['saps12_gloves', 'saps12_sleeves'] },
  // (In the `gun` node's space.)
  muzzle: [-0.0001, 0.051, -0.4569],
  port: [0.0352, 0.0483, 0.1557],
  sights: { x: -0.0001, height: 0.0898, rearZ: 0.0525, frontZ: -0.372, front: { x: -0.0001, height: 0.0857 } },
  // Where the `gun` node is in the idle pose (the file's space), and how
  // it's turned there (x, y, z, w).
  frame: [0.1145, -0.1973, -0.3909],
  hold: [-0.0245, 0.0169, 0.08, 0.9964],
  // Aimed, its idle is held at its start, where its sights were lined up
  // (its idle loop rocks it up and down by more than the sights' width).
  aimStill: 0,
  // Aimed, its shot clip plays at this share of its weight over that held
  // frame: at full weight its recoil rocks the gun up 37 degrees, which
  // aimed swings the sights right out of the top of the view; this much
  // keeps the rock (some 13 degrees) and the sights in view.
  aimShot: 0.35,
  // While one clip fades into the next (from one shell's reload to the
  // next's, say), its shell (moved by shell_ctrl) is where the clip coming in has it (see
  // noFade in animatedGun.js): each reload clip starts with it in the hand,
  // out of view, and the one before ends with it in the gun.
  noFade: ['shell_ctrl'],
  slideTravel: 0,
  events: {
    shoot: { fire: 0.05 },
    // It can fire once the draw has it settled.
    draw: { fire: 1.108 },
  },
};
