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

export class Pistol {
  constructor() {
    this.ammo = PISTOL.magazine;
    this.reserve = PISTOL.reserve;
    this.cooldown = 0;
    this.slideLocked = false; // the slide stays back after the last round
    this.reload = null; // { time, duration, empty, done: Set of steps reached }
    this.pulls = []; // trigger pulls waiting for the gun to be ready (seconds waited)
  }

  get reloading() {
    return this.reload !== null;
  }

  // How far through the reload (0..1), or -1 if not reloading.
  get reloadProgress() {
    return this.reload ? Math.min(1, this.reload.time / this.reload.duration) : -1;
  }

  // dt: seconds since the last frame. trigger: how many times the fire button
  // was pressed this frame (a pull while the gun isn't ready yet is kept for a
  // moment, so quick taps are never lost). reloadKey: the reload key was pressed.
  // Returns a list of events: 'shot', 'dry', 'reload', 'magOut', 'magCaught',
  // 'magGrab', 'magIn', 'slideRelease', 'reloaded'.
  update(dt, trigger, reloadKey) {
    this.pulls = this.pulls.map((t) => t + dt).filter((t) => t < 0.25);
    for (let i = 0; i < trigger; i++) this.pulls.push(0);
    return this.step(dt, reloadKey);
  }

  step(dt, reloadKey) {
    const events = [];
    this.cooldown = Math.max(0, this.cooldown - dt);

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
    if (reloadKey && canReload) {
      const empty = this.ammo === 0;
      this.reload = { time: 0, duration: empty ? PISTOL.emptyReloadTime : PISTOL.reloadTime, empty, done: new Set() };
      events.push('reload');
      this.pulls = [];
      return events;
    }

    if (this.pulls.length && this.cooldown === 0) {
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
