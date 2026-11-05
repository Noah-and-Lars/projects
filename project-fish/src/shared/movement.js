// Player movement. Pure maths with no three.js or browser code, so the
// multiplayer server can run exactly the same code as the game.
//
// Coordinates: metres, Y is up. A yaw of 0 faces -Z, and yaw increases
// when turning left (the same convention as three.js cameras).
//
// What the player can do:
// - Walk (slower backwards and sideways), sprint (Shift going forwards) and
//   tactical sprint (double-tap Shift): faster, while stamina lasts, slowing
//   towards a plain sprint as it runs out. Plain sprinting never tires.
// - Crouch (C) and go prone (Z); Space stands up. Standing up needs room
//   overhead.
// - Slide (C while sprinting), and jump out of it to keep the speed (a slide
//   cancel). Double-tap C while sprinting for a longer, lower slide on your
//   back, which takes a moment to get up from.
// - Dive (Z while sprinting): a low leap forward, landing prone.
// - Jump, land on top of boxes, step up anything low, and mantle: Space at a
//   ledge (or in the air, moving towards one) climbs onto it, or vaults over
//   it if it's low and thin. You keep your speed coming out (and C during a
//   vault goes straight into a slide).
// - Landing from high up slows you for a moment.

import { MOVEMENT, PLAYER, WORLD } from './config.js';
import { COLLIDERS } from './map.js';

export const BUTTON_JUMP = 1 << 0;
export const BUTTON_AIM = 1 << 1;
export const BUTTON_SPRINT = 1 << 2;
export const BUTTON_CROUCH = 1 << 3;
export const BUTTON_PRONE = 1 << 4;
// The Shift key itself, held (BUTTON_SPRINT is Shift when sprinting is
// allowed: not while aiming or just after a shot). Double taps go by this.
export const BUTTON_SPRINT_KEY = 1 << 5;

export function createPlayerState() {
  return {
    x: 0,
    y: 0, // feet height; the baseplate is at 0
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    sprinting: false,
    tacSprint: false,
    stamina: 1, // tactical sprint, 0..1
    staminaWait: 0, // s before it starts coming back
    sprintTime: 0, // s of sprinting so far
    sprintHeld: false, // Shift is still down from a sprint that C crouched out of
    stance: 'stand', // 'stand', 'crouch' or 'prone'
    move: 'ground', // 'ground', 'air', 'slide', 'supine', 'rise', 'dive', 'mantle'
    moveTime: 0, // s in this move
    height: PLAYER.heights.stand, // for bumping into things
    eye: PLAYER.eyeHeight, // above the feet
    slideCooldown: 0,
    mantle: null, // { from, to, peak, time, duration, exit: [vx, vz], slide, vault }
    landSlow: 0, // s of landing slowdown left
    landFactor: 1,
    fallFrom: 0, // where a fall started (feet height)
    landings: 0, // counts landings, for the game's effects
    lastLandSpeed: 0, // m/s, the latest one
    sinceGround: 0, // s since last on the ground
    sinceJump: 9,
    jumpBufferTimer: 0,
    sprintTap: 9, // s since Shift was last let go after sprinting
    crouchTap: 9, // s since C was last pressed
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

// Whether the player is lying or sliding low (the gun can't come up fully).
export function isLow(s) {
  return s.move === 'slide' || s.move === 'supine' || s.move === 'rise' || s.move === 'dive' || s.stance === 'prone';
}

// Advances the player by one tick of `dt` seconds.
export function simulatePlayer(s, cmd, dt) {
  const pressed = cmd.buttons & ~s.prevButtons;
  const released = s.prevButtons & ~cmd.buttons;
  s.prevButtons = cmd.buttons;
  s.moveTime += dt;
  s.sinceJump += dt;
  s.sprintTap += dt;
  s.crouchTap += dt;
  s.slideCooldown = Math.max(0, s.slideCooldown - dt);
  s.landSlow = Math.max(0, s.landSlow - dt);
  const aiming = Boolean(cmd.buttons & BUTTON_AIM);

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
  const faceX = -sin;
  const faceZ = -cos;

  if (s.move === 'mantle') {
    stepMantle(s, cmd, pressed, dt);
    finishTick(s, dt);
    return;
  }

  // --- Sprinting --------------------------------------------------------------
  // Only going forwards (straight or at an angle), standing, not aiming. It
  // starts on the ground and keeps going through a jump. A second press of
  // Shift soon after letting it go is a tactical sprint, while stamina lasts.
  const free = s.move === 'ground' || s.move === 'air';
  const wantsSprint = Boolean(cmd.buttons & BUTTON_SPRINT) && !aiming && cmd.forward > 0 && free;
  // (The double tap is of the Shift key itself, so aiming for a moment
  // while sprinting doesn't count as one. A command without the key's own
  // bit, from older code, uses the sprint button.)
  const key = cmd.buttons & (BUTTON_SPRINT_KEY | BUTTON_SPRINT) ? (cmd.buttons & BUTTON_SPRINT_KEY ? BUTTON_SPRINT_KEY : BUTTON_SPRINT) : BUTTON_SPRINT_KEY;
  if ((pressed & key) && s.sprintTap < MOVEMENT.doubleTap && s.stamina >= MOVEMENT.tacSprintMinStamina) s.tacSprint = true;
  if (released & key) s.sprintTap = s.sprinting ? 0 : 9;
  // C while sprinting that can't slide yet crouches you, and holding Shift
  // doesn't stand you straight back up: press it again to sprint.
  if (pressed & key) s.sprintHeld = false;
  const sprinting = wantsSprint && !s.sprintHeld && (s.grounded || s.sprinting);
  if (sprinting && s.stance !== 'stand') {
    // Sprinting gets you up (if there's room).
    if (fits(s.x, s.y, s.z, PLAYER.heights.stand)) s.stance = 'stand';
  }
  s.sprinting = Boolean(sprinting && s.stance === 'stand');
  if (!s.sprinting) s.tacSprint = false;
  s.sprintTime = s.sprinting ? s.sprintTime + dt : 0;
  if (s.tacSprint) {
    s.stamina = Math.max(0, s.stamina - dt / MOVEMENT.tacSprintTime);
    s.staminaWait = MOVEMENT.staminaRegenDelay;
    if (s.stamina === 0) s.tacSprint = false;
  } else if (s.staminaWait > 0) {
    s.staminaWait = Math.max(0, s.staminaWait - dt);
  } else {
    s.stamina = Math.min(1, s.stamina + dt / MOVEMENT.staminaRegenTime);
  }

  // --- Stance, slides and dives --------------------------------------------------
  const speed = Math.hypot(s.vx, s.vz);
  if (pressed & BUTTON_CROUCH) {
    const doubleTap = s.crouchTap < MOVEMENT.doubleTap;
    s.crouchTap = 0;
    if (s.sprinting && s.grounded && s.sprintTime >= MOVEMENT.slideMinSprintTime && speed >= MOVEMENT.slideMinSpeed && s.slideCooldown === 0) {
      startSlide(s, speed, false);
    } else if (s.sprinting && s.move === 'ground') {
      // Too soon into the sprint to slide: crouch, and stop sprinting.
      s.stance = 'crouch';
      s.sprinting = s.tacSprint = false;
      s.sprintHeld = true;
    } else if (s.move === 'slide' && doubleTap && s.moveTime < 0.25) {
      // The second tap of a double tap, just into a slide: onto your back.
      startSlide(s, Math.hypot(s.vx, s.vz) / MOVEMENT.slideBoost, true);
    } else if (s.move === 'ground') {
      if (s.stance === 'crouch') {
        if (fits(s.x, s.y, s.z, PLAYER.heights.stand)) s.stance = 'stand';
      } else if (s.stance === 'stand' || fits(s.x, s.y, s.z, PLAYER.heights.crouch)) {
        s.stance = 'crouch';
      }
    }
  }
  if (pressed & BUTTON_PRONE) {
    if (s.sprinting && s.grounded && s.sprintTime >= MOVEMENT.diveMinSprintTime && s.sinceJump > MOVEMENT.diveAfterJump) {
      startDive(s, speed, faceX, faceZ);
    } else if (s.move === 'ground' || s.move === 'slide') {
      if (s.stance === 'prone') {
        if (fits(s.x, s.y, s.z, PLAYER.heights.stand)) s.stance = 'stand';
        else if (fits(s.x, s.y, s.z, PLAYER.heights.crouch)) s.stance = 'crouch';
      } else {
        s.stance = 'prone';
        if (s.move === 'slide') setMove(s, 'ground');
      }
    }
  }

  // --- Moving -----------------------------------------------------------------
  if (s.move === 'slide' || s.move === 'supine') {
    stepSlide(s, cmd, pressed, wishX, wishZ, hasInput, dt);
  } else if (s.move === 'rise') {
    // Getting up off your back.
    moveVelocityTowards(s, 0, 0, MOVEMENT.groundDecel * dt);
    if (s.moveTime >= MOVEMENT.supineRise) setMove(s, 'ground');
  } else if (s.move === 'dive') {
    stepDive(s, dt);
  } else {
    // Walking speed, slower backwards and sideways (an ellipse between them).
    let top = MOVEMENT.walkSpeed;
    if (hasInput) {
      const ff = f >= 0 ? f : f * MOVEMENT.backSpeedFactor;
      const rr = r * MOVEMENT.strafeSpeedFactor;
      top *= Math.hypot(ff, rr) / Math.hypot(f, r);
    }
    if (s.stance === 'prone') top = MOVEMENT.proneSpeed;
    else if (s.stance === 'crouch') top *= aiming ? MOVEMENT.crouchAimSpeedFactor : MOVEMENT.crouchSpeedFactor;
    else if (aiming) top *= MOVEMENT.aimSpeedFactor;
    else if (s.sprinting) {
      let sprint = MOVEMENT.sprintSpeedFactor;
      if (s.tacSprint) {
        const fresh = Math.min(1, s.stamina / MOVEMENT.fatigueStart);
        sprint += (MOVEMENT.tacSprintSpeedFactor - MOVEMENT.sprintSpeedFactor) * fresh;
      }
      top = MOVEMENT.walkSpeed * sprint;
    }
    if (s.landSlow > 0) top *= s.landFactor;

    if (s.grounded) {
      const accel = hasInput ? MOVEMENT.groundAccel : MOVEMENT.groundDecel;
      moveVelocityTowards(s, wishX * top, wishZ * top, accel * dt);
      if (s.jumpBufferTimer > 0) {
        if (s.stance !== 'stand') {
          // Space stands you up.
          if (fits(s.x, s.y, s.z, PLAYER.heights.stand)) s.stance = 'stand';
          s.jumpBufferTimer = 0;
        } else if (!tryMantle(s, faceX, faceZ, pressed, true)) {
          jump(s);
        }
      }
    } else {
      if (s.sinceGround < MOVEMENT.coyoteTime && s.jumpBufferTimer > 0 && s.vy <= 0 && s.stance === 'stand') {
        jump(s);
      } else if (hasInput) {
        // In the air you can steer, but not speed up beyond your current
        // speed (or walking speed, whichever is higher).
        const most = Math.max(Math.hypot(s.vx, s.vz), top);
        moveVelocityTowards(s, wishX * most, wishZ * most, MOVEMENT.airAccel * dt);
      }
      // Moving towards a ledge in the air (or pressing Space at one) climbs it.
      if (s.move === 'air' && (f > 0 || s.jumpBufferTimer > 0) && s.vy < 2.5) tryMantle(s, faceX, faceZ, pressed, false);
    }
  }
  if (s.move === 'mantle') {
    finishTick(s, dt);
    return;
  }

  // --- Moving through the world ------------------------------------------------
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  const wasGrounded = s.grounded;
  if (!s.grounded) {
    s.y += s.vy * dt - 0.5 * MOVEMENT.gravity * dt * dt;
    s.vy -= MOVEMENT.gravity * dt;
    s.fallFrom = Math.max(s.fallFrom, s.y); // a fall is from its highest point
  }
  for (const box of COLLIDERS) collideWithBox(s, box);
  const floor = floorAt(s.x, s.z, s.y + PLAYER.stepHeight);
  if (s.grounded) {
    if (floor < s.y - 0.02) {
      // Walked off an edge.
      s.grounded = false;
      s.vy = 0;
      s.fallFrom = s.y;
      if (s.move === 'ground') setMove(s, 'air');
      // (A slide carries on over a small drop: gravity takes it down and it
      // keeps sliding when it lands.)
    } else {
      s.y = floor; // steps up anything low enough
    }
  }
  if (!s.grounded) {
    // Bumping your head.
    const ceiling = ceilingAt(s.x, s.z, s.y);
    if (s.y + s.height > ceiling) {
      s.y = ceiling - s.height;
      if (s.vy > 0) s.vy = 0;
    }
    if (s.y <= floor && s.vy <= 0) {
      s.y = floor;
      s.vy = Math.min(s.vy, 0);
      land(s, wasGrounded);
    }
  }

  // Invisible walls at the edges of the baseplate.
  const limit = WORLD.size / 2 - PLAYER.radius;
  if (s.x > limit) { s.x = limit; s.vx = Math.min(s.vx, 0); }
  if (s.x < -limit) { s.x = -limit; s.vx = Math.max(s.vx, 0); }
  if (s.z > limit) { s.z = limit; s.vz = Math.min(s.vz, 0); }
  if (s.z < -limit) { s.z = -limit; s.vz = Math.max(s.vz, 0); }

  finishTick(s, dt);
}

// The height (for bumping into things) and eye height the player is easing
// towards, and the rest of the tick's bookkeeping.
function finishTick(s, dt) {
  const shape = { slide: 'slide', supine: 'supine', rise: 'crouch', dive: 'dive' }[s.move] || s.stance;
  const height = PLAYER.heights[shape];
  // Growing needs room; shrinking is immediate.
  if (height <= s.height || fits(s.x, s.y, s.z, height)) s.height = height;
  const eye = Math.min(PLAYER.eyes[shape], s.height - 0.12);
  const rate = s.move === 'slide' || s.move === 'supine' || s.move === 'dive' ? 6 : shape === 'prone' || s.stance === 'prone' ? MOVEMENT.stanceSpeed.prone : MOVEMENT.stanceSpeed.crouch;
  s.eye += Math.max(-rate * dt, Math.min(rate * dt, eye - s.eye));
  s.sinceGround = s.grounded ? 0 : s.sinceGround + dt;
  s.jumpBufferTimer = Math.max(0, s.jumpBufferTimer - dt);
}

function setMove(s, move) {
  s.move = move;
  s.moveTime = 0;
}

function jump(s) {
  s.vy = Math.sqrt(2 * MOVEMENT.gravity * MOVEMENT.jumpHeight);
  s.grounded = false;
  s.jumpBufferTimer = 0;
  s.sinceJump = 0;
  s.fallFrom = s.y;
  setMove(s, 'air');
}

function land(s, wasGrounded) {
  if (wasGrounded) return;
  s.grounded = true;
  const fall = s.fallFrom - s.y;
  s.lastLandSpeed = Math.sqrt(Math.max(0, 2 * MOVEMENT.gravity * Math.max(0, s.fallFrom - s.y)));
  s.landings++;
  if (s.move === 'dive') {
    s.stance = 'prone';
    setMove(s, 'dive');
    s.diveLanded = true;
    return;
  }
  if (s.move === 'air') setMove(s, 'ground');
  if (s.move === 'slide' || s.move === 'supine') return; // landed still sliding
  const keep = s.sprinting ? MOVEMENT.sprintLandKeep : 0;
  if (fall >= MOVEMENT.hardLandFall) {
    s.landSlow = MOVEMENT.hardLand.time;
    s.landFactor = Math.max(keep, MOVEMENT.hardLand.factor);
  } else if (fall >= MOVEMENT.landSlowFall) {
    s.landSlow = MOVEMENT.landSlow.time;
    s.landFactor = Math.max(keep, MOVEMENT.landSlow.factor);
  }
}

function startSlide(s, speed, supine) {
  const boost = supine ? MOVEMENT.supineBoost : MOVEMENT.slideBoost;
  const start = Math.min(MOVEMENT.slideMaxStartSpeed * (supine ? 1.1 : 1), speed * boost);
  const len = Math.hypot(s.vx, s.vz) || 1;
  s.vx = (s.vx / len) * start;
  s.vz = (s.vz / len) * start;
  s.stance = 'crouch';
  s.sprinting = s.tacSprint = false;
  setMove(s, supine ? 'supine' : 'slide');
}

// Sliding: slowing down, steering a little; jump out of it (after a
// moment) to keep going at speed, or it ends crouched (or, on your back,
// getting up).
function stepSlide(s, cmd, pressed, wishX, wishZ, hasInput, dt) {
  const supine = s.move === 'supine';
  let speed = Math.hypot(s.vx, s.vz);
  const friction = supine ? MOVEMENT.supineFriction : MOVEMENT.slideFriction;
  speed = Math.max(0, speed - friction * dt);
  let dx = s.vx;
  let dz = s.vz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  if (hasInput && !supine) {
    // Steering: turns the slide a little towards the keys.
    const side = wishX * -dz + wishZ * dx;
    const turn = (side * MOVEMENT.slideSteer * dt) / Math.max(speed, 1);
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c];
  }
  s.vx = dx * speed;
  s.vz = dz * speed;
  const duration = supine ? MOVEMENT.supineTime : MOVEMENT.slideTime;
  if (!supine && s.grounded && s.jumpBufferTimer > 0 && s.moveTime >= MOVEMENT.slideJumpDelay && fits(s.x, s.y, s.z, PLAYER.heights.stand)) {
    // Out of the slide at speed: a slide cancel.
    s.stance = 'stand';
    s.slideCooldown = MOVEMENT.slideCooldown;
    jump(s);
    const most = MOVEMENT.walkSpeed * MOVEMENT.sprintSpeedFactor;
    if (speed > most) {
      s.vx *= most / speed;
      s.vz *= most / speed;
    }
    return;
  }
  if (s.moveTime >= duration || speed < MOVEMENT.walkSpeed * MOVEMENT.crouchSpeedFactor) {
    s.slideCooldown = MOVEMENT.slideCooldown;
    if (supine) {
      // Up off your back (if there's room to crouch; else onto your front).
      if (fits(s.x, s.y, s.z, PLAYER.heights.crouch)) {
        s.stance = 'crouch';
        setMove(s, 'rise');
      } else {
        s.stance = 'prone';
        setMove(s, 'ground');
      }
    } else {
      setMove(s, s.grounded ? 'ground' : 'air');
    }
  }
}

function startDive(s, speed, faceX, faceZ) {
  const forward = Math.min(MOVEMENT.diveMaxSpeed, Math.max(speed, MOVEMENT.walkSpeed));
  s.vx = faceX * forward;
  s.vz = faceZ * forward;
  s.vy = MOVEMENT.diveUp;
  s.grounded = false;
  s.fallFrom = s.y;
  s.sprinting = s.tacSprint = false;
  s.diveLanded = false;
  setMove(s, 'dive');
}

function stepDive(s, dt) {
  if (!s.diveLanded) return; // flying: gravity does it
  const speed = Math.max(0, Math.hypot(s.vx, s.vz) - MOVEMENT.diveFriction * dt);
  const len = Math.hypot(s.vx, s.vz) || 1;
  s.vx = (s.vx / len) * speed;
  s.vz = (s.vz / len) * speed;
  if (speed === 0 && s.moveTime >= MOVEMENT.diveRecover) {
    s.stance = 'prone';
    setMove(s, 'ground');
  }
}

// --- Mantling ------------------------------------------------------------------

// Looks for a ledge just ahead (in the facing direction) to climb onto, or a
// low, thin box to vault over, and starts the climb if there's one within
// reach with room on top. Returns whether it did.
function tryMantle(s, dx, dz, pressed, onGround) {
  const reach = PLAYER.radius + MOVEMENT.mantleProbe;
  let best = null;
  for (const box of COLLIDERS) {
    const top = box.maxY;
    if (top <= s.y + PLAYER.stepHeight || top > s.y + MOVEMENT.mantleReach) continue;
    if (box.minY > s.y + s.height) continue;
    const t = rayBox2D(s.x, s.z, dx, dz, box, reach);
    if (t === null) continue;
    if (!best || t < best.t) best = { box, t, top };
  }
  if (!best) return false;
  const { box, t, top } = best;
  const edge = t;
  // Onto the top...
  let tx = s.x + dx * (edge + PLAYER.radius + 0.05);
  let tz = s.z + dz * (edge + PLAYER.radius + 0.05);
  let ty = top;
  let vault = false;
  const rise = top - s.y;
  // ...or over it, if it's low and thin enough.
  const exit = exitDistance(s.x, s.z, dx, dz, box);
  if (rise <= MOVEMENT.vaultMaxHeight && exit !== null && exit - edge <= MOVEMENT.vaultMaxDepth) {
    const ox = s.x + dx * (exit + PLAYER.radius + 0.1);
    const oz = s.z + dz * (exit + PLAYER.radius + 0.1);
    const floor = floorAt(ox, oz, top + 0.01);
    if (floor < top - 0.2 && fits(ox, floor, oz, PLAYER.heights.stand)) {
      tx = ox;
      tz = oz;
      ty = floor;
      vault = true;
    }
  }
  if (!vault) {
    // Room on top: standing, or at least crouched.
    if (!fits(tx, ty, tz, PLAYER.heights.crouch)) return false;
    if (!roomAbove(s.x, s.z, top + PLAYER.heights.crouch)) return false;
  }
  const speed = Math.hypot(s.vx, s.vz);
  const kind = vault ? 'vault' : rise <= 1.1 ? 'low' : rise <= 1.6 ? 'mid' : 'high';
  const exitSpeed = Math.min(MOVEMENT.walkSpeed * MOVEMENT.sprintSpeedFactor, Math.max(vault ? MOVEMENT.walkSpeed : 0, speed));
  s.mantle = {
    from: [s.x, s.y, s.z],
    to: [tx, ty, tz],
    peak: Math.max(top, s.y) + (vault ? 0.15 : 0),
    duration: MOVEMENT.mantleTimes[kind],
    exit: [dx * exitSpeed, dz * exitSpeed],
    vault,
    kind,
    slide: false,
    sprinting: s.sprinting,
  };
  s.vx = s.vz = s.vy = 0;
  s.grounded = false;
  s.jumpBufferTimer = 0;
  s.sprinting = s.tacSprint = false;
  if (!onGround) s.fallFrom = s.y;
  setMove(s, 'mantle');
  return true;
}

// Climbing: up first, then forward over the top (a vault rises to just over
// the top and drops down beyond). C during a vault goes into a slide.
function stepMantle(s, cmd, pressed, dt) {
  const m = s.mantle;
  if (pressed & BUTTON_CROUCH) m.slide = true;
  const t = Math.min(1, s.moveTime / m.duration);
  const smooth = (a, b, x) => {
    const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const [x0, y0, z0] = m.from;
  const [x1, y1, z1] = m.to;
  if (m.vault) {
    const along = smooth(0, 1, t);
    s.x = x0 + (x1 - x0) * along;
    s.z = z0 + (z1 - z0) * along;
    const up = smooth(0, 0.45, t);
    const down = smooth(0.55, 1, t);
    s.y = y0 + (m.peak - y0) * up - (m.peak - y1) * down;
  } else {
    const up = smooth(0, 0.65, t);
    const over = smooth(0.4, 1, t);
    s.y = y0 + (y1 - y0) * up;
    s.x = x0 + (x1 - x0) * over;
    s.z = z0 + (z1 - z0) * over;
  }
  if (t >= 1) {
    s.mantle = null;
    s.y = y1;
    s.grounded = true;
    s.vy = 0;
    [s.vx, s.vz] = m.exit;
    s.stance = fits(s.x, s.y, s.z, PLAYER.heights.stand) ? 'stand' : 'crouch';
    s.height = PLAYER.heights[s.stance];
    setMove(s, 'ground');
    if (m.slide && Math.hypot(s.vx, s.vz) >= MOVEMENT.walkSpeed) startSlide(s, Math.max(Math.hypot(s.vx, s.vz), MOVEMENT.walkSpeed * MOVEMENT.sprintSpeedFactor), false);
    else if (m.sprinting) s.sprinting = true;
  }
}

// Distance along the ray (x, z) + t (dx, dz) at which it enters the box seen
// from above (0 if it starts inside), or null if it misses within maxT.
function rayBox2D(x, z, dx, dz, b, maxT) {
  let t0 = 0;
  let t1 = maxT;
  for (const [o, d, lo, hi] of [[x, dx, b.minX, b.maxX], [z, dz, b.minZ, b.maxZ]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let a = (lo - o) / d;
    let c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

// Where the ray leaves the box seen from above.
function exitDistance(x, z, dx, dz, b) {
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [[x, dx, b.minX, b.maxX], [z, dz, b.minZ, b.maxZ]]) {
    if (Math.abs(d) < 1e-9) continue;
    t1 = Math.min(t1, Math.max((lo - o) / d, (hi - o) / d));
  }
  return Number.isFinite(t1) ? t1 : null;
}

// --- The world's shape ---------------------------------------------------------

// Whether the circle of the player's width at (x, z) overlaps the box seen
// from above.
function overlaps2D(x, z, b, radius = PLAYER.radius) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return Math.hypot(x - cx, z - cz) < radius;
}

// The highest thing to stand on under the player at (x, z) no higher than
// `below`: the ground or a box's top.
export function floorAt(x, z, below) {
  let floor = 0;
  for (const b of COLLIDERS) {
    if (b.maxY <= below && b.maxY > floor && overlaps2D(x, z, b)) floor = b.maxY;
  }
  return floor;
}

// The lowest thing overhead at (x, z) above feet height y.
function ceilingAt(x, z, y) {
  let ceiling = Infinity;
  for (const b of COLLIDERS) {
    if (b.minY > y + PLAYER.stepHeight && b.minY < ceiling && overlaps2D(x, z, b)) ceiling = b.minY;
  }
  return ceiling;
}

// Whether nothing is in the way from (x, z) up to height `top`.
function roomAbove(x, z, top) {
  for (const b of COLLIDERS) {
    if (b.minY < top && b.maxY > top - 0.5 && overlaps2D(x, z, b, PLAYER.radius * 0.9)) return false;
  }
  return true;
}

// Whether a player `height` tall fits standing at (x, y, z).
export function fits(x, y, z, height) {
  for (const b of COLLIDERS) {
    if (b.maxY > y + 0.01 && b.minY < y + height && overlaps2D(x, z, b, PLAYER.radius - 0.01)) return false;
  }
  return true;
}

// Pushes the player (a circle of PLAYER.radius seen from above) out of a box,
// and removes the part of their velocity going into it, so they slide along
// walls. Boxes they're above (or can step onto) and boxes overhead don't
// push.
function collideWithBox(s, box) {
  if (s.y + PLAYER.stepHeight >= box.maxY || s.y + s.height <= box.minY) return;

  // Closest point of the box to the player's centre, seen from above.
  const cx = Math.max(box.minX, Math.min(s.x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(s.z, box.maxZ));
  let nx = s.x - cx;
  let nz = s.z - cz;
  const dist = Math.hypot(nx, nz);
  if (dist >= PLAYER.radius) return;

  let push;
  if (dist > 1e-9) {
    nx /= dist;
    nz /= dist;
    push = PLAYER.radius - dist;
  } else {
    // Centre inside the box: leave by the nearest side.
    const exits = [
      [s.x - box.minX, -1, 0],
      [box.maxX - s.x, 1, 0],
      [s.z - box.minZ, 0, -1],
      [box.maxZ - s.z, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    [push, nx, nz] = exits[0];
    push += PLAYER.radius;
  }
  s.x += nx * push;
  s.z += nz * push;

  const into = s.vx * nx + s.vz * nz;
  if (into < 0) {
    s.vx -= into * nx;
    s.vz -= into * nz;
  }
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
