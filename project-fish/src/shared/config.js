// Gameplay values that the game and the future multiplayer server must agree on.
// Nothing in src/shared/ may use three.js or the browser, so a server can run it too.

// The game logic runs at a fixed rate, whatever the screen's frame rate.
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const PLAYER = {
  height: 1.8, // m
  eyeHeight: 1.65, // m, camera height above the feet
  radius: 0.35, // m, how wide the player is when bumping into things
};

export const MOVEMENT = {
  walkSpeed: 5.0, // m/s
  aimSpeedFactor: 0.55, // walking speed while aiming down the sights, as a fraction of walkSpeed
  sprintSpeedFactor: 1.5, // running speed while sprinting (hold Shift going forwards), as a fraction of walkSpeed
  groundAccel: 50, // m/s², how hard you speed up or change direction on the ground
  groundDecel: 40, // m/s², how hard you stop when you let go of the keys
  airAccel: 12, // m/s², how much you can steer in the air
  gravity: 20, // m/s², stronger than real life so jumps feel crisp
  jumpHeight: 1.0, // m
  jumpBuffer: 0.1, // s, a jump pressed this long before landing still happens
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
  emptyReloadTime: 2.5,
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
