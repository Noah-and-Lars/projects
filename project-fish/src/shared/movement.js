// Player movement. Pure maths with no three.js or browser code, so the
// multiplayer server can run exactly the same code as the game.
//
// Coordinates: metres, Y is up. A yaw of 0 faces -Z, and yaw increases
// when turning left (the same convention as three.js cameras).

import { MOVEMENT, PLAYER, WORLD } from './config.js';

export const BUTTON_JUMP = 1 << 0;

export function createPlayerState() {
  return {
    x: 0,
    y: 0, // feet height; the baseplate is at 0
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    jumpBufferTimer: 0,
    prevButtons: 0,
  };
}

// An input command describes one tick of player input:
//   forward: -1..1 (S to W), right: -1..1 (A to D),
//   yaw / pitch: where the player is looking, in radians,
//   buttons: BUTTON_* flags held this tick.
export function emptyCommand() {
  return { forward: 0, right: 0, yaw: 0, pitch: 0, buttons: 0 };
}

// Advances the player by one tick of `dt` seconds.
export function simulatePlayer(s, cmd, dt) {
  const pressed = cmd.buttons & ~s.prevButtons;
  s.prevButtons = cmd.buttons;

  if (pressed & BUTTON_JUMP) s.jumpBufferTimer = MOVEMENT.jumpBuffer;

  // Direction the keys point in, relative to where the player is facing.
  let f = cmd.forward;
  let r = cmd.right;
  const len = Math.hypot(f, r);
  if (len > 1) {
    f /= len;
    r /= len;
  }
  const sin = Math.sin(cmd.yaw);
  const cos = Math.cos(cmd.yaw);
  const wishX = -sin * f + cos * r;
  const wishZ = -cos * f - sin * r;
  const hasInput = len > 0.001;

  if (s.grounded) {
    const targetX = wishX * MOVEMENT.walkSpeed;
    const targetZ = wishZ * MOVEMENT.walkSpeed;
    const accel = hasInput ? MOVEMENT.groundAccel : MOVEMENT.groundDecel;
    moveVelocityTowards(s, targetX, targetZ, accel * dt);

    if (s.jumpBufferTimer > 0) {
      s.vy = Math.sqrt(2 * MOVEMENT.gravity * MOVEMENT.jumpHeight);
      s.grounded = false;
      s.jumpBufferTimer = 0;
    }
  } else if (hasInput) {
    // In the air you can steer, but not speed up beyond your current
    // speed (or walking speed, whichever is higher).
    const speed = Math.max(Math.hypot(s.vx, s.vz), MOVEMENT.walkSpeed);
    moveVelocityTowards(s, wishX * speed, wishZ * speed, MOVEMENT.airAccel * dt);
  }

  // Constant gravity, integrated exactly so the jump height doesn't depend on the tick rate.
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  if (!s.grounded) {
    s.y += s.vy * dt - 0.5 * MOVEMENT.gravity * dt * dt;
    s.vy -= MOVEMENT.gravity * dt;
  }

  // Land on the baseplate.
  if (s.y <= 0) {
    s.y = 0;
    if (s.vy < 0) s.vy = 0;
    s.grounded = true;
  }

  // Invisible walls at the edges of the baseplate.
  const limit = WORLD.size / 2 - PLAYER.radius;
  if (s.x > limit) { s.x = limit; s.vx = Math.min(s.vx, 0); }
  if (s.x < -limit) { s.x = -limit; s.vx = Math.max(s.vx, 0); }
  if (s.z > limit) { s.z = limit; s.vz = Math.min(s.vz, 0); }
  if (s.z < -limit) { s.z = -limit; s.vz = Math.max(s.vz, 0); }

  s.jumpBufferTimer = Math.max(0, s.jumpBufferTimer - dt);
}

// Changes the horizontal velocity towards (tx, tz) by at most maxDelta.
function moveVelocityTowards(s, tx, tz, maxDelta) {
  const dx = tx - s.vx;
  const dz = tz - s.vz;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxDelta || dist === 0) {
    s.vx = tx;
    s.vz = tz;
  } else {
    s.vx += (dx / dist) * maxDelta;
    s.vz += (dz / dist) * maxDelta;
  }
}

export function horizontalSpeed(s) {
  return Math.hypot(s.vx, s.vz);
}
