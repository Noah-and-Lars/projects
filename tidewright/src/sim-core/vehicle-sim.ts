// Backend-agnostic land-vehicle controller: raycast wheels + drivetrain.
// Given the body's state and a raycast function, produces impulses to apply.
import type { VehicleModel, WheelModel } from './assembly';
import { GRAVITY } from './assembly';
import { type Vec3, type Quat, qrot, cross, dot, clamp, add, scale, sub } from './math';
import { engineTorque, autoClutch, autoShift } from './drivetrain';
import { longCurve, latCurve, suspensionForce } from './tyre';

export interface BodyState { pos: Vec3; quat: Quat; linvel: Vec3; angvel: Vec3; com: Vec3 /* world */ }
export interface RayHit { dist: number; normal: Vec3 }
export type RaycastFn = (origin: Vec3, dir: Vec3, maxDist: number) => RayHit | null;
export interface Impulse { point: Vec3; impulse: Vec3 }

export interface Controls {
  throttle: number; // 0..1  (W / RT)
  brake: number; // 0..1     (S / LT)
  steer: number; // -1..1    (+ right)
  handbrake: boolean;
  shiftUp: boolean; // edge-triggered
  shiftDown: boolean;
  lights: boolean;
}
export const NO_CONTROLS: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, shiftUp: false, shiftDown: false, lights: false };

export interface WheelState { compression: number; prevCompression: number; omega: number; spin: number; steerAngle: number; contact: boolean; slip: number }

export interface Telemetry {
  speed: number; // m/s forward
  rps: number; // engine rev/s
  gear: number; // -1 R, 0 N, 1..n
  throttle: number;
  clutch: number;
  fuel: number; // litres left
  fuelMax: number;
  battery: number; // 0..1
  running: boolean;
  grounded: number; // wheels touching
  lights: boolean;
}

const TAU = Math.PI * 2;
const AIR = 1.2;
const VMIN = 2.0; // low-speed slip reference (m/s)
const MAX_STEER = 0.62; // rad

export class VehicleSim {
  wheels: WheelState[];
  engineW = 0;
  gear = 1;
  running = false;
  fuel: number;
  battery = 1;
  clutch = 0;
  steerState = 0;
  shiftTimer = 0;
  lights = false;
  private lastThrottle = 0;
  private impulses: Impulse[] = [];

  constructor(public model: VehicleModel) {
    this.wheels = model.wheels.map(() => ({ compression: 0, prevCompression: 0, omega: 0, spin: 0, steerAngle: 0, contact: false, slip: 0 }));
    this.fuel = model.fuel;
    this.battery = model.battery > 0 ? 1 : 0;
    this.running = !!model.engine && this.fuel > 0 && this.battery > 0;
    if (model.engine) this.engineW = model.engine.idleRps * TAU;
  }

  /** Wheel angle for Ackermann steering. Positive = toward +X (right). */
  private wheelSteer(w: WheelModel, center: number): number {
    if (!w.steer || Math.abs(center) < 1e-4) return 0;
    const L = this.model.wheelbase;
    const R = L / Math.tan(Math.abs(center));
    const inner = Math.sign(center) === w.side;
    const a = Math.atan(L / Math.max(R + (inner ? -1 : 1) * (this.model.track / 2), 0.3));
    return Math.sign(center) * a * w.steer;
  }

  step(dt: number, body: BodyState, ctl: Controls, raycast: RaycastFn): Impulse[] {
    const m = this.model;
    const imp = this.impulses;
    imp.length = 0;
    const q = body.quat;
    const up = qrot(q, [0, 1, 0]);
    const fwdB = qrot(q, [0, 0, -1]);
    const rightB = qrot(q, [1, 0, 0]);
    const vFwd = dot(body.linvel, fwdB);
    const e = m.engine;

    // --- Gear selection (arcade auto with reverse on brake at standstill) ---
    let throttle = clamp(ctl.throttle, 0, 1);
    let brake = clamp(ctl.brake, 0, 1);
    if (ctl.lights !== this.lights) this.lights = ctl.lights;
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    const nG = m.gears.length;
    if (m.autoShift) {
      if (this.gear >= 1 && brake > 0.1 && throttle < 0.05 && vFwd < 0.6) this.gear = -1;
      else if (this.gear === -1 && throttle > 0.1 && vFwd > -0.6) this.gear = 1;
      if (this.gear === 0) this.gear = 1;
    } else {
      if (ctl.shiftUp && this.gear < nG) { this.gear = this.gear === -1 ? 0 : this.gear + 1; this.shiftTimer = 0.18; }
      if (ctl.shiftDown && this.gear > -1) { this.gear = this.gear === 1 ? 0 : this.gear - 1; this.shiftTimer = 0.18; }
    }
    if (this.gear === -1 && m.autoShift) { const t = throttle; throttle = brake; brake = t; }
    if (!this.running) throttle = 0;
    this.lastThrottle = throttle;

    // --- Steering with speed-sensitive authority ---
    const authority = MAX_STEER * (1 - 0.72 * clamp(Math.abs(vFwd) / 32, 0, 1));
    const target = clamp(ctl.steer, -1, 1) * authority;
    const rate = 2.2 * dt;
    this.steerState += clamp(target - this.steerState, -rate, rate);

    // --- Pass 1: suspension raycasts and contact kinematics ---
    const n = m.wheels.length;
    const P: Vec3[] = new Array(n), F: Vec3[] = new Array(n), Lt: Vec3[] = new Array(n), Nn: Vec3[] = new Array(n);
    const load = new Float64Array(n), vL = new Float64Array(n), vT = new Float64Array(n), K = new Float64Array(n);
    let grounded = 0;
    for (let i = 0; i < n; i++) {
      const w = m.wheels[i], s = this.wheels[i];
      s.steerAngle = this.wheelSteer(w, this.steerState);
      const top: Vec3 = [w.center[0], w.center[1] + w.travel * 0.5, w.center[2]];
      const origin = add(body.pos, qrot(q, top));
      const maxD = w.travel + w.radius;
      const down: Vec3 = [-up[0], -up[1], -up[2]];
      const hit = raycast(origin, down, maxD);
      s.prevCompression = s.compression;
      if (!hit) { s.compression = 0; s.contact = false; load[i] = 0; K[i] = 0; continue; }
      s.contact = true; grounded++;
      s.compression = clamp(maxD - hit.dist, 0, maxD);
      const compVel = (s.compression - s.prevCompression) / dt;
      let Fs = suspensionForce(s.compression, compVel, w.k, w.c);
      if (s.compression > w.travel) Fs += w.k * 12 * (s.compression - w.travel); // bump stop
      load[i] = Fs;
      const nrm = hit.normal;
      Nn[i] = nrm;
      P[i] = add(origin, scale(down, hit.dist));
      const ca = Math.cos(s.steerAngle), sa = Math.sin(s.steerAngle);
      const wf: Vec3 = add(scale(fwdB, ca), scale(rightB, sa));
      let f = sub(wf, scale(nrm, dot(wf, nrm)));
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      f = scale(f, 1 / fl);
      F[i] = f;
      Lt[i] = cross(f, nrm);
      const v = add(body.linvel, cross(body.angvel, sub(P[i], body.com)));
      vL[i] = dot(v, f);
      vT[i] = dot(v, Lt[i]);
      // Effective longitudinal stiffness (secant of the slip curve around the last wheel speed).
      const muN = w.grip * Fs;
      const ref = Math.max(Math.abs(vL[i]), VMIN);
      const slipV = s.omega * w.radius - vL[i];
      const sx = slipV / ref;
      K[i] = Math.abs(sx) > 1e-3 ? (muN * longCurve(sx)) / slipV : (muN * 16.5) / ref;
    }

    // --- Pass 2: drivetrain implicit solve (engine <-> clutch <-> gears <-> diff <-> wheels) ---
    const driven: number[] = [];
    for (let i = 0; i < n; i++) if (m.wheels[i].driven) driven.push(i);
    const G = this.gear === 0 || this.shiftTimer > 0 ? 0 : this.gear > 0 ? m.gears[this.gear - 1] : -m.reverse;
    const eff = 0.92;
    const newOmega = new Float64Array(n);
    const D = new Float64Array(n), A = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const w = m.wheels[i], s = this.wheels[i];
      D[i] = w.inertia / dt + K[i] * w.radius * w.radius;
      A[i] = (w.inertia * s.omega / dt + K[i] * w.radius * vL[i]) / D[i];
      newOmega[i] = A[i];
    }
    let Tc = 0;
    if (e && driven.length) {
      const Te = engineTorque(e, this.engineW, throttle, this.running);
      let meanA = 0, meanB = 0;
      const locked = m.diff === 'locked';
      if (locked) {
        let sumIw = 0, sumD = 0;
        for (const i of driven) { sumIw += A[i] * D[i]; sumD += D[i]; }
        meanA = sumIw / sumD; meanB = (G * eff) / sumD;
      } else {
        for (const i of driven) { meanA += A[i]; meanB += (G * eff) / (driven.length * D[i]); }
        meanA /= driven.length; meanB /= driven.length;
      }
      const wDriven = meanA;
      if (m.autoShift && this.gear >= 1) {
        const ng = autoShift(e, m.gears, this.gear, wDriven, throttle);
        if (ng !== this.gear) { this.gear = ng; this.shiftTimer = 0.15; }
      }
      this.clutch = G === 0 ? 0 : autoClutch(e, this.engineW, Math.abs(wDriven * G), throttle);
      if (G !== 0 && this.clutch > 0) {
        const Cmax = this.clutch * e.peakTorque * 2.2;
        const TcLock = (this.engineW + (dt * Te) / e.inertia - G * meanA) / (dt / e.inertia + G * meanB);
        Tc = clamp(TcLock, -Cmax, Cmax);
      }
      if (locked) {
        const wl = meanA + meanB * Tc;
        for (const i of driven) newOmega[i] = wl;
      } else {
        const lsd = m.diff === 'limited' ? 0.55 : 0;
        let mean = 0;
        for (const i of driven) { newOmega[i] = A[i] + (Tc * G * eff) / (driven.length * D[i]); mean += newOmega[i]; }
        mean /= driven.length;
        if (lsd) for (const i of driven) newOmega[i] = newOmega[i] + (mean - newOmega[i]) * lsd;
      }
      this.engineW = Math.max(0, this.engineW + (dt / e.inertia) * (Te - Tc));
      if (!this.running && this.engineW < 1) this.engineW = 0;
    }

    // Brakes (Coulomb, applied implicitly) and handbrake on non-steering wheels.
    for (let i = 0; i < n; i++) {
      const w = m.wheels[i];
      const maxB = 1400 * (w.radius / 0.375) * (m.mass / Math.max(n, 1) / 250);
      const B = brake * maxB + (ctl.handbrake && !w.steer ? maxB * 2.5 : 0);
      if (B > 0) {
        const dw = B / D[i];
        const o = newOmega[i];
        newOmega[i] = Math.abs(o) <= dw ? 0 : o - Math.sign(o) * dw;
      }
      this.wheels[i].omega = newOmega[i];
      this.wheels[i].spin = (this.wheels[i].spin + newOmega[i] * dt) % TAU;
    }

    // --- Pass 3: tyre forces -> impulses ---
    for (let i = 0; i < n; i++) {
      const s = this.wheels[i];
      if (!s.contact) continue;
      const w = m.wheels[i];
      const N = load[i];
      const muN = w.grip * N;
      const mEff = N / GRAVITY;
      const ref = Math.max(Math.abs(vL[i]), VMIN);
      const slipV = s.omega * w.radius - vL[i];
      let fx = muN * longCurve(slipV / ref);
      // Rolling resistance, plus a "parking stick" at walking pace so cars don't creep at rest.
      const av = Math.abs(vL[i]);
      const rr = 0.012 * N + (throttle < 0.02 && av < 0.6 ? 0.3 * N * (1 - av / 0.6) : 0);
      fx -= Math.sign(vL[i]) * Math.min(rr, (mEff * av) / dt);
      if (s.omega === 0) fx = clamp(fx, -(mEff * Math.abs(vL[i])) / dt, (mEff * Math.abs(vL[i])) / dt);
      const alpha = Math.atan2(vT[i], Math.max(Math.abs(vL[i]), VMIN * 0.75));
      let fy = -muN * latCurve(alpha);
      const capY = (mEff * Math.abs(vT[i])) / dt * 0.9;
      fy = clamp(fy, -capY, capY);
      const tot = Math.hypot(fx, fy);
      if (tot > muN && tot > 0) { fx *= muN / tot; fy *= muN / tot; }
      s.slip = Math.abs(slipV) / ref + Math.abs(alpha);
      const Fv = add(add(scale(up, N), scale(F[i], fx)), scale(Lt[i], fy));
      const at = add(P[i], scale(Nn[i], w.radius * 0.35));
      imp.push({ point: at, impulse: scale(Fv, dt) });
    }

    // Aerodynamic drag at the centre of mass.
    const sp = Math.hypot(body.linvel[0], body.linvel[1], body.linvel[2]);
    if (sp > 0.1) imp.push({ point: body.com, impulse: scale(body.linvel, -0.5 * AIR * m.cdA * sp * dt) });

    // Fuel and battery.
    if (e && this.running) {
      const rps = this.engineW / TAU;
      this.fuel = Math.max(0, this.fuel - e.burn * rps * (0.3 + 0.7 * throttle) * dt);
      if (this.fuel <= 0) this.running = false;
      this.battery = Math.min(1, this.battery + 0.002 * dt);
    }
    if (this.lights && m.battery > 0) {
      this.battery = Math.max(0, this.battery - (0.0008 * m.lamps.length * dt) / m.battery);
      if (this.battery <= 0) this.lights = false;
    }
    return imp;
  }

  /** Try to (re)start the engine. Needs fuel and battery charge. */
  ignition(on: boolean): boolean {
    if (!this.model.engine) return false;
    if (!on) { this.running = false; return true; }
    if (this.fuel > 0 && this.battery > 0.02) { this.running = true; this.battery -= 0.01; this.engineW = Math.max(this.engineW, this.model.engine.idleRps * TAU); return true; }
    return false;
  }

  telemetry(body: BodyState): Telemetry {
    const fwd = qrot(body.quat, [0, 0, -1]);
    return {
      speed: dot(body.linvel, fwd), rps: this.engineW / TAU, gear: this.gear, throttle: this.lastThrottle, clutch: this.clutch,
      fuel: this.fuel, fuelMax: this.model.fuel, battery: this.battery, running: this.running,
      grounded: this.wheels.filter((w) => w.contact).length, lights: this.lights,
    };
  }
}
