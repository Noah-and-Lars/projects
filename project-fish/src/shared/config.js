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
