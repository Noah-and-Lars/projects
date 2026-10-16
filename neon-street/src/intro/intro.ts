// The wake-up sequence: you come to lying in the street inside a cracked
// helmet, sit up, press a gloved hand into a puddle, then pull the helmet off
// and drop it beside you. Drives the camera, the arm/helmet objects, the
// visor overlay, the helmet HUD glow, audio muffling and water impulses.

import { type Vec3, clamp, cross, lerp, normalize } from '../core/math';
import type { CameraState, DynObjectPose } from '../renderer/pathtracer';
import type { WaterImpulse } from '../weather/water';

export interface IntroOverlay {
  eyelid: number; // 0 open .. 1 closed
  blur: number;   // 0 sharp .. 1 blurred
  visor: number;  // 0 off .. 1 fully drawn
  lift: number;   // 0 worn .. 1 lifted away
  boot: number;   // HUD glitch amount
}

export interface IntroFrame {
  camera: CameraState;
  armL: DynObjectPose | null;
  armR: DynObjectPose | null;
  helmet: DynObjectPose | null;
  overlay: IntroOverlay;
  /** Helmet HUD glow intensity (material emission multiplier). */
  hud: number;
  /** 0..1 how muffled the world sounds. */
  muffle: number;
  events: string[];
  impulses: WaterImpulse[];
  done: boolean;
}

const ARM_LOCAL_BOUNDS: [Vec3, Vec3] = [[-0.09, -0.06, -0.33], [0.09, 0.17, 0.22]];
const HELMET_LOCAL_BOUNDS: [Vec3, Vec3] = [[-0.16, -0.15, -0.17], [0.16, 0.25, 0.13]];
const DURATION = 16.4;

type Pose = [number, number, number, number]; // eye height, pitch, roll, yaw

const smooth = (a: number, b: number, t: number) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const mixPose = (a: Pose, b: Pose, k: number): Pose => a.map((v, i) => lerp(v, b[i], k)) as Pose;

/** Camera basis from yaw/pitch/roll. */
function basis(yaw: number, pitch: number, roll: number): { fwd: Vec3; right: Vec3; up: Vec3 } {
  const fwd: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const right0: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up0 = cross(fwd, right0);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const right: Vec3 = normalize(add(scale(right0, cr), scale(up0, sr)));
  const up: Vec3 = normalize(add(scale(up0, cr), scale(right0, -sr)));
  return { fwd, right, up };
}

/** Rotation matrix (row-major, object -> world) from the world directions of the object's axes. */
function rotFromAxes(ox: Vec3, oy: Vec3, oz: Vec3): number[] {
  return [ox[0], oy[0], oz[0], ox[1], oy[1], oz[1], ox[2], oy[2], oz[2]];
}

function poseFromAxes(pos: Vec3, ox: Vec3, oy: Vec3, oz: Vec3, local: [Vec3, Vec3]): DynObjectPose {
  const rot = rotFromAxes(ox, oy, oz);
  const bmin: Vec3 = [Infinity, Infinity, Infinity];
  const bmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [local[0][0], local[1][0]]) for (const y of [local[0][1], local[1][1]]) for (const z of [local[0][2], local[1][2]]) {
    const w: Vec3 = [
      rot[0] * x + rot[1] * y + rot[2] * z + pos[0],
      rot[3] * x + rot[4] * y + rot[5] * z + pos[1],
      rot[6] * x + rot[7] * y + rot[8] * z + pos[2],
    ];
    for (let i = 0; i < 3; i++) { bmin[i] = Math.min(bmin[i], w[i]); bmax[i] = Math.max(bmax[i], w[i]); }
  }
  return { pos, rot, boundsMin: bmin, boundsMax: bmax };
}

export class IntroSequence {
  active = true;
  private t = 0;
  private holding = true;
  private fired = new Set<string>();
  private helmetVel: Vec3 = [0, 0, 0];
  private helmetPos: Vec3 | null = null;
  private helmetAxes: [Vec3, Vec3, Vec3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  private helmetSpin = 0;
  private helmetRest = false;

  /**
   * @param feet   spawn position on the ground
   * @param yaw    facing direction the player ends up with
   * @param ground ground height at the spawn
   */
  constructor(private readonly feet: Vec3, private readonly yaw: number, private readonly ground: number) {}

  /** Start the clock (called when the player clicks start). */
  begin(): void { this.holding = false; }

  skip(): void { this.t = DURATION; }

  restart(): void {
    this.t = 0;
    this.active = true;
    this.holding = false;
    this.fired.clear();
    this.helmetPos = null;
    this.helmetRest = false;
    this.helmetVel = [0, 0, 0];
  }

  get helmetRestingPose(): DynObjectPose | null {
    if (!this.helmetPos || !this.helmetRest) return null;
    return this.helmetPose();
  }

  private helmetPose(): DynObjectPose {
    const [ox, oy, oz] = this.helmetAxes;
    // Tumble about the forward axis after release.
    const a = this.helmetSpin;
    const rx = normalize(add(scale(ox, Math.cos(a)), scale(oy, Math.sin(a))));
    const ry = normalize(add(scale(oy, Math.cos(a)), scale(ox, -Math.sin(a))));
    return poseFromAxes(this.helmetPos!, rx, ry, oz, HELMET_LOCAL_BOUNDS);
  }

  update(dt: number): IntroFrame {
    if (!this.holding) this.t += dt;
    const t = this.t;
    const events: string[] = [];
    const impulses: WaterImpulse[] = [];
    const fire = (name: string, at: number, cb?: () => void) => {
      if (t >= at && !this.fired.has(name)) { this.fired.add(name); events.push(name); cb?.(); }
    };

    // ---- camera -----------------------------------------------------------
    const yaw0 = this.yaw;
    const lying: Pose = [0.32, 1.0, 0.2, yaw0 + 0.35];
    const pressing: Pose = [1.0, -0.95, 0.0, yaw0 + 0.4];      // looking down at the hand
    const helmetLook: Pose = [1.05, -0.05, 0.0, yaw0 - 0.05];   // looking ahead while lifting
    const dropLook: Pose = [1.05, -0.62, 0.0, yaw0 + 0.75];     // watching the helmet land
    const standing: Pose = [1.7, 0.0, 0.0, yaw0];
    let pose: Pose;
    if (t < 5.5) pose = lying;
    else if (t < 8.6) pose = mixPose(lying, pressing, smooth(5.5, 8.2, t));
    else if (t < 12.4) pose = mixPose(pressing, helmetLook, smooth(8.6, 9.6, t));
    else if (t < 14.4) pose = mixPose(helmetLook, dropLook, smooth(12.4, 13.1, t));
    else pose = mixPose(dropLook, standing, smooth(14.4, 16.2, t));
    // A little tremor while coming to.
    const tremor = (1 - smooth(4.0, 9.0, t)) * 0.012;
    const yawN = pose[3] + Math.sin(t * 7.3) * tremor;
    const pitchN = pose[1] + Math.sin(t * 5.1) * tremor;
    const b = basis(yawN, pitchN, pose[2]);
    const camPos: Vec3 = [this.feet[0], this.ground + pose[0], this.feet[2]];
    const camera: CameraState = { pos: camPos, fwd: b.fwd, right: b.right, up: b.up, tanHalfFov: Math.tan((75 * Math.PI) / 360) };
    const toWorld = (l: Vec3): Vec3 => add(add(add(camPos, scale(b.right, l[0])), scale(b.up, l[1])), scale(b.fwd, l[2]));
    // Flat facing direction for ground targets.
    const flatF: Vec3 = [Math.sin(yaw0 + 0.4), 0, Math.cos(yaw0 + 0.4)];
    const flatR: Vec3 = [Math.cos(yaw0 + 0.4), 0, -Math.sin(yaw0 + 0.4)];

    // ---- arms -----------------------------------------------------------------
    // An arm reaches from the shoulder toward a world-space hand target; the
    // object origin is the wrist, fingertips 0.21 m further along +z.
    const armTo = (side: -1 | 1, hand: Vec3): DynObjectPose => {
      const shoulder = toWorld([side * 0.22, -0.28, -0.05]);
      const oz = normalize(sub(hand, shoulder));
      const ox0 = normalize(cross(b.up, oz));
      const oy = normalize(cross(oz, ox0));
      const wrist = sub(sub(hand, scale(oz, 0.08)), scale(oy, 0.01));
      return poseFromAxes(wrist, ox0, oy, oz, ARM_LOCAL_BOUNDS);
    };
    let armL: DynObjectPose | null = null;
    let armR: DynObjectPose | null = null;
    // Right hand presses into the puddle beside you while sitting up.
    const pressPoint: Vec3 = add(add([this.feet[0], this.ground + 0.02, this.feet[2]], scale(flatR, 0.38)), scale(flatF, 0.62));
    if (t > 5.9 && t < 9.5) {
      const down = smooth(5.9, 7.1, t) * (1 - smooth(8.4, 9.4, t));
      const rest = toWorld([0.3, -0.7, 0.3]);
      const hand: Vec3 = [lerp(rest[0], pressPoint[0], down), lerp(rest[1], pressPoint[1], down), lerp(rest[2], pressPoint[2], down)];
      armR = armTo(1, hand);
      fire('splash', 7.0, () => { impulses.push({ x: pressPoint[0], z: pressPoint[2], radius: 0.3, strength: 0.012 }); });
      if (t > 7.0 && t < 8.4 && Math.random() < dt * 3) {
        impulses.push({ x: pressPoint[0] + (Math.random() - 0.5) * 0.15, z: pressPoint[2] + (Math.random() - 0.5) * 0.15, radius: 0.12, strength: 0.002 });
      }
      fire('drip', 8.7);
    }
    // Both hands rise to the helmet, lift it, carry it right and let go.
    let helmet: DynObjectPose | null = null;
    if (t > 9.1 && t < 14.0) {
      const up = smooth(9.1, 10.1, t);
      const lift = smooth(10.4, 11.6, t);
      const carry = smooth(11.6, 12.6, t);
      const release = smooth(12.6, 13.9, t);
      const hL: Vec3 = [lerp(-0.5, -0.2, up) + carry * 0.4, lerp(-0.6, -0.04, up) + lift * 0.45 - carry * 0.35, lerp(0.35, 0.3, up)];
      const hR: Vec3 = [lerp(0.5, 0.2, up) + carry * 0.4, lerp(-0.6, -0.04, up) + lift * 0.45 - carry * 0.35, lerp(0.35, 0.3, up)];
      const away = release * 0.6;
      armL = armTo(-1, toWorld([hL[0] - away * 0.3, hL[1] - away, hL[2] + away * 0.1]));
      armR = armTo(1, toWorld([hR[0] + away * 0.3, hR[1] - away, hR[2] + away * 0.1]));
      fire('seal', 10.3);
      if (t >= 10.4 && t < 12.6) {
        // The helmet moves with the hands until released.
        const local: Vec3 = [(hL[0] + hR[0]) * 0.5, (hL[1] + hR[1]) * 0.5 + 0.03, 0.3];
        const pos = toWorld(local);
        this.helmetAxes = [b.right, b.up, b.fwd];
        this.helmetSpin = 0;
        this.helmetPos = pos;
        helmet = this.helmetPose();
        this.helmetVel = add(scale(b.right, 0.9), [0, 0.3, 0]);
      }
    }
    // Free fall after release, landing beside you.
    if (t >= 12.6 && this.helmetPos && !this.helmetRest) {
      this.helmetVel[1] -= 9.8 * dt;
      for (let i = 0; i < 3; i++) this.helmetPos[i] += this.helmetVel[i] * dt;
      this.helmetSpin += dt * 5;
      const floor = this.ground + 0.15;
      if (this.helmetPos[1] <= floor) {
        this.helmetPos[1] = floor;
        this.helmetRest = true;
        this.helmetSpin = Math.PI * 0.45;
        events.push('thud');
        impulses.push({ x: this.helmetPos[0], z: this.helmetPos[2], radius: 0.4, strength: 0.02 });
      }
    }
    if (this.helmetPos && t >= 12.6) helmet = this.helmetPose();

    // ---- overlay, HUD glow, sound -------------------------------------------
    let eyelid = 1;
    if (t < 1.2) eyelid = 1;
    else if (t < 1.8) eyelid = lerp(1, 0.4, smooth(1.2, 1.8, t));
    else if (t < 2.4) eyelid = lerp(0.4, 1, smooth(1.8, 2.4, t));
    else eyelid = 1 - smooth(2.4, 5.2, t);
    const blur = (1 - smooth(3.0, 7.5, t)) * 0.9;
    const liftV = smooth(10.4, 11.6, t);
    const visor = 1 - smooth(11.3, 11.8, t);
    const boot = clamp(1 - smooth(2.6, 6.0, t), 0, 1) * (t > 1.2 ? 1 : 0) + (t > 10.3 ? smooth(10.3, 10.5, t) * (1 - smooth(10.5, 11.0, t)) : 0);
    const muffle = 1 - smooth(10.4, 12.0, t);
    // HUD inside the discarded helmet keeps glowing for a moment, then dies.
    const hud = t < 10.4 ? 1 : 1 - smooth(13.2, 14.8, t);
    fire('breath', 0.2);

    const done = t >= DURATION;
    if (done) this.active = false;
    return {
      camera, armL, armR, helmet,
      overlay: { eyelid, blur, visor, lift: liftV, boot },
      hud, muffle, events, impulses, done,
    };
  }
}
