// A short film made in the game: the soldier sprints in, dives, catches a
// PF-9 thrown to him in mid air, rolls into cover behind a barrier, comes
// up and fires; then the bullet cam: time all but stops at the muzzle and
// the camera rides beside the bullet while labels (in the breakdowns' look,
// with their lines and cards) tell what it is, how it spins, what's left
// behind and how fast it goes, until it strikes a steel plate, time snaps
// back and the plate rings and swings.
//
//     import { Film } from './showcase/cinematic/film.js';
//     const film = new Film({ onClose: () => { ... }, wardrobe });
//     film.play();     // opens it over the page (call from a click: it plays sounds)
//     film.close();    // closes it and frees everything (Esc does this)
//
// Like the breakdowns (src/showcase/breakdown.js), it covers the page with
// its own canvas and renderer, is a function of one clock (seek(t) shows
// any moment, the same every time), and frees all it made when it closes.
// Its keys: Space pauses, the arrows skip back and on 5 s, Esc closes; at
// the end Replay and Close.
//
// What happens is all in src/showcase/cinematic/edit.js (the slots for his
// moves, the shots, the cameras, the labels); the shot's numbers in
// ballistics.js; the set, the round, the effects and the sounds in set.js,
// round.js, fx.js and sound.js; the soldier, his moves and the pistol in
// actor.js. `test: true` shows the shot's name and times, and a note on
// each shot still waiting for its Mixamo clip.
//
// The picture: the scene with depth of field (focused per camera key),
// then the air (the bow wave, wake and blast wave bending the picture
// behind the bullet), the glow (bloom), film-like tone mapping and a grade
// (vignette, a touch of fringing and grain), in wide screen with bars.
// Time: each shot maps film time to story time (see edit.js, TIME), and
// everything is posed from story time, so slow motion slows it all.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { addBreakdownStyles, ease, leaderPaths, releaseSharedTextures } from '../breakdown.js';
import { outdoorEnvironment, SUN_DIRECTION } from '../../world.js';
import { MODEL9 } from '../../viewmodel/pistol9.js';
import { Actor, advance, retreat } from './actor.js';
import { buildSet, filmEnvironment, TARGET } from './set.js';
import { makeCartridge, makeFiredBullet, makeSpentCase, roundMaterials, ROUND } from './round.js';
import { Effects, FX_LAYER } from './fx.js';
import { FilmSound } from './sound.js';
import { EJECT, SHOT, barrelPose, bulletSpeed, bulletSpin, bulletTravel, gunKick, plateSwing, slideBack, timeToTravel } from './ballistics.js';
import { FILM, LAYOUT, SLOTS, cards, cues as makeCues, shots as makeShots } from './edit.js';
import { clamp01, lerp, monotone, pathAt, smoothstep } from './util.js';

const LABEL = { line: 0.4, card: 0.25 }; // the breakdowns' pace: the line draws, the card fades
const BAND = 2.39; // the picture's shape (wide screen), with bars above and below
const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = new THREE.Vector3(0, -9.81, 0);

let stylesAdded = false;
function addStyles() {
  addBreakdownStyles();
  if (stylesAdded) return;
  stylesAdded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./cinematic.css', import.meta.url).href;
  document.head.appendChild(link);
}

// The sounds by name: each gets the film's sound and how fast the story
// is going (1 real time, less in slow motion), and plays at that rate (a
// slowed sound deepens) or, slowed past hearing, its slow-motion form.
const slowed = (speed) => Math.max(0.2, Math.min(1, speed));
const SOUNDS = {
  shot: (a, v) => (v > 0.5 ? a.shot() : a.slowShot()),
  slowShot: (a) => a.slowShot(),
  rush14: (a) => a.rush(13),
  rush7: (a) => a.rush(6.4),
  slowRing: (a) => a.slowRing(),
  ring: (a, v) => (v > 0.5 ? a.ring() : a.slowRing()),
  snap: (a) => a.snap(),
  tink: (a, v, volume) => a.tink(slowed(v), volume),
  slowTink: (a) => a.tink(0.35),
  thump: (a, v, volume) => a.thump(volume, slowed(v)),
  slap: (a, v) => a.slap(slowed(v)),
  whoosh: (a, v) => a.whoosh(slowed(v)),
};

export class Film {
  constructor({ container = document.body, onClose = null, wardrobe = null, test = false, sound = true, autoplay = true, slots = SLOTS } = {}) {
    this.container = container;
    this.onClose = onClose;
    this.wardrobe = wardrobe;
    this.test = test;
    this.sound = sound;
    this.autoplay = autoplay;
    this.slotSpecs = slots;
    this.t = 0;
    this.paused = false;
    this.open = false;
    this.ready = null;
    this.frame = this.frame.bind(this);
    this.onKey = this.onKey.bind(this);
    this.onResize = () => { this.layoutDirty = true; };
  }

  async play() {
    addStyles();
    if (!this.root) this.buildDom();
    this.root.hidden = false;
    this.open = true;
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    if (this.sound && !this.audio) this.audio = new FilmSound();
    if (!this.ready) this.ready = this.setUp();
    try {
      await this.ready;
    } catch (error) {
      if (!this.open) return;
      this.loading.textContent = 'The film couldn’t load.';
      throw error;
    }
    if (!this.open) return;
    this.loading.hidden = true;
    this.seek(0);
    this.paused = false;
    this.last = performance.now();
    if (this.autoplay) this.renderer.setAnimationLoop(this.frame);
  }

  skip() {
    this.close();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispose();
    if (this.onClose) this.onClose();
  }

  // ---- The page ----

  buildDom() {
    const root = (this.root = document.createElement('div'));
    root.className = 'bd-root cine-root';
    root.innerHTML = `
      <canvas class="bd-canvas"></canvas>
      <div class="cine-bar cine-top"></div><div class="cine-bar cine-bottom"></div>
      <svg class="bd-lines" xmlns="http://www.w3.org/2000/svg"></svg>
      <div class="bd-card cine-card" hidden><div class="bd-kicker"></div><h2 class="bd-title"></h2><p class="bd-text"></p></div>
      <div class="bd-titlecard cine-titlecard" hidden><div class="bd-name"></div><div class="bd-sub"></div><div class="bd-credit"></div>
        <div class="bd-buttons"><button type="button" class="bd-replay">Replay</button><button type="button" class="bd-done">Close</button></div></div>
      <button type="button" class="bd-close" aria-label="Close the film">Close <kbd>Esc</kbd></button>
      <div class="bd-hint"><kbd>Space</kbd> pause · <kbd>←</kbd> <kbd>→</kbd> skip</div>
      <div class="bd-progress"><div class="bd-progress-fill"></div></div>
      <div class="cine-test" hidden></div>
      <div class="bd-loading">Loading…</div>`;
    const $ = (s) => root.querySelector(s);
    this.canvas = $('.bd-canvas');
    this.svg = $('.bd-lines');
    this.bars = [$('.cine-top'), $('.cine-bottom')];
    this.leaders = [];
    this.card = $('.bd-card');
    this.cardKicker = $('.bd-kicker');
    this.cardTitle = $('.bd-title');
    this.cardText = $('.bd-text');
    this.titleCard = $('.bd-titlecard');
    this.titleName = $('.bd-name');
    this.titleSub = $('.bd-sub');
    this.creditLine = $('.bd-credit');
    this.creditLine.textContent = FILM.credit;
    this.buttons = $('.bd-buttons');
    this.progressBar = $('.bd-progress-fill');
    this.hint = $('.bd-hint');
    this.testLine = $('.cine-test');
    this.loading = $('.bd-loading');
    const stop = (e) => e.stopPropagation();
    $('.bd-close').addEventListener('click', (e) => { stop(e); this.close(); });
    $('.bd-done').addEventListener('click', (e) => { stop(e); this.close(); });
    $('.bd-replay').addEventListener('click', (e) => { stop(e); this.seek(0); this.paused = false; this.lastEvent = -1; });
    for (const b of root.querySelectorAll('button')) b.addEventListener('pointerdown', stop);
    root.addEventListener('pointerdown', (e) => { if (e.button === 0 && this.timeline) this.paused = !this.paused; });
    this.container.appendChild(root);
  }

  onKey(e) {
    if (!this.open) return;
    const keys = {
      Escape: () => this.close(),
      Space: () => { this.paused = !this.paused; },
      ArrowRight: () => this.seek(Math.min(this.duration, this.t + 5)),
      ArrowLeft: () => this.seek(Math.max(0, this.t - 5)),
    };
    const act = keys[e.code];
    if (!act) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.timeline || e.code === 'Escape') act();
  }

  // ---- Loading ----

  async setUp() {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // (applied by the output pass)
    renderer.toneMappingExposure = 1.1; // the game's
    renderer.shadowMap.autoUpdate = false; // (drawn once a frame, by the scene pass)
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    this.camera.layers.enableAll();
    this.env = outdoorEnvironment(renderer, SUN_DIRECTION); // (the game's: for him)
    this.shine = filmEnvironment(renderer, SUN_DIRECTION); // (for the rounds and the metal close up)

    const set = (this.set = buildSet(renderer, { crateSpot: LAYOUT.crates }));
    scene.add(set.group);
    scene.fog = set.fog;
    // Metal on the set shows the sky, as the gun and the soldier do.
    set.group.traverse((o) => {
      if (o.isMesh) for (const m of [].concat(o.material)) if (m.metalness > 0.3) m.envMap = this.shine;
    });

    // The rounds: the one on the barrier in the opening, the bullet and
    // the spent case.
    this.roundMat = roundMaterials(this.shine);
    this.titleRound = makeCartridge(this.roundMat);
    this.titleRound.position.fromArray(LAYOUT.round);
    this.titleRound.rotation.set(-Math.PI / 2, 0, 0.6);
    scene.add(this.titleRound);
    this.bullet = makeFiredBullet(this.roundMat);
    this.spent = makeSpentCase(this.roundMat);
    scene.add(this.bullet, this.spent);

    this.fx = new Effects(scene);

    // The soldier and the pistol.
    const actor = (this.actor = new Actor({ renderer, envMap: this.env, gunEnv: this.shine, wardrobe: this.wardrobe }));
    await actor.load(this.slotSpecs);
    if (!this.renderer) throw new Error('closed while loading');
    scene.add(actor.model, actor.pistol);
    await actor.dressed;
    if (!this.renderer) throw new Error('closed while loading');

    this.plan();
    this.post();
    this.layoutDirty = true;
    this.layout();
    // Compile the shaders and upload the textures now, not on the first frames.
    this.renderAt(this.shotList.find((s) => s.name === 'bullet-out').start + 3);
    this.renderAt(0);
  }

  // ---- The plan: where everything goes and when ----

  plan() {
    const actor = this.actor;
    // The slots: each one's length (its clip's, or as planned), where it
    // starts in the story, and where in the world.
    const slots = this.slotSpecs.map((spec) => {
      const clip = actor.clips[spec.id];
      return { ...spec, length: clip ? clip.duration / (spec.speed || 1) : spec.length, hasClip: !!clip, marks: { ...(spec.marks || {}) } };
    });
    const byId = Object.fromEntries(slots.map((s) => [s.id, s]));
    const base = slots.filter((s) => !s.layer);
    let t = 0;
    base.forEach((s, i) => {
      if (i > 0) t += base[i - 1].length - s.blend;
      s.start = t;
    });
    for (const s of slots.filter((x) => x.layer)) {
      const under = byId[s.over];
      s.start = under.start + (under.marks[s.at] ?? under.length / 2) - s.lead;
    }
    // Placed backwards from the fire slot: each slot starts where the one
    // before it has carried him by the time the next fades in.
    const fireIndex = base.findIndex((s) => s.id === 'fire');
    base[fireIndex].place = { ...LAYOUT.fireSpot };
    const carry = (s, time) => {
      if (s.hasClip) {
        const d = actor.clipDrift(actor.clips[s.id], time * (s.speed || 1));
        return [d.dx, d.dz, 0];
      }
      const k = clamp01(time / s.length);
      return [s.travel[0] * k, s.travel[1] * k, (s.turn || 0) * k];
    };
    for (let i = fireIndex - 1; i >= 0; i--) {
      const s = base[i], next = base[i + 1];
      const [dx, dz, turn] = carry(s, next.start - s.start);
      s.place = retreat(next.place, dx, dz, turn);
    }
    for (let i = fireIndex + 1; i < base.length; i++) {
      const s = base[i], prev = base[i - 1];
      const [dx, dz, turn] = carry(prev, s.start - prev.start);
      s.place = advance(prev.place, dx, dz, turn);
    }
    for (const s of slots.filter((x) => x.layer)) s.place = byId[s.over].place;
    this.slots = slots;
    actor.setUp(slots);

    const story = {
      start: (id) => byId[id].start,
      mark: (id, name) => byId[id].start + (byId[id].marks[name] ?? 0),
    };
    story.fire = story.mark('fire', 'shot');
    this.fireAt = story.fire;
    this.grabAt = story.mark('dive', 'catch');

    // The plate, and where the bullet strikes it.
    const target = this.set.target;
    target.group.updateMatrixWorld(true);
    this.hitLocal = new THREE.Vector3(LAYOUT.hit[0], LAYOUT.hit[1], TARGET.thick / 2);
    this.hit = this.hitLocal.clone().applyMatrix4(target.plate.matrixWorld);
    this.hitNormal = new THREE.Vector3(0, 0, 1).transformDirection(target.plate.matrixWorld);

    // The gun as he fires: from his hand if the fire clip is in, else held
    // up in its aim pose. The bullet flies from where it sits in the
    // chamber to the strike.
    this.aimPose = this.aimGun();
    const firing = byId.fire.hasClip ? this.gunFromHand(story.fire) : this.aimPose;
    this.firing = firing;
    const muzzleLocal = new THREE.Vector3(...MODEL9.muzzle);
    const muzzle = muzzleLocal.clone().applyQuaternion(firing.quaternion).add(firing.position);
    this.dir = new THREE.Vector3().subVectors(this.hit, muzzle).normalize();
    this.seat = muzzle.clone().addScaledVector(this.dir, -SHOT.bore); // the bullet's base, seated
    this.range = muzzle.distanceTo(this.hit);
    const toHit = this.seat.distanceTo(this.hit) - ROUND.bullet.length;
    this.hitS = timeToTravel(toHit); // seconds after the primer fires
    story.impact = story.fire + this.hitS;
    this.fx.setPath(muzzle, this.hit);

    // The toss: the pistol lies on the top crate (LAYOUT.crates) until
    // it's thrown, then flies to arrive in his hand at the dive's catch,
    // turning over (whole turns, plus the turn from lying flat to his
    // grip) as it goes.
    actor.pose(this.grabAt);
    const grab = actor.gunInHand();
    const rest = this.restingGun();
    const T = LAYOUT.toss.flight;
    const from = rest.position.clone();
    this.toss = {
      from, T, start: this.grabAt - T, end: grab.position.clone(), endQuat: grab.quaternion.clone(), restQuat: rest.quaternion.clone(),
      v0: grab.position.clone().sub(from).addScaledVector(GRAVITY, -0.5 * T * T).divideScalar(T),
      axis: new THREE.Vector3().subVectors(grab.position, from).cross(UP).normalize(),
    };
    this.catchPoint = grab.position.clone();

    // The spent case's flight, worked out once.
    this.caseFlight = this.flyCase();

    // The shots, end to end. A shot's story clock: `time` keys (a smooth
    // curve through [film seconds, story time]), `ramp` keys (its speed,
    // story seconds a film second, eased from key to key in proportion,
    // so 1 to 1/1000 slows as evenly as 1/1000 to 1/1,000,000), or real
    // speed. `from: 'prev'` carries on from where the shot before ended.
    const list = makeShots(story);
    let at = 0, prevTo = 0;
    this.shotList = list.map((spec) => {
      const from = spec.from === 'prev' ? prevTo : spec.from;
      let film, map, to = spec.to;
      if (spec.ramp) {
        // (With `to`, a stretch at the first key's speed comes first, as
        // long as it takes for the ramp to end there.)
        let keys = spec.ramp;
        if (typeof spec.to === 'number') {
          const lead = (spec.to - rampMap(from, keys).to) / keys[0][1];
          if (lead > 0) keys = [[0, keys[0][1]], ...keys.map(([x, v]) => [x + lead, v])];
        }
        spec = { ...spec, ramp: keys };
        const r = rampMap(from, keys);
        film = r.film;
        map = r.map;
        to = r.to;
      } else {
        film = spec.film ?? to - from;
        map = spec.time ? monotone(spec.time) : (x) => from + x;
      }
      const camKeys = spec.camera.map((k) => ({ ...k, at: k.at === 'end' ? film : k.at }));
      const shot = { ...spec, from, to, film, start: at, end: at + film, map, camKeys };
      // How fast its story goes at x film seconds in (story s a film s).
      shot.speedAt = spec.ramp ? rampMap.speed(spec.ramp) : spec.time ? (x) => {
        const h = Math.min(1 / 240, film / 4);
        const a = Math.max(0, x - h), b = Math.min(film, x + h);
        return (map(b) - map(a)) / Math.max(1e-9, b - a);
      } : () => 1;
      at += film;
      prevTo = to;
      return shot;
    });
    this.duration = at;
    this.story = story;
    this.cards = cards(this.range);
    // Sounds: at film times in a shot (`sounds`), and at moments in the
    // story (cues: each plays once, the first time the film passes it, at
    // the story's speed then: slowed, or in its slow-motion form).
    this.events = [];
    for (const s of this.shotList) for (const [when, name] of s.sounds || []) this.events.push({ t: s.start + when, name });
    this.events.sort((a, b) => a.t - b.t);
    this.cues = makeCues(story, this).map(([w, name, volume]) => ({ w, name, volume }));
    this.cuesPlayed = new Set();
    this.timeline = { shots: this.shotList };
  }

  // The PF-9 lying on its left side on the top crate's lid, its muzzle
  // turned a little off the crate's long side.
  restingGun() {
    const crates = this.set.crates;
    crates.group.updateMatrixWorld(true);
    const pistol = this.actor.pistol;
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, crates.topYaw + LAYOUT.toss.restTurn, -Math.PI / 2, 'YXZ'));
    quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(crates.group.matrixWorld)));
    // (Its lowest point on the lid.)
    pistol.position.set(0, 0, 0);
    pistol.quaternion.copy(quaternion);
    pistol.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pistol);
    const lid = crates.top.clone().applyMatrix4(crates.group.matrixWorld);
    const position = new THREE.Vector3(lid.x - (box.min.x + box.max.x) / 2, lid.y - box.min.y, lid.z - (box.min.z + box.max.z) / 2);
    return { position, quaternion };
  }

  // The PF-9 held up to fire, its muzzle at LAYOUT.muzzle, pointing at the strike.
  aimGun() {
    const muzzle = new THREE.Vector3(...LAYOUT.muzzle);
    const dir = new THREE.Vector3().subVectors(this.hit, muzzle).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, UP); // (its -Z along dir)
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
    const position = muzzle.clone().sub(new THREE.Vector3(...MODEL9.muzzle).applyQuaternion(quaternion));
    return { position, quaternion };
  }

  gunFromHand(storyTime) {
    this.actor.pose(storyTime);
    const g = this.actor.gunInHand();
    return { position: g.position.clone(), quaternion: g.quaternion.clone() };
  }

  // The case from the moment it leaves the port: thrown out, tumbling,
  // falling, bouncing off the ground and settling on its side. Steps of
  // half a millisecond for four seconds.
  flyCase() {
    const g = this.firing;
    const dt = 0.0005;
    const portLocal = this.caseInGun(EJECT.time).position;
    const pos = portLocal.clone().applyQuaternion(g.quaternion).add(g.position);
    const vel = new THREE.Vector3(...EJECT.velocity).applyQuaternion(g.quaternion);
    let q = this.caseInGun(EJECT.time).quaternion.clone().premultiply(g.quaternion);
    let axis = new THREE.Vector3(...EJECT.axis).normalize().applyQuaternion(g.quaternion);
    let spin = EJECT.spin * Math.PI * 2;
    const steps = Math.ceil(4 / dt);
    const out = { dt, pos: new Float32Array(steps * 3), quat: new Float32Array(steps * 4), landed: [] };
    const r = ROUND.case.rim / 2;
    let resting = false;
    for (let i = 0; i < steps; i++) {
      out.pos.set([pos.x, pos.y, pos.z], i * 3);
      out.quat.set([q.x, q.y, q.z, q.w], i * 4);
      if (resting) continue;
      vel.addScaledVector(GRAVITY, dt);
      pos.addScaledVector(vel, dt);
      q = new THREE.Quaternion().setFromAxisAngle(axis, spin * dt).multiply(q);
      if (pos.y < r && vel.y < 0) {
        pos.y = r;
        out.landed.push(i * dt);
        vel.y *= -0.32;
        vel.x *= 0.55;
        vel.z *= 0.55;
        spin *= 0.45;
        // (On the ground it rolls about its own length.)
        axis = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
        if (Math.abs(vel.y) < 0.25) {
          // Lying on its side.
          const along = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
          q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
          vel.set(0, 0, 0);
          resting = true;
        }
      }
    }
    return out;
  }

  // Where the case is in the gun while the extractor holds it on the
  // slide's face (gun frame): seated, then drawn back with the slide.
  caseInGun(s) {
    const back = slideBack(s, MODEL9.slideTravel);
    const z = this.seatZ() + back;
    return {
      position: new THREE.Vector3(0, MODEL9.muzzle[1], z),
      quaternion: new THREE.Quaternion().setFromAxisAngle(UP, Math.PI), // mouth to -Z
    };
  }

  // The case's base, seated, along the gun's Z.
  seatZ() {
    return MODEL9.muzzle[2] + SHOT.bore + (ROUND.case.length - ROUND.seat);
  }

  // ---- Rendering set-up ----

  post() {
    const renderer = this.renderer;
    const composer = (this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })));
    this.scenePass = new SceneDofPass(this);
    composer.addPass(this.scenePass);
    this.air = new ShaderPass(AIR);
    composer.addPass(this.air);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.4, 1.6);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    composer.addPass(this.grade);
  }

  layout() {
    if (!this.renderer) return;
    const w = Math.max(1, this.root.clientWidth), h = Math.max(1, this.root.clientHeight);
    if (this.size && (w !== this.size.w || h !== this.size.h)) this.layoutDirty = true;
    if (!this.layoutDirty) return;
    this.layoutDirty = false;
    this.size = { w, h };
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.scenePass.setSize(w * dpr, h * dpr);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // The picture: wide screen with bars, or (in a tall window) the full
    // window, cropped at the sides.
    this.portrait = aspect < 1.3;
    const bandH = this.portrait || aspect >= BAND ? h : w / BAND;
    const bar = Math.max(0, Math.round((h - bandH) / 2));
    for (const b of this.bars) b.style.height = bar + 'px';
    this.band = { top: bar, bottom: h - bar, h: h - 2 * bar };
    const m = Math.round(Math.max(16, Math.min(40, w * 0.035)));
    this.cardW = this.portrait ? w - 2 * m : Math.round(Math.min(420, Math.max(250, w * 0.28)));
    this.margin = m;
    this.cardIndex = null;
  }

  // ---- Running ----

  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.advance(dt);
    // (Paused, the sounds already playing hold too.)
    if (this.audio && this.audio.ok && this.paused !== this.audioPaused) {
      this.audioPaused = this.paused;
      if (this.paused) this.audio.ctx.suspend().catch(() => {});
      else this.audio.resume();
    }
    this.draw();
  }

  advance(dt) {
    const before = this.t;
    this.t = Math.min(this.duration + 30, this.t + dt);
    if (!this.audio || dt <= 0) return;
    for (const e of this.events) if (e.t > before && e.t <= this.t && SOUNDS[e.name]) SOUNDS[e.name](this.audio, 1);
    // The story's cues passed since the last frame (within this shot).
    const shot = this.shotAt(this.t);
    const local = Math.min(this.t - shot.start, shot.film);
    const w1 = shot.map(local), w0 = shot.map(Math.max(0, local - (this.t - before)));
    for (let i = 0; i < this.cues.length; i++) {
      const c = this.cues[i];
      if (this.cuesPlayed.has(i) || !(c.w > w0 && c.w <= w1) || !SOUNDS[c.name]) continue;
      this.cuesPlayed.add(i);
      SOUNDS[c.name](this.audio, shot.speedAt(local), c.volume ?? 1);
    }
  }

  // The story time at film time t.
  storyAt(t) {
    const shot = this.shotAt(t);
    return shot.map(Math.min(Math.max(0, t - shot.start), shot.film));
  }

  seek(t) {
    this.t = Math.max(0, t);
    // (Cues before here count as played; those after will play.)
    if (this.cues) {
      const w = this.storyAt(this.t);
      this.cuesPlayed = new Set(this.cues.map((c, i) => (c.w <= w ? i : -1)).filter((i) => i >= 0));
    }
    if (this.renderer) this.draw();
  }

  renderAt(t) {
    const start = performance.now();
    this.seek(t);
    return performance.now() - start;
  }

  shotAt(t) {
    const list = this.shotList;
    return list.find((s) => t < s.end) || list[list.length - 1];
  }

  // Everything at film time t.
  draw() {
    if (!this.renderer) return;
    this.layout();
    const t = this.t;
    const shot = this.shotAt(t);
    const local = Math.min(t - shot.start, shot.film);
    const w = shot.map(local); // story time
    const s = w - this.fireAt; // since the primer fired
    const actor = this.actor;
    const standIn = shot.aim && !actor.clips.fire;

    // Him.
    actor.pose(w);
    actor.model.visible = !(standIn || (shot.hide || []).includes('soldier'));

    // The pistol: in the air, in his hand, or held up to fire; its slide
    // and barrel as the shot cycles them.
    const gun = this.gunAt(w, s, standIn);
    actor.pistol.visible = !!gun;
    if (gun) {
      actor.pistol.position.copy(gun.position);
      actor.pistol.quaternion.copy(gun.quaternion);
    }
    const slide = slideBack(s, MODEL9.slideTravel);
    actor.setPistol({ slide, barrel: barrelPose(slide, MODEL9.barrel), trigger: smoothstep(-0.12, -0.02, s) * (1 - smoothstep(0.03, 0.15, s)) }, MODEL9);
    actor.pistol.updateMatrixWorld(true);

    // The bullet.
    const travel = bulletTravel(s);
    const flying = s > 0 && travel > SHOT.bore - ROUND.bullet.length && s < this.hitS + 0.00012;
    this.bullet.visible = flying;
    const bulletMid = new THREE.Vector3();
    const bulletQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
    bulletQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bulletSpin(s)));
    if (flying) {
      // At the strike it flattens against the steel, the lead spreading.
      const k = clamp01((s - this.hitS) / 0.00004);
      const along = 1 - 0.88 * k;
      const across = 1 + 1.3 * k;
      const base = this.seat.clone().addScaledVector(this.dir, Math.min(travel, this.seat.distanceTo(this.hit) - ROUND.bullet.length * along));
      this.bullet.position.copy(base);
      this.bullet.quaternion.copy(bulletQ);
      this.bullet.scale.set(across, across, along);
      bulletMid.copy(base).addScaledVector(this.dir, (ROUND.bullet.length * along) / 2);
    } else {
      bulletMid.copy(this.seat).addScaledVector(this.dir, Math.min(travel, this.seat.distanceTo(this.hit)) + ROUND.bullet.length / 2);
    }
    this.bulletFrame = { origin: bulletMid, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir) };

    // The case.
    const caseMid = this.caseAt(s, gun);

    // The plate swings once struck.
    this.set.target.pivot.rotation.x = plateSwing(s - this.hitS);
    this.set.target.pivot.updateMatrixWorld(true);

    // Effects.
    const muzzle = gun ? new THREE.Vector3(...MODEL9.muzzle).applyMatrix4(actor.pistol.matrixWorld) : new THREE.Vector3();
    this.muzzleNow = gun ? muzzle : null;
    const portGun = new THREE.Vector3(...MODEL9.port);
    portGun.z += slide;
    const port = gun ? portGun.applyMatrix4(actor.pistol.matrixWorld) : new THREE.Vector3();
    const portDir = gun ? new THREE.Vector3(0.85, 0.5, 0.1).normalize().applyQuaternion(actor.pistol.quaternion) : UP;
    const fxDir = gun ? new THREE.Vector3(0, 0, -1).applyQuaternion(actor.pistol.quaternion) : this.dir;

    // Camera (before the effects: streaks turn to face it).
    this.placeCamera(shot, local, w);
    this.fx.update(s, this.camera, {
      muzzle, dir: fxDir, port, portDir, bullet: bulletMid, flying: flying && s < this.hitS, speed: bulletSpeed(s),
      hit: { s: this.hitS, at: this.hit, normal: this.hitNormal, plate: this.set.target.plate, local: this.hitLocal },
    });
    // (Before the shot, nothing of it.)
    this.fx.group.visible = s > 0;
    this.fx.splash.visible = this.fx.splash.visible && s > this.hitS;

    // Shadows: a tight box round the bullet or the gun in the close shots,
    // else the whole action.
    const sun = this.set.sun;
    const centre = shot.fine ? this.lookPoint : new THREE.Vector3(1.5, 0, 0);
    const half = shot.fine ? 0.35 : 16;
    sun.target.position.copy(centre);
    sun.position.copy(centre).addScaledVector(SUN_DIRECTION, shot.fine ? 6 : 40);
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: shot.fine ? 0.5 : 5, far: shot.fine ? 12 : 90 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = shot.fine ? 0.0004 : 0.015;
    sun.shadow.bias = shot.fine ? -0.00005 : -0.0003;

    this.setAir(s, flying);
    this.scenePass.focus = this.focusDist;
    this.scenePass.blur = shot.blur ?? 0.008;
    this.grade.uniforms.time.value = t;
    this.renderer.toneMappingExposure = shot.exposure ?? 1.1; // (the game's, unless the shot says)
    this.composer.render();

    this.drawLabels(shot, local, s, caseMid);
    this.drawTitles(shot, local, t);
    this.progressBar.style.width = (100 * clamp01(t / this.duration)).toFixed(2) + '%';
    const hint = this.paused || t < 3 ? '1' : '0';
    if (this.hint.style.opacity !== hint) this.hint.style.opacity = hint;
    if (this.test) this.drawTest(shot, t, w, s);
  }

  // The air the shot disturbs, as the picture bends it: the bow wave just
  // ahead of the bullet's nose (it flies at about Mach 1), the churning
  // wake behind its base, and the blast wave spreading from the muzzle.
  // Worked out on the screen from where the bullet and the muzzle are.
  setAir(s, flying) {
    const u = this.air.uniforms;
    const { w, h } = this.size;
    const dpr = this.renderer.getPixelRatio();
    u.res.value.set(w * dpr, h * dpr);
    const cam = this.camera;
    const toPx = (v, out) => {
      const p = v.clone().project(cam);
      out.set((p.x + 1) * 0.5 * w * dpr, (p.y + 1) * 0.5 * h * dpr);
      return p.z < 1 && p.z > -1;
    };
    u.wake.value = 0;
    u.bow.value = 0;
    u.blast.value = 0;
    if (flying && s < this.hitS) {
      const mid = this.bulletFrame.origin;
      const half = ROUND.bullet.length / 2;
      const nose = mid.clone().addScaledVector(this.dir, half), tail = mid.clone().addScaledVector(this.dir, -half);
      const onScreen = toPx(nose, u.nose.value) & toPx(tail, u.tail.value);
      // (Its radius on the screen, from its distance.)
      const dist = mid.distanceTo(cam.position);
      const rad = ((ROUND.bullet.diameter / 2) / (dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))) * 0.5 * h * dpr;
      u.rad.value = rad;
      // Out of the gas cloud, and big enough on the screen to see.
      const out = smoothstep(0.0006, 0.0011, s) * smoothstep(3, 9, rad) * (onScreen ? 1 : 0);
      const travelled = bulletTravel(s);
      u.phase.value = (travelled * (u.nose.value.distanceTo(u.tail.value) / ROUND.bullet.length)) % (rad * 900 + 1);
      u.wake.value = out;
      u.bow.value = out * smoothstep(SHOT.sound * 0.995, SHOT.sound * 1.01, bulletSpeed(s) * 1.0) * 0.6 + out * 0.4;
    }
    // The blast wave: a shell spreading from the muzzle faster than sound
    // at first, fading as it grows.
    const since = s - SHOT.exit + 0.00003;
    if (since > 0 && since < 0.0016 && this.muzzleNow) {
      const R = 0.012 + 520 * since * Math.exp(-since / 0.004);
      const c = this.muzzleNow;
      if (toPx(c, u.blastC.value)) {
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        const edge = new THREE.Vector2();
        toPx(c.clone().addScaledVector(right, R), edge);
        u.blastR.value = edge.distanceTo(u.blastC.value);
        u.blastW.value = Math.max(2.5 * dpr, u.blastR.value * 0.07);
        u.blast.value = (1 - smoothstep(0.0006, 0.0016, since)) * smoothstep(0, 0.00006, since);
      }
    }
    u.time.value = s;
    // (Behind the bullet, or the muzzle for the blast.)
    const at = flying && s < this.hitS ? this.bulletFrame.origin : this.muzzleNow;
    u.behind.value = at ? at.distanceTo(cam.position) + 0.012 : 0;
    u.tDepth.value = this.scenePass.target.depthTexture;
    u.near.value = cam.near;
    u.far.value = cam.far;
  }

  // The pistol's pose at story time w (null before it's thrown).
  gunAt(w, s, standIn) {
    const actor = this.actor;
    const toss = this.toss;
    if (w < toss.start) return { position: toss.from.clone(), quaternion: toss.restQuat.clone() };
    if (w < this.grabAt) {
      const tau = w - toss.start;
      const position = toss.from.clone().addScaledVector(toss.v0, tau).addScaledVector(GRAVITY, 0.5 * tau * tau);
      const k = tau / toss.T;
      // (From lying flat to his grip, plus whole turns end over end, which
      // spin fastest as it leaves and slow a touch: a little drag.)
      const spin = 1 - (1 - k) * (1 - k * 0.25) / 1;
      const quaternion = toss.restQuat.clone().slerp(toss.endQuat, smoothstep(0, 1, k))
        .premultiply(new THREE.Quaternion().setFromAxisAngle(toss.axis, -(1 - spin) * LAYOUT.toss.turns * Math.PI * 2));
      return { position, quaternion };
    }
    if (standIn) {
      // Held up to fire, kicking as it fires.
      const kick = gunKick(s);
      const g = this.aimPose;
      const pivot = new THREE.Vector3(0, -0.085, 0.03); // about the grip, in the gun's frame
      const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kick.rise);
      const local = new THREE.Vector3().sub(pivot).applyQuaternion(turn).add(pivot);
      local.z += kick.back;
      return {
        position: local.applyQuaternion(g.quaternion).add(g.position),
        quaternion: g.quaternion.clone().multiply(turn),
      };
    }
    const g = actor.gunInHand();
    return { position: g.position.clone(), quaternion: g.quaternion.clone() };
  }

  // Places the spent case for time s; returns its middle (or null).
  caseAt(s, gun) {
    const c = this.spent;
    const back = slideBack(s, MODEL9.slideTravel);
    if (s <= 0 || (s < EJECT.time && back < 0.004) || !gun) {
      c.visible = false;
      return null;
    }
    c.visible = true;
    if (s < EJECT.time) {
      const p = this.caseInGun(s);
      c.position.copy(p.position).applyMatrix4(this.actor.pistol.matrixWorld);
      c.quaternion.copy(this.actor.pistol.quaternion).multiply(p.quaternion);
    } else {
      const f = this.caseFlight;
      const x = Math.min((s - EJECT.time) / f.dt, f.pos.length / 3 - 1.001);
      const i = Math.floor(x), k = x - i;
      c.position.fromArray(f.pos, i * 3).lerp(new THREE.Vector3().fromArray(f.pos, i * 3 + 3), k);
      c.quaternion.fromArray(f.quat, i * 4).slerp(new THREE.Quaternion().fromArray(f.quat, i * 4 + 4), k);
    }
    c.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0, ROUND.case.length / 2).applyMatrix4(c.matrixWorld);
  }

  // A point [frame, x, y, z] in the world, now.
  point([frame, x = 0, y = 0, z = 0]) {
    const v = new THREE.Vector3(x, y, z);
    const actor = this.actor;
    switch (frame) {
      case 'world': return v;
      case 'hips': return v.add(actor.bones.CC_Base_Hip.getWorldPosition(new THREE.Vector3()));
      case 'hand': return v.add(actor.bones.CC_Base_R_Hand.getWorldPosition(new THREE.Vector3()));
      case 'catch': return v.add(this.catchPoint);
      case 'case': return v.add(this.spent.visible ? new THREE.Vector3(0, 0, ROUND.case.length / 2).applyMatrix4(this.spent.matrixWorld) : this.hit);
      case 'hit': return v.add(this.hit);
      case 'gun': return v.applyMatrix4(actor.pistol.matrixWorld);
      case 'muzzle':
      case 'bullet': {
        // [right, up, forward] along the bore.
        const f = this.dir, r = new THREE.Vector3().crossVectors(f, UP).normalize(), u = new THREE.Vector3().crossVectors(r, f);
        const o = frame === 'muzzle' ? this.seat.clone().addScaledVector(f, SHOT.bore) : this.bulletFrame.origin;
        return o.clone().addScaledVector(r, x).addScaledVector(u, y).addScaledVector(f, z);
      }
      default: return v;
    }
  }

  // The camera at u seconds into the shot: between its keys, what it looks
  // at moves smoothly, and it swings round that (by its direction and
  // distance) rather than across.
  placeCamera(shot, local) {
    const keys = shot.camKeys;
    const at = keys.map((k) => k.at);
    const looks = keys.map((k) => this.point(k.look));
    const offsets = keys.map((k, i) => this.point(k.pos).sub(looks[i]));
    const look = pathAt(looks, at, local, new THREE.Vector3());
    // Direction (azimuth, elevation) and distance, smoothly.
    const sph = offsets.map((o) => {
      const r = o.length();
      return new THREE.Vector3(Math.atan2(o.x, o.z), Math.asin(THREE.MathUtils.clamp(o.y / r, -1, 1)), Math.log(r));
    });
    for (let i = 1; i < sph.length; i++) {
      // (The shorter way round.)
      while (sph[i].x - sph[i - 1].x > Math.PI) sph[i].x -= Math.PI * 2;
      while (sph[i].x - sph[i - 1].x < -Math.PI) sph[i].x += Math.PI * 2;
    }
    const o = pathAt(sph, at, local, new THREE.Vector3());
    const r = Math.exp(o.z);
    const pos = look.clone().add(new THREE.Vector3(Math.sin(o.x) * Math.cos(o.y), Math.sin(o.y), Math.cos(o.x) * Math.cos(o.y)).multiplyScalar(r));
    const lens = pathAt(keys.map((k) => new THREE.Vector3(k.lens || 35, k.roll || 0, k.focus || 0)), at, local, new THREE.Vector3());
    const cam = this.camera;
    cam.position.copy(pos);
    cam.up.copy(UP);
    cam.lookAt(look);
    if (lens.y) cam.rotateZ(THREE.MathUtils.degToRad(lens.y));
    if (shot.shake) {
      const t = this.t;
      const a = 0.0025 * shot.shake;
      cam.rotateX(a * (Math.sin(t * 2.1) * 0.6 + Math.sin(t * 5.3 + 1) * 0.3 + Math.sin(t * 11.7 + 2) * 0.1));
      cam.rotateY(a * (Math.sin(t * 1.7 + 3) * 0.6 + Math.sin(t * 4.1 + 2) * 0.3 + Math.sin(t * 9.9) * 0.1));
    }
    // The lens: its view across (a full-frame camera's 36 mm width) at the
    // picture's wide-screen shape.
    const tanH = 18 / lens.x;
    const aspect = cam.aspect;
    const tanV = this.portrait ? (tanH / BAND) * 1.6 : aspect >= BAND ? tanH / BAND : tanH / aspect;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanV));
    const dist = pos.distanceTo(look);
    // Near and far planes for what's in view: millimetres for the bullet.
    cam.near = Math.max(0.0015, Math.min(0.05, dist * 0.08));
    cam.far = cam.near * 3e5;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.focusDist = lens.z || dist;
    this.lookPoint = look;
  }

  // ---- Labels ----

  leader(i) {
    while (this.leaders.length <= i) {
      const ns = 'http://www.w3.org/2000/svg';
      const make = (tag, cls) => {
        const el = document.createElementNS(ns, tag);
        el.setAttribute('class', cls);
        this.svg.appendChild(el);
        return el;
      };
      const line = make('polyline', 'bd-line');
      const ring = make('circle', 'bd-ring');
      const dot = make('circle', 'bd-dot');
      dot.setAttribute('r', 3.5);
      this.leaders.push({ line, ring, dot });
    }
    return this.leaders[i];
  }

  // The bullet cam's labels, the breakdowns' way: a dot on the part, a
  // line drawing to the card, the card fading in; both go before the next.
  drawLabels(shot, local, s, caseMid) {
    const label = (shot.labels || []).find((l) => local >= l.at && local < l.until) || null;
    const hide = () => {
      this.card.hidden = true;
      for (const l of this.leaders) {
        l.line.setAttribute('points', '');
        l.dot.style.opacity = 0;
        l.ring.style.opacity = 0;
      }
    };
    if (!label) return hide();
    const card = this.cards[label.card];
    const { w, h } = this.size;
    if (this.cardIndex !== label) {
      this.cardIndex = label;
      this.cardTitle.textContent = card.title;
      this.cardText.textContent = card.text;
      this.cardKicker.textContent = card.kicker;
      this.card.style.width = this.cardW + 'px';
      this.card.hidden = false;
      this.cardH = this.card.offsetHeight;
    }
    if (card.live) this.cardKicker.textContent = `${card.kicker} · ${card.live({ s, travelled: bulletTravel(s) - SHOT.bore })}`;
    const m = this.margin;
    let box;
    if (this.portrait) box = { x: m, y: this.band.bottom - 56 - this.cardH, w: this.cardW, h: this.cardH, side: 'bottom' };
    else {
      const left = label.side === 'left';
      const y = Math.round(Math.min(this.band.bottom - 40 - this.cardH, Math.max(this.band.top + 40, this.band.top + this.band.h * 0.5 - this.cardH * 0.55)));
      box = { x: left ? m : w - m - this.cardW, y, w: this.cardW, h: this.cardH, side: left ? 'left' : 'right' };
    }
    Object.assign(this.card.style, { left: box.x + 'px', top: box.y + 'px' });
    const p = this.point(label.anchor[0] === 'case' && !caseMid ? ['hit'] : label.anchor).project(this.camera);
    const spot = { ax: (p.x + 1) * 0.5 * w, ay: (1 - p.y) * 0.5 * h };
    const [pts] = leaderPaths([spot], box);
    const draw = clamp01((local - label.at) / LABEL.line);
    const fadeOut = clamp01((label.until - local) / LABEL.card);
    const pulse = ((local - label.at) % 1.6) / 1.6;
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const { line, dot, ring } = this.leader(0);
    line.setAttribute('points', pts.map((q) => q.join(',')).join(' '));
    line.style.strokeDasharray = `${len} ${len}`;
    line.style.strokeDashoffset = String(len * (1 - ease(draw)));
    line.style.opacity = fadeOut;
    dot.setAttribute('cx', spot.ax);
    dot.setAttribute('cy', spot.ay);
    dot.style.opacity = Math.min(1, draw * 3) * fadeOut;
    ring.setAttribute('cx', spot.ax);
    ring.setAttribute('cy', spot.ay);
    ring.setAttribute('r', 4 + pulse * 10);
    ring.style.opacity = (1 - pulse) * 0.8 * fadeOut * Math.min(1, draw * 3);
    const cardIn = clamp01((local - label.at - LABEL.line) / LABEL.card);
    this.card.hidden = false;
    this.card.style.opacity = Math.min(cardIn, fadeOut);
    this.card.style.transform = `translateY(${(1 - ease(cardIn)) * 8}px)`;
  }

  // The title over the opening shot, and the end with the credit and buttons.
  drawTitles(shot, local, t) {
    let k = 0, ending = false;
    if (shot.title === 'open') {
      k = Math.min(clamp01((local - 0.6) / 0.8), clamp01((shot.film - 0.4 - local) / 0.6));
      if (this.titleMode !== 'open') {
        this.titleMode = 'open';
        this.titleName.textContent = 'PROJECT FISH';
        this.titleSub.textContent = FILM.subtitle;
      }
    } else if (shot.title === 'end') {
      k = clamp01((local - 2.6) / 1.0);
      ending = true;
      if (this.titleMode !== 'end') {
        this.titleMode = 'end';
        this.titleName.textContent = FILM.name;
        this.titleSub.textContent = '9×19 mm Parabellum';
      }
    }
    if (t > this.duration) k = 1;
    this.titleCard.hidden = k <= 0;
    this.titleCard.style.opacity = k;
    this.creditLine.style.display = ending ? '' : 'none';
    this.buttons.style.display = ending ? '' : 'none';
  }

  drawTest(shot, t, w, s) {
    const notes = [];
    if (shot.slot) {
      const slot = this.slots.find((x) => x.id === shot.slot);
      if (slot && !slot.hasClip) notes.push(`placeholder: waiting for the Mixamo clip (${slot.name})`);
      if (shot.slot === 'dive' || shot.slot === 'catch') {
        const c = this.slots.find((x) => x.id === 'catch');
        if (c && !c.hasClip && shot.slot === 'dive') notes.push('placeholder: waiting for the Mixamo clip (Catch)');
      }
    }
    if (shot.aim && !this.actor.clips.fire) notes.push('placeholder: shooter left out until the Mixamo clip (Fire) arrives');
    this.testLine.hidden = false;
    this.testLine.innerHTML = `<b>${shot.name}</b> · film ${t.toFixed(2)} s · story ${w.toFixed(4)} s` + (s > -0.5 && s < 3.5 ? ` · shot +${(s * 1000).toFixed(3)} ms` : '')
      + notes.map((n) => `<div class="cine-note">${n}</div>`).join('');
  }

  // ---- Closing ----

  dispose() {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    if (this.renderer) {
      const renderer = this.renderer;
      renderer.setAnimationLoop(null);
      // Take this renderer's listeners off what it shares with the game
      // (the soldier's and his gear's geometry and textures, and three.js's
      // own lookup texture), so nothing the game keeps holds on to it.
      if (this.scene) releaseSharedTextures(renderer, this.scene);
      if (this.actor && this.set) {
        const ownOf = (thing) => (thing._listeners && thing._listeners.dispose ? thing._listeners.dispose.slice() : []);
        const mine = new Set([...ownOf(this.set.floor.geometry), ...ownOf(this.set.floor.material), ...ownOf(this.set.floor.material.map)]);
        for (const thing of this.actor.shared) {
          const list = thing._listeners && thing._listeners.dispose;
          if (list) for (const fn of list.slice()) if (mine.has(fn)) thing.removeEventListener('dispose', fn);
        }
      }
      if (this.actor) {
        if (this.actor.model) this.actor.model.removeFromParent();
        this.actor.dispose();
      }
      if (this.scene) {
        this.scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          for (const m of [].concat(o.material || [])) {
            for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
            m.dispose();
          }
        });
      }
      for (const tex of Object.values(this.fx ? this.fx.tex : {}).flat()) tex.dispose();
      if (this.env) this.env.dispose();
      if (this.shine) this.shine.dispose();
      if (this.composer) {
        this.composer.dispose();
        this.air.dispose();
        this.grade.dispose();
        this.scenePass.dispose();
        this.bloom.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      this.renderer = null;
    }
    this.scene = this.actor = this.set = this.fx = this.composer = this.timeline = this.shotList = null;
    if (this.audio) { this.audio.close(); this.audio = null; }
    if (this.root) { this.root.remove(); this.root = null; }
    this.ready = null;
  }

  // Timings and draw counts, for checking.
  stats() {
    const info = this.renderer ? this.renderer.info : null;
    return {
      duration: +this.duration.toFixed(2),
      fire: +this.fireAt.toFixed(4),
      hitMs: +(this.hitS * 1000).toFixed(3),
      range: +this.range.toFixed(3),
      shots: this.shotList.map((s) => ({ name: s.name, start: +s.start.toFixed(2), end: +s.end.toFixed(2), story: [+s.from.toFixed(4), +s.to.toFixed(4)] })),
      slots: this.slots.map((s) => ({ id: s.id, clip: s.hasClip, start: +s.start.toFixed(3), length: +s.length.toFixed(3), place: s.place && { x: +s.place.x.toFixed(2), z: +s.place.z.toFixed(2), yaw: +s.place.yaw.toFixed(2) } })),
      triangles: info ? info.render.triangles : 0,
      calls: info ? info.render.calls : 0,
      textures: info ? info.memory.textures : 0,
    };
  }
}

// A shot's story clock from speed keys [[film seconds, speed], ...]
// (story seconds a film second): between keys the speed eases (smoothly
// in and out) from one to the next in proportion (its logarithm eases), so
// a ramp from real speed to a thousandth is as smooth at every scale.
// Returns { map(x): story time x film seconds in, film, to }.
function rampMap(from, keys) {
  const speed = rampMap.speed(keys);
  const film = keys[keys.length - 1][0];
  const steps = Math.max(1, Math.ceil(film * 2000));
  const dx = film / steps;
  const sum = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i++) sum[i + 1] = sum[i] + speed((i + 0.5) * dx) * dx;
  const map = (x) => {
    const f = Math.min(steps, Math.max(0, x / dx));
    const i = Math.min(steps - 1, Math.floor(f));
    return from + sum[i] + (sum[i + 1] - sum[i]) * (f - i);
  };
  return { map, film, to: from + sum[steps] };
}
rampMap.speed = (keys) => (x) => {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (x > keys[i + 1][0]) i++;
  const k = smoothstep(keys[i][0], keys[i + 1][0], x);
  return Math.exp(lerp(Math.log(keys[i][1]), Math.log(keys[i + 1][1]), k));
};

// ---- The picture: the scene with depth of field, then the glows ----

// Depth of field: each pixel blurred by how far it is from the focus
// (a thin lens: the blur grows as |1 - focus / distance|, to `blur` of the
// picture's width far behind, more in front), gathering the
// breakdown-style 41 taps of three.js's bokeh shader; a sharper pixel
// nearer the camera than this one doesn't bleed into its blur.
const DOF = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, focus: { value: 1 }, blur: { value: 0.01 },
    near: { value: 0.1 }, far: { value: 100 }, aspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tColor, tDepth;
    uniform float focus, blur, near, far, aspect;
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
    float coc(float d) {
      float c = blur * abs(1.0 - focus / max(d, 1e-4));
      return min(c, blur * 1.6);
    }
    void main() {
      float d0 = dist(vUv);
      float c0 = coc(d0);
      vec2 r = vec2(1.0, aspect) * c0;
      vec4 sum = texture2D(tColor, vUv);
      float wsum = 1.0;
      const int N = 40;
      vec2 taps[40];
      taps[0]=vec2(0.0,0.4); taps[1]=vec2(0.15,0.37); taps[2]=vec2(0.29,0.29); taps[3]=vec2(-0.37,0.15); taps[4]=vec2(0.4,0.0);
      taps[5]=vec2(0.37,-0.15); taps[6]=vec2(0.29,-0.29); taps[7]=vec2(-0.15,-0.37); taps[8]=vec2(0.0,-0.4); taps[9]=vec2(-0.15,0.37);
      taps[10]=vec2(-0.29,0.29); taps[11]=vec2(0.37,0.15); taps[12]=vec2(-0.4,0.0); taps[13]=vec2(-0.37,-0.15); taps[14]=vec2(-0.29,-0.29);
      taps[15]=vec2(0.15,-0.37); taps[16]=vec2(0.135,0.333); taps[17]=vec2(-0.333,0.135); taps[18]=vec2(0.333,-0.135); taps[19]=vec2(-0.135,-0.333);
      taps[20]=vec2(-0.135,0.333); taps[21]=vec2(0.333,0.135); taps[22]=vec2(-0.333,-0.135); taps[23]=vec2(0.135,-0.333); taps[24]=vec2(0.203,0.203);
      taps[25]=vec2(0.28,0.0); taps[26]=vec2(0.203,-0.203); taps[27]=vec2(0.0,-0.28); taps[28]=vec2(-0.203,0.203); taps[29]=vec2(-0.28,0.0);
      taps[30]=vec2(-0.203,-0.203); taps[31]=vec2(0.0,0.28); taps[32]=vec2(0.116,0.116); taps[33]=vec2(0.16,0.0); taps[34]=vec2(0.116,-0.116);
      taps[35]=vec2(0.0,-0.16); taps[36]=vec2(-0.116,0.116); taps[37]=vec2(-0.16,0.0); taps[38]=vec2(-0.116,-0.116); taps[39]=vec2(0.0,0.16);
      // (The taps turned by a different angle at each pixel, so a small
      // bright highlight far out of focus spreads into a soft disc, not a
      // ring of dots.)
      float spin = fract(sin(dot(vUv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
      mat2 turn = mat2(cos(spin), sin(spin), -sin(spin), cos(spin));
      for (int i = 0; i < N; i++) {
        vec2 uv = vUv + turn * taps[i] * 2.5 * r;
        float d = dist(uv);
        float c = coc(d);
        // (A sharper pixel in front of this one stays out of its blur.)
        float w = d < d0 ? clamp(c / max(c0, 1e-5), 0.0, 1.0) : 1.0;
        sum += texture2D(tColor, uv) * w;
        wsum += w;
      }
      gl_FragColor = vec4(sum.rgb / wsum, 1.0);
    }`,
};

// Copies the scene's depth into another target's depth buffer, so the glows
// drawn after the blur are still hidden behind what's in front of them.
const DEPTH_COPY = {
  uniforms: { tDepth: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform sampler2D tDepth; void main() { gl_FragDepth = texture2D(tDepth, vUv).x; gl_FragColor = vec4(0.0); }',
};

class SceneDofPass extends Pass {
  constructor(film) {
    super();
    this.film = film;
    this.needsSwap = true;
    this.focus = 1;
    this.blur = 0.01;
    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.FloatType;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
    this.dof = new THREE.ShaderMaterial({ ...DOF, uniforms: THREE.UniformsUtils.clone(DOF.uniforms), depthTest: false, depthWrite: false });
    this.copy = new THREE.ShaderMaterial({ ...DEPTH_COPY, uniforms: THREE.UniformsUtils.clone(DEPTH_COPY.uniforms), depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, colorWrite: false });
    this.quad = new FullScreenQuad(this.dof);
  }

  setSize(w, h) {
    this.target.setSize(w, h);
  }

  render(renderer, writeBuffer) {
    const { scene, camera } = this.film;
    const autoClear = renderer.autoClear;
    // The scene (everything but the glows), with its depth.
    camera.layers.set(0);
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(this.target);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.render(scene, camera);
    // Blurred by distance into the next target.
    const u = this.dof.uniforms;
    u.tColor.value = this.target.texture;
    u.tDepth.value = this.target.depthTexture;
    u.focus.value = this.focus;
    u.blur.value = this.blur;
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.aspect.value = camera.aspect;
    renderer.setRenderTarget(writeBuffer);
    renderer.autoClear = false; // (each draw below adds to the last)
    renderer.clear(true, true, false);
    this.quad.material = this.dof;
    this.quad.render(renderer);
    // Its depth, then the glows over it.
    this.copy.uniforms.tDepth.value = this.target.depthTexture;
    this.quad.material = this.copy;
    this.quad.render(renderer);
    camera.layers.set(FX_LAYER);
    const fog = scene.fog;
    scene.fog = null;
    renderer.render(scene, camera);
    scene.fog = fog;
    camera.layers.enableAll();
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.target.dispose();
    this.dof.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}

// The grade: a soft vignette, a little colour fringing towards the edges,
// a touch of contrast and fine moving grain (after tone mapping).
const GRADE = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float time;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 37.0) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 shift = c * r2 * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18); // contrast
      col *= mix(1.0, 0.62, smoothstep(0.12, 0.62, r2)); // vignette
      col += (hash(vUv * 913.0) - 0.5) * 0.028; // grain
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// The air: the picture bent where the shot disturbs it (see setAir). All
// in pixels: the bullet's nose and tail and its radius on the screen; the
// blast wave's centre, radius and thickness.
const AIR = {
  uniforms: {
    tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) },
    nose: { value: new THREE.Vector2() }, tail: { value: new THREE.Vector2() }, rad: { value: 1 },
    wake: { value: 0 }, bow: { value: 0 }, phase: { value: 0 }, time: { value: 0 },
    tDepth: { value: null }, near: { value: 0.1 }, far: { value: 100 }, behind: { value: 0 },
    blastC: { value: new THREE.Vector2() }, blastR: { value: 0 }, blastW: { value: 1 }, blast: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tDiffuse, tDepth;
    uniform float near, far, behind;
    uniform vec2 res, nose, tail, blastC;
    uniform float rad, wake, bow, phase, time, blastR, blastW, blast;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      vec2 px = vUv * res;
      vec2 off = vec2(0.0);
      float shade = 0.0;
      vec2 axis = nose - tail;
      float len = length(axis);
      if (wake + bow > 0.0 && len > 1.0) {
        vec2 ax = axis / len, pr = vec2(-ax.y, ax.x);
        // (Seen end on, there's nothing to show: it fades as it turns.)
        float side = smoothstep(1.2, 3.0, len / rad);
        vec2 d = px - nose;
        float al = dot(d, ax), ac = dot(d, pr);
        // The bow wave: a thin curved sheet standing just off the nose.
        float Rc = rad * 1.8;
        float ahead = al - (rad * 0.45 - ac * ac / (2.0 * Rc));
        float x = ahead / (rad * 0.12);
        vec2 n = normalize(ax + pr * (ac / Rc));
        // (Only round the nose: it fades out sideways and before it
        // curves back past the bullet's middle.)
        float around = exp(-ac * ac / (rad * rad * 7.0)) * smoothstep(-len * 0.5, rad * 0.2, al);
        off += n * (-x) * exp(-x * x) * around * bow * side * rad * 0.2;
        // The wake: eddies shed off the base, fixed in the air as the
        // bullet leaves them behind, widening and dying away.
        float b = -(al + len);
        float width = rad * (0.85 + 0.06 * max(b, 0.0) / rad);
        float inside = smoothstep(-rad * 0.2, rad * 0.4, b) * smoothstep(width, width * 0.35, abs(ac)) * exp(-max(b, 0.0) / (rad * 45.0));
        if (inside > 0.001) {
          vec2 q = vec2((b + phase) / (rad * 0.55), ac / (rad * 0.42) + time * 300.0);
          vec2 q2 = vec2((b + phase) / (rad * 0.22), ac / (rad * 0.2) - time * 500.0);
          vec2 swirl = vec2(noise(q) - 0.5, noise(q + 17.3) - 0.5) + 0.5 * vec2(noise(q2) - 0.5, noise(q2 + 5.1) - 0.5);
          off += swirl * inside * wake * side * rad * 0.28;
          // (Hot, thin air shows as faint light and dark streaks even
          // against a plain sky, as in a schlieren photograph.)
          shade += (swirl.x + swirl.y) * inside * wake * side * 0.2;
        }
        shade += (-x) * exp(-x * x) * around * bow * side * 0.14;
      }
      if (blast > 0.0) {
        vec2 d = px - blastC;
        float r = length(d);
        float x = (r - blastR) / blastW;
        // A lens-like ring: the picture pushed out at the front of the
        // shell and pulled in behind it.
        off += (d / max(r, 1e-3)) * (-x) * exp(-x * x) * blast * blastW * 0.6;
        shade += (-x) * exp(-x * x) * blast * 0.06;
      }
      // (Only the air behind the bullet bends: nothing nearer than
      // behind metres, the bullet itself included, moves or is pulled
      // into the picture.)
      if (behind > 0.0) {
        float d0 = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, near, far);
        float d1 = -perspectiveDepthToViewZ(texture2D(tDepth, vUv + off / res).x, near, far);
        float k = smoothstep(behind, behind * 1.25, min(d0, d1));
        off *= k;
        shade *= k;
      }
      vec4 col = texture2D(tDiffuse, vUv + off / res);
      gl_FragColor = vec4(col.rgb * (1.0 + shade), col.a);
    }`,
};
