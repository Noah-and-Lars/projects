// Watching a recorded run: the same track, bike, rider, animator and
// cameras as live riding, driven from the recording instead of physics.

import * as THREE from 'three';
import { COURSES } from './courses.js';
import { BIKES } from './physics.js';
import { Track } from './track.js';
import { World } from './world.js';
import { buildBike, buildRider } from './models.js';
import { RiderAnimator } from './animate.js';
import { CameraRig, VIEWS } from './camera.js';
import { decode } from './replay.js';
import { resolveQuality } from './game.js';
import { store } from './storage.js';
import { updateRide } from './audio.js';

export class ReplayView {
  constructor({ renderer, scene, camera, rec, hud, input }) {
    this.isReplay = true;
    this.scene = scene;
    this.hud = hud;
    this.input = input;
    this.play = decode(rec);
    const m = this.play.meta;
    this.course = COURSES.find((c) => c.id === m.course) || COURSES[0];
    this.track = new Track(this.course);
    this.world = new World(renderer, scene, this.track, { quality: resolveQuality(store().settings.quality), weather: m.weather || 'day' });
    const def = BIKES[m.bike] || BIKES.trail;
    this.bike = buildBike(def.id, def.wb, m.color || def.color);
    this.rider = buildRider(m.kit || store().kit);
    this.bike.root.add(this.rider.group);
    scene.add(this.bike.root);
    this.anim = new RiderAnimator(this.bike, this.rider);
    this.rig = new CameraRig(camera);
    this.rig.setView('follow');
    this.hintState = { hint: 0 };
    this.t = 0;
    this.rate = 1;
    this.paused = false;
    this.playing = true;
    this.evIdx = 0;
    this.st = {};
    this.prev = null;
    // Shapes the HUD and camera expect from a live run.
    const self = this;
    this.sim = {
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, roll: 0, whip: 0, speed: 0,
      grounded: true, manual: 0, stoppie: 0, lift: 0, preload: 0, compress: 0, noHand: 0, superman: 0,
      barAngle: 0, barspin: 0, steerVis: 0, pedaling: false, brakeVis: 0, skid: 0, sliding: 0, landIn: 4,
      landNear: 0, spinVel: 0, hopT: -1, bunny: false, airTime: 0, windT: 0, weightIn: 0,
      hSpeed() { return Math.hypot(this.vel.x, this.vel.z); },
    };
    this.phase = 'run'; this.started = true; this.penalty = 0; this.time = 0; this.crash = null;
    void self;
    this.seek(0);
  }

  get duration() { return this.play.duration; }

  seek(t) {
    this.t = Math.max(0, Math.min(this.duration, t));
    // Re-find the event cursor; skip events before the new time.
    this.evIdx = 0;
    while (this.evIdx < this.play.events.length && this.play.events[this.evIdx][0] <= this.t) this.evIdx++;
    this.prev = null;
    this.rig.inited = false;
  }

  update(frameDt) {
    const dt = Math.min(frameDt, 0.1);
    for (const a of this.input.takeActions()) {
      if (a === 'camera') this.rig.next();
      if (a === 'pause' && this.onExit) this.onExit();
    }
    const adv = this.playing ? dt * this.rate : 0;
    const t0 = this.t;
    this.t = Math.min(this.duration, this.t + adv);
    if (this.t >= this.duration) this.playing = false;
    const s = this.play.sample(this.t, this.st);
    const sim = this.sim;
    // Velocity from the recorded path.
    if (this.prev && adv > 0) {
      const k = 1 / Math.max(adv, 1e-3);
      sim.vel.x = (s.x - this.prev.x) * k; sim.vel.y = (s.y - this.prev.y) * k; sim.vel.z = (s.z - this.prev.z) * k;
    }
    this.prev = { x: s.x, y: s.y, z: s.z };
    sim.pos.x = s.x; sim.pos.y = s.y; sim.pos.z = s.z;
    sim.yaw = s.yaw; sim.pitch = s.pitch; sim.roll = s.roll; sim.whip = s.whip;
    sim.speed = s.speed; sim.grounded = s.grounded; sim.pedaling = s.pedaling;
    sim.lift = s.lift; sim.manual = Math.max(0, s.lift); sim.stoppie = Math.max(0, -s.lift);
    sim.preload = s.preload; sim.noHand = s.noHand; sim.superman = s.superman;
    sim.barAngle = s.barAngle; sim.barspin = s.barspin; sim.steerVis = s.steerVis; sim.brakeVis = s.brakeVis;
    sim.landIn = s.landIn; sim.landNear = 1 - Math.max(0, Math.min(1, (s.landIn - 0.05) / 0.75));
    sim.spinVel = s.spinVel; sim.sliding = s.sliding; sim.skid = s.skid;
    sim.bunny = s.bunny; sim.hopT = s.standing ? 0.1 : -1;
    sim.airTime = s.grounded ? 0 : sim.airTime + adv;
    this.time = s.clock;
    this.crash = s.crash ? { reason: 'replay' } : null;

    // Events between the last frame and this one.
    const ev = this.play.events;
    let barCatch = 0;
    while (this.evIdx < ev.length && ev[this.evIdx][0] <= this.t) {
      const [, type, ...a] = ev[this.evIdx++];
      if (adv <= 0 || this.t - t0 > 0.5) continue;    // don't replay text while scrubbing
      if (type === 'land') this.anim.onLand({ vn: a[0], first: a[1] });
      else if (type === 'pop') this.anim.onPop();
      else if (type === 'barcatch') barCatch = a[0];
      else if (type === 'hud' && typeof this.hud[a[0]] === 'function') this.hud[a[0]](...a.slice(1));
    }

    const p = this.track.project(sim.pos.x, sim.pos.z, this.hintState.hint, {});
    this.hintState.hint = p.i;
    const fx = Math.sin(sim.yaw), fz = Math.cos(sim.yaw), w2 = this.bike.wb / 2, h = p.i;
    this.anim.update(dt * (this.playing ? this.rate : 0) || 1e-4, sim, {
      root: this.bike.root, crash: !!this.crash, crashT: 0.6,
      gF: this.track.height(sim.pos.x + fx * w2, sim.pos.z + fz * w2, h),
      gR: this.track.height(sim.pos.x - fx * w2, sim.pos.z - fz * w2, h),
      barCatch,
    });
    if (this.crash) {
      // Crash frames carry the tumbling bike's own transform.
      const r = this.bike.root;
      r.position.set(s.x, s.y, s.z);
      r.rotation.set(-s.pitch, s.yaw, -s.roll, 'YXZ');
    }
    this.world.dust.update(dt);
    const ground = { height: (x, z) => this.track.height(x, z, this.hintState.hint) };
    this.rig.update(dt, sim, ground);
    this.world.follow(this.bike.root.position, sim.yaw);
    updateRide({
      active: this.playing, speed: sim.grounded ? sim.speed : sim.hSpeed(), grounded: sim.grounded, air: !sim.grounded,
      pedal: sim.pedaling, slide: sim.sliding, skid: sim.skid, brake: sim.brakeVis, dt,
    });
    this.hud.update(this, dt);
  }

  dispose() {
    updateRide({ active: false, speed: 0 });
    this.world.dispose();
    this.scene.remove(this.bike.root);
  }
}

export { VIEWS };
void THREE;
