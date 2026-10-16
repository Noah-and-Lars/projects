// First-person walking: WASD + mouse look, circle-vs-box collision, curb steps.

import { type Vec3, clamp, cross, lerp } from '../core/math';
import type { Input } from '../core/input';
import type { SceneData } from '../world/geometry';
import type { CameraState } from '../renderer/pathtracer';
import { STREET } from '../world/street';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.35;
const WALK_SPEED = 2.4;
const RUN_SPEED = 4.6;
const MOUSE_SENS = 0.0022;
const STEP_HEIGHT = 0.35;
const BODY_HEIGHT = 1.8;

export class PlayerController {
  /** Feet position. */
  pos: Vec3;
  yaw = 0;
  pitch = 0;
  fovDeg = 75;
  private vel: Vec3 = [0, 0, 0];
  private camY: number;
  private bobPhase = 0;
  private bobAmount = 0;
  headBob = true;

  constructor(private readonly scene: SceneData, private readonly input: Input, spawn: Vec3 = STREET.spawn) {
    this.pos = [spawn[0], this.groundHeight(spawn[0], spawn[2]), spawn[2]];
    this.camY = this.pos[1] + EYE_HEIGHT;
  }

  /** Move instantly to a spot on the street (used by URL parameters). */
  teleport(x: number, z: number): void {
    this.pos = [x, this.groundHeight(x, z), z];
    this.camY = this.pos[1] + EYE_HEIGHT;
  }

  groundHeight(x: number, z: number): number {
    let h = 0;
    for (const s of this.scene.walkSurfaces) {
      if (x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2]) h = Math.max(h, s.height);
    }
    return h;
  }

  update(dt: number, allowInput: boolean): void {
    const inp = this.input;
    if (allowInput) {
      const [mx, my] = inp.consumeMouse();
      this.yaw += mx * MOUSE_SENS;
      this.pitch = clamp(this.pitch - my * MOUSE_SENS, -1.45, 1.45);
    } else {
      inp.consumeMouse();
    }

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd: Vec3 = [sy, 0, cy];
    const right: Vec3 = [cy, 0, -sy];
    let wx = 0, wz = 0;
    if (allowInput) {
      const f = (inp.isDown('KeyW') || inp.isDown('ArrowUp') ? 1 : 0) - (inp.isDown('KeyS') || inp.isDown('ArrowDown') ? 1 : 0);
      const r = (inp.isDown('KeyD') || inp.isDown('ArrowRight') ? 1 : 0) - (inp.isDown('KeyA') || inp.isDown('ArrowLeft') ? 1 : 0);
      wx = fwd[0] * f + right[0] * r;
      wz = fwd[2] * f + right[2] * r;
      const len = Math.hypot(wx, wz);
      if (len > 1e-6) { wx /= len; wz /= len; }
    }
    const speed = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight') ? RUN_SPEED : WALK_SPEED;
    const accel = 1 - Math.exp(-dt * 12);
    this.vel[0] = lerp(this.vel[0], wx * speed, accel);
    this.vel[2] = lerp(this.vel[2], wz * speed, accel);

    this.pos[0] += this.vel[0] * dt;
    this.pos[2] += this.vel[2] * dt;
    this.collide();
    this.pos[0] = clamp(this.pos[0], -STREET.sidewalkOuter + RADIUS, STREET.sidewalkOuter - RADIUS);
    this.pos[2] = clamp(this.pos[2], STREET.walkMinZ, STREET.walkMaxZ);
    this.pos[1] = this.groundHeight(this.pos[0], this.pos[2]);

    // Smooth the eye height over curbs and bob gently while walking.
    const targetY = this.pos[1] + EYE_HEIGHT;
    this.camY = lerp(this.camY, targetY, 1 - Math.exp(-dt * 14));
    const moving = Math.hypot(this.vel[0], this.vel[2]);
    this.bobAmount = lerp(this.bobAmount, this.headBob ? Math.min(1, moving / WALK_SPEED) : 0, 1 - Math.exp(-dt * 6));
    this.bobPhase += dt * moving * 1.7;
  }

  private collide(): void {
    const feet = this.pos[1];
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.scene.colliders) {
        if (c.max[1] <= feet + STEP_HEIGHT || c.min[1] >= feet + BODY_HEIGHT) continue;
        const minX = c.min[0] - RADIUS, maxX = c.max[0] + RADIUS;
        const minZ = c.min[2] - RADIUS, maxZ = c.max[2] + RADIUS;
        const x = this.pos[0], z = this.pos[2];
        if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
        const push = [x - minX, maxX - x, z - minZ, maxZ - z];
        let best = 0;
        for (let i = 1; i < 4; i++) if (push[i] < push[best]) best = i;
        if (best === 0) this.pos[0] = minX;
        else if (best === 1) this.pos[0] = maxX;
        else if (best === 2) this.pos[2] = minZ;
        else this.pos[2] = maxZ;
      }
    }
  }

  camera(): CameraState {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const fwd: Vec3 = [sy * cp, sp, cy * cp];
    const right: Vec3 = [cy, 0, -sy];
    const up = cross(fwd, right);
    const bobY = Math.sin(this.bobPhase * 2) * 0.022 * this.bobAmount;
    const bobX = Math.sin(this.bobPhase) * 0.012 * this.bobAmount;
    return {
      pos: [this.pos[0] + right[0] * bobX, this.camY + bobY, this.pos[2] + right[2] * bobX],
      fwd,
      right,
      up,
      tanHalfFov: Math.tan((this.fovDeg * Math.PI) / 360),
    };
  }
}
