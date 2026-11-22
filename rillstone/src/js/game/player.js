// First-person controller. The physics worker moves the capsule (character
// controller with step-up and slope limits); this side turns input into a
// wanted velocity, owns the view angles and smooths the camera.
import * as THREE from 'three';

export const MOVE = { walk: 4.2, sprint: 6.8, crouch: 2.0, jumpApex: 1.1, gravity: 22, stepUp: 0.35, maxSlope: 50 };
// Launch speed for the apex height under the worker's semi-implicit 60 Hz
// integration (velocity is updated before position each step).
const JUMP_V = MOVE.gravity / 120 + Math.sqrt((MOVE.gravity / 120) ** 2 + 2 * MOVE.gravity * MOVE.jumpApex);
const EYE_STAND = 0.75, EYE_CROUCH = 0.15; // above the capsule centre (centre is 0.9 m above the feet)

export function createPlayer(settings) {
  const p = {
    yaw: 0, pitch: 0, eye: EYE_STAND, crouching: false, sprinting: false, sprintLatched: false,
    pos: new THREE.Vector3(), prev: new THREE.Vector3(), cur: new THREE.Vector3(),
    grounded: false, fly: false, bob: 0, speed: 0, jumpQueued: false,
    look(d) {
      p.yaw -= d.x; p.pitch -= d.y;
      p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch));
    },
    // Build this frame's movement intent for the physics worker.
    intent(input, enabled) {
      const mv = enabled ? input.move() : { x: 0, y: 0 };
      p.crouching = enabled && input.held('crouch');
      if (settings.sprintToggle) { if (enabled && input.pressed('sprint')) p.sprintLatched = !p.sprintLatched; if (mv.y <= 0) p.sprintLatched = false; p.sprinting = p.sprintLatched; }
      else p.sprinting = enabled && input.held('sprint') && mv.y > 0;
      const sp = p.fly ? (p.sprinting ? 30 : 12) : p.crouching ? MOVE.crouch : p.sprinting ? MOVE.sprint : MOVE.walk;
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      // Forward is -z at yaw 0.
      const vx = (mv.x * c - mv.y * s) * sp, vz = (-mv.x * s - mv.y * c) * sp;
      p.speed = Math.hypot(vx, vz);
      if (enabled && input.pressed('jump')) p.jumpQueued = true;
      const jump = p.jumpQueued; p.jumpQueued = false;
      const vy = p.fly ? ((enabled && input.held('jump') ? 1 : 0) - (p.crouching ? 1 : 0)) * sp : 0;
      return { vx, vz, vy, jump, jumpV: JUMP_V, fly: p.fly };
    },
    // New physics position arrived (capsule centre).
    stepped(state) {
      p.prev.copy(p.cur);
      p.cur.fromArray(state.pos);
      p.grounded = state.grounded;
    },
    teleported(x, y, z) { p.prev.set(x, y, z); p.cur.set(x, y, z); },
    // Place the camera; alpha interpolates between the last two physics states.
    camera(cam, alpha, dt) {
      p.pos.lerpVectors(p.prev, p.cur, alpha);
      if (p.prev.distanceToSquared(p.cur) > 25) p.pos.copy(p.cur);
      p.eye += ((p.crouching ? EYE_CROUCH : EYE_STAND) - p.eye) * Math.min(1, dt * 12);
      let by = 0, bx = 0;
      if (settings.headBob && p.grounded && p.speed > 0.5) { p.bob += dt * p.speed * 2.2; by = Math.sin(p.bob * 2) * 0.035; bx = Math.cos(p.bob) * 0.025; }
      cam.position.set(p.pos.x + bx * Math.cos(p.yaw), p.pos.y + p.eye + by, p.pos.z - bx * Math.sin(p.yaw));
      cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    },
    feet() { return new THREE.Vector3(p.cur.x, p.cur.y - 0.9, p.cur.z); },
  };
  return p;
}
