// The pistol's rules: one shot per trigger pull, a short wait between shots,
// a magazine, and reloading. It doesn't draw or play anything; it reports
// what happened (events) so the effects, sounds and gun animation can follow.

import { PISTOL } from './shared/config.js';

// When things happen during a reload, as a fraction of its length.
export const RELOAD_STEPS = {
  handOff: 0.12, // support hand leaves the gun
  magOut: 0.22, // magazine drops out
  magIn: 0.6, // new magazine clicks in
  slideRelease: 0.8, // (empty reloads) slide snaps forward
  handOn: 0.82, // support hand back on the gun
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
  // Returns a list of events: 'shot', 'dry', 'reload', 'magOut', 'magIn',
  // 'slideRelease', 'reloaded'.
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
      for (const step of ['magOut', 'magIn', 'slideRelease']) {
        if (step === 'slideRelease' && !this.reload.empty) continue;
        if (p >= RELOAD_STEPS[step] && !this.reload.done.has(step)) {
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
