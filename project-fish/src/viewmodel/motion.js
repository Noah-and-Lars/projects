// Weapon physics: the hands and gun hang on springs, so they have weight.
//
// Every frame they're pushed by how the player turns, speeds up, slows down,
// steps, jumps and lands; springs pull them back to where they're held, and
// they overshoot a little as they settle, like real arms. Near a wall, the
// gun is pulled back and tipped up so it doesn't look like it goes through.
//
// Offsets are in the viewmodel camera's space: x right, y up, z towards the
// player. Rotations are radians about those axes.

import * as THREE from 'three';

// All the tuning in one place.
export const MOTION = {
  position: { stiffness: 140, damping: 0.55 }, // springs: stiffer settles faster; damping 1 = no overshoot
  rotation: { stiffness: 190, damping: 0.5 },
  look: { trail: 0.02, sideways: 0.004, max: 0.08 }, // trailing behind a turn, per radian/second
  inertia: { position: 0.02, rotation: 0.05 }, // how hard speeding up or slowing down shoves the gun
  lean: 0.01, // roll into a strafe, per m/s
  bob: { stepsPerMetre: 0.75, side: 0.0045, up: 0.0035, roll: 0.01, yaw: 0.006, footstep: 0.03, nod: 0.12 },
  jump: { drop: 0.15, nod: 0.5 }, // shove when leaving the ground
  landing: { drop: 0.045, nod: 0.22 }, // shove when landing, per m/s of fall
  breath: { speed: 1.4, up: 0.0007, pitch: 0.002, drift: 0.0015 },
  wall: { far: 0.85, near: 0.35, back: 0.12, down: 0.025, tip: 0.4 },
  // Aiming down the sights: how much of each movement is left (1 = all of it),
  // and the hold wobble: a slow figure-of-eight from breathing plus a faint tremor.
  aiming: { look: 0.35, inertia: 0.4, lean: 0.3, bob: 0.25, wall: 0.5 },
  aimWobble: { speed: 0.8, pitch: 0.0035, yaw: 0.0048, tremor: 0.0007 },
  aimSettle: { nod: 0.35, roll: 0.4 }, // little shove as the sights come up or go down
};

const MAX_STEP = 1 / 240; // springs are stepped at least this finely, so they stay stable

class Spring {
  constructor({ stiffness, damping }) {
    this.k = stiffness;
    this.c = 2 * damping * Math.sqrt(stiffness);
    this.value = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
  }

  // Moves towards `target` for dt seconds, with `force` (an acceleration) pushing it too.
  step(dt, target, force) {
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const axis of ['x', 'y', 'z']) {
        const a = this.k * (target[axis] - this.value[axis]) - this.c * this.velocity[axis] + force[axis];
        this.velocity[axis] += a * h;
        this.value[axis] += this.velocity[axis] * h;
      }
    }
  }
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class ViewmodelMotion {
  constructor() {
    this.position = new Spring(MOTION.position);
    this.rotation = new Spring(MOTION.rotation);
    this.time = 0;
    this.lastYaw = null;
    this.lastPitch = 0;
    this.turn = new THREE.Vector2(); // smoothed turning speed (yaw, pitch), radians/second
    this.lastVelocity = null; // player's velocity relative to where they look (right, forward)
    this.accel = new THREE.Vector2();
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.wasGrounded = true;
    this.lastFall = 0;
    this.wall = 0;
  }

  // The sights just came up (+1) or went down (-1): a small shove, so the gun
  // settles into place instead of stopping dead.
  settle(direction) {
    this.rotation.velocity.x += MOTION.aimSettle.nod * direction;
    this.rotation.velocity.z -= MOTION.aimSettle.roll * direction;
  }

  // dt: seconds since the last frame. player: movement state. yaw, pitch: where
  // the player looks. wallDistance: metres to whatever is straight ahead.
  // aim: 0 at the hip, 1 fully aiming down the sights.
  update(dt, player, yaw, pitch, wallDistance, aim = 0) {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    this.time += dt;
    const M = MOTION;
    const keep = (k) => 1 - (1 - M.aiming[k]) * aim; // how much of a movement is left while aiming
    const target = new THREE.Vector3();
    const targetRot = new THREE.Vector3();
    const force = new THREE.Vector3();
    const torque = new THREE.Vector3();

    // Turning: the gun trails behind, then swings back past centre when you stop.
    if (this.lastYaw === null) this.lastYaw = yaw;
    const dYaw = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
    const dPitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const smooth = 1 - Math.exp(-dt / 0.03);
    this.turn.x += (dYaw / dt - this.turn.x) * smooth;
    this.turn.y += (dPitch / dt - this.turn.y) * smooth;
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    targetRot.y += clamp(-this.turn.x * M.look.trail, M.look.max) * keep('look');
    targetRot.x += clamp(-this.turn.y * M.look.trail, M.look.max) * keep('look');
    target.x += clamp(this.turn.x * M.look.sideways, 0.02) * keep('look');
    target.y -= clamp(this.turn.y * M.look.sideways, 0.02) * keep('look');

    // Moving: speeding up or slowing down shoves the gun the other way.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const right = player.vx * cos - player.vz * sin;
    const forward = -player.vx * sin - player.vz * cos;
    if (this.lastVelocity === null) this.lastVelocity = new THREE.Vector2(right, forward);
    const ax = (right - this.lastVelocity.x) / dt;
    const af = (forward - this.lastVelocity.y) / dt;
    this.lastVelocity.set(right, forward);
    this.accel.x += (ax - this.accel.x) * (1 - Math.exp(-dt / 0.04));
    this.accel.y += (af - this.accel.y) * (1 - Math.exp(-dt / 0.04));
    const shove = keep('inertia');
    force.x -= this.accel.x * M.inertia.position * shove;
    force.z += this.accel.y * M.inertia.position * shove;
    torque.x += this.accel.y * M.inertia.rotation * shove;
    torque.z += this.accel.x * M.inertia.rotation * shove;
    torque.y += this.accel.x * M.inertia.rotation * 0.4 * shove;
    targetRot.z -= right * M.lean * keep('lean');

    // Walking: a figure-of-eight in step with the feet, and a little bounce at each footstep.
    const speed = player.grounded ? Math.hypot(player.vx, player.vz) : 0;
    this.bobAmount += (Math.min(speed / 5, 1) - this.bobAmount) * Math.min(1, dt * 8);
    const before = Math.floor(this.bobPhase / Math.PI);
    this.bobPhase += speed * dt * M.bob.stepsPerMetre * Math.PI;
    const b = this.bobAmount * keep('bob');
    if (Math.floor(this.bobPhase / Math.PI) !== before) {
      this.position.velocity.y -= M.bob.footstep * b;
      this.rotation.velocity.x -= M.bob.nod * b;
    }
    target.x += Math.sin(this.bobPhase) * M.bob.side * b;
    target.y -= Math.abs(Math.cos(this.bobPhase)) * M.bob.up * b;
    targetRot.z += Math.sin(this.bobPhase) * M.bob.roll * b;
    targetRot.y += Math.sin(this.bobPhase) * M.bob.yaw * b;

    // Jumping and landing.
    if (this.wasGrounded && !player.grounded && player.vy > 0) {
      this.position.velocity.y -= M.jump.drop;
      this.rotation.velocity.x -= M.jump.nod;
    }
    if (!this.wasGrounded && player.grounded) {
      const impact = Math.max(0, -this.lastFall);
      this.position.velocity.y -= impact * M.landing.drop;
      this.rotation.velocity.x -= impact * M.landing.nod;
    }
    this.wasGrounded = player.grounded;
    this.lastFall = player.vy;
    if (!player.grounded) target.y += clamp(-player.vy * 0.0012, 0.01);

    // Breathing, and a slow drift so the hands are never perfectly still.
    const t = this.time * M.breath.speed;
    target.y += Math.sin(t) * M.breath.up;
    targetRot.x += Math.sin(t + 1) * M.breath.pitch;
    targetRot.y += Math.sin(t * 0.5) * M.breath.drift;

    // Holding the sights up: a slow figure-of-eight as you breathe, and a faint
    // tremor from the arms holding the weight out.
    const ws = this.time * M.aimWobble.speed * 2 * Math.PI;
    targetRot.x += aim * (Math.sin(ws) * M.aimWobble.pitch
      + (Math.sin(this.time * 17.3) + Math.sin(this.time * 23.9 + 1.3)) * 0.5 * M.aimWobble.tremor);
    targetRot.y += aim * (Math.sin(ws * 0.5 + 0.7) * M.aimWobble.yaw
      + (Math.sin(this.time * 19.1 + 2.1) + Math.sin(this.time * 29.7)) * 0.5 * M.aimWobble.tremor);

    // Close to a wall: pull the gun back and tip it up.
    const w = smoothstep(M.wall.far, M.wall.near, wallDistance) * keep('wall');
    this.wall += (w - this.wall) * Math.min(1, dt * 10);
    target.z += M.wall.back * this.wall;
    target.y -= M.wall.down * this.wall;
    targetRot.x += M.wall.tip * this.wall;

    this.position.step(dt, target, force);
    this.rotation.step(dt, targetRot, torque);
  }
}
