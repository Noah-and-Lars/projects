// Bike physics. Pure math, no three.js, so the jump designer and the node
// tests can run the exact same integrator the game uses.
//
// Conventions: Y is up. Heading `yaw` points the bike along
// (sin yaw, 0, cos yaw). Right is (-cos yaw, 0, sin yaw). `pitch` is
// positive nose-up. `pos` is the point midway between the two tyre contact
// patches.

import { clamp, wrapAngle } from './noise.js';

export const G = 9.81;
const TAU = Math.PI * 2;

export const BIKES = {
  trail: {
    id: 'trail', name: 'Trail 140', type: 'Full suspension', price: 0,
    desc: 'The all-rounder: 140 mm of travel, quick to pedal, easy to throw around.',
    wb: 1.18, pedalAcc: 4.2, vPedal: 14.0, brake: 7.5, grip: 0.62,
    flipAcc: 15, flipMax: 6.4, spinMax: 7.2, impact: 12.5, barspin: true,
    color: '#e8562a', stats: { speed: 3, air: 3, grip: 3, tough: 3 },
  },
  dj: {
    id: 'dj', name: 'Slab DJ', type: 'Dirt jumper', price: 300,
    desc: 'Small wheels, slammed saddle, rigid back end. Spins and flips fast, lands hard.',
    wb: 1.06, pedalAcc: 4.6, vPedal: 12.6, brake: 7.0, grip: 0.58,
    flipAcc: 19, flipMax: 7.8, spinMax: 9.2, impact: 11.0, barspin: true,
    color: '#2fb8e6', stats: { speed: 2, air: 5, grip: 2, tough: 2 },
  },
  enduro: {
    id: 'enduro', name: 'Scree 170', type: 'Enduro', price: 650,
    desc: 'Long, slack and planted. Holds a line in the rough and soaks up casings.',
    wb: 1.24, pedalAcc: 4.3, vPedal: 15.0, brake: 8.2, grip: 0.7,
    flipAcc: 13.5, flipMax: 6.0, spinMax: 6.6, impact: 13.5, barspin: true,
    color: '#8bc34a', stats: { speed: 4, air: 3, grip: 4, tough: 4 },
  },
  dh: {
    id: 'dh', name: 'Gravity 200', type: 'Downhill (dual crown)', price: 1200,
    desc: 'Two hundred millimetres and a dual-crown fork. Flat-out fast, forgiving, slow to rotate. No barspins.',
    wb: 1.28, pedalAcc: 4.0, vPedal: 16.0, brake: 9.0, grip: 0.76,
    flipAcc: 12, flipMax: 5.4, spinMax: 5.8, impact: 15.0, barspin: false,
    color: '#f2c230', stats: { speed: 5, air: 2, grip: 5, tough: 5 },
  },
};

export const POP_V = 2.45;      // flat pop: ~30 cm
export const HOP_V = 3.3;       // bunny hop from a manual: ~55 cm
export const POP_LIP = 1.35;    // a pop off a jump face adds to the face's throw
const CRR = 0.014;
const CD = 0.0034;              // per metre (a = CD * v^2)
const POP_GRACE = 0.12;         // late pop window after leaving a lip
export const IMPACT_CLEAN = 5.5;  // m/s into the ground: below this costs nothing
export const IMPACT_FULL = 13;    // ...and the speed cost tops out here

function emptyInput() {
  return {
    throttle: 0, brake: 0, steer: 0, weight: 0, spin: 0,
    jumpHeld: false, jumpPressed: false, jumpReleased: false,
    barspinTap: false, noHand: 0, superman: 0,
  };
}
export { emptyInput };

export class BikeSim {
  constructor(ground, bike = BIKES.trail) {
    this.ground = ground;   // { height(x, z) }
    this.bike = bike;
    this.reset(0, 0, 0, 0, 0);
    this.events = [];
    this.surface = { roll: 1, grip: 1 };
    this.assist = { airPitch: null, airGain: 0, straighten: 0 };
  }

  reset(x, y, z, yaw, speed) {
    this.pos = { x, y, z };
    this.yaw = yaw;
    this.pitch = 0;
    this.pitchVel = 0;
    this.spinVel = 0;
    this.whip = 0;
    this.whipMax = 0;
    this.roll = 0;
    this.grounded = true;
    this.airTime = 0;
    this.manual = 0;
    this.stoppie = 0;
    this.barspin = 0;          // remaining radians of the current barspin
    this.barAngle = 0;         // visual bar rotation
    this.barspins = 0;
    this.noHand = 0;
    this.superman = 0;
    this.preload = 0;
    this.popUsed = false;
    this.speed = speed;
    this.groundPitch = 0;
    this.compress = 0;
    this.steerVis = 0;
    this.pedalPhase = 0;
    this.air = null;           // per-jump trick bookkeeping
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (this.ground) {
      const h = this.wheelGround(x, z, fx, fz);
      this.pos.y = h.c;
      this.groundPitch = Math.atan(h.slope);
      this.pitch = this.groundPitch;
      const tl = Math.hypot(1, h.slope);
      this.vel = { x: fx * speed / tl, y: h.slope * speed / tl, z: fz * speed / tl };
    } else {
      this.vel = { x: fx * speed, y: 0, z: fz * speed };
    }
  }

  wheelGround(x, z, fx, fz) {
    const w2 = this.bike.wb / 2;
    const hF = this.ground.height(x + fx * w2, z + fz * w2);
    const hR = this.ground.height(x - fx * w2, z - fz * w2);
    const hc = this.ground.height(x, z);
    const avg = (hF + hR) / 2;
    // Over a convex edge (a lip, a drop, the crest of a roller) the ground
    // under the middle is higher than the wheels' average: the bike rides it
    // until the middle has passed the edge, pitched like its rear half.
    const full = clamp((hF - hR) / this.bike.wb, -1.2, 1.2);
    const e = hc - avg;
    if (e > 0) {
      // Continuous hand-over from the two wheels to the middle.
      const t = Math.min(1, e / 0.04);
      const rear = clamp((hc - hR) / w2, -1.2, 1.2);
      return { f: hF, r: hR, c: hc, slope: full + (rear - full) * t, edge: t >= 1 };
    }
    return { f: hF, r: hR, c: avg, slope: full };
  }

  hSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  step(dt, inp) {
    this.events.length = 0;
    if (this.grounded) this.stepGround(dt, inp);
    else this.stepAir(dt, inp);
    return this.events;
  }

  stepGround(dt, inp) {
    const b = this.bike;
    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const wg = this.wheelGround(this.pos.x, this.pos.z, fx, fz);
    const slope = wg.slope;
    let tl = Math.hypot(1, slope);
    let ty = slope / tl;
    let u = (this.vel.x * fx + this.vel.z * fz) / tl + this.vel.y * ty;

    // Lateral slope (bank) for grip.
    const rx = -fz, rz = fx;
    const hl = this.ground.height(this.pos.x - rx * 0.5, this.pos.z - rz * 0.5);
    const hr = this.ground.height(this.pos.x + rx * 0.5, this.pos.z + rz * 0.5);
    const bankSlope = (hr - hl); // >0: right side higher

    // Manual / stoppie (weight on the ground). weight > 0 = forward.
    const wantManual = inp.weight < -0.15 ? clamp(-inp.weight, 0, 1) * 0.34 : 0;
    const wantStoppie = inp.weight > 0.15 && u > 2 ? clamp(inp.weight, 0, 1) * 0.26 : 0;
    this.manual += (wantManual - this.manual) * Math.min(1, dt * 7);
    this.stoppie += (wantStoppie - this.stoppie) * Math.min(1, dt * 7);

    let a = -G * ty;
    if (inp.throttle > 0 && u > -0.5 && this.stoppie < 0.05) {
      a += inp.throttle * b.pedalAcc * Math.max(0, 1 - Math.max(u, 0) / b.vPedal);
      this.pedalPhase += dt * (2 + Math.max(u, 0) * 0.9) * inp.throttle;
    }
    let brake = inp.brake + this.stoppie * 2.5;
    if (brake > 0) {
      if (u > 0.4) a -= Math.min(brake, 1.4) * b.brake;
      else if (inp.brake > 0 && u > -2.2) a -= inp.brake * 2.2; // reverse
    }
    const roll = CRR * G * this.surface.roll + CD * u * u;
    a -= Math.sign(u) * roll;
    let u2 = u + a * dt;
    if (brake > 0 && u > 0.4 && u2 < 0) u2 = 0;
    if (Math.abs(u2) < 0.05 && inp.throttle === 0 && !(inp.brake > 0)) {
      // Rest on gentle slopes instead of creeping.
      if (Math.abs(G * ty) < CRR * G * this.surface.roll * 1.5) u2 = 0;
    }
    u = u2;

    // Steering (grip-limited, berms help).
    const sp = Math.abs(u);
    const steerRate = Math.min(2.4, 10 / Math.max(sp, 1));
    const turningRight = inp.steer > 0;
    const bankHelp = clamp((turningRight ? -bankSlope : bankSlope), -0.3, 1.2);
    const grip = G * (b.grip * this.surface.grip + Math.max(0, bankHelp) * 0.9);
    let yawRate = -inp.steer * steerRate * (u < 0 ? -1 : 1);
    const maxRate = grip / Math.max(sp, 0.5);
    if (Math.abs(yawRate) > maxRate) {
      // Scrub speed when asking for more than the tyres can give.
      const over = Math.abs(yawRate) / maxRate - 1;
      u -= Math.sign(u) * Math.min(Math.abs(u), over * 2.5 * dt);
      yawRate = Math.sign(yawRate) * maxRate;
    }
    this.yaw += yawRate * dt;
    this.roll += (clamp(-yawRate * sp / G, -0.8, 0.8) - this.roll) * Math.min(1, dt * 8);
    this.steerVis += (inp.steer - this.steerVis) * Math.min(1, dt * 10);

    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    tl = Math.hypot(1, slope);
    this.vel.x = fx * u / tl;
    this.vel.z = fz * u / tl;
    this.vel.y = slope * u / tl;
    this.speed = u;

    const yTan = this.pos.y + this.vel.y * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const wg2 = this.wheelGround(this.pos.x, this.pos.z, fx, fz);
    const drop = yTan - wg2.c;
    this.groundPitch = Math.atan(wg2.slope);

    // Preload crouch.
    this.preload += ((inp.jumpHeld ? 1 : 0) - this.preload) * Math.min(1, dt * 9);

    // Bunny hop: front wheel up, press jump.
    if (inp.jumpPressed && this.manual > 0.1) {
      this.takeoff(yTan, wg);
      const n = this.normalAt();
      const k = HOP_V * (0.6 + 0.4 * clamp(this.manual / 0.34, 0, 1));
      this.vel.x += n.x * k; this.vel.y += n.y * k; this.vel.z += n.z * k;
      this.pitchVel = -this.manual * 2.5;
      this.popUsed = true;
      this.events.push({ type: 'pop', kind: 'hop' });
      return;
    }
    if (inp.jumpReleased && !inp.jumpPressed) {
      this.takeoff(Math.max(yTan, wg2.c), wg);
      const n = this.normalAt();
      // Off a jump face the pop adds to the face's throw; on the flat it's
      // a full hop.
      const k = slope > 0.15 ? POP_LIP : POP_V;
      this.vel.x += n.x * k; this.vel.y += n.y * k; this.vel.z += n.z * k;
      this.popUsed = true;
      this.events.push({ type: 'pop', kind: 'ground' });
      return;
    }

    if (drop > 0.5 * G * dt * dt * 1.2 + 0.0015 && u > 1.5) {
      this.takeoff(yTan, wg);
      this.events.push({ type: 'takeoff' });
    } else {
      this.compress = clamp(this.compress * 0.9 + Math.max(0, -drop) * 2, 0, 1);
      this.pos.y = wg2.c;
      this.pitch = this.groundPitch + this.manual - this.stoppie;
    }
  }

  normalAt() {
    const e = 0.25, x = this.pos.x, z = this.pos.z, gr = this.ground;
    let dx = (gr.height(x + e, z) - gr.height(x - e, z)) / (2 * e);
    let dz = (gr.height(x, z + e) - gr.height(x, z - e)) / (2 * e);
    // Across an edge the difference is a cliff, not a surface: cap at ~50°.
    const gm = Math.hypot(dx, dz);
    let k = gm > 1.2 ? 1.2 / gm : 1;
    const l = Math.hypot(dx * k, 1, dz * k);
    return { x: -dx * k / l, y: 1 / l, z: -dz * k / l };
  }

  takeoff(y, wg) {
    this.grounded = false;
    this.pos.y = y;
    this.airTime = 0;
    this.pitch = Math.atan(wg.slope) + this.manual - this.stoppie;
    this.pitchVel = 0;
    this.spinVel = 0;
    this.popUsed = false;
    this.whip = 0;
    this.air = {
      startY: y, maxY: y, pitch0: this.pitch, yaw0: this.yaw,
      rotPitch: 0, rotYaw: 0, whipMax: 0, noHand: 0, superman: 0, barspins: 0,
    };
  }

  stepAir(dt, inp) {
    const b = this.bike;
    this.airTime += dt;
    const v = this.vel;
    const sp = Math.hypot(v.x, v.y, v.z);
    const drag = CD * sp;
    v.x -= v.x * drag * dt; v.y -= v.y * drag * dt; v.z -= v.z * drag * dt;
    v.y -= G * dt;

    // Late pop: the rear wheel is still on the lip.
    if (inp.jumpReleased && !this.popUsed && this.airTime < POP_GRACE) {
      v.y += POP_LIP;
      this.popUsed = true;
      this.events.push({ type: 'pop', kind: 'late' });
    }

    this.pos.x += v.x * dt; this.pos.y += v.y * dt; this.pos.z += v.z * dt;
    this.air.maxY = Math.max(this.air.maxY, this.pos.y);

    const hs = Math.hypot(v.x, v.z);
    const velPitch = Math.atan2(v.y, Math.max(hs, 0.01));
    const velYaw = Math.atan2(v.x, v.z);

    // Pitch: hold ↑/↓ to rotate; let go and the bike drifts back toward the
    // flight path (or the landing, with assist).
    const w = inp.weight;
    const prevPitch = this.pitch;
    if (Math.abs(w) > 0.12) {
      this.pitchVel += -w * b.flipAcc * dt;
      this.pitchVel = clamp(this.pitchVel, -b.flipMax, b.flipMax);
    } else {
      let target = velPitch;
      let kP = 3.2, kD = 3.4;
      if (this.assist.airPitch !== null) {
        target = target + (this.assist.airPitch - target) * this.assist.airGain;
        kP += 4 * this.assist.airGain; kD += 2 * this.assist.airGain;
      }
      target += TAU * Math.round((this.pitch - target) / TAU);
      this.pitchVel += ((target - this.pitch) * kP - this.pitchVel * kD) * dt;
    }
    this.pitch += this.pitchVel * dt;
    this.air.rotPitch += this.pitch - prevPitch;

    // Spin about the vertical.
    const prevYaw = this.yaw;
    if (Math.abs(inp.spin) > 0.12) {
      const target = -inp.spin * b.spinMax;
      this.spinVel += (target - this.spinVel) * Math.min(1, dt * 6);
    } else {
      let err = this.yaw - velYaw;
      const near = TAU * Math.round(err / TAU);
      err -= near;
      const k = 3.0 + this.assist.straighten * 4;
      this.spinVel += (-err * k * 2 - this.spinVel * 3.2) * dt;
    }
    this.yaw += this.spinVel * dt;
    this.air.rotYaw += this.yaw - prevYaw;

    // Whip: steer kicks the rear out, let go to straighten.
    const whipTarget = -inp.steer * 1.45;
    const rate = Math.abs(whipTarget) > Math.abs(this.whip) ? 7 : 4.2 + this.assist.straighten * 4;
    this.whip += (whipTarget - this.whip) * Math.min(1, dt * rate);
    this.air.whipMax = Math.max(this.air.whipMax, Math.abs(this.whip));

    // Poses.
    this.noHand += ((inp.noHand > 0.5 ? 1 : 0) - this.noHand) * Math.min(1, dt * 9);
    this.superman += ((inp.superman > 0.5 ? 1 : 0) - this.superman) * Math.min(1, dt * 8);
    if (this.noHand > 0.85) this.air.noHand += dt;
    if (this.superman > 0.85) this.air.superman += dt;

    // Barspin: one full turn of the bar.
    if (inp.barspinTap && b.barspin && this.noHand < 0.3) {
      if (this.barspin <= 0) this.barspin = TAU; else this.barspin += TAU;
    }
    if (this.barspin > 0) {
      const d = Math.min(this.barspin, dt * TAU / 0.42);
      this.barspin -= d;
      this.barAngle += d;
      if (this.barspin <= 1e-4) {
        this.barspin = 0;
        this.air.barspins += Math.round(this.barAngle / TAU);
        this.barAngle = 0;
      }
    }

    this.preload += (0 - this.preload) * Math.min(1, dt * 6);
    this.manual *= Math.max(0, 1 - dt * 4);
    this.stoppie *= Math.max(0, 1 - dt * 4);
    this.roll *= Math.max(0, 1 - dt * 3);
    this.steerVis += (0 - this.steerVis) * Math.min(1, dt * 6);

    // Contact?
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const w2 = b.wb / 2;
    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const rxw = this.pos.x - fx * w2 * cp, rzw = this.pos.z - fz * w2 * cp;
    const fxw = this.pos.x + fx * w2 * cp, fzw = this.pos.z + fz * w2 * cp;
    const yR = this.pos.y - spch * w2, yF = this.pos.y + spch * w2;
    const hR = this.ground.height(rxw, rzw), hF = this.ground.height(fxw, fzw);
    const hc = this.ground.height(this.pos.x, this.pos.z);
    const pen = 0.004;
    // Wheels only count once the rear has had time to clear a lip.
    const wheels = this.airTime > 0.12 && (yR < hR - pen || yF < hF - pen);
    if ((wheels || (this.airTime > 0.02 && this.pos.y < hc - 0.02)) && v.y < 0.5) {
      this.land(velYaw, velPitch);
    }
  }

  land(velYaw, velPitch) {
    const b = this.bike;
    const n = this.normalAt();
    const v = this.vel;
    const vn = -(v.x * n.x + v.y * n.y + v.z * n.z);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const wg = this.wheelGround(this.pos.x, this.pos.z, fx, fz);
    const gp = Math.atan(wg.slope);
    const pitchErr = wrapAngle(this.pitch - gp);
    const yawErr = wrapAngle(this.yaw - velYaw);
    const hs = this.hSpeed();
    const air = this.air || { rotPitch: 0, rotYaw: 0, whipMax: 0, noHand: 0, superman: 0, barspins: 0, startY: this.pos.y, maxY: this.pos.y };

    let crash = null;
    if (Math.abs(this.whip) > 0.45) crash = 'whip';
    else if (this.barspin > 0.5 && this.barspin < TAU - 0.35) crash = 'barspin';
    else if (pitchErr < -0.62 || pitchErr > 0.85) crash = 'pitch';
    else if (Math.abs(yawErr) > 0.7 && hs > 3) crash = 'pitch';
    else if (vn > b.impact) crash = 'impact';
    else if (this.noHand > 0.55 || this.superman > 0.55) crash = 'pose';

    const result = {
      type: 'land', crash, vn, pitchErr, yawErr, airTime: this.airTime,
      rotPitch: air.rotPitch, rotYaw: air.rotYaw, whipMax: air.whipMax,
      noHand: air.noHand, superman: air.superman, barspins: air.barspins,
      height: air.maxY - Math.min(air.startY, this.pos.y), hard: false,
    };

    // Settle on the ground: keep the tangential part of the velocity.
    const dot = v.x * n.x + v.y * n.y + v.z * n.z;
    v.x -= n.x * dot; v.y -= n.y * dot; v.z -= n.z * dot;
    let tangential = Math.hypot(v.x, v.y, v.z);
    // Line the bike up with where it is going.
    const remain = this.yaw - velYaw;
    this.yaw = velYaw + wrapAngle(remain) * 0.25;
    tangential *= Math.max(0.3, Math.cos(yawErr));
    // Impact cost: 0 below IMPACT_CLEAN, up to 30% of speed at IMPACT_FULL
    // (scaled by how much the bike soaks up).
    const soak = b.impact / 12.5;
    const hk = clamp((vn / soak - IMPACT_CLEAN) / (IMPACT_FULL - IMPACT_CLEAN), 0, 1);
    result.impactK = hk;
    if (!crash) {
      result.hard = hk >= 1 / 3;
      tangential *= 1 - 0.3 * hk;
    }
    // Landing nose-heavy or tail-heavy costs a little speed too.
    tangential *= 1 - Math.min(0.25, Math.abs(pitchErr) * 0.35);
    const fx2 = Math.sin(this.yaw), fz2 = Math.cos(this.yaw);
    const tl = Math.hypot(1, wg.slope);
    v.x = fx2 * tangential / tl; v.z = fz2 * tangential / tl; v.y = wg.slope * tangential / tl;
    this.speed = tangential;
    this.grounded = true;
    // Over an edge (one wheel above a drop) the average is far below: stay
    // put and let the next ground step drop the bike off naturally.
    this.pos.y = Math.max(wg.c, this.pos.y - 0.05);
    this.groundPitch = gp;
    this.pitch = gp;
    this.pitchVel = 0;
    this.spinVel = 0;
    this.whip = 0;
    this.barspin = 0; this.barAngle = 0;
    this.noHand = 0; this.superman = 0;
    this.compress = clamp(vn / 6, 0, 1);
    this.air = null;
    this.events.push(result);
  }
}
