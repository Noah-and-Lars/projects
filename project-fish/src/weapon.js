// A pistol's rules: one shot per trigger pull, a short wait between shots,
// a magazine, and reloading. It doesn't draw or play anything; it reports
// what happened (events) so the effects, sounds and gun animation can follow.
// Each gun has its own (its numbers are in src/shared/config.js).

import { PISTOL } from './shared/config.js';

// When things happen during a reload, as a fraction of its length. There are
// two kinds: from empty, the empty magazine is dropped and the slide released
// at the end; with rounds left, the support hand catches the old magazine as
// it comes out and swaps it for a fresh one at the pouch, so the rounds left
// in it are kept. The hands' movements in between are keyframed in
// src/viewmodel/viewmodel.js (HAND_PATHS).
// A released magazine is pushed out a little, then gravity takes it: how far
// it has fallen (metres) t seconds after the release is pressed, and how long
// it takes to fall a distance.
export const magazineFall = (t) => 0.4 * t + 0.5 * 9.8 * t * t;
const fallTime = (distance) => (-0.4 + Math.sqrt(0.16 + 2 * 9.8 * distance)) / 9.8;
// With rounds left, the old magazine falls this far (metres) into the
// support hand waiting under the grip.
export const CATCH_GAP = 0.09;

export const RELOAD_STEPS = {
  empty: {
    magOut: 0.1, // the thumb presses the magazine release: the empty one drops free
    magGrab: 0.36, // the support hand closes round a fresh magazine on the belt
    magIn: 0.63, // the palm pushes it home and it clicks
    handOn: 0.84, // the support hand is back round the grip
    slideRelease: 0.87, // the slide snaps forward
  },
  catching: {
    magOut: 0.165, // the thumb presses the magazine release: the old one drops into the waiting hand
    magCaught: 0.165 + fallTime(CATCH_GAP) / PISTOL.reloadTime, // it lands in the palm
    magGrab: 0.385, // swapped for a fresh one at the pouch
    magIn: 0.63,
    handOn: 0.84,
  },
};

// A gun's own times for a reload (its spec's reloadSteps change some of
// them; a gun that's racked by hand from empty has rackGrab and rackPull).
export function reloadSteps(spec, kind) {
  return { ...RELOAD_STEPS[kind], ...((spec && spec.reloadSteps && spec.reloadSteps[kind]) || {}) };
}

// Inspecting: the shooting hand turns the gun to show its right side, then
// its left, and then the magazine is checked: the support hand catches it as
// it drops out, holds it up to look at, and pushes it back in. Then the
// chamber: the support hand eases the slide back half way so the round in
// the chamber shows through the ejection port, and lets it snap forward
// (with the slide locked back on an empty gun the chamber is plain to see,
// so that's left out). The hands' and gun's movements are keyframed in
// src/viewmodel/viewmodel.js (INSPECT_POSES and HAND_PATHS.inspect); these
// are the times things happen (seconds from the start), for the sounds, the
// magazine and the slide.
export const INSPECT = {
  time: 7.2, // the whole thing
  shortTime: 5.8, // without the chamber check
  // Cut short (by firing, aiming, reloading or sprinting), it goes back to
  // the hold this quickly, from wherever it's got to...
  fade: 0.25,
  // ...but with the magazine out or the slide held back, that's finished
  // first, the rest played this many times faster.
  hurry: 4,
  magOut: 3.38, // the thumb presses the release; the magazine drops into the support hand
  magIn: 4.78, // the palm pushes it back home
  pull: 5.36, // the support hand, holding the slide, starts easing it back...
  pulled: 5.62, // ...and has it half way back
  release: 6.2, // it lets go and the slide snaps forward
};
// The stretches of an inspect where the gun is held still to be looked at
// (seconds into it; they match the keys in src/viewmodel/viewmodel.js): its
// right side, its left side, the magazine held up, and the slide held back
// over the chamber. A gun can make these last longer (its inspectHolds in
// src/shared/config.js: extra seconds for each). Time in the inspect then
// runs slower through them, so the moves between stay just as quick.
export const INSPECT_HOLDS = {
  right: [0.8, 1.55],
  left: [2.2, 2.85],
  magazine: [INSPECT.magOut + fallTime(CATCH_GAP) + 0.42, INSPECT.magIn - 0.43],
  chamber: [INSPECT.pulled, INSPECT.release - 0.05], // only with the chamber check
};

const HOLD_EASE = 0.15; // seconds (of the inspect) to slow into and out of a hold
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const INSPECT_STEPS = {
  magOut: INSPECT.magOut,
  magCaught: INSPECT.magOut + fallTime(CATCH_GAP), // it lands in the palm
  magIn: INSPECT.magIn,
  slidePull: INSPECT.pull, // the slide starts to come back (only with the chamber check)
  slideRelease: INSPECT.release, // it's let go (only with the chamber check)
};

export class Pistol {
  // spec: the gun's numbers (PISTOL or PISTOL45 in src/shared/config.js).
  constructor(spec = PISTOL) {
    this.spec = spec;
    this.ammo = spec.magazine;
    this.reserve = spec.reserve;
    this.cooldown = 0;
    this.slideLocked = false; // the slide stays back after the last round
    this.reload = null; // { time, duration, empty, done: Set of steps reached }
    this.inspect = null; // { time, done: Set of steps reached, check: with the chamber check, cut: cut short, fade: 1 → 0 when it's going back }
    this.reloadWaiting = false; // the reload key was pressed while inspecting
    this.pulls = []; // trigger pulls waiting for the gun to be ready (seconds waited)
    this.chamberCheck = true; // whether inspecting checks the chamber (not while an attachment is in the way of the hand)
  }

  // Whether a trigger pull is waiting to fire (for the gun to come up out of
  // a sprint, or for the last shot's cycle to finish).
  get shotWaiting() {
    return this.pulls.length > 0;
  }

  get reloading() {
    return this.reload !== null;
  }

  // How far through the reload (0..1), or -1 if not reloading.
  get reloadProgress() {
    return this.reload ? Math.min(1, this.reload.time / this.reload.duration) : -1;
  }

  get inspecting() {
    return this.inspect !== null;
  }

  // How far into the inspect (seconds), or -1 if not inspecting.
  get inspectTime() {
    return this.inspect ? Math.min(this.inspect.time, this.inspectLength) : -1;
  }

  // Whether this inspect checks the chamber (not with the slide locked back).
  get inspectCheck() {
    return this.inspect ? this.inspect.check : false;
  }

  get inspectLength() {
    return this.inspect && this.inspect.check ? INSPECT.time : INSPECT.shortTime;
  }

  // How much of the inspect pose there is: 1, going down to 0 when it's cut
  // short.
  get inspectAmount() {
    return this.inspect ? Math.max(0, this.inspect.fade) : 0;
  }

  // dt: seconds since the last frame. trigger: how many times the fire button
  // was pressed this frame (a pull while the gun isn't ready yet is kept for a
  // moment, so quick taps are never lost). reloadKey: the reload key was pressed.
  // ready: the gun is up and can fire (not while it's still coming up from a
  // sprint; a pull made then fires as soon as it's up). inspectKey: the
  // inspect key was pressed. busy: aiming or sprinting, which stops an
  // inspect (or keeps one from starting).
  // Returns a list of events: 'shot', 'dry', 'reload', 'magOut', 'magCaught',
  // 'magGrab', 'magIn', 'slidePull', 'slideRelease', 'reloaded', 'inspect',
  // 'inspected'.
  update(dt, trigger, reloadKey, ready = true, inspectKey = false, busy = false) {
    for (let i = 0; i < trigger; i++) this.pulls.push(0);
    const events = this.step(dt, reloadKey, ready, inspectKey, busy);
    // Pulls that couldn't fire yet go stale after a moment, but only once
    // the gun is up (out of a sprint, or back from an inspect), and only
    // after a frame in which they could have fired (so even a very slow
    // frame can't make one stale before it gets its chance).
    if (ready && !this.inspect) this.pulls = this.pulls.map((t) => t + dt).filter((t) => t < 0.25);
    return events;
  }

  step(dt, reloadKey, ready = true, inspectKey = false, busy = false) {
    const events = [];
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.inspect) {
      // Firing, reloading, aiming or sprinting cuts it short, and what was
      // asked for happens once the gun is back in the hold.
      if (reloadKey && this.ammo < this.spec.magazine && this.reserve > 0) this.reloadWaiting = true;
      const inspect = this.inspect;
      if (this.pulls.length || this.reloadWaiting || busy) inspect.cut = true;
      const t = inspect.time;
      const magazineOut = t >= INSPECT.magOut && t < INSPECT.magIn;
      const slideHeld = inspect.check && t >= INSPECT.pull && t < INSPECT.release;
      if (inspect.cut && !magazineOut && !slideHeld) inspect.fade -= dt / INSPECT.fade;
      else inspect.time += inspect.cut ? dt * INSPECT.hurry : this.inspectStep(inspect, dt);
      for (const [step, at] of Object.entries(INSPECT_STEPS)) {
        if ((step === 'slidePull' || step === 'slideRelease') && !inspect.check) continue;
        if (inspect.time >= at && !inspect.done.has(step)) {
          inspect.done.add(step);
          events.push(step);
        }
      }
      if (inspect.time < this.inspectLength && inspect.fade > 0) return events;
      this.inspect = null;
      events.push('inspected');
    }

    if (this.reload) {
      this.reload.time += dt;
      const p = this.reloadProgress;
      const steps = reloadSteps(this.spec, this.reload.empty ? 'empty' : 'catching');
      for (const [step, at] of Object.entries(steps)) {
        if (step === 'handOn') continue;
        if (p >= at && !this.reload.done.has(step)) {
          this.reload.done.add(step);
          events.push(step);
          if (step === 'slideRelease') this.slideLocked = false;
        }
      }
      if (p >= 1) {
        const taken = Math.min(this.spec.magazine - this.ammo, this.reserve);
        this.ammo += taken;
        this.reserve -= taken;
        this.slideLocked = false;
        this.reload = null;
        events.push('reloaded');
      }
      return events;
    }

    const canReload = this.ammo < this.spec.magazine && this.reserve > 0;
    if (this.reloadWaiting) {
      reloadKey = true;
      this.reloadWaiting = false;
    }
    if (reloadKey && canReload) {
      const empty = this.ammo === 0;
      this.reload = { time: 0, duration: empty ? this.spec.emptyReloadTime : this.spec.reloadTime, empty, done: new Set() };
      events.push('reload');
      this.pulls = [];
      return events;
    }

    // (A gun with no inspect animation, its spec's inspect false, ignores the key.)
    if (inspectKey && this.spec.inspect !== false && ready && !busy && !this.pulls.length && this.cooldown === 0) {
      this.inspect = { time: 0, done: new Set(), check: !this.slideLocked && this.chamberCheck, cut: false, fade: 1 };
      events.push('inspect');
      return events;
    }

    if (ready && this.pulls.length && this.cooldown === 0) {
      this.pulls.shift();
      if (this.ammo > 0) {
        this.ammo--;
        this.cooldown = this.spec.fireInterval;
        if (this.ammo === 0) this.slideLocked = true;
        events.push('shot');
      } else {
        this.cooldown = this.spec.fireInterval;
        events.push('dry');
      }
    }
    return events;
  }

  // How far an inspect moves on in dt seconds: slower through the holds
  // this gun makes longer (INSPECT_HOLDS). It slows down and speeds up again
  // smoothly over HOLD_EASE at each end of a hold (a hand may still be moving
  // into it), and just enough in between that the hold lasts its extra
  // seconds.
  inspectStep(inspect, dt) {
    const extra = this.spec.inspectHolds || {};
    for (const [name, [from, to]] of Object.entries(INSPECT_HOLDS)) {
      if (name === 'chamber' && !inspect.check) continue;
      if (!(extra[name] > 0) || inspect.time < from || inspect.time >= to) continue;
      const ease = Math.min(HOLD_EASE, (to - from) / 2);
      const t = inspect.time;
      const bump = smoothstep(from, from + ease, t) * (1 - smoothstep(to - ease, to, t));
      // Real seconds per inspect second: 1 + slow * bump, which adds up to
      // the extra time over the whole hold.
      const slow = extra[name] / (to - from - ease);
      return dt / (1 + slow * bump);
    }
    return dt;
  }

  // Putting the gun away: an inspect stops, and so does a reload, unless the
  // fresh magazine is already in (then it counts, slide released and all).
  // Trigger pulls waiting to fire are dropped.
  holster() {
    this.inspect = null;
    this.reloadWaiting = false;
    this.pulls = [];
    if (!this.reload) return;
    const steps = reloadSteps(this.spec, this.reload.empty ? 'empty' : 'catching');
    if (this.reloadProgress >= steps.magIn) {
      const taken = Math.min(this.spec.magazine - this.ammo, this.reserve);
      this.ammo += taken;
      this.reserve -= taken;
      this.slideLocked = false;
    }
    this.reload = null;
  }
}
