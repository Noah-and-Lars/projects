// One run on one course: physics stepping, assist, tricks and scoring,
// crashes and respawns, timing and splits, ghost recording/playback.

import * as THREE from 'three';
import { BikeSim, BIKES, emptyInput } from './physics.js';
import { Track } from './track.js';
import { World } from './world.js';
import { buildBike, buildRider } from './models.js';
import { RiderAnimator } from './animate.js';
import { Recorder, saveReplay, flagsOf } from './replay.js';
import { CameraRig } from './camera.js';
import { sfx, updateRide, duckMusic } from './audio.js';
import { clamp, wrapAngle, smoothstep } from './noise.js';
import { store, save, setting, loadGhost, saveGhost } from './storage.js';

const DT = 1 / 120;
const PENALTY = 3;
const TAU = Math.PI * 2;

export const CRASH_TEXT = {
  pitch: 'Bad landing angle — crash!',
  whip: "Whip not straightened — crash!",
  impact: 'Landed too hard — crash!',
  offtrack: 'Off the trail!',
  barspin: "Didn't catch the bar!",
  loopout: 'Looped out of the manual!',
  pit: 'Fell in the gap!',
};

export const COIN_RATE = { 0: 80, 1: 50, 2: 30 };
const LEVEL_MULT = { easy: 0.5, medium: 1, hard: 1.5 };

export class Game {
  constructor({ renderer, scene, camera, course, bikeId, input, hud, ghostOn = true }) {
    this.renderer = renderer;
    this.scene = scene;
    this.input = input;
    // HUD calls that show ride text are mirrored into the replay timeline.
    const REC = new Set(['trickLine', 'trickTotal', 'flash', 'split', 'taskDone']);
    this.hud = new Proxy(hud, {
      get: (t, k) => {
        const v = t[k];
        if (typeof v !== 'function') return v;
        return (...a) => {
          if (REC.has(k) && this.recorder && this.started) this.recorder.event('hud', k, ...a);
          return v.apply(t, a);
        };
      },
    });
    this.course = course;
    const st = store();
    this.bikeDef = BIKES[bikeId] || BIKES.trail;
    this.assist = st.settings.assist;

    this.track = new Track(course);
    const q = resolveQuality(st.settings.quality);
    this.world = new World(renderer, scene, this.track, { quality: q, weather: st.settings.weather });

    this.sim = new BikeSim(null, this.bikeDef);
    this.hintState = { hint: 0 };
    this.sim.ground = this.track.groundFor(this.hintState);
    this.projTmp = {};

    const color = st.colors[this.bikeDef.id] || this.bikeDef.color;
    this.bike = buildBike(this.bikeDef.id, this.bikeDef.wb, color);
    this.rider = buildRider(st.kit);
    this.bikeRoot = this.bike.root;
    this.bikeRoot.add(this.rider.group);
    scene.add(this.bikeRoot);
    this.anim = new RiderAnimator(this.bike, this.rider);

    this.rig = new CameraRig(camera);
    this.rig.setView(st.settings.camera || 'follow');

    // Ghost of the personal best.
    this.ghostData = ghostOn && course.timed ? loadGhost(course.id) : null;
    if (this.ghostData) {
      const gb = buildBike(this.ghostData.bike || 'trail', (BIKES[this.ghostData.bike] || BIKES.trail).wb, '#ffffff');
      gb.root.traverse((o) => {
        if (o.material) {
          o.material = o.material.clone();
          o.material.transparent = true; o.material.opacity = 0.32; o.material.depthWrite = false;
          o.castShadow = false;
        }
      });
      this.ghost = gb;
      scene.add(gb.root);
    }

    this.accum = 0;
    this.restart();
  }

  // ------------------------------------------------------------ state --

  restart() {
    this.phase = 'ready';        // ready → countdown → run → finished
    this.time = 0;
    this.penalty = 0;
    this.crashes = 0;
    this.style = 0;
    this.splits = [];
    this.cpIndex = 0;
    this.started = false;
    this.crashT = 0;
    this.crash = null;
    this.lastSafe = null;
    this.jumpsCleared = new Set();
    this.combo = [];
    this.takeoffJump = null;
    this.manualT = 0;
    this.manualBest = 0;
    this.lastPop = null;
    this.rec = [];
    this.recT = 0;
    this.countdown = 0;
    this.finishedData = null;
    this.tasks = Object.assign({}, store().tasks[this.course.id] || {});
    const o = this.track.pointAt(0, 0);
    this.recorder = this.course.timed ? new Recorder({ x: o.x, y: this.track.base[0], z: o.z }) : null;
    this.replayId = null;
    this.spawnAt(3, 0, 0);
    this.hud.reset(this);
    if (this.course.timed) this.phase = 'ready';
    else { this.phase = 'run'; this.started = true; }
  }

  spawnAt(s, speed, d = 0) {
    const tr = this.track;
    const pt = tr.pointAt(s, d);
    this.hintState.hint = pt.i;
    tr.hint = pt.i;
    this.sim.reset(pt.x, 0, pt.z, pt.yaw, speed);
    this.input.reset();
    this.prevS = s;
    this.rider.group.visible = true;
    this.riderFree = null;
    this.bikeTumble = null;
    this.bike.body.rotation.set(0, 0, 0);
    this.bike.body.position.copy(this.bike.whipPivot.position).multiplyScalar(-1);
    this.rig.inited = false;
  }

  respawn(penalty) {
    const tr = this.track;
    // Back before the last feature, at its design speed.
    const s = this.progressS();
    let spawnS = Math.max(2, s - 25), speed = 7;
    for (const f of tr.features) {
      if (f.type !== 'jump') continue;
      if (f.s0 <= s + 2) { spawnS = Math.max(2, f.s0 - 16); speed = f.speed; }
    }
    if (this.lastSafe && this.lastSafe.s > spawnS && this.lastSafe.s < s) {
      // Prefer the last feature start; fall back to the last safe spot.
    }
    if (spawnS < 3) speed = 0;
    // Slightly under the jump speed: the run-in tops it up.
    this.spawnAt(spawnS, speed * 0.97);
    if (penalty && this.started && this.phase === 'run') {
      this.penalty += PENALTY;
      this.hud.flash('+3 s penalty', 'bad');
    }
  }

  progressS() { return this.track.project(this.sim.pos.x, this.sim.pos.z, this.hintState.hint, this.projTmp).s; }

  // ---------------------------------------------------------- frame ----

  update(frameDt) {
    const dt = Math.min(frameDt, 0.1);
    const actions = this.input.takeActions();
    for (const a of actions) this.onAction(a);
    if (this.paused) return;

    const inp = this.input.read(dt, this.sim.grounded);

    if (this.phase === 'ready') {
      if (inp.raw.throttle > 0.3 || inp.jumpPressed || actions.includes('enter')) this.startCountdown();
    }
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after > 0) { sfx('beep'); this.hud.count(after); }
      if (this.countdown <= 0) { this.phase = 'run'; sfx('go'); this.hud.count(0); }
    }

    if (this.crash) {
      this.updateCrash(dt);
    } else {
      const canRide = this.phase === 'run' || this.phase === 'finished';
      const ride = canRide ? inp : emptyInput();
      if (this.phase === 'finished') { ride.throttle = 0; ride.brake = 0.35; }
      this.applyAssist(ride, dt);
      this.accum += canRide ? dt : 0; // held at the gate until GO
      let first = true;
      while (this.accum >= DT) {
        this.accum -= DT;
        const sub = first ? ride : { ...ride, jumpPressed: false, jumpReleased: false, barspinTap: false };
        first = false;
        this.stepPhysics(sub);
        if (this.crash) break;
      }
    }

    if (this.started && this.phase === 'run') this.time += dt;
    this.updateVisuals(dt, inp);
    this.recordGhost(dt);
    this.recordReplay(dt);
    this.updateGhost();
    this.hud.update(this, dt);
  }

  startCountdown() {
    this.phase = 'countdown';
    this.countdown = 3;
    sfx('beep');
    this.hud.count(3);
  }

  onAction(a) {
    if (a === 'respawn' && !this.crash && this.phase !== 'finished') this.respawn(true);
    else if (a === 'camera') { const v = this.rig.next(); setting('camera', v); this.hud.toastView(v); }
    else if (a === 'pause') this.hud.togglePause(this);
    else if (a === 'photo') this.hud.togglePhoto(this);
    else if (a === 'mute') this.hud.toggleMute();
  }

  // ------------------------------------------------------------ assist --

  applyAssist(inp, dt) {
    const lvl = this.assist;
    const sim = this.sim;
    const tr = this.track;
    const p = tr.project(sim.pos.x, sim.pos.z, this.hintState.hint, this.projTmp);
    sim.assist.airPitch = null; sim.assist.airGain = 0; sim.assist.straighten = 0;
    if (lvl === 0) return;
    if (sim.grounded && Math.abs(sim.speed) > 0.5) {
      // Steer toward a point ahead on the trail; left/right picks the line.
      const look = clamp(Math.abs(sim.speed) * 0.55, 3, 9);
      const lineD = lvl === 2 ? inp.steer * tr.hw * 0.7 : p.d;
      const ahead = tr.pointAt(p.s + look, lineD);
      const want = Math.atan2(ahead.x - sim.pos.x, ahead.z - sim.pos.z);
      const err = wrapAngle(want - sim.yaw);
      const auto = clamp(-err * 2.2, -1, 1);
      if (lvl === 2) inp.steer = auto;
      else inp.steer = clamp(inp.steer + auto * 0.55, -1, 1);
    }
    if (lvl === 2 && sim.grounded && this.phase === 'run') {
      // Hold the speed each jump needs; scrub what a corner can't take.
      const j = tr.nextJump(p.s, 45);
      let target = null;
      if (j && j.lipS - p.s < 40) target = j.speed;
      // Ease off for a berm, unless a jump right after it needs the speed.
      const berm = tr.featureAt(p.s + 8);
      const after = berm && berm.type === 'berm' ? tr.nextJump(berm.s1, 40) : null;
      if (berm && berm.type === 'berm') target = Math.min(target ?? 99, after ? Math.max(12, after.speed - 1) : 12);
      if (target !== null) {
        const v = sim.speed;
        if (v < target - 0.3) { inp.throttle = Math.max(inp.throttle, 1); inp.brake = 0; }
        else if (v > target + 0.4) { inp.throttle = 0; inp.brake = Math.max(inp.brake, clamp((v - target) * 0.35, 0, 1)); }
        else { inp.throttle = Math.min(inp.throttle, 0.4); inp.brake = 0; }
      }
    }
    if (!sim.grounded) {
      // Line the bike up with the landing.
      // The bike already rights itself near the ground; assist starts that
      // earlier and harder.
      sim.assist.airPitch = sim.landSlope;
      sim.assist.airGain = lvl === 2 ? 0.85 : 0.4;
      sim.assist.straighten = lvl === 2 ? 1 : 0.4;
    }
  }

  // ----------------------------------------------------------- physics --

  stepPhysics(inp) {
    const sim = this.sim, tr = this.track;
    const p = tr.project(sim.pos.x, sim.pos.z, this.hintState.hint, this.projTmp);
    this.hintState.hint = p.i;
    tr.hint = p.i;
    const off = Math.abs(p.d) - tr.hw;
    sim.surface.roll = off > 0.3 ? 4 : 1;
    sim.surface.grip = off > 0.3 ? 0.75 : off > 1.2 ? 0.65 : 1;
    this.rough = off > 0.3;
    const jl = tr.nextJump(p.s - 0.6, 8);
    sim.nearLip = !!(jl && p.s > jl.s0 && p.s < jl.lipS + 0.5);

    const events = sim.step(DT, inp);
    for (const e of events) this.onEvent(e, p);
    if (this.crash) return;

    // Leaving the course.
    if (off > 7 || (sim.grounded && off > 4.5 && Math.abs(sim.speed) > 3)) { this.doCrash('offtrack'); return; }
    if (sim.pos.y < p.base - 12) { this.doCrash('pit'); return; }

    // On the ground between a gap's lip and its landing: that's the pit.
    if (sim.grounded) {
      const f = tr.featureAt(p.s);
      if (f && f.type === 'jump' && f.gap && p.s > f.lipS + 0.4 && p.s < f.knuckleS - 0.4 && Math.abs(p.d) < tr.hw + 1) { this.doCrash('pit'); return; }
    }
    // Stuck (e.g. rolled back into a gap): put the rider back after a while.
    if (this.started && this.phase === 'run' && Math.abs(sim.speed) < 0.4 && sim.grounded) {
      this.stuckT = (this.stuckT || 0) + DT;
      if (this.stuckT > 4) { this.stuckT = 0; this.hud.flash('Stuck: back to the run-in', 'warn'); this.respawn(true); return; }
    } else this.stuckT = 0;

    // Manual time.
    if (sim.grounded && sim.manual > 0.18 && sim.speed > 1.5) {
      this.manualT += DT;
      if (this.manualT > 2 && !this.tasks.manual) this.task('manual');
    } else if (this.manualT > 0) {
      if (this.manualT > 1) this.trick(`Manual ${this.manualT.toFixed(1)}s`, Math.round(this.manualT * 60));
      this.manualT = 0;
    }

    // Timing.
    const s = p.s;
    if (this.course.timed) {
      if (!this.started && this.phase === 'run' && s >= tr.startS) { this.started = true; this.time = 0; }
      if (this.started && this.phase === 'run') {
        while (this.cpIndex < tr.checkpoints.length && s >= tr.checkpoints[this.cpIndex]) {
          const t = this.time + this.penalty;
          this.splits.push(t);
          const best = store().best[this.course.id];
          const ref = best && best.splits ? best.splits[this.cpIndex] : null;
          this.hud.split(this.cpIndex + 1, t, ref);
          sfx('split', 0.7);
          this.cpIndex++;
        }
        if (s >= tr.finishS) this.finish();
      }
    } else if (s >= tr.finishS) {
      // Free ride: loop back to the top.
      this.hud.flash('Back to the top', 'info');
      this.spawnAt(2, 0);
    }
    if (sim.grounded && Math.abs(p.d) < tr.hw && !tr.featureAt(s)) this.lastSafe = { s, d: p.d };
    this.prevS = s;
  }

  onEvent(e, p) {
    const tr = this.track, sim = this.sim;
    if (e.type === 'pop') {
      sfx('pop', 0.5);
      this.anim.onPop();
      if (this.recorder) this.recorder.event('pop');
      const j = tr.nextJump(p.s - 2, 4);
      if (j && e.kind !== 'hop') {
        const dl = p.s - j.lipS;
        // Released in the last ~70 ms before the lip, or just after leaving it.
        const win = Math.max(0.3, Math.abs(sim.speed || sim.hSpeed()) * 0.07);
        if ((e.kind === 'late' && sim.airTime <= 0.07 + 1e-3) || (e.kind !== 'late' && dl > -win && dl < 0.5)) {
          this.lastPop = { jump: j, perfect: true };
          this.trick('Perfect pop', 50, true);
          this.task('pop');
        }
      }
      if (e.kind === 'hop') this.hopPending = true;
    }
    if (e.type === 'pop' || e.type === 'takeoff') {
      if (!this.takeoffJump) {
        const j = tr.nextJump(p.s - 3, 6);
        this.takeoffJump = j && p.s > j.lipS - 3 && p.s < j.lipS + 2 ? j : null;
      }
    }
    if (e.type === 'land') this.onLand(e, p);
    if (e.type === 'loopout') this.doCrash('loopout');
    if (e.type === 'barcatch') { this.barCatch = e.rate; if (this.recorder) this.recorder.event('barcatch', +e.rate.toFixed(2)); }
  }

  onLand(e, p) {
    if (!e.crash) {
      this.anim.onLand(e);
      if (this.recorder) this.recorder.event('land', +e.vn.toFixed(2), e.first);
    }
    const tr = this.track, sim = this.sim;
    const j = this.takeoffJump;
    this.takeoffJump = null;
    const s = p.s;
    let crash = e.crash;
    let grade = null;
    if (j && e.airTime >= 0.35) {
      grade = tr.judge(j, s);
      if (grade === 'casedGap') crash = crash || 'pit';
    }
    if (crash) { this.doCrash(crash); return; }

    // Speed cost of where it landed (on top of the impact cost in physics).
    let cost = 0;
    if (grade === 'cased' || grade === 'casedGap') cost += 0.06;
    if (grade === 'casedHeavy') cost += 0.18;
    if (grade === 'flat') cost += 0.1;
    if (cost) sim.speed *= 1 - cost, scaleVel(sim, 1 - cost);

    // Tricks.
    const items = [];
    const flips = Math.round(Math.abs(e.rotPitch) / TAU);
    const spins = Math.floor((Math.abs(e.rotYaw) + 0.6) / TAU);
    if (flips > 0) items.push([`${e.rotPitch > 0 ? 'Backflip' : 'Front flip'}${flips > 1 ? ' ×' + flips : ''}`, 500 * flips * flips]);
    if (spins > 0) items.push([`${spins * 360} spin`, 350 * spins * spins]);
    const whipDeg = Math.round(e.whipMax * 180 / Math.PI * 1.15);
    if (whipDeg >= 30) items.push([`Whip ${Math.min(whipDeg, 90)}°`, Math.round(whipDeg * 3)]);
    if (e.noHand > 0.12) items.push(['No hander', 200 + Math.round(e.noHand * 200)]);
    if (e.superman > 0.12) items.push(['Superman', 250 + Math.round(e.superman * 250)]);
    if (e.barspins > 0) items.push([`Barspin${e.barspins > 1 ? ' ×' + e.barspins : ''}`, 300 * e.barspins]);
    if (e.airTime > 0.8) items.push([`Air ${e.airTime.toFixed(1)}s`, Math.round(e.airTime * 40)]);
    if (grade === 'sweet' && Math.abs(e.pitchErr) < 0.3) items.push(['Sweet spot', 100]);
    else if (e.clean && e.airTime > 0.5 && !/cased/i.test(grade || '')) items.push(['Clean landing', 40]);

    let total = items.reduce((a, b) => a + b[1], 0);
    const nTricks = items.filter((i) => !/Air|Sweet|Clean/.test(i[0])).length;
    if (nTricks >= 2) total = Math.round(total * (1 + 0.25 * (nTricks - 1)));
    for (const [label] of items) this.hud.trickLine(label);
    if (total > 0) { this.style += total; this.hud.trickTotal(total, nTricks >= 2 ? `Combo ×${(1 + 0.25 * (nTricks - 1)).toFixed(2)}` : null); }
    if (nTricks) sfx('ding', 0.5); else if (grade === 'sweet') sfx('good', 0.4);

    // Grade messages.
    if (grade === 'cased' || grade === 'casedGap') this.hud.flash('Clipped the deck', 'warn');
    else if (grade === 'casedHeavy') this.hud.flash('Cased it', 'bad');
    else if (grade === 'flat') this.hud.flash('Flat landing', 'warn');
    if (e.hard) { this.hud.flash('Hard landing! Speed lost', 'warn'); this.rig.shake = 0.6; }

    sfx('thud', clamp(e.vn / 8, 0.15, 1), 0.9 + Math.random() * 0.2);
    if (e.vn > 2) this.dustBurst(clamp(e.vn * 3, 6, 30));

    // Tasks + jumps cleared.
    if (j && grade && grade !== 'casedHeavy' && grade !== 'casedGap') {
      this.jumpsCleared.add(j.lipS);
      if (j.kind === 'drop') this.task('drop');
      if (j.kind === 'stepup' && grade === 'sweet') this.task('stepup');
    }
    if (grade === 'sweet') this.task('sweet');
    if (whipDeg >= 45) this.task('whip');
    if (spins > 0) this.task('spin');
    if (flips > 0 && e.rotPitch > 0) this.task('flip');
    if (e.noHand > 0.12) this.task('nohand');
    if (e.superman > 0.12) this.task('superman');
    if (e.barspins > 0) this.task('barspin');
    if (this.hopPending && e.height > 0.25) this.task('hop');
    this.hopPending = false;
  }

  trick(label, pts, quiet) {
    this.style += pts;
    this.hud.trickLine(label);
    if (!quiet) this.hud.trickTotal(pts);
  }

  task(id) {
    const list = this.course.tasks;
    if (!list || this.tasks[id]) return;
    const t = list.find((x) => x.id === id);
    if (!t) return;
    this.tasks[id] = true;
    const st = store();
    st.tasks[this.course.id] = Object.assign(st.tasks[this.course.id] || {}, { [id]: true });
    st.coins += 20;
    save();
    this.hud.taskDone(t.label);
    sfx('good', 0.6);
  }

  doCrash(reason) {
    const sim = this.sim;
    this.crash = { reason, t: 0 };
    this.crashes++;
    this.hud.flash(CRASH_TEXT[reason] || 'Crash!', 'bad', 1.6);
    sfx('crash', 0.8);
    duckMusic(0.25, 1.6);
    this.rig.shake = 1;
    // Rider and bike tumble apart.
    const v = sim.vel;
    this.bikeTumble = {
      vel: new THREE.Vector3(v.x * 0.7, Math.max(v.y, 0) + 2, v.z * 0.7),
      rot: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8),
    };
    const rp = new THREE.Vector3();
    this.rider.group.getWorldPosition(rp);
    this.riderFree = {
      pos: this.bikeRoot.position.clone(),
      vel: new THREE.Vector3(v.x * 0.9, Math.max(v.y, 0) + 3, v.z * 0.9),
      spin: new THREE.Vector3(4 + Math.random() * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5),
      rot: this.bikeRoot.rotation.clone(),
    };
    this.dustBurst(30);
  }

  updateCrash(dt) {
    const c = this.crash;
    c.t += dt;
    const tr = this.track;
    // Bike body tumbles inside its root.
    const bt = this.bikeTumble;
    const root = this.bikeRoot;
    bt.vel.y -= 9.81 * dt;
    root.position.addScaledVector(bt.vel, dt);
    const gh = tr.height(root.position.x, root.position.z, this.hintState.hint);
    if (root.position.y < gh + 0.3) {
      root.position.y = gh + 0.3;
      bt.vel.y = Math.abs(bt.vel.y) * 0.3;
      bt.vel.x *= 0.7; bt.vel.z *= 0.7;
      bt.rot.multiplyScalar(0.7);
      if (Math.abs(bt.vel.y) > 1) this.dustBurst(5);
    }
    root.rotation.x += bt.rot.x * dt; root.rotation.y += bt.rot.y * dt; root.rotation.z += bt.rot.z * dt;
    // Rider flies separately: detach visually by offsetting.
    const rf = this.riderFree;
    rf.vel.y -= 9.81 * dt;
    rf.pos.addScaledVector(rf.vel, dt);
    const rh = tr.height(rf.pos.x, rf.pos.z, this.hintState.hint);
    if (rf.pos.y < rh) { rf.pos.y = rh; rf.vel.multiplyScalar(0.55); rf.vel.y = Math.abs(rf.vel.y) * 0.25; rf.spin.multiplyScalar(0.6); }
    rf.rot.x += rf.spin.x * dt; rf.rot.y += rf.spin.y * dt; rf.rot.z += rf.spin.z * dt;
    if (!this.riderDetached) {
      this.riderDetached = true;
      this.scene.attach(this.rider.group);
    }
    this.rider.group.position.copy(rf.pos);
    this.rider.group.rotation.copy(rf.rot);
    this.rider.group.translateY(-0.6);
    // Ragdoll-ish limp pose.
    this.limpPose();

    if (c.t > 1.7) {
      this.bikeRoot.add(this.rider.group);
      this.rider.group.position.set(0, 0, 0);
      this.rider.group.rotation.set(0, 0, 0);
      this.riderDetached = false;
      this.crash = null;
      this.respawn(this.started);
    }
  }

  dustBurst(n) {
    const p = this.sim.pos;
    this.world.dust.emit(p.x, p.y, p.z, this.sim.vel.x * 0.3, 0.5, this.sim.vel.z * 0.3, Math.round(n));
  }

  finish() {
    this.phase = 'finished';
    const total = this.time + this.penalty;
    const st = store();
    const prev = st.best[this.course.id];
    const isBest = !prev || total < prev.time;
    const coinsBase = COIN_RATE[this.assist] * (LEVEL_MULT[this.course.level] || 1);
    const coins = Math.round(coinsBase + this.style / 100);
    st.coins += coins;
    if (isBest) {
      st.best[this.course.id] = { time: total, style: this.style, splits: this.splits.slice(), crashes: this.crashes, bike: this.bikeDef.id };
      saveGhost(this.course.id, { bike: this.bikeDef.id, dt: 0.05, f: this.rec });
    } else if (prev && this.style > (prev.style || 0)) {
      prev.styleBest = Math.max(prev.styleBest || 0, this.style);
    }
    save();
    this.replayId = this.saveReplay(total);
    this.finishedData = {
      time: total, raw: this.time, penalty: this.penalty, crashes: this.crashes, style: this.style,
      splits: this.splits.slice(), prev, isBest, coins,
      jumps: this.jumpsCleared.size, jumpTotal: this.track.jumps().length, replayId: this.replayId,
    };
    sfx('finish', 0.8);
    this.hud.finish(this, this.finishedData);
  }

  // ----------------------------------------------------------- replay --

  recordReplay(dt) {
    if (!this.recorder || !this.started || this.phase !== 'run') return;
    const sim = this.sim, r = this.bikeRoot;
    const crash = !!this.crash;
    this.recorder.tick(dt, crash ? {
      x: r.position.x, y: r.position.y, z: r.position.z, yaw: r.rotation.y, pitch: -r.rotation.x, roll: -r.rotation.z,
      clock: this.time + this.penalty, flags: flagsOf({ crash: true }), landIn: 4,
    } : {
      x: sim.pos.x, y: sim.pos.y, z: sim.pos.z, yaw: sim.yaw, pitch: sim.pitch, roll: sim.roll, whip: sim.whip,
      speed: sim.grounded ? sim.speed : sim.hSpeed(), lift: sim.manual - sim.stoppie, preload: sim.preload,
      noHand: sim.noHand, superman: sim.superman, barAngle: sim.barAngle, barspin: sim.barspin,
      steerVis: sim.steerVis, brakeVis: sim.brakeVis, landIn: sim.landIn, spinVel: sim.spinVel,
      sliding: sim.sliding, skid: sim.skid, clock: this.time + this.penalty,
      flags: flagsOf({ grounded: sim.grounded, pedaling: sim.pedaling, bunny: sim.bunny, standing: sim.hopT >= 0 }),
    });
  }

  saveReplay(total) {
    if (!this.recorder || this.recorder.frames.length < 20) return null;
    const st = store();
    const rec = this.recorder.encode({
      course: this.course.id, courseName: this.course.name, bike: this.bikeDef.id,
      color: st.colors[this.bikeDef.id] || this.bikeDef.color, kit: { ...st.kit },
      time: total, style: this.style, crashes: this.crashes, weather: this.world.weather,
    });
    return saveReplay(rec);
  }

  // ------------------------------------------------------------ ghost --

  recordGhost(dt) {
    if (!this.started || this.phase !== 'run' || !this.course.timed) return;
    this.recT += dt;
    while (this.recT >= 0.05) {
      this.recT -= 0.05;
      const s = this.sim;
      this.rec.push([+s.pos.x.toFixed(2), +s.pos.y.toFixed(2), +s.pos.z.toFixed(2), +s.yaw.toFixed(3), +s.pitch.toFixed(3), +s.whip.toFixed(2)]);
    }
  }

  updateGhost() {
    if (!this.ghost) return;
    const g = this.ghostData.f;
    const show = this.started && this.phase !== 'ready' && g.length > 1;
    this.ghost.root.visible = show;
    if (!show) return;
    const t = (this.time + this.penalty) / 0.05;
    const i = Math.min(g.length - 2, Math.floor(t));
    const k = clamp(t - i, 0, 1);
    const a = g[i], b = g[i + 1];
    const r = this.ghost.root;
    r.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
    r.rotation.set(0, 0, 0);
    r.rotation.order = 'YXZ';
    r.rotation.y = a[3] + wrapAngle(b[3] - a[3]) * k;
    r.rotation.x = -(a[4] + (b[4] - a[4]) * k);
  }

  // ---------------------------------------------------------- visuals --

  updateVisuals(dt, inp) {
    const sim = this.sim;
    if (!this.crash) {
      const fx = Math.sin(sim.yaw), fz = Math.cos(sim.yaw), w2 = this.bike.wb / 2;
      const h = this.hintState.hint;
      this.anim.update(dt, sim, {
        root: this.bikeRoot,
        gF: this.track.height(sim.pos.x + fx * w2, sim.pos.z + fz * w2, h),
        gR: this.track.height(sim.pos.x - fx * w2, sim.pos.z - fz * w2, h),
        barCatch: this.barCatch || 0,
      });
      this.barCatch = 0;
      // Dust off the rear tyre (lots of it when sliding or skidding).
      const hs = Math.abs(sim.speed);
      const slide = Math.max(sim.sliding, sim.skid * 0.8);
      if (sim.grounded && hs > 4 && Math.random() < hs / 30 * (this.rough ? 2 : 1) + slide * 1.5) {
        this.world.dust.emit(sim.pos.x - fx * 0.6, sim.pos.y + 0.05, sim.pos.z - fz * 0.6, -fx * 1.5, 0.6, -fz * 1.5, 1);
      }
    }
    this.world.dust.update(dt);
    const ground = { height: (x, z) => this.track.height(x, z, this.hintState.hint) };
    const camTarget = this.crash ? { pos: this.bikeRoot.position, vel: { x: 0, y: 0, z: 0 }, yaw: this.rig.yaw, pitch: 0, grounded: true, speed: 0, roll: 0, preload: 0 } : sim;
    this.rig.update(dt, camTarget, ground);
    this.world.follow(this.bikeRoot.position, sim.yaw);
    const ps = this.projTmp.s ?? 0;
    const deck = this.track.features.find((f) => f.deckS !== null && f.deckS !== undefined && ps >= f.deckS && ps <= f.lipS);
    updateRide({
      active: this.phase === 'run' || this.phase === 'finished', speed: this.crash ? 0 : sim.grounded ? sim.speed : sim.hSpeed(),
      grounded: sim.grounded && !this.crash, air: !sim.grounded, pedal: sim.pedaling && sim.grounded, rough: this.rough,
      slide: sim.sliding, skid: sim.skid, brake: sim.brakeVis, wood: !!deck && sim.grounded, dt,
    });
  }

  // Loose, tumbling pose while the rider is thrown clear in a crash.
  limpPose() {
    const V3 = THREE.Vector3;
    this.rider.pose({
      bb: this.bike.bb, handL: new V3(0.4, 0.75, 0.55), handR: new V3(-0.45, 0.85, 0.4),
      footL: new V3(0.22, 0.2, -0.15), footR: new V3(-0.25, 0.35, 0.2),
      drop: 0.25, fore: 0.1, hipX: 0, torso: 0.9, hipYaw: 0.2, hipRoll: 0.3, headPitch: 0.5, headYaw: 0.3,
    });
  }

  dispose() {
    this.world.dispose();
    this.scene.remove(this.bikeRoot);
    if (this.riderDetached) this.scene.remove(this.rider.group);
    if (this.ghost) this.scene.remove(this.ghost.root);
    const disposeTree = (o) => o.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    disposeTree(this.bikeRoot);
    if (this.ghost) disposeTree(this.ghost.root);
  }
}

function scaleVel(sim, k) { sim.vel.x *= k; sim.vel.y *= k; sim.vel.z *= k; }

export function resolveQuality(q) {
  if (q && q !== 'auto') return q;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
}

export function fmtTime(t) {
  if (t === null || t === undefined || !isFinite(t)) return '–:––.––';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

void smoothstep;
