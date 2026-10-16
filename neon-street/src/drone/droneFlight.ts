// Drone flight: patrols the street between waypoints, hovers now and then,
// tilts into its motion, and sweeps its searchlight over the ground.

import { type Vec3, clamp, lerp, makeRng } from '../core/math';

export interface DroneState {
  pos: Vec3;
  /** Row-major 3x3 rotation (object -> world). */
  rot: number[];
  /** Searchlight origin and direction in world space. */
  lampPos: Vec3;
  lampDir: Vec3;
  /** Rotor angular speed, radians per second. */
  rotorSpeed: number;
  /** Ground point under the drone, for downwash. */
  ground: Vec3;
  /** How hard the downwash hits the ground (0..1). */
  downwash: number;
  active: boolean;
}

interface Waypoint { x: number; y: number; z: number; hover: number }

export class DroneFlight {
  private pos: Vec3;
  private vel: Vec3 = [0, 0, 0];
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private waypoints: Waypoint[] = [];
  private target = 0;
  private hoverLeft = 0;
  private rng = makeRng(4242);
  private lampPhase = 0;
  private lampDir: Vec3 = [0, -1, 0];
  private lampAim: Vec3 = [0, 0, 0];

  constructor(private readonly lampLocal: Vec3, enabled = true) {
    this.active = enabled;
    // A patrol loop up and down the street at varying heights.
    const zs = [4, 22, 40, 58, 76, 94, 110, 94, 72, 50, 30, 12];
    for (const z of zs) {
      this.waypoints.push({ x: (this.rng() * 2 - 1) * 2.4, y: 5.4 + this.rng() * 2.6, z, hover: this.rng() < 0.45 ? 3 + this.rng() * 4 : 0 });
    }
    const w = this.waypoints[0];
    this.pos = [w.x, w.y, w.z + 6];
  }

  active: boolean;

  update(dt: number, time: number): DroneState {
    const wp = this.waypoints[this.target];
    const to: Vec3 = [wp.x - this.pos[0], wp.y - this.pos[1], wp.z - this.pos[2]];
    const dist = Math.hypot(to[0], to[1], to[2]);
    let desired: Vec3 = [0, 0, 0];
    if (this.hoverLeft > 0) {
      this.hoverLeft -= dt;
      // Drift a little while hovering.
      desired = [Math.sin(time * 0.7) * 0.25, Math.sin(time * 1.1) * 0.15, Math.cos(time * 0.5) * 0.25];
    } else if (dist < 0.6) {
      this.hoverLeft = wp.hover;
      this.target = (this.target + 1) % this.waypoints.length;
    } else {
      const speed = Math.min(3.2, 0.8 + dist * 0.6);
      desired = [to[0] / dist * speed, to[1] / dist * speed, to[2] / dist * speed];
    }
    const k = 1 - Math.exp(-dt * 1.6);
    const prevVel: Vec3 = [...this.vel];
    for (let i = 0; i < 3; i++) this.vel[i] = lerp(this.vel[i], desired[i], k);
    for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;
    const acc: Vec3 = [(this.vel[0] - prevVel[0]) / Math.max(dt, 1e-3), 0, (this.vel[2] - prevVel[2]) / Math.max(dt, 1e-3)];

    // Face the direction of travel; lean into acceleration.
    const horiz = Math.hypot(this.vel[0], this.vel[2]);
    if (horiz > 0.3) {
      const targetYaw = Math.atan2(this.vel[0], this.vel[2]);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.yaw += d * (1 - Math.exp(-dt * 2.0));
    }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwdAcc = acc[0] * sy + acc[2] * cy + (this.vel[0] * sy + this.vel[2] * cy) * 0.35;
    const sideAcc = acc[0] * cy - acc[2] * sy + (this.vel[0] * cy - this.vel[2] * sy) * 0.35;
    this.pitch = lerp(this.pitch, clamp(fwdAcc * 0.08, -0.3, 0.3), 1 - Math.exp(-dt * 3));
    this.roll = lerp(this.roll, clamp(-sideAcc * 0.08, -0.3, 0.3), 1 - Math.exp(-dt * 3));
    const rot = rotationYXZ(this.yaw, this.pitch, this.roll);

    // Searchlight: a slow sweep around the point under the drone, wider while hovering.
    this.lampPhase += dt * (this.hoverLeft > 0 ? 0.9 : 0.5);
    const sweep = this.hoverLeft > 0 ? 4.5 : 2.5;
    const aim: Vec3 = [
      this.pos[0] + Math.sin(this.lampPhase) * sweep * 0.6,
      0,
      this.pos[2] + Math.cos(this.lampPhase * 0.7) * sweep + (this.hoverLeft > 0 ? 0 : 3),
    ];
    for (let i = 0; i < 3; i++) this.lampAim[i] = lerp(this.lampAim[i], aim[i], 1 - Math.exp(-dt * 2.5));
    const lampPos = transform(rot, this.lampLocal, this.pos);
    const dir: Vec3 = [this.lampAim[0] - lampPos[0], this.lampAim[1] - lampPos[1], this.lampAim[2] - lampPos[2]];
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    this.lampDir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];

    const thrust = 1 + Math.max(0, this.vel[1]) * 0.3 + Math.hypot(acc[0], acc[2]) * 0.05;
    return {
      pos: [...this.pos],
      rot,
      lampPos,
      lampDir: this.lampDir,
      rotorSpeed: 180 * thrust,
      ground: [this.pos[0], 0, this.pos[2]],
      downwash: clamp(1 - (this.pos[1] - 4) / 6, 0.2, 1),
      active: this.active,
    };
  }
}

/** Row-major rotation: yaw about y, then pitch about x, then roll about z (object -> world). */
export function rotationYXZ(yaw: number, pitch: number, roll: number): number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry * Rx * Rz
  return [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr, cp * cr, -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp,
  ];
}

export function transform(rot: number[], v: Vec3, offset: Vec3): Vec3 {
  return [
    rot[0] * v[0] + rot[1] * v[1] + rot[2] * v[2] + offset[0],
    rot[3] * v[0] + rot[4] * v[1] + rot[5] * v[2] + offset[1],
    rot[6] * v[0] + rot[7] * v[1] + rot[8] * v[2] + offset[2],
  ];
}
