// Gameplay values that the game and the future multiplayer server must agree on.
// Nothing in src/shared/ may use three.js or the browser, so a server can run it too.

// The game logic runs at a fixed rate, whatever the screen's frame rate.
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const PLAYER = {
  height: 1.8, // m, standing
  eyeHeight: 1.65, // m, camera height above the feet, standing
  radius: 0.35, // m, how wide the player is when bumping into things
  // How tall the player is (for bumping into things) and where the eyes are,
  // in each stance and move.
  heights: { stand: 1.8, crouch: 1.2, slide: 0.95, prone: 0.55, supine: 0.6, dive: 0.8 },
  eyes: { stand: 1.65, crouch: 1.08, slide: 0.82, prone: 0.38, supine: 0.48, dive: 0.65 },
  stepHeight: 0.35, // m, walks straight up anything this low
};

export const MOVEMENT = {
  walkSpeed: 5.0, // m/s
  // Speeds as fractions of walkSpeed.
  aimSpeedFactor: 0.6, // aiming down the sights
  sprintSpeedFactor: 1.36, // sprinting (hold Shift going forwards): 6.8 m/s
  tacSprintSpeedFactor: 1.68, // tactical sprint (double-tap Shift): 8.4 m/s, while stamina lasts
  backSpeedFactor: 0.75, // walking backwards
  strafeSpeedFactor: 0.9, // walking sideways
  crouchSpeedFactor: 0.5, // crouched
  crouchAimSpeedFactor: 0.35, // crouched and aiming
  proneSpeed: 0.9, // m/s, crawling
  groundAccel: 50, // m/s², how hard you speed up or change direction on the ground
  groundDecel: 40, // m/s², how hard you stop when you let go of the keys
  airAccel: 12, // m/s², how much you can steer in the air
  gravity: 20, // m/s², stronger than real life so jumps feel crisp
  jumpHeight: 1.0, // m
  jumpBuffer: 0.1, // s, a jump pressed this long before landing still happens
  coyoteTime: 0.1, // s, you can still jump this long after walking off an edge
  doubleTap: 0.3, // s, two presses this close together are a double tap

  // Changing stance: how fast the eyes move (m/s).
  stanceSpeed: { crouch: 4, prone: 1.5 },

  // Tactical sprint and stamina (plain sprinting never runs out).
  tacSprintTime: 4, // s from full to empty
  tacSprintMinStamina: 0.25, // needed to start one
  staminaRegenDelay: 0.6, // s after it stops
  staminaRegenTime: 3, // s from empty to full
  fatigueStart: 0.3, // below this much stamina it slows towards a plain sprint

  // Sliding: press C while sprinting.
  slideMinSprintTime: 0.15, // s of sprinting first
  slideMinSpeed: 5.5, // m/s
  slideBoost: 1.2, // speed at the start, times the sprint speed you had
  slideMaxStartSpeed: 9.6, // m/s
  slideFriction: 7, // m/s², how fast it slows
  slideTime: 0.75, // s at most
  slideSteer: 4, // m/s², how much you can steer
  slideJumpDelay: 0.15, // s into a slide before you can jump out of it
  slideCooldown: 0.3, // s before the next one (sprinting again)
  // Supine slide: double-tap C while sprinting. Longer and lower, ending on
  // your back; getting up takes a moment.
  supineBoost: 1.4,
  supineFriction: 5,
  supineTime: 1.1,
  supineRise: 0.55, // s

  // Diving: press Z while sprinting.
  diveMinSprintTime: 0.15,
  diveUp: 3.2, // m/s up at the start
  diveMaxSpeed: 9,
  diveFriction: 10, // m/s², sliding on your front after landing
  diveRecover: 0.45, // s before you can crawl after landing
  diveAfterJump: 0.35, // s after a jump before you can dive

  // Landing: falls from higher than this slow you a little for a moment.
  landSlowFall: 1.5, // m
  landSlow: { time: 0.15, factor: 0.7 },
  hardLandFall: 3.5, // m
  hardLand: { time: 0.35, factor: 0.5 },
  sprintLandKeep: 0.8, // landing while sprinting keeps at least this much speed

  // Mantling and vaulting (Space at a ledge, or automatically in the air).
  mantleProbe: 0.5, // m beyond the player's edge
  mantleReach: 2.1, // m above the feet (standing or in the air)
  vaultMaxHeight: 1.15, // m: lower, and thin enough, and you go over instead of onto
  vaultMaxDepth: 0.8, // m
  mantleTimes: { vault: 0.4, low: 0.45, mid: 0.55, high: 0.75 }, // s
};

export const WORLD = {
  size: 2000, // m, the baseplate is size × size, centred on 0,0
};

// The guns. Times in seconds, angles in degrees, distances in metres.
// The first pistol: a compact 9 mm, 15 rounds.
export const PISTOL = {
  name: 'PF-9',
  fireInterval: 0.12, // fastest the trigger can be pulled again (500 rounds a minute)
  magazine: 15,
  reserve: 60,
  reloadTime: 2.1, // with rounds left: the old magazine is caught and kept
  emptyReloadTime: 2.5, // from empty: the slide has to be released too
  range: 150,
  // How far shots can stray from where the gun points (half the cone's angle).
  spread: { hip: 1.8, aim: 0.12, moving: 1.2 }, // moving is added at full walking speed
  recoil: 1, // how hard it kicks (the view and the gun)
};

// The second pistol: a .45 in the style of the 1911. Fewer, slower, harder-
// kicking shots. (Its reload times match the first pistol's for now: the
// hands' reload is shared, see src/viewmodel/viewmodel.js.)
export const PISTOL45 = {
  name: 'PF-45',
  fireInterval: 0.17, // 350 rounds a minute at most
  magazine: 7,
  reserve: 35,
  reloadTime: 2.1,
  // From empty the support hand racks the slide (overhand, from the back)
  // after the magazine goes in, rather than the thumb dropping the slide
  // stop: a little longer. (Fractions of the reload; see RELOAD_STEPS in
  // src/weapon.js.)
  emptyReloadTime: 2.9,
  reloadSteps: {
    empty: { magOut: 0.086, magGrab: 0.31, magIn: 0.543, rackGrab: 0.69, rackPull: 0.735, slideRelease: 0.76, handOn: 0.9 },
  },
  range: 150,
  spread: { hip: 2.1, aim: 0.14, moving: 1.4 },
  recoil: 1.5,
  // Its inspect lingers longer on each thing it shows (extra seconds; see
  // INSPECT_HOLDS in src/weapon.js): 10.4 s in all instead of 7.2.
  inspectHolds: { right: 0.9, left: 0.9, magazine: 0.8, chamber: 0.6 },
};

// The guns the player carries, in the order of their keys (1, 2).
export const LOADOUT = ['pistol', 'pistol45'];
export const GUNS = { pistol: PISTOL, pistol45: PISTOL45 };
