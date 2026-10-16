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

const ARM_LOCAL_BOUNDS: [Vec3, Vec3] = [[-0.09, -0.06, -0.33], [0.09, 0.06, 0.22]];
const HELMET_LOCAL_BOUNDS: [Vec3, Vec3] = [[-0.16, -0.15, -0.17], [0.16, 0.25, 0.13]];
const DURATION = 16.2;

const smooth = (a: number, b: number, t: number) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

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
    const p = this.helmetPos!;
    const a = this.helmetSpin;
    // Lying on its side: tilted around the forward axis.
    const ox: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const oy: Vec3 = [-Math.sin(a), Math.cos(a), 0];
    const oz: Vec3 = [0, 0, 1];
    return poseFromAxes(p, ox, oy, oz, HELMET_LOCAL_BOUNDS);
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
    const lying: [number, number, number, number] = [0.32, 1.25, 0.2, yaw0 + 0.35];   // eye height, pitch, roll, yaw
    const sitting: [number, number, number, number] = [1.0, -0.45, 0.0, yaw0 - 0.55];
    const standing: [number, number, number, number] = [1.7, 0.0, 0.0, yaw0];
    let pose = lying;
    if (t < 5.5) pose = lying;
    else if (t < 8.6) { const k = smooth(5.5, 8.4, t); pose = lying.map((v, i) => lerp(v, sitting[i], k)) as typeof lying; }
    else if (t < 13.6) {
      // Look forward-up for the helmet, then back to level.
      const k = smooth(8.8, 9.8, t);
      const look: [number, number, number, number] = [1.05, -0.08, 0, yaw0 - 0.1];
      pose = sitting.map((v, i) => lerp(v, look[i], k)) as typeof lying;
    } else {
      const k = smooth(13.6, 16.0, t);
      const look: [number, number, number, number] = [1.05, -0.08, 0, yaw0 - 0.1];
      pose = look.map((v, i) => lerp(v, standing[i], k)) as typeof lying;
    }
    // A little tremor while coming to.
    const tremor = (1 - smooth(4.0, 9.0, t)) * 0.012;
    const yawN = pose[3] + Math.sin(t * 7.3) * tremor;
    const pitchN = pose[1] + Math.sin(t * 5.1) * tremor;
    const b = basis(yawN, pitchN, pose[2]);
    const camPos: Vec3 = [this.feet[0], this.ground + pose[0], this.feet[2]];
    const camera: CameraState = { pos: camPos, fwd: b.fwd, right: b.right, up: b.up, tanHalfFov: Math.tan((75 * Math.PI) / 360) };
    const toWorld = (l: Vec3): Vec3 => add(add(add(camPos, scale(b.right, l[0])), scale(b.up, l[1])), scale(b.fwd, l[2]));

    // ---- arms -----------------------------------------------------------------
    // Rest poses hang below the view; the hands come up when needed.
    const armPose = (side: -1 | 1, local: Vec3, pitchDown: number, yawIn: number): DynObjectPose => {
      const pos = toWorld(local);
      // Object z axis: forward tilted down; roll so the palm faces down.
      const cp = Math.cos(pitchDown), sp = Math.sin(pitchDown);
      const cy = Math.cos(yawIn), sy = Math.sin(yawIn);
      const oz = normalize(add(add(scale(b.fwd, cp * cy), scale(b.up, -sp)), scale(b.right, -side * sy)));
      const ox0 = normalize(cross(b.up, oz));
      const oy = normalize(cross(oz, ox0));
      return poseFromAxes(pos, ox0, oy, oz, ARM_LOCAL_BOUNDS);
    };
    let armL: DynObjectPose | null = null;
    let armR: DynObjectPose | null = null;
    // Right hand presses into the puddle beside you while sitting up.
    if (t > 5.8 && t < 9.4) {
      const down = smooth(5.8, 7.1, t) * (1 - smooth(8.3, 9.3, t));
      const rest: Vec3 = [0.3, -0.55, 0.35];
      const press: Vec3 = [0.42, -(pose[0] - 0.03), 0.5]; // fingertips at the ground
      const local: Vec3 = rest.map((v, i) => lerp(v, press[i], down)) as Vec3;
      armR = armPose(1, local, lerp(0.9, 0.25, down), 0.15);
      fire('splash', 7.0, () => { impulses.push({ x: toWorld(press)[0], z: toWorld(press)[2], radius: 0.3, strength: 0.012 }); });
      if (t > 7.0 && t < 8.3) {
        // Hand resting in the water keeps it moving a little.
        if (Math.random() < dt * 3) impulses.push({ x: toWorld(press)[0] + (Math.random() - 0.5) * 0.15, z: toWorld(press)[2] + (Math.random() - 0.5) * 0.15, radius: 0.12, strength: 0.002 });
      }
      fire('drip', 8.6);
    }
    // Both hands rise to the helmet, lift it, carry it right and let go.
    let helmet: DynObjectPose | null = null;
    if (t > 9.0 && t < 13.9) {
      const up = smooth(9.0, 10.0, t);
      const lift = smooth(10.4, 11.6, t);
      const carry = smooth(11.6, 12.6, t);
      const release = smooth(12.6, 13.9, t);
      const hL: Vec3 = [lerp(-0.45, -0.22, up) + carry * 0.35, lerp(-0.5, -0.02, up) + lift * 0.42 - carry * 0.25, 0.3];
      const hR: Vec3 = [lerp(0.45, 0.22, up) + carry * 0.35, lerp(-0.5, -0.02, up) + lift * 0.42 - carry * 0.25, 0.3];
      const away = release * 0.5;
      armL = armPose(-1, [hL[0] - away * 0.4, hL[1] - away, hL[2]], 0.35 - lift * 0.5, 0.25);
      armR = armPose(1, [hR[0] + away * 0.4, hR[1] - away, hR[2]], 0.35 - lift * 0.5, 0.25);
      fire('seal', 10.3);
      if (t >= 10.4 && t < 12.6) {
        // The helmet moves with the hands until released.
        const local: Vec3 = [(hL[0] + hR[0]) * 0.5, (hL[1] + hR[1]) * 0.5 + 0.02, 0.28];
        const pos = toWorld(local);
        helmet = poseFromAxes(pos, b.right, b.up, b.fwd, HELMET_LOCAL_BOUNDS);
        this.helmetPos = pos;
        this.helmetVel = [b.right[0] * 0.6 + b.fwd[0] * 0.2, 0.2, b.right[2] * 0.6 + b.fwd[2] * 0.2];
        this.helmetSpin = 0;
      }
    }
    // Free fall after release, landing beside you.
    if (t >= 12.6 && this.helmetPos && !this.helmetRest) {
      this.helmetVel[1] -= 9.8 * dt;
      for (let i = 0; i < 3; i++) this.helmetPos[i] += this.helmetVel[i] * dt;
      this.helmetSpin += dt * 4;
      const floor = this.ground + 0.15;
      if (this.helmetPos[1] <= floor) {
        this.helmetPos[1] = floor;
        this.helmetRest = true;
        this.helmetSpin = Math.PI * 0.42;
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
    const visor = 1 - smooth(11.2, 11.8, t);
    const boot = clamp(1 - smooth(2.6, 6.0, t), 0, 1) * (t > 1.2 ? 1 : 0) + (t > 10.3 ? smooth(10.3, 10.5, t) * (1 - smooth(10.5, 11.0, t)) : 0);
    const muffle = 1 - smooth(10.4, 12.0, t);
    // HUD inside the discarded helmet keeps glowing for a moment, then dies.
    const hud = t < 10.4 ? 1 : 1 - smooth(13.0, 14.6, t);
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
