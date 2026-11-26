// Bike physics. Pure math, no three.js, so the jump designer and the node
// tests can run the exact same integrator the game uses.
//
// Conventions: Y is up. Heading `yaw` points the bike along
// (sin yaw, 0, cos yaw). Right is (-cos yaw, 0, sin yaw). `pitch` is
// positive nose-up. `pos` is the point midway between the two tyre contact
// patches.
//
// Model in brief:
//  - Ground: speed along the heading plus a separate sideways velocity, so
//    asking more of the tyres than the banked-curve grip limit allows makes
//    the bike drift instead of turning; hard braking locks the rear.
//  - Takeoff happens when the ground falls away faster than gravity can
//    follow; the suspension soaks up part of a lip's upward kick.
//  - Air: a landing predictor drives the bike's natural follow of the arc,
//    an auto-align toward the landing slope in the last ~0.8 s, spin rounding
//    to whole turns, and whip limits that tighten as the ground comes up.
//  - Landing: impact into the slope costs speed; crossed-up landings turn into
//    a slide; only big mismatches crash.

import { clamp, wrapAngle } from './noise.js';

export const G = 9.81;
const TAU = Math.PI * 2;

// Each bike is described by its build (wheel radius m, suspension travel m,
// tyre width in, mass kg, head angle deg, wheelbase m); deriveBike() turns
// that into handling. Trail 140 is the reference (all factors 1).
export const BIKES = {
  trail: {
    id: 'trail', name: 'Trail 140', type: 'Full suspension', price: 0,
    desc: 'The all-rounder: 140 mm of travel, quick to pedal, easy to throw around.',
    wb: 1.18, wheelR: 0.37, travelM: 0.14, tyre: 2.4, mass: 14, head: 65, topKmh: 50, brake: 7.0, barspin: true,
    color: '#e8562a',
  },
  dj: {
    id: 'dj', name: 'Slab DJ', type: 'Dirt jumper', price: 300,
    desc: 'Small wheels, slammed saddle, rigid back end. Spins and flips fast, lands hard.',
    wb: 1.06, wheelR: 0.33, travelM: 0.08, tyre: 2.2, mass: 11, head: 69, topKmh: 45, brake: 6.6, barspin: true,
    color: '#2fb8e6',
  },
  enduro: {
    id: 'enduro', name: 'Scree 170', type: 'Enduro', price: 650,
    desc: 'Long, slack and planted. Holds a line in the rough and soaks up casings.',
    wb: 1.24, wheelR: 0.37, travelM: 0.17, tyre: 2.5, mass: 15.5, head: 63.5, topKmh: 54, brake: 7.4, barspin: true,
    color: '#8bc34a',
  },
  dh: {
    id: 'dh', name: 'Gravity 200', type: 'Downhill (dual crown)', price: 1200,
    desc: 'Two hundred millimetres and a dual-crown fork. Flat-out fast, forgiving, slow to rotate. No barspins.',
    wb: 1.28, wheelR: 0.37, travelM: 0.2, tyre: 2.5, mass: 17, head: 62.5, topKmh: 58, brake: 7.8, barspin: false,
    color: '#f2c230',
  },
};

// Handling from the build:
//  - airK: rotation agility, from mass and wheelbase (moment of inertia)
//  - massK: pop strength (rider + bike mass)
//  - travel: how much of a lip's kick the suspension soaks up
//  - impact: the landing speed (into the slope) that crashes you
//  - grip: tyre width; rough: sensitivity off the trail (small wheels, little travel)
//  - rmin: tightest turn (longer, slacker bikes turn wider); vPedal: pedalling top speed
export function deriveBike(b) {
  const ref = BIKES.trail;
  const inertia = (x) => 12 + x.mass * (x.wb / 2) ** 2;
  const soak = (x) => 0.3 + x.travelM;
  b.airK = inertia(ref) / inertia(b);
  b.massK = (75 + ref.mass) / (75 + b.mass);
  b.travel = soak(b) / soak(ref);
  b.impact = 18 * b.travel;
  b.grip = 1.05 * (1 + 0.3 * Math.log(b.tyre / ref.tyre)) * (b.id === 'dh' ? 1.06 : 1);
  b.rough = Math.sqrt((ref.wheelR / b.wheelR) / b.travel);
  b.rmin = 1.6 * (b.wb / 1.32) / (1 + 0.05 * (b.head - 63));
  b.vPedal = b.topKmh / 3.6 * 1.0;
  b.pedalAcc = 4.4 * Math.pow(b.massK, 2);
  const lvl = (v, lo, hi) => Math.max(1, Math.min(5, Math.round(1 + 4 * (v - lo) / (hi - lo))));
  b.stats = { speed: lvl(b.topKmh, 44, 58), air: lvl(b.airK, 0.85, 1.12), grip: lvl(b.grip, 1.0, 1.12), tough: lvl(b.impact, 15.5, 21) };
  return b;
}
for (const b of Object.values(BIKES)) deriveBike(b);

export const POP_FLAT = 3.0;      // ollie on the flat: ~45 cm
export const POP_LIP = 1.5;       // added to a kicker's throw
export const HOP_V = 3.6;         // bunny hop out of a manual
const HOP_STAND = 0.24;           // stand-up phase before a bunny hop pops
const CRR = 0.012;
const CD = 0.0042;                // a = CD * v^2 (tucked: 40% less)
const POP_GRACE = 0.12;           // late pop window after leaving a lip
const LONG_CROUCH = 0.8;          // holding jump longer than this on the flat just stands up
export const IMPACT_CLEAN = 5.5;  // m/s into the ground: below this costs nothing
export const IMPACT_FULL = 13;    // ...and the speed cost tops out here
const PITCH_ASSIST = 0.65;        // strength of the built-in landing auto-align
const DEG = Math.PI / 180;

function emptyInput() {
  return {
    throttle: 0, brake: 0, steer: 0, weight: 0, spin: 0,
    jumpHeld: false, jumpPressed: false, jumpReleased: false,
    barspinTap: false, noHand: 0, superman: 0,
  };
}
export { emptyInput };

// Rate-limited approach with a faster reverse (for flip/spin/whip rates).
function approach(v, target, acc, reverseK, dt) {
  const k = acc * (target * v < 0 ? reverseK : 1) * dt;
  return v + clamp(target - v, -k, k);
}

export class BikeSim {
  constructor(ground, bike = BIKES.trail) {
    this.ground = ground;   // { height(x, z) }
    this.bike = bike;
    this.events = [];
    this.surface = { roll: 1, grip: 1 };
    this.assist = { airPitch: null, airGain: 0, straighten: 0 };
    this.nearLip = false;   // set by the caller: on a kicker approach / just past a lip
    this.reset(0, 0, 0, 0, 0);
  }

  reset(x, y, z, yaw, speed) {
    this.pos = { x, y, z };
    this.yaw = yaw;
    this.pitch = 0;
    this.pitchVel = 0;
    this.spinVel = 0;
    this.whip = 0;
    this.whipVel = 0;
    this.roll = 0;
    this.grounded = true;
    this.airTime = 0;
    this.lift = 0;             // + manual (front up), - stoppie (rear up), rad
    this.manual = 0;
    this.stoppie = 0;
    this.windT = 0;
    this.barspin = 0;          // remaining radians of the current barspin
    this.barAngle = 0;         // visual bar rotation (accumulated)
    this.barVel = 0;
    this.barCatchV = 5;
    this.barRate = 0;
    this.noHand = 0;
    this.superman = 0;
    this.handsBack = 0;
    this.trickLatch = 0;
    this.preload = 0;
    this.jumpHeldT = 0;
    this.popUsed = false;
    this.popKind = null;
    this.hopT = -1;
    this.hopFrom = 0;
    this.bunny = false;
    this.riderTurned = false;
    this.speed = speed;
    this.vLat = 0;
    this.sliding = 0;
    this.rearGrip = 1;
    this.skid = 0;
    this.landFx = 0;
    this.lipSoak = 0;
    this.groundPitch = 0;
    this.compress = 0;
    this.steerVis = 0;
    this.pedalPhase = 0;
    this.pedaling = false;
    this.brakeVis = 0;
    this.landIn = 4;
    this.landNear = 0;
    this.landSlope = 0;
    this.predT = 0;
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
    // Where the front wheel would be if the ground carried on as it does
    // under the rear half (a parabola through three points behind it).
    const e = 0.3;
    const hRb = this.ground.height(x - fx * (w2 + e), z - fz * (w2 + e));
    const x0 = -(w2 + e), x1 = -w2, x2 = 0, xf = w2;
    const L0 = ((xf - x1) * (xf - x2)) / ((x0 - x1) * (x0 - x2));
    const L1 = ((xf - x0) * (xf - x2)) / ((x1 - x0) * (x1 - x2));
    const L2 = ((xf - x0) * (xf - x1)) / ((x2 - x0) * (x2 - x1));
    const hFext = Math.min(hRb * L0 + hR * L1 + hc * L2, hc + 1.2 * w2);
    // Past a lip or a drop edge the front wheel has nothing under it: the bike
    // rides the rear wheel's line until the rear leaves too.
    // Only a real edge (ground under the front well below where it should
    // be) hands over, and continuously from 3 cm.
    const lostK = clamp((hFext - hF - 0.03) / 0.04, 0, 1);
    const fh = hF + (hFext - hF) * lostK;
    const lost = lostK > 0.5;
    const avg = (fh + hR) / 2;
    const c = Math.max(avg, lost ? -Infinity : hc);
    return { f: hF, r: hR, c, slope: clamp((fh - hR) / this.bike.wb, -1.2, 1.2), edge: lost };
  }

  hSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  step(dt, inp) {
    this.events.length = 0;
    this.weightIn = inp.weight;
    this.handsBack = Math.max(0, this.handsBack - dt);
    this.landFx = Math.max(0, this.landFx - dt / 0.7);
    if (this.grounded) this.stepGround(dt, inp);
    else this.stepAir(dt, inp);
    return this.events;
  }

  // ------------------------------------------------------------ ground --

  stepGround(dt, inp) {
    const b = this.bike;
    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let rx = -fz, rz = fx;
    const wg = this.wheelGround(this.pos.x, this.pos.z, fx, fz);
    const slope = wg.slope;
    let tl = Math.hypot(1, slope);
    let ty = slope / tl;
    let u = (this.vel.x * fx + this.vel.z * fz) / tl + this.vel.y * ty;
    let vLat = this.vel.x * rx + this.vel.z * rz;

    const back = Math.max(0, -inp.weight), fwd = Math.max(0, inp.weight);

    // ---- Manual / stoppie. A short pull back is a weighting (wind-up); keep
    // pulling and the front comes up, and keeps coming: hold it with taps,
    // drag the rear brake, or loop out.
    if (back > 0.15 && this.lift <= 0.02) this.windT += dt; else if (back <= 0.15) this.windT = 0;
    const countering = (fwd > 0.15 && this.lift > 0.01) || (back > 0.15 && this.lift < -0.01);
    if (this.hopT >= 0) {
      // Bunny-hop stand phase: the front keeps rising, then it pops.
      this.hopT += dt;
      const t = Math.min(1, this.hopT / HOP_STAND);
      const target = this.hopFrom + Math.max(0, 0.9 * (0.6 - this.hopFrom));
      this.lift = this.hopFrom + (target - this.hopFrom) * t * t * (3 - 2 * t);
    } else if (countering) {
      this.lift += (0 - this.lift) * Math.min(1, dt * 12);
    } else if (back > 0.15 && (this.windT > 0.35 || this.lift > 0.02)) {
      const boost = 1 + 1.2 * Math.max(0, 1 - Math.abs(this.lift) / 0.3);
      this.lift += (back * 1.6 * b.airK * boost - 0.5 * this.lift - inp.brake * 2.5) * dt;
    } else if (fwd > 0.15 && u > 2) {
      this.lift += (-fwd * 0.26 - this.lift) * Math.min(1, dt * 6);
    } else {
      // Neutral: the lifted wheel settles back down.
      this.lift += (0 - this.lift) * Math.min(1, dt * (this.lift > 0 ? 2.2 : 6));
    }
    this.lift = Math.max(this.lift, -0.35);
    if (this.lift > 1.05) { this.lift = 0; this.events.push({ type: 'loopout' }); }
    this.manual = Math.max(0, this.lift);
    this.stoppie = Math.max(0, -this.lift);

    // ---- Longitudinal.
    let a = -G * ty;
    this.pedaling = inp.throttle > 0.05 && u > -0.5 && this.stoppie < 0.05;
    if (this.pedaling) {
      a += inp.throttle * b.pedalAcc * Math.max(0, 1 - Math.max(u, 0) / b.vPedal);
      this.pedalPhase += dt * Math.max(3.5, 1.05 * Math.max(u, 0)) * inp.throttle;
    }
    // Friction budget (classic banked-curve formula): berms help when you
    // turn into them, and cost a little when you turn against them.
    const hl = this.ground.height(this.pos.x - rx * 0.5, this.pos.z - rz * 0.5);
    const hr = this.ground.height(this.pos.x + rx * 0.5, this.pos.z + rz * 0.5);
    const bankSlope = hr - hl;                 // > 0: right side higher
    const turnSign = Math.sign(inp.steer);     // + = turning right
    let tanB = Math.abs(bankSlope);
    if (turnSign !== 0 && Math.sign(-bankSlope) !== turnSign) tanB = -0.5 * tanB;
    tanB = clamp(tanB, -0.6, 0.75);
    const mu = b.grip * this.surface.grip;
    const weightMul = 1 + 0.15 * fwd - 0.1 * back;
    const a1 = G * (mu + tanB) / Math.max(0.25, 1 - mu * tanB) * weightMul;
    // Brakes: past half the lever, the rear locks and slides.
    const brakeIn = inp.brake + this.stoppie * 2;
    let brakeDecel = 0, lock = 0;
    if (brakeIn > 0 && u > 0.4) {
      const req = Math.min(b.brake * Math.min(brakeIn, 1.4), u / dt);
      lock = inp.brake > 0 && u > 1 ? clamp((inp.brake - 0.5) / 0.3, 0, 1) : 0;
      brakeDecel = Math.min(req, 0.95 * a1) * (1 - lock * 0.35);
    } else if (inp.brake > 0 && u <= 0.4 && u > -2.2) {
      a -= inp.brake * 2.2; // reverse
    }
    a -= brakeDecel;
    this.skid = lock > this.skid ? lock : this.skid * Math.exp(-7 * dt);
    this.rearGrip = lock > 0 ? Math.min(this.rearGrip, 1 - lock * 0.7) : Math.min(1, this.rearGrip + 1.2 * dt);
    const drag = CD * (1 - 0.4 * this.preload);
    const roll = CRR * G * (this.surface.roll > 1 ? this.surface.roll * b.rough : 1) + drag * u * u + (this.sliding * 1.5);
    a -= Math.sign(u) * roll;
    let u2 = u + a * dt;
    if (brakeDecel > 0 && u2 < 0) u2 = 0;
    if (Math.abs(u2) < 0.05 && inp.throttle === 0 && !(inp.brake > 0) && Math.abs(G * ty) < CRR * G * 1.5) u2 = 0;
    u = u2;

    // ---- Steering. Yaw demand is limited by the bike's tightest radius and
    // by twice the grip; the velocity only follows as far as grip allows, so
    // over-asking slides.
    const P = Math.abs(u);
    const Rmin = b.rmin;
    const gripRate = a1 / Math.max(P, 1);
    let yawRate = -inp.steer * Math.min(P / Rmin, 2 * gripRate) * (u < 0 ? -1 : 1);
    const dyaw = yawRate * dt;
    this.yaw += dyaw;
    // Momentum doesn't rotate with the bike: re-express velocity in the new
    // heading frame, then let lateral friction pull it back in line.
    const cu = Math.cos(dyaw), su = Math.sin(dyaw);
    const u3 = u * cu - vLat * su;      // (rotation into the new frame)
    vLat = u * su + vLat * cu;
    u = u3;
    const aLat = Math.sqrt(Math.max(0, a1 * a1 - brakeDecel * brakeDecel)) * (0.25 + 0.75 * this.rearGrip) * (1 + 1.5 * this.landFx);
    const dl = Math.min(Math.abs(vLat), aLat * dt);
    vLat -= Math.sign(vLat) * dl;
    this.sliding = Math.min(1, Math.abs(vLat) / 4);
    this.vLat = vLat;

    const yawEff = P > 0.5 ? clamp(yawRate, -a1 / P, a1 / P) : 0;
    const leanT = clamp(0.7 * Math.atan(P * -yawEff / G), -0.7, 0.7);
    this.roll += (leanT - this.roll) * Math.min(1, dt * 8);
    this.steerVis += (inp.steer - this.steerVis) * Math.min(1, dt * 10);
    this.brakeVis += (Math.min(1, brakeIn) - this.brakeVis) * Math.min(1, dt * 8);

    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    rx = -fz; rz = fx;
    tl = Math.hypot(1, slope);
    this.vel.x = fx * u / tl + rx * vLat;
    this.vel.z = fz * u / tl + rz * vLat;
    this.vel.y = slope * u / tl;
    this.speed = u;

    const yTan = this.pos.y + this.vel.y * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const wg2 = this.wheelGround(this.pos.x, this.pos.z, fx, fz);
    const drop = yTan - wg2.c;
    this.groundPitch = Math.atan(wg2.slope);

    // ---- Preload and pops.
    this.preload += ((inp.jumpHeld ? 1 : 0) - this.preload) * Math.min(1, dt * 4);
    this.jumpHeldT = inp.jumpHeld ? this.jumpHeldT + dt : this.jumpHeldT;

    // Bunny hop: front wheel up, press (or release) jump: stand, then pop.
    if (this.hopT < 0 && this.lift > 0.12 && (inp.jumpPressed || inp.jumpReleased) && !this.nearLip) {
      this.hopT = 0;
      this.hopFrom = this.lift;
      this.jumpHeldT = 0;
    }
    if (this.hopT >= HOP_STAND) {
      this.hopT = -1;
      this.takeoff(Math.max(yTan, wg2.c), wg);
      const n = this.normalAt();
      const k = HOP_V * b.massK * (1 + 0.15 * Math.min(1, this.lift / 0.35));
      this.vel.x += n.x * k; this.vel.y += n.y * k; this.vel.z += n.z * k;
      this.bunny = true;
      this.popUsed = true;
      this.events.push({ type: 'pop', kind: 'hop' });
      return;
    }
    if (inp.jumpReleased && !inp.jumpPressed && this.hopT < 0) {
      const longCrouch = this.jumpHeldT > LONG_CROUCH && !this.nearLip;
      this.jumpHeldT = 0;
      if (!longCrouch) {
        this.takeoff(Math.max(yTan, wg2.c), wg);
        const onLip = this.nearLip || slope > 0.15;
        const k = (onLip ? POP_LIP : POP_FLAT) * b.massK * (1 + 0.2 * back);
        const n = this.normalAt();
        this.vel.x += n.x * k; this.vel.y += n.y * k; this.vel.z += n.z * k;
        this.popUsed = true;
        this.events.push({ type: 'pop', kind: onLip ? 'lip' : 'ground' });
        return;
      }
    }
    if (!inp.jumpHeld && !inp.jumpReleased) this.jumpHeldT = 0;

    if (drop > 0.5 * G * dt * dt * 1.2 + 0.0015 && u > 1.5 && this.hopT < 0) {
      this.takeoff(yTan, wg);
      // The suspension eats a fifth of a lip's upward kick (more travel, more soak).
      this.lipSoak = Math.max(0, this.vel.y) * 0.2 * b.travel;
      this.events.push({ type: 'takeoff' });
    } else {
      this.compress = clamp(this.compress * 0.9 + Math.max(0, -drop) * 2, 0, 1);
      this.pos.y = wg2.c;
      this.pitch = this.groundPitch + this.manual * 0.95 - this.stoppie;
    }
  }

  normalAt() {
    const e = 0.25, x = this.pos.x, z = this.pos.z, gr = this.ground;
    let dx = (gr.height(x + e, z) - gr.height(x - e, z)) / (2 * e);
    let dz = (gr.height(x, z + e) - gr.height(x, z - e)) / (2 * e);
    // Across an edge the difference is a cliff, not a surface: cap at ~50°.
    const gm = Math.hypot(dx, dz);
    const k = gm > 1.2 ? 1.2 / gm : 1;
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
    this.lipSoak = 0;
    this.riderTurned = false;
    this.bunny = false;
    this.hopT = -1;
    this.trickLatch = 0;
    // A sideways drift at takeoff shows as a whip: the bike keeps pointing
    // where it was while it flies where it was going.
    const velYaw = Math.atan2(this.vel.x, this.vel.z);
    this.whip = clamp(wrapAngle(this.yaw - velYaw), -1, 1);
    this.whipCarried = Math.abs(this.whip);
    this.yaw = velYaw;
    this.whipVel = 0;
    this.lift = 0;
    this.predT = 0;
    this.landIn = 4;
    this.landNear = 0;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.aimPitch0 = this.pitch;
    this.aimTraj0 = Math.atan2(this.vel.y, Math.max(1, hs));
    this.flightShare = 0; // set on the first air step (after the pop)
    this.takeoffPos = { x: this.pos.x, z: this.pos.z };
    this.air = {
      startY: y, maxY: y, pitch0: this.pitch, yaw0: this.yaw,
      rotPitch: 0, rotYaw: 0, whipMax: 0, noHand: 0, superman: 0, barspins: 0, firstStep: true,
    };
  }

  // Ballistic look-ahead for the landing: time to touchdown and the slope
  // there (along the flight direction).
  predictLanding() {
    let x = this.pos.x, y = this.pos.y, z = this.pos.z;
    const vx = this.vel.x, vz = this.vel.z;
    let vy = this.vel.y;
    const hs = Math.hypot(vx, vz) || 1;
    let prevY = y, prevG = this.ground.height(x, z);
    for (let i = 1; i <= 75; i++) {
      const dt = 0.04;
      vy -= G * dt;
      x += vx * dt; y += vy * dt; z += vz * dt;
      const g = this.ground.height(x, z);
      if (y <= g) {
        const f = (prevY - prevG) / Math.max(1e-4, (prevY - prevG) - (y - g));
        this.landIn = (i - 1 + clamp(f, 0, 1)) * dt;
        const ex = vx / hs * 0.6, ez = vz / hs * 0.6;
        this.landSlope = Math.atan((this.ground.height(x + ex, z + ez) - this.ground.height(x - ex, z - ez)) / 1.2);
        return;
      }
      prevY = y; prevG = g;
    }
    this.landIn = 4;
  }

  // --------------------------------------------------------------- air --

  stepAir(dt, inp) {
    const b = this.bike;
    if (!this.air) this.takeoff(this.pos.y, { slope: Math.tan(this.pitch) });
    this.airTime += dt;
    const v = this.vel;
    const sp = Math.hypot(v.x, v.y, v.z);
    const drag = CD * sp * (1 - 0.3 * this.preload);
    v.x -= v.x * drag * dt; v.y -= v.y * drag * dt; v.z -= v.z * drag * dt;
    v.y -= G * dt;

    // Late pop: the rear wheel is still on the lip.
    if (inp.jumpReleased && !this.popUsed && this.airTime < POP_GRACE && !this.bunny) {
      v.y += POP_LIP * b.massK;
      this.popUsed = true;
      this.events.push({ type: 'pop', kind: 'late' });
    }
    // Suspension soak drains once the rear wheel has left the lip.
    const hsNow = Math.hypot(v.x, v.z);
    if (this.lipSoak > 0 && this.airTime >= (b.wb / 2) / Math.max(hsNow, 1)) {
      const d = Math.min(this.lipSoak, 25 * dt);
      v.y -= d; this.lipSoak -= d;
    }

    this.pos.x += v.x * dt; this.pos.y += v.y * dt; this.pos.z += v.z * dt;
    this.air.maxY = Math.max(this.air.maxY, this.pos.y);

    const hs = Math.hypot(v.x, v.z);
    const traj = Math.atan2(v.y, Math.max(1, hs));
    const velYaw = Math.atan2(v.x, v.z);
    if (this.air.firstStep) {
      this.air.firstStep = false;
      this.aimTraj0 = traj;
      this.flightShare = Math.max(0, 1 - Math.abs(wrapAngle(this.pitch - traj)) / 0.35);
    }

    // Landing prediction (every few steps).
    this.predT -= dt;
    if (this.predT <= 0) { this.predictLanding(); this.predT = 0.03; } else this.landIn = Math.max(0, this.landIn - dt);
    const T = 1 - clamp((this.landIn - 0.05) / 0.75, 0, 1);
    this.landNear = T;
    const assistK = PITCH_ASSIST + this.assist.airGain * 0.7;
    const I = Math.min(1, dt * 20 * T * assistK / 0.65);
    const D = Math.max(4, 1 / Math.max(this.landIn, 0.05));
    const aimSlope = this.assist.airPitch !== null && this.assist.airGain > 0.5 ? this.assist.airPitch : this.landSlope;

    // ---- Pitch. Lean to flip (back = backflip). Hands off: the bike follows
    // the arc as well as it was lined up at takeoff, never nose-below the
    // landing, and in the last moments rights itself toward the slope.
    const lean = inp.weight;
    const prevPitch = this.pitch;
    const flipMax = 5.5 * b.airK, flipAcc = 14.5 * b.airK;
    if (Math.abs(lean) > 0.12) {
      this.riderTurned = true;
      this.pitchVel = approach(this.pitchVel, -lean * flipMax, flipAcc, 2, dt);
    } else if (this.bunny && !this.riderTurned) {
      // Bunny hop: level out toward the ground ahead.
      const err = wrapAngle(this.landSlope - this.pitch);
      const want = clamp(err * 12, -4.5 * b.airK, 4.5 * b.airK);
      this.pitchVel += (want - this.pitchVel) * Math.min(1, 14 * b.airK * dt);
    } else {
      let H = 0, corr = 0, rate = 2.4;
      if (!this.riderTurned) {
        let aim = this.aimPitch0 + this.flightShare * (traj - this.aimTraj0);
        let clamped = false;
        if (aim < this.landSlope) { aim = this.landSlope; clamped = true; }
        // Rotation rate of the arc itself.
        const arcRate = -G * Math.max(1, hs) / (Math.max(1, hs) ** 2 + v.y * v.y);
        H = clamped ? 0 : this.flightShare * arcRate;
        const g1 = (1 - Math.min(1, Math.abs(this.pitchVel - H) / 1.5)) * Math.min(1, this.airTime / 0.25);
        corr = wrapAngle(aim - this.pitch) * assistK * 3.8 * g1;
        rate = 2.4 + 5.6 * g1;
      }
      this.pitchVel += (H + corr - this.pitchVel) * (1 - Math.exp(-rate * dt));
    }
    if (T > 0) {
      const stop = this.pitch + this.pitchVel / 2.4;
      let e = aimSlope - stop;
      e -= TAU * Math.round(e / TAU);           // nearest whole-flip equivalent
      const want = clamp(D * (e + this.pitchVel / 2.4), -5.5, 5.5);
      this.pitchVel += (want - this.pitchVel) * 0.25 * I;
    }
    this.pitch += this.pitchVel * dt;
    this.air.rotPitch += this.pitch - prevPitch;

    // ---- Spin (relative to the flight direction). Released, it coasts down
    // and near the ground rounds to the nearest whole turn.
    const prevYaw = this.yaw;
    if (Math.abs(inp.spin) > 0.12) {
      this.spinVel = approach(this.spinVel, -inp.spin * 5.5 * b.airK, 14.5 * b.airK, 2, dt);
    } else {
      this.spinVel *= Math.exp(-2.4 * dt);
      if (T > 0) {
        const rel = this.yaw - velYaw;
        const stop = rel + this.spinVel / 2.4;
        const target = TAU * Math.round(stop / TAU);
        const want = clamp(D * (target - stop + this.spinVel / 2.4), -5.5, 5.5);
        this.spinVel += (want - this.spinVel) * 0.25 * I * (1 + this.assist.straighten);
      }
    }
    this.yaw += this.spinVel * dt;
    this.air.rotYaw += this.yaw - prevYaw;

    // ---- Whip: soft and hard limits that tighten as the landing nears.
    const U = 1.15 - 0.35 * T, B = 1.7 - 0.75 * T;
    const N = clamp((Math.abs(this.whip) - U) / (B - U), 0, 1);
    if (Math.abs(inp.steer) > 0.12) {
      let target = -inp.steer * 2.8;
      if (target * this.whip > 0) target *= 1 - N;
      const acc = 24 * b.airK * (target * this.whip < 0 ? 0.4 : 1);
      this.whipVel = approach(this.whipVel, target, acc, 1.3, dt);
    } else {
      const extra = this.whipVel * this.whip > 0 ? 30 * Math.max(0, 1 - Math.abs(this.whip) / 0.7) : 0;
      this.whipVel += (-5 * this.whip - (3 + extra) * this.whipVel) * dt;
      if (T > 0) this.whipVel += (-this.whip * 4 - this.whipVel) * 0.12 * I * (1 + 2 * this.assist.straighten);
    }
    this.whipVel *= Math.exp(-6 * N * dt);
    this.whip = clamp(this.whip + this.whipVel * dt, -1.7, 1.7);
    if (Math.abs(this.whip) > B) {
      this.whip -= Math.sign(this.whip) * (Math.abs(this.whip) - B) * Math.min(1, 12 * dt);
      if (this.whipVel * this.whip > 0) this.whipVel *= Math.exp(-20 * dt);
    }
    this.air.whipMax = Math.max(this.air.whipMax, Math.abs(this.whip));

    // ---- Tricks. Poses fade out by themselves as the ground comes up, so a
    // late no-hander or superman is a rushed recovery, not a crash.
    if (this.trickLatch === 0 && this.airTime < 0.05 && (inp.noHand > 0.5 || inp.superman > 0.5)) this.trickLatch = 1;
    if (this.trickLatch === 1 && inp.noHand < 0.5 && inp.superman < 0.5) this.trickLatch = 0;
    const nhT = this.trickLatch ? 0 : (inp.noHand > 0.5 ? 1 : 0) * (1 - T);
    const smT = this.trickLatch ? 0 : (inp.superman > 0.5 ? 1 : 0) * (1 - T);
    this.noHand += (nhT - this.noHand) * Math.min(1, dt * (nhT > this.noHand ? 9 : 7 + 10 * T));
    this.superman += (smT - this.superman) * Math.min(1, dt * (smT > this.superman ? 8 : 7 + 10 * T));
    if (this.noHand > 0.85) { this.air.noHand += dt; this.handsBack = 1.5; }
    if (this.superman > 0.85) this.air.superman += dt;

    // Barspin: each tap adds a full turn; the bar slows to a catch speed
    // exactly as it comes round.
    if (inp.barspinTap && b.barspin && this.handsBack <= 0 && this.landIn > 0.2) {
      const jitter = 1 + 0.1 * Math.sin(this.airTime * 97.3);
      this.barspin += TAU;
      this.barVel = Math.max(this.barVel, 14.3 * b.airK * jitter);
      this.barCatchV = 5 * jitter;
      this.events.push({ type: 'barspin' });
    }
    if (this.barspin > 0) {
      const vc = this.barCatchV;
      const decel = (this.barVel * this.barVel - vc * vc) / (2 * Math.max(this.barspin, 1e-3));
      this.barVel = Math.max(vc, this.barVel - decel * dt);
      const d = Math.min(this.barspin, this.barVel * dt);
      this.barspin -= d;
      this.barAngle += d;
      this.barRate = this.barVel;
      if (this.barspin < 0.03) {
        this.barAngle += this.barspin;
        this.barspin = 0;
        this.air.barspins += Math.round(this.barAngle / TAU);
        this.barAngle = 0;
        this.barVel = 0;
        this.events.push({ type: 'barcatch', rate: this.barRate });
      }
    }

    this.preload += ((inp.jumpHeld ? 1 : 0) - this.preload) * Math.min(1, dt * 4);
    this.manual *= Math.max(0, 1 - dt * 4);
    this.stoppie *= Math.max(0, 1 - dt * 4);
    this.roll *= Math.max(0, 1 - dt * 3);
    this.steerVis += (0 - this.steerVis) * Math.min(1, dt * 6);
    this.vLat = 0; this.sliding = 0;

    // ---- Contact?
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const w2 = b.wb / 2;
    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const rxw = this.pos.x - fx * w2 * cp, rzw = this.pos.z - fz * w2 * cp;
    const fxw = this.pos.x + fx * w2 * cp, fzw = this.pos.z + fz * w2 * cp;
    const yR = this.pos.y - spch * w2, yF = this.pos.y + spch * w2;
    const hR = this.ground.height(rxw, rzw), hF = this.ground.height(fxw, fzw);
    const hc = this.ground.height(this.pos.x, this.pos.z);
    const pen = 0.004;
    // Wheels only count once the bike has flown its own length from the
    // takeoff point (until then the rear wheel can still be over the lip).
    const flown = Math.hypot(this.pos.x - this.takeoffPos.x, this.pos.z - this.takeoffPos.z);
    const wheels = (flown > b.wb || this.airTime > 0.6) && (yR < hR - pen || yF < hF - pen);
    if ((wheels || (this.airTime > 0.02 && this.pos.y < hc - 0.02)) && v.y < 0.5) {
      this.land(velYaw);
    }
  }

  // ------------------------------------------------------------ landing --

  land(velYaw) {
    const b = this.bike;
    const n = this.normalAt();
    const v = this.vel;
    const vn = -(v.x * n.x + v.y * n.y + v.z * n.z);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const wg = this.wheelGround(this.pos.x, this.pos.z, fx, fz);
    const gp = Math.atan(wg.slope);
    const pitchErr = wrapAngle(this.pitch - gp);
    const spinErr = wrapAngle(this.yaw - velYaw);
    const side = wrapAngle(spinErr + this.whip);   // how crossed-up the bike is
    const hs = this.hSpeed();
    const air = this.air || { rotPitch: 0, rotYaw: 0, whipMax: 0, noHand: 0, superman: 0, barspins: 0, startY: this.pos.y, maxY: this.pos.y };

    // Crash checks, in order. Steeper head angles leave less nose-down margin.
    const noseDown = (45 - 0.8 * (b.head - 63)) * DEG;
    let crash = null;
    if (vn > b.impact) crash = 'impact';
    else if (pitchErr > 75 * DEG || pitchErr < -noseDown) crash = 'pitch';
    else if ((hs > 8 && Math.abs(side) > 75 * DEG) || -hs * Math.cos(side) > 1.5) crash = 'whip';
    else if (this.barspin > 60 * DEG) crash = 'barspin';

    const soak = b.impact / 18;
    const hk = clamp((vn / soak - IMPACT_CLEAN) / (IMPACT_FULL - IMPACT_CLEAN), 0, 1);
    const result = {
      type: 'land', crash, vn, pitchErr, yawErr: spinErr, side, airTime: this.airTime,
      rotPitch: air.rotPitch, rotYaw: air.rotYaw, whipMax: Math.max(0, air.whipMax - (this.whipCarried || 0)),
      noHand: air.noHand, superman: air.superman, barspins: air.barspins,
      height: air.maxY - Math.min(air.startY, this.pos.y), hard: false, impactK: hk,
      clean: vn < 4.5 && Math.abs(pitchErr) < 0.3 && Math.abs(side) < 0.5,
      first: pitchErr > 0.08 ? 'rear' : pitchErr < -0.08 ? 'front' : 'both',
    };

    // Speed along the slope survives (a down-slope turns fall into speed);
    // impact costs up to 30% (the game adds cased / flat costs).
    const dot = v.x * n.x + v.y * n.y + v.z * n.z;
    v.x -= n.x * dot; v.y -= n.y * dot; v.z -= n.z * dot;
    let kept = Math.hypot(v.x, v.y, v.z);
    if (!crash) {
      result.hard = hk >= 1 / 3;
      kept *= 1 - 0.3 * hk;
    }
    // A crossed-up or badly pitched landing deflects into a slide: the bike
    // points where it points, momentum carries on, friction scrubs the rest.
    let defl = side;
    if (Math.abs(pitchErr) > 0.45) {
      const s = Math.sign(Math.abs(this.whip) > 0.12 ? this.whip : (this.roll || 1));
      defl += s * Math.min(1, (Math.abs(pitchErr) - 0.45) * (pitchErr > 0 ? 0.8 : 0.35)) * (pitchErr > 0 ? 1 : -1);
    }
    defl = clamp(defl, -1.2, 1.2);
    const heading = velYaw + defl;
    const tl = Math.hypot(1, wg.slope);
    const fwdK = Math.cos(defl), latK = Math.sin(defl);
    this.yaw = heading;
    const hx = Math.sin(heading), hz = Math.cos(heading), rx = -hz, rz = hx;
    v.x = hx * kept * fwdK / tl + rx * kept * latK;
    v.z = hz * kept * fwdK / tl + rz * kept * latK;
    v.y = wg.slope * kept * fwdK / tl;
    this.speed = kept * fwdK;
    this.vLat = kept * latK;
    this.grounded = true;
    this.pos.y = Math.max(wg.c, this.pos.y - 0.05);
    this.groundPitch = gp;
    this.pitch = gp;
    this.pitchVel = 0;
    this.spinVel = 0;
    this.whip = 0; this.whipVel = 0;
    this.barspin = 0; this.barAngle = 0; this.barVel = 0;
    this.noHand = 0; this.superman = 0;
    this.bunny = false;
    this.compress = clamp(vn / 6, 0, 1);
    this.landFx = 1;
    this.landIn = 4; this.landNear = 0;
    this.air = null;
    this.events.push(result);
  }
}
