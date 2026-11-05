// The pistol's rules: one shot per trigger pull, a short wait between shots,
// a magazine, and reloading. It doesn't draw or play anything; it reports
// what happened (events) so the effects, sounds and gun animation can follow.

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
  checkChamber: false, // the chamber check isn't finished yet (the hand's grip on the slide), so it's left out for now
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
export const INSPECT_STEPS = {
  magOut: INSPECT.magOut,
  magCaught: INSPECT.magOut + fallTime(CATCH_GAP), // it lands in the palm
  magIn: INSPECT.magIn,
  slideRelease: INSPECT.release, // only with the chamber check
};

export class Pistol {
  constructor() {
    this.ammo = PISTOL.magazine;
    this.reserve = PISTOL.reserve;
    this.cooldown = 0;
    this.slideLocked = false; // the slide stays back after the last round
    this.reload = null; // { time, duration, empty, done: Set of steps reached }
    this.inspect = null; // { time, done: Set of steps reached, check: with the chamber check, cut: cut short, fade: 1 → 0 when it's going back }
    this.reloadWaiting = false; // the reload key was pressed while inspecting
    this.pulls = []; // trigger pulls waiting for the gun to be ready (seconds waited)
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
  // 'magGrab', 'magIn', 'slideRelease', 'reloaded', 'inspect', 'inspected'.
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
      if (reloadKey && this.ammo < PISTOL.magazine && this.reserve > 0) this.reloadWaiting = true;
      const inspect = this.inspect;
      if (this.pulls.length || this.reloadWaiting || busy) inspect.cut = true;
      const t = inspect.time;
      const magazineOut = t >= INSPECT.magOut && t < INSPECT.magIn;
      const slideHeld = inspect.check && t >= INSPECT.pull && t < INSPECT.release;
      if (inspect.cut && !magazineOut && !slideHeld) inspect.fade -= dt / INSPECT.fade;
      else inspect.time += dt * (inspect.cut ? INSPECT.hurry : 1);
      for (const [step, at] of Object.entries(INSPECT_STEPS)) {
        if (step === 'slideRelease' && !inspect.check) continue;
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
      const steps = RELOAD_STEPS[this.reload.empty ? 'empty' : 'catching'];
      for (const [step, at] of Object.entries(steps)) {
        if (step === 'handOn') continue;
        if (p >= at && !this.reload.done.has(step)) {
          this.reload.done.add(step);
          events.push(step);
          if (step === 'slideRelease') this.slideLocked = false;
        }
      }
      if (p >= 1) {
        const taken = Math.min(PISTOL.magazine - this.ammo, this.reserve);
        this.ammo += taken;
        this.reserve -= taken;
        this.slideLocked = false;
        this.reload = null;
        events.push('reloaded');
      }
      return events;
    }

    const canReload = this.ammo < PISTOL.magazine && this.reserve > 0;
    if (this.reloadWaiting) {
      reloadKey = true;
      this.reloadWaiting = false;
    }
    if (reloadKey && canReload) {
      const empty = this.ammo === 0;
      this.reload = { time: 0, duration: empty ? PISTOL.emptyReloadTime : PISTOL.reloadTime, empty, done: new Set() };
      events.push('reload');
      this.pulls = [];
      return events;
    }

    if (inspectKey && ready && !busy && !this.pulls.length && this.cooldown === 0) {
      this.inspect = { time: 0, done: new Set(), check: INSPECT.checkChamber && !this.slideLocked, cut: false, fade: 1 };
      events.push('inspect');
      return events;
    }

    if (ready && this.pulls.length && this.cooldown === 0) {
      this.pulls.shift();
      if (this.ammo > 0) {
        this.ammo--;
        this.cooldown = PISTOL.fireInterval;
        if (this.ammo === 0) this.slideLocked = true;
        events.push('shot');
      } else {
        this.cooldown = PISTOL.fireInterval;
        events.push('dry');
      }
    }
    return events;
  }
}
