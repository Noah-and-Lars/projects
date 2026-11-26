// Procedural rider and bike animation. Every pose channel is a scalar that
// chases a target with an ease, a spring or a rate limit; the body is built
// by adding channels together and the hands and feet are pinned with IK
// (models.js). A small vertical simulation of the fork, shock and the
// rider's legs supplies bounce, dive and the arms giving on landings.

import * as THREE from 'three';
import { clamp } from './noise.js';

const TAU = Math.PI * 2;
const COM = 0.85;                       // rider+bike centre of mass above the axle line
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (x, t, rate, dt) => x + (t - x) * Math.min(1, dt * rate);

// Critically damped spring (two half steps for stability).
function spring(st, key, target, w, dt) {
  const h = dt / 2;
  for (let i = 0; i < 2; i++) {
    st[key + 'V'] += (w * w * (target - st[key]) - 2 * w * st[key + 'V']) * h;
    st[key] += st[key + 'V'] * h;
  }
  return st[key];
}

// ---------------------------------------------------------- suspension --
// Front and rear sprung points over the wheels, and the rider's legs as a
// spring on top. Excited by the ground moving under each wheel, landings,
// braking weight transfer and pops.
class Suspension {
  constructor(bike) {
    this.travelF = bike.travelF; this.travelR = bike.travelR || 0.05;
    this.wb = bike.wb;
    this.y = [0, 0]; this.v = [0, 0];       // compression (+) of front / rear, m
    this.leg = 0; this.legV = 0;            // rider crouch (+ = lower)
    this.frontLoad = 0;
    this.prevG = null;
  }
  kick(front, rear) { this.v[0] += front; this.v[1] += rear; }
  step(dt, s) {
    // s: { grounded, gF, gR (ground heights under the wheels), decel, lift, crouch }
    const g = 9.81;
    const dG = this.prevG ? [(s.gF - this.prevG[0]) / dt, (s.gR - this.prevG[1]) / dt] : [0, 0];
    this.prevG = [s.gF, s.gR];
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    const w = 2 * Math.PI * 2.2, wl = 2 * Math.PI * 1.9;
    let load = 0;
    for (let k = 0; k < n; k++) {
      let acc = 0;
      for (let i = 0; i < 2; i++) {
        const tr = i ? this.travelR : this.travelF;
        if (!s.grounded || (i === 0 && s.lift > 0.08) || (i === 1 && s.lift < -0.08)) {
          // Unloaded: extend toward the top-out quickly.
          this.v[i] += (-w * w * (this.y[i] + 0.02) - 2 * w * this.v[i]) * h;
        } else {
          const prog = 1 + 3 * (Math.max(0, this.y[i]) / tr) ** 2;
          const damp = 0.6 * (this.v[i] < 0 ? 2 / 0.6 * 0.6 : 1);
          const transfer = (i === 0 ? 1 : -1) * s.decel * 0.012;
          let a = -w * w * prog * (this.y[i] - 0.25 * tr - transfer) - 2 * damp * w * Math.sqrt(prog) * this.v[i];
          // The ground rising under the wheel pushes it into its travel.
          a += clamp(dG[i], -6, 6) * 12 * (1 / n);
          this.v[i] += a * h;
          acc += a;
        }
        this.y[i] += this.v[i] * h;
        if (this.y[i] > tr) { this.y[i] = tr; if (this.v[i] > 0) this.v[i] *= -0.2; }
        if (this.y[i] < -0.03) { this.y[i] = -0.03; if (this.v[i] < 0) this.v[i] = 0; }
      }
      // Legs soak what the bike throws at them; the rider crouches on demand.
      const target = clamp(s.crouch * 0.08, 0, 0.08);
      const prog = 1 + 4 * (Math.max(0, this.leg) / 0.28) ** 2;
      this.legV += (acc * 0.004 - wl * wl * prog * (this.leg - target) - 2 * 1.5 * wl * this.legV * (this.legV < 0 ? 1.6 : 1)) * h;
      this.leg = clamp(this.leg + this.legV * h, -0.06, 0.28);
      load += Math.max(0, this.y[0] - 0.25 * this.travelF) / this.travelF;
    }
    this.frontLoad = s.grounded ? (load / n) * 3 + Math.max(0, this.v[0]) * 1.2 : 0;
    void g;
  }
}

// ------------------------------------------------------------- animator --
export class RiderAnimator {
  constructor(bike, rider) {
    this.bike = bike; this.rider = rider;
    this.susp = new Suspension(bike);
    const st = this.st = {};
    for (const k of ['low', 'weight', 'head', 'barCatch', 'superBike']) { st[k] = 0; st[k + 'V'] = 0; }
    this.crouch = 0; this.pedalVis = 0; this.manualVis = 0; this.windVis = 0; this.armGive = 0;
    this.spinPose = 0; this.twist = 0; this.lay = 0; this.lastWhip = 0; this.whipRate = 0; this.settle = 0;
    this.barOffR = 0; this.barRide = 0; this.barReady = 0; this.barLook = 0; this.barFrom = 0; this.wasBar = false;
    this.bunnyPull = 0; this.bunnyPush = 0;
    this.steerVis = 0; this.crank = Math.PI / 2;
    this.airT = 0; this.wasAir = false; this.landOff = new THREE.Vector3(); this.airOff = new THREE.Vector3();
    this.prevSpeed = 0;
    this.v = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.inv = new THREE.Matrix4();
  }

  onLand(e) {
    // Land: split the hit between the wheels by which one touched first.
    const k = Math.min(3, e.vn * 0.55);
    this.susp.kick(k * (e.first === 'rear' ? 0.6 : 1), k * (e.first === 'front' ? 0.6 : 1));
    this.susp.legV += Math.min(2.5, e.vn * 0.35);
  }
  onPop() { this.susp.kick(-0.6, -0.6); this.susp.legV -= 0.9; }

  /**
   * Pose everything for this frame.
   * sim: physics state; ctx: { gF, gR, crash, root (Object3D) }
   */
  update(dt, sim, ctx) {
    const b = this.bike, st = this.st;
    const air = !sim.grounded;
    const speed = Math.abs(sim.grounded ? sim.speed : sim.hSpeed());
    const decel = clamp((this.prevSpeed - speed) / Math.max(dt, 1e-3), -5, 12);
    this.prevSpeed = speed;

    // ---- Suspension.
    this.susp.step(dt, {
      grounded: !air, gF: ctx.gF, gR: ctx.gR, decel: air ? 0 : decel,
      lift: sim.lift || 0, crouch: Math.max(sim.preload, sim.compress * 0.6),
    });
    const sF = this.susp.y[0], sR = this.susp.y[1];
    b.setSuspension(sF / Math.max(0.3, b.steerAxisY), sR);
    const dive = Math.atan2(sF - sR, b.wb);
    const bob = -(sF + sR) * 0.5;

    // ---- Simple channels.
    this.pedalVis = ease(this.pedalVis, sim.pedaling ? 1 : 0, 5, dt);
    this.crouch += clamp(sim.preload - this.crouch, -dt / 0.28, dt / 0.3);
    const speedLow = air ? 0 : 0.7 * clamp((speed - 4) / 11, 0, 1);
    const lowT = Math.max(0.6 * this.pedalVis, 0.2 * Math.abs(sim.steerVis), 0.85 * sim.brakeVis, speedLow);
    spring(st, 'low', lowT, 22, Math.min(dt, 0.05));
    const cr = this.crouch, crS = cr * cr * cr * (cr * (cr * 6 - 15) + 10);
    const low = st.low + crS * Math.max(0, 1 - st.low);
    spring(st, 'weight', sim.weightIn || 0, 16, Math.min(dt, 0.05));
    const fwd = Math.max(0, st.weight);
    const manualT = air ? 0 : Math.max(ss(0, 0.3, sim.manual), sim.windT > 0 ? ss(0.1, 0.35, sim.windT) : 0);
    this.manualVis = ease(this.manualVis, manualT, 18, dt);
    this.windVis = ease(this.windVis, !air && sim.windT > 0 ? ss(0, 0.12, sim.windT) * (1 - manualT) : 0, 18, dt);
    const back = Math.max(Math.max(0, -st.weight) * (1 - this.windVis), this.manualVis);
    const stoppie = ss(0, 0.3, sim.stoppie);
    const giveT = air || sim.preload > 0.05 ? 0 : ss(1.2, 3, this.susp.frontLoad);
    this.armGive += (giveT - this.armGive) * Math.min(1, dt * (giveT > this.armGive ? 30 : 7));
    this.spinPose = ease(this.spinPose, air ? clamp(sim.spinVel / 4.8, -1, 1) * 0.45 : 0, 10, dt);
    const r1 = clamp(this.spinPose + sim.steerVis * 0.45 * (air ? 1 : 1 + 0.3 * clamp((speed - 4) / 6, 0, 1)), -0.45, 0.45);
    const noHand = ss(0, 0.6, sim.noHand), noHandLate = ss(0.3, 1, sim.noHand);
    const sup = sim.superman;
    spring(st, 'superBike', sup, 16, Math.min(dt, 0.05));
    const superBike = clamp(Math.min(st.superBike, ss(0, 0.4, sup)), 0, 1);

    // ---- Bunny hop: pull the front up while standing, then push the bike away.
    const standing = sim.hopT >= 0;
    this.bunnyPull = ease(this.bunnyPull, standing ? 1 : 0, 28, dt);
    this.bunnyPush = ease(this.bunnyPush, sim.bunny && air && sim.airTime < 0.45 ? 1 : 0, standing ? 4 : 13, dt);

    // ---- Whip twist and lay, with a slow unwind when the angle jumps.
    const W = air ? sim.whip : 0;
    const dW = W - this.lastWhip;
    this.lastWhip = W;
    if (Math.abs(dW) > 0.3) this.settle = 0.5;
    this.whipRate = ease(this.whipRate, Math.abs(dW) > 0.3 ? 0 : dW / Math.max(dt, 1e-3), 10, dt);
    this.settle = Math.max(0, this.settle - dt);
    const wr = this.settle > 0 ? 3.5 : 14;
    this.twist = ease(this.twist, clamp(W, -1.9, 1.9), wr, dt);
    const layT = Math.sign(W) * (ss(0, 0.8, Math.abs(W)) + 0.25 * ss(0.8, 2.2, Math.abs(W)));
    this.lay = ease(this.lay, layT, wr, dt);
    b.setWhip(this.twist, 0.8 * this.lay);

    // ---- Barspin: right hand lets go and reaches for the catch, the left
    // rides the stem; the bar wobbles on the catch.
    const spinning = sim.barspin > 0;
    if (spinning && !this.wasBar) this.barFrom = sim.barAngle;
    this.wasBar = spinning;
    const spun = spinning ? sim.barAngle - this.barFrom : 0;
    this.barOffR = ss(0.4, 0.9, spun) * ss(0, 0.08, sim.barspin);
    this.barRide = ease(this.barRide, spinning ? ss(Math.PI / 3, 5 * Math.PI / 6, spun) * ss(0, 1.6, sim.barspin) : 0, spinning ? 8 : 16, dt);
    if (spinning) this.barReady = 1 - ss(1.6, 3.0, sim.barspin);
    this.barLook = ease(this.barLook, spinning ? 1 : 0, 8, dt);
    if (ctx.barCatch) { st.barCatchV += ctx.barCatch; ctx.barCatch = 0; }
    {
      // Underdamped (zeta 0.45) wobble after the catch.
      const w = 22, z = 0.45, h = dt / 2;
      for (let i = 0; i < 2; i++) { st.barCatchV += (-w * w * st.barCatch - 2 * z * w * st.barCatchV) * h; st.barCatch += st.barCatchV * h; }
    }
    const flick = clamp(0.32 * this.whipRate, -0.75, 0.75);
    this.steerVis = ease(this.steerVis, ctx.crash ? 0 : (0.45 * sim.steerVis + flick * 0.5) * (1 - noHand), 10, dt);
    b.setBar(-this.steerVis * 0.7 - sim.barAngle - st.barCatch * 0.05);

    // ---- Wheels and cranks: pedalling turns them with speed, coasting snaps
    // them level (relative to the world during manuals).
    b.roll(dt, ctx.crash ? 0 : air ? speed * 0.6 : sim.speed, sim.skid > 0.5 ? 1 : 0);
    if (sim.pedaling && !air) this.crank += dt * Math.max(3.5, 1.05 * speed);
    else {
      const L = Math.PI / 2 + (air ? 0 : sim.lift || 0);
      const k = Math.round((this.crank - L) / Math.PI);
      this.crank = ease(this.crank, L + k * Math.PI, air ? 16 : 6, dt);
    }
    b.setCrank(this.crank);

    // ---- Head: eyes stay near the horizon and drop to spot the landing.
    const approach = air ? 1 - clamp((sim.landIn - 0.2) / 1.3, 0, 1) : 0;
    const headT = air ? clamp(0.05 + 0.25 * approach + sim.pitch * 0.55, -0.6, 1) * (1 - this.barLook) + this.barLook * 0.5 : 0.04 * low;
    spring(st, 'head', headT, 14, Math.min(dt, 0.05));

    // ---- Root orientation and pivots.
    const r = ctx.root;
    let pitch = sim.pitch;
    if (!air) {
      // Manual / stoppie: rotate about the axle still on the ground.
      const lift = (sim.manual || 0) - (sim.stoppie || 0);
      const P = new THREE.Vector3(0, b.R, lift > 0 ? -b.wb / 2 : b.wb / 2);
      const a = P.clone().applyEuler(new THREE.Euler(-(pitch - lift) - dive, 0, 0));
      const c = P.clone().applyEuler(new THREE.Euler(-pitch - dive, 0, 0));
      this.v.copy(a).sub(c);
    } else this.v.set(0, 0, 0);
    // Air: blend the rotation centre from the contact point to the rider's
    // centre of mass after takeoff, and back as the landing comes up.
    if (air && !this.wasAir) this.airT = 0;
    if (!air && this.wasAir) this.landOff.copy(this.airOff);
    this.wasAir = air;
    if (air) {
      this.airT += dt;
      const k = ss(0, 0.5, this.airT) * (1 - ss(0.2, 1, sim.landNear));
      const up = new THREE.Vector3(0, COM, 0);
      const rot = up.clone().applyEuler(new THREE.Euler(-pitch, 0, 0, 'YXZ'));
      this.airOff.copy(up).sub(rot).multiplyScalar(k);
    } else this.airOff.set(0, 0, 0);
    this.landOff.multiplyScalar(Math.exp(-20 * dt));
    r.rotation.order = 'YXZ';
    r.rotation.set(-pitch - dive - 1.15 * superBike * 0.5, sim.yaw, -sim.roll * 0.9);
    const off = this.v.clone().add(this.airOff).add(this.landOff);
    off.y += bob;
    off.applyQuaternion(this.q.setFromEuler(new THREE.Euler(0, sim.yaw, 0)));
    r.position.set(sim.pos.x + off.x, sim.pos.y + off.y, sim.pos.z + off.z);

    // ---- Rider: body channels.
    const pull = this.bunnyPull, push = this.bunnyPush;
    const wbK = b.wb / 1.32;
    let drop = 0.12 * low * (1 - Math.min(1, pull + push)) + 0.055 * fwd + 0.22 * back + 0.08 * stoppie
      + 0.08 * this.windVis + 0.03 * this.armGive + this.susp.leg + 0.1 * Math.min(1, Math.abs(this.lay))
      + 0.04 * pull + 0.2 * push - (0.02 + 0.04 * noHandLate) * noHand - 0.06 * this.pedalVis * 0 + 0.06 * sim.brakeVis;
    let fore = 0.22 * fwd * wbK - 0.32 * back * wbK + 0.06 * stoppie * wbK + 0.29 * pull * wbK - 0.32 * push * wbK
      - 0.2 * this.susp.leg * wbK + 0.06 * this.pedalVis - 0.02 * sim.brakeVis + 0.09 * Math.abs(Math.sin(this.twist))
      - 0.06 * noHand * wbK - 0.4 * ss(0, 0.7, sup) * wbK;
    drop -= 0.2 * ss(0, 0.7, sup);
    let torso = 0.3 * low + 0.36 * fwd - 0.3 * back + 0.12 * this.windVis + 0.13 * this.armGive + 0.12 * Math.abs(r1) / 0.45
      + 0.2 * this.susp.leg + 0.1 * pull + 0.24 * push - (0.15 + 0.35 * noHandLate) * noHand + 0.42 * ss(0, 0.75, sup)
      + 0.45 * this.barLook * (1 - push);
    const hipYaw = 0.6 * r1 + 0.4 * this.spinPose - 0.4 * clamp(this.twist, -Math.PI / 2, Math.PI / 2);
    const hipRoll = -0.15 * r1 - 0.35 * this.spinPose + 0.35 * 0.8 * this.lay;
    const hipX = -0.13 * r1 - 0.22 * this.spinPose;
    const headYaw = -0.85 * clamp(this.twist, -1.2, 1.2) + 0.2 * r1;
    const headPitch = st.head + 0.04 * low + 1.4 * pull * 0.3 - 0.1 * push + 0.45 * Math.min(1, Math.abs(this.lay)) + 0.25 * noHand + 0.8 * ss(0, 0.75, sup);

    if (ctx.crash) {
      const k = Math.min(1, ctx.crashT / 0.6);
      drop = 0.3 * k; fore = 0.2 * k; torso = 1.0 * k;
    }

    // ---- Hands and feet targets (root space).
    r.updateMatrixWorld(true);
    this.inv.copy(r.matrixWorld).invert();
    const L = (v) => v.applyMatrix4(this.inv);
    const gl = L(b.worldGrip(0, new THREE.Vector3()));
    const gr = L(b.worldGrip(1, new THREE.Vector3()));
    const pl = L(b.worldPedal(0, new THREE.Vector3()));
    const pr = L(b.worldPedal(1, new THREE.Vector3()));
    const bbR = b.bb.clone().applyMatrix4(b.body.matrix).applyMatrix4(b.whipPivot.matrix);
    const hipGuess = new THREE.Vector3(hipX, bbR.y + 0.76 - drop, bbR.z - 0.14 + fore);
    const shoulderGuess = hipGuess.clone().add(new THREE.Vector3(0, 0.42, 0.25));
    // No-hander: arms sweep out and back on an arc, not a straight line.
    let handL = gl, handR = gr;
    if (noHand > 0.01) {
      handL = arc(shoulderGuess.clone().add(new THREE.Vector3(0.19, 0, 0)), gl, new THREE.Vector3(0.64, 0.15, -0.58), new THREE.Vector3(0.85, -0.22, -0.8), noHand);
      handR = arc(shoulderGuess.clone().add(new THREE.Vector3(-0.19, 0, 0)), gr, new THREE.Vector3(-0.64, 0.15, -0.58), new THREE.Vector3(-0.85, -0.22, -0.8), noHand);
    }
    let poleR = null;
    if (this.barOffR > 0.01) {
      // Right hand drops below the shoulder, then reaches for the catch.
      const sh = shoulderGuess.clone().add(new THREE.Vector3(-0.19, 0, 0));
      const hang = sh.clone().add(new THREE.Vector3(-0.05, -0.5, 0.05)).lerp(gr, 0.35);
      const free = hang.lerp(gr, this.barReady);
      handR = gr.clone().lerp(free, this.barOffR);
      poleR = new THREE.Vector3(-0.75, 0.05, -0.6);
    }
    if (this.barRide > 0.01) {
      // Left hand slides in toward the stem and rides the spin.
      const stem = gl.clone().lerp(gr, 0.5);
      handL = handL.clone().lerp(stem, 0.4 * this.barRide).add(new THREE.Vector3(0, 0.06 * this.barRide, 0));
    }
    let footL = pl, footR = pr;
    if (sup > 0.01) {
      const k = ss(0, 0.8, sup);
      footL = arc(hipGuess.clone().add(new THREE.Vector3(0.1, -0.05, 0)), pl, new THREE.Vector3(0.09, 0.27, -0.74), new THREE.Vector3(0.12, -0.75, -0.55), k);
      footR = arc(hipGuess.clone().add(new THREE.Vector3(-0.1, -0.05, 0)), pr, new THREE.Vector3(-0.09, 0.27, -0.74), new THREE.Vector3(-0.12, -0.75, -0.55), k);
    }
    if (ctx.crash) {
      handL = new THREE.Vector3(0.35, 0.9, 0.6); handR = new THREE.Vector3(-0.35, 0.95, 0.5);
      footL = new THREE.Vector3(0.2, 0.25, -0.1); footR = new THREE.Vector3(-0.2, 0.4, 0.15);
    }
    this.rider.pose({
      bb: bbR, handL, handR, footL, footR, poleR,
      drop, fore, hipX, torso, hipYaw, hipRoll, headPitch, headYaw,
      kneeOut: 0.2 + 0.55 * Math.min(1, Math.abs(this.lay)), toes: ss(0, 0.8, sup),
    });
  }
}

// Swing a limb end from its home target toward a free point (given relative
// to the root joint) along a curved path through `mid` (a direction).
function arc(root, home, freeRel, mid, t) {
  const u = home.clone().sub(root);
  const lu = u.length();
  const v = freeRel.clone();
  const lv = v.length();
  u.normalize(); v.normalize();
  const m = mid.clone().normalize();
  const a = (1 - t) * (1 - t), bq = 2 * (1 - t) * t, c = t * t;
  const dir = u.multiplyScalar(a).add(m.multiplyScalar(bq)).add(v.multiplyScalar(c)).normalize();
  return root.clone().addScaledVector(dir, lu + (lv - lu) * t);
}

void TAU;
