// A short film made in the game: the soldier sprints in, dives, catches a
// PF-9 thrown to him in mid air, rolls into cover behind a barrier, comes
// up and fires at an enemy soldier standing by the house; then the bullet
// cam: time all but stops at the muzzle and the camera rides beside the
// bullet while labels (in the breakdowns' look, with their lines and cards)
// tell what it is, how it spins, what's left behind and how fast it goes,
// until it strikes the enemy's shoulder (a puff of dust from his sleeve:
// it's a game, nothing gory), and he twists and falls as time snaps back.
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
// What happens is all in src/showcase/cinematic/edit.js (which Mixamo
// clips the men play when, the shots, the cameras, the labels); the shot's
// numbers in ballistics.js; the set, the rounds, the effects and the
// sounds in set.js, round.js, fx.js and sound.js; the soldiers, their
// moves and their pistols in actor.js. `test: true` shows the shot's name
// and times.
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
import { HOUSE } from '../../shared/map.js';
import { Outfit, SLOTS as GEAR_SLOTS, Wardrobe } from '../../gear.js';
import { MODEL9 } from '../../viewmodel/pistol9.js';
import { Actor, GRIP } from './actor.js';
import { buildSet, filmEnvironment } from './set.js';
import { makeCartridge, makeFiredBullet, makeSpentCase, roundMaterials, ROUND } from './round.js';
import { Effects, FX_LAYER } from './fx.js';
import { FilmSound } from './sound.js';
import { EJECT, SHOT, barrelPose, bulletSpeed, bulletSpin, bulletTravel, slideBack, timeToTravel } from './ballistics.js';
import { CATCH, COVER_FROM, COVER_SEGMENT, DIVE_AT, ENEMY_DROPS, ENEMY_HIT, FILM, FIRES, HERO, LAYOUT, backInCover, cards, cues as makeCues, dive, enemy as enemyTimeline, shots as makeShots } from './edit.js';
import { clamp01, lerp, monotone, pathAt, smoothstep } from './util.js';

const LABEL = { line: 0.4, card: 0.25 }; // the breakdowns' pace: the line draws, the card fades
const BAND = 2.39; // the picture's shape (wide screen), with bars above and below
const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const DUST_STICK = 0.05; // story seconds the strike's dust moves with his sleeve

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
  snap: (a) => a.snap(),
  hit: (a, v) => a.hit(v > 0.5 ? 1 : 0.3),
  tink: (a, v, volume) => a.tink(slowed(v), volume),
  thump: (a, v, volume) => a.thump(volume, slowed(v)),
  slap: (a, v) => a.slap(slowed(v)),
  whoosh: (a, v) => a.whoosh(slowed(v)),
  step: (a, v, volume) => a.step(slowed(v), volume),
  cloth: (a, v, volume) => a.cloth(slowed(v), volume),
  clatter: (a, v) => a.clatter(slowed(v)),
  drone: (a) => a.drone(5.8),
  flap: (a) => a.cloth(0.35, 1.2),
};

// The enemy's outfit: in each slot, something other than what the player
// wears (a different helmet, vest and gloves), so he reads as the other
// side. Fixed for the film (it doesn't follow the player's changes).
function enemyWardrobe(wardrobe) {
  const player = wardrobe ? wardrobe.outfit : new Outfit();
  const pick = { head: ['comms', 'field'], vest: ['black', 'olive'], gloves: ['olive', 'black'] };
  const chosen = {};
  for (const slot of GEAR_SLOTS) {
    const [first, second] = pick[slot.id] || [slot.options[0].id, slot.options[1].id];
    chosen[slot.id] = player.get(slot.id) === first ? second : first;
  }
  return new Wardrobe({ chosen, get: (slot) => chosen[slot], onChange: () => {} });
}

export class Film {
  constructor({ container = document.body, onClose = null, wardrobe = null, test = false, sound = true, autoplay = true } = {}) {
    this.container = container;
    this.onClose = onClose;
    this.wardrobe = wardrobe;
    this.test = test;
    this.sound = sound;
    this.autoplay = autoplay;
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
      <div class="bd-card cine-card" hidden><div class="bd-kicker"></div><h2 class="bd-title"></h2><div class="cine-live" hidden></div><p class="bd-text"></p></div>
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
    this.cardLive = $('.cine-live');
    this.titleCard = $('.bd-titlecard');
    this.titleName = $('.bd-name');
    this.titleSub = $('.bd-sub');
    this.creditLine = $('.bd-credit');
    for (const line of FILM.credits) {
      const row = document.createElement('div');
      row.textContent = line;
      this.creditLine.append(row);
    }
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
    root.addEventListener('pointerdown', (e) => { if (e.button === 0 && this.timeline) this.paused = !this.paused; this.unmute(); });
    this.container.appendChild(root);
  }

  // (Opened without a click, ?cinematic=1, the browser keeps the sound
  // off until the first click or key on the page.)
  unmute() {
    if (this.audio && this.audio.ok && !this.paused) this.audio.resume();
  }

  onKey(e) {
    if (!this.open) return;
    this.unmute();
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
    this.env = outdoorEnvironment(renderer, SUN_DIRECTION); // (the game's: for the men)
    this.shine = filmEnvironment(renderer, SUN_DIRECTION); // (for the rounds and the metal close up)

    const set = (this.set = buildSet(renderer, { crateSpot: LAYOUT.crates, houseSpot: LAYOUT.house }));
    scene.add(set.group);
    scene.fog = set.fog;
    // Metal on the set shows the sky, as the guns and the soldiers do.
    set.group.traverse((o) => {
      if (o.isMesh) for (const m of [].concat(o.material)) if (m.metalness > 0.3) m.envMap = this.shine;
    });

    // The rounds: one lying by the pistol in the opening, the bullet the
    // bullet cam follows, and a spent case for each shot.
    this.roundMat = roundMaterials(this.shine);
    this.titleRound = makeCartridge(this.roundMat);
    this.bullet = makeFiredBullet(this.roundMat);
    this.spentCases = FIRES.map(() => makeSpentCase(this.roundMat));
    scene.add(this.titleRound, this.bullet, ...this.spentCases);

    this.fx = new Effects(scene);

    // The soldier (in the player's outfit) and the enemy (in another), each
    // with a PF-9.
    const actorOptions = { renderer, envMap: this.env, gunEnv: this.shine };
    const hero = (this.hero = new Actor({ ...actorOptions, wardrobe: this.wardrobe, name: 'soldier' }));
    const enemy = (this.enemy = new Actor({ ...actorOptions, wardrobe: enemyWardrobe(this.wardrobe), name: 'enemy' }));
    this.actor = this.hero; // (the star, for older checks)
    // (Closed while they loaded: the film freed itself already, but not
    // them, as they weren't there yet; they let go of the game's outfit
    // now.)
    const closed = () => {
      if (this.renderer) return false;
      hero.dispose();
      enemy.dispose();
      return true;
    };
    await Promise.all([hero.load(), enemy.load()]);
    if (closed()) throw new Error('closed while loading');
    scene.add(hero.model, hero.pistol, enemy.model, enemy.pistol);
    await Promise.all([hero.dressed, enemy.dressed]);
    if (closed()) throw new Error('closed while loading');

    this.plan();
    this.post();
    this.layoutDirty = true;
    this.layout();
    // Compile the shaders and upload the textures now, not on the first frames.
    this.renderAt(this.shotList.find((s) => s.name === 'bullet-out').start + 3);
    this.renderAt(this.shotList.find((s) => s.name === 'impact').start + 4);
    this.renderAt(0);
  }

  // ---- The plan: where everything goes and when ----

  plan() {
    const hero = this.hero, enemy = this.enemy;
    // His timeline, turned to run towards -Z and placed so that he kneels
    // behind the barriers.
    const heroStage = { yaw: Math.PI, anchor: { segment: COVER_SEGMENT, at: COVER_FROM, x: LAYOUT.cover.x, z: LAYOUT.cover.z } };
    hero.setTimeline(HERO, heroStage);
    this.coverCut = HERO[COVER_SEGMENT].start;
    const S = { fires: FIRES.slice(), fire: FIRES[FIRES.length - 1], catch: dive(CATCH) };
    this.fireAt = S.fire;
    this.catchAt = S.catch;

    // The enemy, standing: his left shoulder `range` metres down the bore
    // of the aimed shot (level), turned so that his own pistol points at
    // the shooter's head.
    const shot3 = this.boreAt(S.fire, GRIP);
    enemy.setTimeline([{ clip: 'enemy_aim', start: -60, loop: true, align: false }]);
    enemy.pose(0);
    const eg = enemy.gunInHand(GRIP);
    const eDir = new THREE.Vector3(0, 0, -1).applyQuaternion(eg.quaternion);
    const shoulder0 = enemy.at('CC_Base_L_Upperarm');
    const flat = shot3.dir.clone().setY(0).normalize();
    const want = shot3.muzzle.clone().addScaledVector(flat, LAYOUT.enemy.range);
    hero.pose(S.fire);
    const head = hero.at('CC_Base_Head');
    const yaw = Math.atan2(head.x - want.x, head.z - want.z) - Math.atan2(eDir.x, eDir.z);
    const turned = shoulder0.clone().applyAxisAngle(UP, yaw);
    this.enemyStage = { x: want.x - turned.x, z: want.z - turned.z, yaw };
    enemy.setTimeline([{ clip: 'enemy_aim', start: -60, loop: true, align: false }], this.enemyStage);

    // Where the aimed shot strikes him (the front of his left shoulder,
    // where the ray to the joint meets his sleeve), and the fire clip's
    // grip turned so the bore points exactly there (a degree or two; the
    // same grip for all three shots, as it's one clip).
    this.fireGrip = { position: GRIP.position.clone(), quaternion: GRIP.quaternion.clone() };
    enemy.pose(S.fire);
    const meshes = enemy.meshes();
    for (const m of meshes) if (m.isSkinnedMesh) { m.computeBoundingSphere(); m.computeBoundingBox(); }
    const ray = new THREE.Raycaster();
    let hit = null;
    for (let pass = 0; pass < 3; pass++) {
      const b = this.boreAt(S.fire, this.fireGrip);
      const joint = enemy.at('CC_Base_L_Upperarm').add(new THREE.Vector3(0, 0.035, 0));
      ray.set(b.muzzle, joint.clone().sub(b.muzzle).normalize());
      const found = ray.intersectObjects(meshes, false)[0];
      hit = found ? found.point.clone() : joint;
      // Turn the grip: the bore's direction onto the one to the strike.
      const wantDir = hit.clone().sub(b.muzzle).normalize();
      const qd = new THREE.Quaternion().setFromUnitVectors(b.dir, wantDir);
      const H = hero.hand().quaternion;
      const Hinv = H.clone().invert();
      this.fireGrip.quaternion.premultiply(Hinv.clone().multiply(qd).multiply(H));
    }
    const b3 = this.boreAt(S.fire, this.fireGrip);
    this.firing = b3.gun;
    this.dir = hit.clone().sub(b3.muzzle).normalize();
    this.seat = b3.muzzle.clone().addScaledVector(this.dir, -SHOT.bore); // the bullet's base, seated
    this.range = b3.muzzle.distanceTo(hit);
    this.hit = hit;
    this.hitNormal = this.dir.clone().negate();
    // (Where it strikes, in his left upper arm's frame, for the card's dot
    // to follow his shoulder as he twists away.)
    this.hitOnArm = enemy.bones.CC_Base_L_Upperarm.worldToLocal(hit.clone());
    this.hitS = timeToTravel(this.seat.distanceTo(hit) - ROUND.bullet.length); // the nose meets him
    S.impact = S.fire + this.hitS;
    this.fx.setPath(b3.muzzle, hit);

    // Now the rest of their timelines: he goes back into cover after the
    // strike; the enemy is struck.
    hero.setTimeline([...HERO, backInCover(S)], heroStage);
    enemy.setTimeline(enemyTimeline(S, this.placeHit(S)), this.enemyStage);
    // Lying on the ground (his roll; the enemy's fall), their bodies,
    // outfits and all, are raised so nothing goes below it.
    // (His ends at the cut to cover; the enemy's holds as he lies there.)
    hero.setLift(this.lifts(hero, dive(1.1), this.coverCut - 1e-3));
    enemy.setLift({ ...this.lifts(enemy, S.impact + 0.3, S.impact + 3.2), holdEnd: true });
    // The struck spot on his sleeve as he starts to twist away (the dust
    // goes with it a moment, then drifts on at its speed).
    const sleeveAt = (t) => { enemy.pose(t); return enemy.bones.CC_Base_L_Upperarm.localToWorld(this.hitOnArm.clone()); };
    const pA = sleeveAt(S.impact + DUST_STICK), pB = sleeveAt(S.impact + DUST_STICK + 0.02);
    this.dustDrift = { at: pA, v: pB.sub(pA).divideScalar(0.02) };

    // Each shot: the gun as it fires, the bullet's line, where it strikes
    // (the first two, the house behind him: plaster; the last, him), and
    // its spent case's flight.
    const houseFront = LAYOUT.house.z + HOUSE.depth / 2;
    this.shots = S.fires.map((F, i) => {
      const last = i === S.fires.length - 1;
      const b = last ? b3 : this.boreAt(F, this.fireGrip);
      const dir = last ? this.dir : b.dir;
      const shot = { F, firing: b.gun, muzzle: b.muzzle, dir, caseMesh: this.spentCases[i] };
      if (last) shot.hit = { s: this.hitS, at: hit, normal: this.hitNormal, dir, kind: 'cloth' };
      else {
        // The house's front wall, or failing that the ground.
        const seat = b.muzzle.clone().addScaledVector(dir, -SHOT.bore);
        let at = null, normal = null;
        const k = (houseFront - b.muzzle.z) / dir.z;
        const p = b.muzzle.clone().addScaledVector(dir, k);
        if (k > 0 && Math.abs(p.x - LAYOUT.house.x) < HOUSE.width / 2 && p.y > 0 && p.y < HOUSE.wallHeight) { at = p; normal = new THREE.Vector3(0, 0, 1); }
        else if (dir.y < 0) { at = b.muzzle.clone().addScaledVector(dir, -b.muzzle.y / dir.y); normal = UP.clone(); }
        if (at) shot.hit = { s: timeToTravel(seat.distanceTo(at)), at, normal, dir, kind: 'wall' };
      }
      shot.caseFlight = this.flyCase(b.gun);
      return shot;
    });

    // The toss: the pistol lies on the top crate (LAYOUT.crates) until
    // it's thrown, then flies to a point a hand's width off his open palm,
    // turning over (whole turns, plus the turn from lying flat to his
    // grip, all done a little before it gets there), and for the last
    // LAYOUT.toss.seat seconds slides straight into his palm, at his grip,
    // as his fingers start to close: the catch.
    const seat = LAYOUT.toss.seat;
    hero.pose(S.catch - seat);
    const near = hero.gunInHand(GRIP);
    const palm = this.palmOut();
    const rest = this.restingGun();
    const T = LAYOUT.toss.flight;
    const from = rest.position.clone();
    const end = near.position.clone().addScaledVector(palm, LAYOUT.toss.reach);
    this.toss = {
      from, T, seat, start: S.catch - seat - T, end, endQuat: near.quaternion.clone(), restQuat: rest.quaternion.clone(),
      v0: end.clone().sub(from).addScaledVector(GRAVITY, -0.5 * T * T).divideScalar(T),
      axis: new THREE.Vector3().subVectors(end, from).cross(UP).normalize(),
    };
    hero.pose(S.catch);
    const grab = hero.gunInHand(GRIP);
    this.catchPoint = grab.position.clone();
    this.restPoint = rest.position.clone();
    // A round lying on the lid beside it, for the opening.
    this.titleRound.quaternion.copy(rest.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.9, 0)));
    this.titleRound.position.copy(rest.position).add(new THREE.Vector3(0.05, 0, 0.07).applyAxisAngle(UP, this.set.crates.topYaw + LAYOUT.crates.yaw));
    this.titleRound.position.y = rest.position.y + 0.0003;
    this.titleRound.updateMatrixWorld(true);
    const roundBox = new THREE.Box3().setFromObject(this.titleRound);
    this.titleRound.position.y += rest.position.y - roundBox.min.y;

    // The enemy's pistol: in his hand until he's struck, then dropped.
    this.enemyGun = this.dropGun(S.impact + ENEMY_DROPS);
    this.enemyGunLands = this.enemyGun.landed;

    // His footfalls as he runs (each toe's lowest point, while the sprint plays).
    this.footfalls = [];
    let prev = null;
    for (let t = 0; t < DIVE_AT + 0.3; t += 1 / 60) {
      hero.pose(t);
      const y = [hero.at('CC_Base_L_ToeBase').y, hero.at('CC_Base_R_ToeBase').y];
      if (prev) for (let k = 0; k < 2; k++) if (prev.y[k] > y[k] && y[k] < 0.06 && !prev.down[k]) {
        if (t > 0.05 && !(t - this.footfalls[this.footfalls.length - 1] < 0.2)) this.footfalls.push(t);
        prev.down[k] = true;
      }
      const down = prev ? prev.down.map((d, k) => d && y[k] < 0.09) : [false, false];
      prev = { y, down };
    }

    // The shots, end to end. A shot's story clock: `time` keys (a smooth
    // curve through [film seconds, story time]), `ramp` keys (its speed,
    // story seconds a film second, eased from key to key in proportion,
    // so 1 to 1/1000 slows as evenly as 1/1000 to 1/1,000,000), or real
    // speed. `from: 'prev'` carries on from where the shot before ended.
    const list = makeShots(S);
    let at = 0, prevTo = 0;
    this.shotList = list.map((spec) => {
      const from = spec.from === 'prev' ? prevTo : spec.from;
      let film, map, to = spec.to;
      if (spec.ramp) {
        // Holds first: a key { hold: story time } holds the speed before it
        // until the story gets there; the keys after it count from there.
        let keys = [];
        for (const k of spec.ramp) {
          if (Array.isArray(k) && !keys.held) keys.push(k);
          else if (Array.isArray(k)) keys.push([keys.held + k[0], k[1]]);
          else {
            const reached = rampMap(from, keys).to;
            const last = keys[keys.length - 1];
            const hold = Math.max(1e-4, (k.hold - reached) / last[1]);
            keys.push([last[0] + hold, last[1]]);
            keys.held = last[0] + hold;
          }
        }
        keys = keys.map((k) => k.slice());
        // With `to`: a stretch at the first key's speed comes first, as long
        // as it takes for the ramp to end there (or, with fill: 'tail', at
        // the last key's speed after it).
        if (typeof spec.to === 'number') {
          const short = spec.to - rampMap(from, keys).to;
          if (short > 0 && spec.fill === 'tail') {
            const last = keys[keys.length - 1];
            keys.push([last[0] + short / last[1], last[1]]);
          } else if (short > 0) {
            const lead = short / keys[0][1];
            keys = [[0, keys[0][1]], ...keys.map(([x, v]) => [x + lead, v])];
          }
        }
        spec = { ...spec, ramp: keys };
        const r = rampMap(from, keys);
        film = r.film;
        map = r.map;
        to = r.to;
        // (A ramp that would run past `to` is cut where it gets there.)
        if (typeof spec.to === 'number' && to > spec.to) {
          let lo = 0, hi = film;
          for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (map(mid) < spec.to) lo = mid;
            else hi = mid;
          }
          film = lo;
          to = map(lo);
        }
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
    this.story = S;
    this.cards = cards(this.range, this.hitS);
    // Sounds: at film times in a shot (`sounds`), and at moments in the
    // story (cues: each plays once, the first time the film passes it, at
    // the story's speed then: slowed, or in its slow-motion form).
    this.events = [];
    for (const s of this.shotList) for (const [when, name] of s.sounds || []) this.events.push({ t: s.start + when, name });
    this.events.sort((a, b) => a.t - b.t);
    this.cues = makeCues(S, this).map(([w, name, volume]) => ({ w, name, volume }));
    this.cuesPlayed = new Set();
    this.timeline = { shots: this.shotList };
  }

  // Where the enemy's hit clip goes: turned and moved so that, where it
  // comes in, his feet are where they were in his aim (so they don't slide
  // as one cross-fades into the other). Returns its turn (degrees) and
  // move, for enemyTimeline.
  placeHit(S) {
    const enemy = this.enemy;
    const feet = () => ['L', 'R'].map((k) => enemy.at(`CC_Base_${k}_Foot`).add(enemy.at(`CC_Base_${k}_ToeBase`)).multiplyScalar(0.5));
    const hitAlone = (place) => {
      const segs = enemyTimeline(S, place);
      segs[1] = { ...segs[1], blend: 0 };
      enemy.setTimeline(segs, this.enemyStage);
      enemy.pose(S.impact);
      return feet();
    };
    enemy.setTimeline(enemyTimeline(S), this.enemyStage);
    enemy.pose(S.impact - 1e-4);
    const [aL, aR] = feet();
    const flatAngle = (v) => Math.atan2(v.x, v.z);
    let place = { yaw: -20, dx: 0, dz: 0 };
    let [bL, bR] = hitAlone(place);
    place.yaw += THREE.MathUtils.radToDeg(flatAngle(aR.clone().sub(aL)) - flatAngle(bR.clone().sub(bL)));
    [bL, bR] = hitAlone(place);
    const move = aL.clone().add(aR).sub(bL).sub(bR).multiplyScalar(0.5).setY(0).applyAxisAngle(UP, -this.enemyStage.yaw);
    place = { ...place, dx: move.x, dz: move.z };
    return place;
  }

  // How far a man must be raised at story times t0..t1 (every 30th of a
  // second) so that no part of him (or his outfit) is below the ground:
  // the lowest point of his posed meshes, padded and smoothed.
  lifts(actor, t0, t1) {
    const dt = 1 / 30, raw = [];
    const meshes = actor.meshes().filter((m) => m.isSkinnedMesh);
    const box = new THREE.Box3();
    for (let t = t0; t <= t1 + 1e-9; t += dt) {
      actor.pose(t, false);
      let low = Infinity;
      for (const m of meshes) {
        m.computeBoundingBox();
        box.copy(m.boundingBox).applyMatrix4(m.matrixWorld);
        low = Math.min(low, box.min.y);
      }
      raw.push(Math.max(0, 0.004 - low));
    }
    // (The most it needs nearby, then smoothed, so it rises and settles
    // gently and never lets him dip.)
    const near = raw.map((_, i) => Math.max(...raw.slice(Math.max(0, i - 4), i + 5)));
    const values = near.map((_, i) => {
      const part = near.slice(Math.max(0, i - 3), i + 4);
      return part.reduce((a, b) => a + b, 0) / part.length;
    });
    return { t0, dt, values };
  }

  // The PF-9 in his hand at story time t with a grip: its pose, its
  // muzzle and its bore's direction.
  boreAt(t, grip) {
    this.hero.pose(t);
    const g = this.hero.gunInHand(grip);
    const gun = { position: g.position.clone(), quaternion: g.quaternion.clone() };
    const muzzle = new THREE.Vector3(...MODEL9.muzzle).applyQuaternion(gun.quaternion).add(gun.position);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(gun.quaternion);
    return { gun, muzzle, dir };
  }

  // The way out of his right palm now (world): across the palm's width and
  // along it, turned to the side his fingers curl to.
  palmOut() {
    const h = this.hero;
    const hand = h.at('CC_Base_R_Hand'), mid = h.at('CC_Base_R_Mid1');
    const across = h.at('CC_Base_R_Pinky1').sub(h.at('CC_Base_R_Index1'));
    const n = mid.clone().sub(hand).cross(across).normalize();
    if (n.dot(h.at('CC_Base_R_Mid3').sub(mid)) < 0) n.negate();
    return n;
  }

  // The PF-9 lying on its left side on the top crate's lid, its muzzle
  // turned a little off the crate's long side.
  restingGun() {
    const crates = this.set.crates;
    crates.group.updateMatrixWorld(true);
    const pistol = this.hero.pistol;
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

  // The enemy's pistol as it leaves his hand at story time t0: thrown on
  // with his hand's speed, tumbling, falling and bouncing on the ground.
  // Steps of a millisecond for three seconds.
  dropGun(t0) {
    const enemy = this.enemy;
    const dt = 0.001, h = 1 / 30;
    enemy.pose(t0 - h);
    const a = enemy.gunInHand(GRIP);
    const pa = a.position.clone();
    enemy.pose(t0);
    const b = enemy.gunInHand(GRIP);
    const pos = b.position.clone();
    const vel = pos.clone().sub(pa).divideScalar(h).multiplyScalar(0.8);
    let q = b.quaternion.clone();
    let axis = new THREE.Vector3(1, 0.3, 0.2).normalize().applyQuaternion(q);
    let spin = 7; // rad/s
    const steps = Math.ceil(3 / dt);
    const out = { t0, dt, pos: new Float32Array(steps * 3), quat: new Float32Array(steps * 4), landed: [] };
    const r = 0.025; // (about its half thickness, lying)
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
        out.landed.push(t0 + i * dt);
        vel.y *= -0.25;
        vel.x *= 0.5;
        vel.z *= 0.5;
        spin *= 0.4;
        axis = new THREE.Vector3(0, 1, 0);
        if (Math.abs(vel.y) < 0.3) {
          // Lying on its side.
          const along = new THREE.Vector3(0, 0, -1).applyQuaternion(q).setY(0).normalize();
          q.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), along, UP)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
          vel.set(0, 0, 0);
          resting = true;
        }
      }
    }
    return out;
  }

  // The case from the moment it leaves the port of the gun posed `g`:
  // thrown out, tumbling, falling, bouncing off the ground and settling on
  // its side. Steps of half a millisecond for four seconds.
  flyCase(g) {
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
    // (Hidden, the sounds already playing hold too, as the picture does.)
    const hidden = document.hidden;
    if (this.audio && this.audio.ok && hidden !== this.audioHidden) {
      this.audioHidden = hidden;
      if (hidden) this.audio.ctx.suspend().catch(() => {});
      else if (!this.paused) this.audio.resume();
    }
    // (Paused, the sounds already playing hold too.)
    if (this.audio && this.audio.ok && this.paused !== this.audioPaused) {
      this.audioPaused = this.paused;
      if (this.paused) this.audio.ctx.suspend().catch(() => {});
      else this.audio.resume();
    }
    // (Paused, nothing moves: the picture is drawn again only if the
    // window changed.)
    if (this.paused && this.drawnAt === this.t && !this.layoutDirty) return;
    this.draw();
  }

  advance(dt) {
    const before = this.t;
    this.t = Math.min(this.duration + 30, this.t + dt);
    if (!this.audio || dt <= 0) return;
    for (const e of this.events) if (e.t > before && e.t <= this.t && SOUNDS[e.name]) SOUNDS[e.name](this.audio, 1);
    // The story's cues passed since the last frame: each shot the film
    // went through plays the stretch of story it showed (from a shot's
    // very first moment, when the film cut into it), so a cue right at a
    // cut, or in a shot skipped over by a long frame, still plays once.
    const list = this.shotList;
    const i0 = list.indexOf(this.shotAt(before)), i1 = list.indexOf(this.shotAt(this.t));
    for (let i = i0; i <= i1; i++) {
      const sh = list[i];
      const a = i === i0 ? Math.min(Math.max(0, before - sh.start), sh.film) : 0;
      const b = i === i1 ? Math.min(Math.max(0, this.t - sh.start), sh.film) : sh.film;
      const wa = sh.map(a), wb = sh.map(b);
      for (let k = 0; k < this.cues.length; k++) {
        const c = this.cues[k];
        if (this.cuesPlayed.has(k) || !SOUNDS[c.name]) continue;
        if (!((i === i0 ? c.w > wa : c.w >= wa) && c.w <= wb)) continue;
        this.cuesPlayed.add(k);
        SOUNDS[c.name](this.audio, sh.speedAt(b), c.volume ?? 1);
      }
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
    this.drawnAt = t;
    const shot = this.shotAt(t);
    const local = Math.min(t - shot.start, shot.film);
    const w = shot.map(local); // story time
    const speed = shot.speedAt(local);
    const s = w - this.fireAt; // since the aimed shot's primer fired
    const hero = this.hero, enemy = this.enemy;
    const hide = shot.hide || [];

    // The men.
    hero.pose(w);
    enemy.pose(w);
    hero.model.visible = !hide.includes('soldier');
    enemy.model.visible = !hide.includes('enemy');

    // His pistol: on the crate, in the air, or in his hand; its slide and
    // barrel as the latest shot cycles them, its trigger as the next one
    // breaks.
    const gun = this.gunAt(w);
    hero.pistol.position.copy(gun.position);
    hero.pistol.quaternion.copy(gun.quaternion);
    let latest = null, next = null;
    for (const sh of this.shots) {
      if (w >= sh.F) latest = sh;
      else if (!next) next = sh;
    }
    const slide = latest ? slideBack(w - latest.F, MODEL9.slideTravel) : 0;
    const pull = (x) => smoothstep(-0.12, -0.02, x) * (1 - smoothstep(0.03, 0.15, x));
    hero.setPistol({ slide, barrel: barrelPose(slide, MODEL9.barrel), trigger: Math.max(latest ? pull(w - latest.F) : 0, next ? pull(w - next.F) : 0) }, MODEL9);
    hero.pistol.updateMatrixWorld(true);
    // The enemy's: in his hand, then dropped as he's struck.
    const eg = this.enemyGunAt(w);
    enemy.pistol.position.copy(eg.position);
    enemy.pistol.quaternion.copy(eg.quaternion);
    enemy.pistol.visible = enemy.model.visible;
    enemy.pistol.updateMatrixWorld(true);

    // The bullet the camera follows (the aimed shot's): out of the barrel,
    // across, and into his sleeve, where it's gone.
    const travel = bulletTravel(s);
    const flying = s > 0 && travel > SHOT.bore - ROUND.bullet.length && s < this.hitS + 0.00008;
    this.bullet.visible = flying;
    const bulletMid = new THREE.Vector3();
    const bulletQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
    bulletQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bulletSpin(s)));
    const base = this.seat.clone().addScaledVector(this.dir, travel);
    this.bullet.position.copy(base);
    this.bullet.quaternion.copy(bulletQ);
    this.bullet.scale.set(1, 1, 1);
    bulletMid.copy(base).addScaledVector(this.dir, ROUND.bullet.length / 2);
    this.bulletFrame = { origin: bulletMid, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir) };

    // The spent cases.
    this.shots.forEach((sh) => { sh.caseMid = this.caseAt(sh, w - sh.F); });
    const caseMid = this.shots[this.shots.length - 1].caseMid;

    // Camera (before the effects: streaks turn to face it).
    this.placeCamera(shot, local, w);

    // Effects, for each shot: at the gun while it's at the muzzle and the
    // port (its smoke left where it was fired), and at the strike.
    const pm = hero.pistol.matrixWorld;
    const firedMatrix = (sh) => new THREE.Matrix4().compose(sh.firing.position, sh.firing.quaternion, new THREE.Vector3(1, 1, 1));
    this.fx.begin(this.camera);
    let anyFx = false;
    this.muzzleNow = null;
    for (const sh of this.shots) {
      const sk = w - sh.F;
      if (sk <= 0) continue;
      anyFx = true;
      const live = sh === latest && sk < 0.02;
      const m = live ? pm : firedMatrix(sh);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(m));
      const muzzle = new THREE.Vector3(...MODEL9.muzzle).applyMatrix4(m);
      const portGun = new THREE.Vector3(...MODEL9.port);
      portGun.z += live ? slide : 0;
      const port = portGun.applyMatrix4(m);
      const portDir = new THREE.Vector3(0.85, 0.5, 0.1).normalize().applyQuaternion(q);
      const fxDir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      if (sh === this.shots[this.shots.length - 1]) this.muzzleNow = muzzle;
      let hit = sh.hit;
      if (hit && hit.kind === 'cloth' && sk > hit.s) {
        // (On his sleeve, moving with it, then drifting on.)
        const since = sk - hit.s;
        const at = since < DUST_STICK ? this.point(['sleeve']) : this.dustDrift.at.clone().addScaledVector(this.dustDrift.v, 0.5 * (since - DUST_STICK));
        hit = { ...hit, at };
      }
      this.fx.shot(sk, { muzzle, dir: fxDir, port, portDir, realtime: speed > 0.3, hit });
    }
    this.fx.end();
    this.fx.group.visible = anyFx;
    if (this.fx.dust) this.fx.dust.visible = s > 0 && s < this.hitS + 0.002;

    // Shadows: a tight box round the bullet or the gun in the close shots,
    // else round what the camera looks at.
    const sun = this.set.sun;
    const centre = shot.fine ? this.lookPoint : this.lookPoint.clone().setY(0);
    const half = shot.fine ? 0.35 : 14;
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
    // (The end dims as its title and credits come up.)
    this.grade.uniforms.fade.value = shot.title === 'end' ? 0.5 * smoothstep(2.4, 3.8, local) : 0;
    this.renderer.toneMappingExposure = shot.exposure ?? 1.1; // (the game's, unless the shot says)
    this.bloom.strength = shot.bloom ?? 0.3;
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

  // His pistol's pose at story time w: lying on the crate, thrown, or in
  // his hand (the fire clip's grip faded in with the fire clip).
  gunAt(w) {
    const toss = this.toss;
    if (w < toss.start) return { position: toss.from.clone(), quaternion: toss.restQuat.clone() };
    const seatAt = this.catchAt - toss.seat;
    if (w < seatAt) {
      const tau = w - toss.start;
      const position = toss.from.clone().addScaledVector(toss.v0, tau).addScaledVector(GRAVITY, 0.5 * tau * tau);
      // (From lying flat to his grip, plus whole turns end over end, which
      // spin fastest as it leaves and slow a touch, a little drag: all done
      // by 85% of the way, so it comes in steady.)
      const k = Math.min(1, tau / toss.T / 0.85);
      const spin = 1 - (1 - k) * (1 - k * 0.25);
      const quaternion = toss.restQuat.clone().slerp(toss.endQuat, smoothstep(0, 1, k))
        .premultiply(new THREE.Quaternion().setFromAxisAngle(toss.axis, -(1 - spin) * LAYOUT.toss.turns * Math.PI * 2));
      return { position, quaternion };
    }
    if (w < this.catchAt) {
      // Sliding into his palm, as his hand moves.
      const k = (w - seatAt) / toss.seat;
      const g = this.hero.gunInHand(GRIP);
      g.position.addScaledVector(this.palmOut(), LAYOUT.toss.reach * (1 - k * (1.3 - 0.3 * k)));
      return { position: g.position.clone(), quaternion: g.quaternion.clone() };
    }
    let fire = 0;
    for (const p of this.hero.segments) if (p.s.clip === 'fire') fire += p.action.weight;
    const grip = { position: GRIP.position, quaternion: GRIP.quaternion.clone().slerp(this.fireGrip.quaternion, clamp01(fire)) };
    const g = this.hero.gunInHand(grip);
    return { position: g.position.clone(), quaternion: g.quaternion.clone() };
  }

  // The enemy's pistol: in his right hand (the same grip), then falling.
  enemyGunAt(w) {
    const f = this.enemyGun;
    if (w < f.t0) {
      const g = this.enemy.gunInHand(GRIP);
      return { position: g.position.clone(), quaternion: g.quaternion.clone() };
    }
    const x = Math.min((w - f.t0) / f.dt, f.pos.length / 3 - 1.001);
    const i = Math.floor(x), k = x - i;
    return {
      position: new THREE.Vector3().fromArray(f.pos, i * 3).lerp(new THREE.Vector3().fromArray(f.pos, i * 3 + 3), k),
      quaternion: new THREE.Quaternion().fromArray(f.quat, i * 4).slerp(new THREE.Quaternion().fromArray(f.quat, i * 4 + 4), k),
    };
  }

  // Places a shot's spent case for time s since it fired; returns its
  // middle (or null).
  caseAt(sh, s) {
    const c = sh.caseMesh;
    const back = slideBack(s, MODEL9.slideTravel);
    if (s <= 0 || (s < EJECT.time && back < 0.004)) {
      c.visible = false;
      return null;
    }
    c.visible = true;
    if (s < EJECT.time) {
      const p = this.caseInGun(s);
      c.position.copy(p.position).applyMatrix4(this.hero.pistol.matrixWorld);
      c.quaternion.copy(this.hero.pistol.quaternion).multiply(p.quaternion);
    } else {
      const f = sh.caseFlight;
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
    const hero = this.hero, enemy = this.enemy;
    const along = (o) => {
      // [right, up, forward] along the bullet's line.
      const f = this.dir, r = new THREE.Vector3().crossVectors(f, UP).normalize(), u = new THREE.Vector3().crossVectors(r, f);
      return o.clone().addScaledVector(r, x).addScaledVector(u, y).addScaledVector(f, z);
    };
    switch (frame) {
      case 'world': return v;
      case 'hips': return v.add(hero.at('CC_Base_Hip'));
      case 'hand': return v.add(hero.at('CC_Base_R_Hand'));
      case 'head': return v.add(hero.at('CC_Base_Head'));
      case 'enemy': return v.add(enemy.at('CC_Base_Hip'));
      case 'ehead': return v.add(enemy.at('CC_Base_Head'));
      case 'catch': return v.add(this.catchPoint);
      case 'rest': return v.add(this.restPoint);
      case 'case': {
        const c = this.shots[this.shots.length - 1].caseMesh;
        return v.add(c.visible ? new THREE.Vector3(0, 0, ROUND.case.length / 2).applyMatrix4(c.matrixWorld) : this.hit);
      }
      case 'hit': return v.add(this.hit);
      case 'sleeve': return v.add(enemy.bones.CC_Base_L_Upperarm.localToWorld(this.hitOnArm.clone()));
      case 'gun': return v.applyMatrix4(hero.pistol.matrixWorld);
      case 'muzzle': return along(this.seat.clone().addScaledVector(this.dir, SHOT.bore));
      case 'bullet': return along(this.bulletFrame.origin);
      case 'strike': return along(this.hit);
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
    if (shot.jolt) {
      // (A kick as time snaps back, dying away in a quarter of a second.)
      const k = Math.exp(-local / 0.07);
      cam.rotateX(0.035 * k * Math.cos(local * 38));
      cam.rotateZ(0.02 * k * Math.sin(local * 31));
    }
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
      this.cardLive.hidden = !card.live;
      if (card.live) this.cardLive.textContent = card.live({ s, travelled: bulletTravel(s) - SHOT.bore });
    if (card.status) this.cardKicker.textContent = `${card.kicker} · ${card.status({ s })}`;
      this.card.style.width = this.cardW + 'px';
      this.card.hidden = false;
      this.cardH = this.card.offsetHeight;
    }
    if (card.live) this.cardLive.textContent = card.live({ s, travelled: bulletTravel(s) - SHOT.bore });
    if (card.status) this.cardKicker.textContent = `${card.kicker} · ${card.status({ s })}`;
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
    this.testLine.hidden = false;
    this.testLine.innerHTML = `<b>${shot.name}</b> · film ${t.toFixed(2)} s · story ${w.toFixed(4)} s · ×${shot.speedAt(Math.min(t - shot.start, shot.film)).toPrecision(2)}` + (s > -0.5 && s < 3.5 ? ` · shot +${(s * 1000).toFixed(3)} ms` : '');
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
      const actors = [this.hero, this.enemy].filter((a) => a);
      if (this.set) {
        const ownOf = (thing) => (thing._listeners && thing._listeners.dispose ? thing._listeners.dispose.slice() : []);
        const mine = new Set([...ownOf(this.set.floor.geometry), ...ownOf(this.set.floor.material), ...ownOf(this.set.floor.material.map)]);
        for (const actor of actors) for (const thing of actor.shared) {
          const list = thing._listeners && thing._listeners.dispose;
          if (list) for (const fn of list.slice()) if (mine.has(fn)) thing.removeEventListener('dispose', fn);
        }
      }
      // (Their models out of the scene first: the geometry is the game's.)
      for (const actor of actors) {
        if (actor.model) actor.model.removeFromParent();
        actor.dispose();
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
    this.scene = this.actor = this.hero = this.enemy = this.set = this.fx = this.composer = this.timeline = this.shotList = null;
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
      fires: this.shots.map((s) => ({ at: +s.F.toFixed(3), hit: s.hit ? { kind: s.hit.kind, at: s.hit.at.toArray().map((v) => +v.toFixed(3)), ms: +(s.hit.s * 1000).toFixed(2) } : null })),
      impact: +this.story.impact.toFixed(4),
      catch: this.catchPoint.toArray().map((v) => +v.toFixed(3)),
      heroStage: this.hero.stage, enemyStage: this.enemyStage,
      segments: this.hero.segments.map((p) => ({ clip: p.s.clip, start: +p.s.start.toFixed(3), from: p.s.from || 0 })),
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
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fade: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float time, fade;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 37.0) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 shift = c * r2 * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + shift).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - shift).b);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18); // contrast
      col *= mix(1.0, 0.62, smoothstep(0.12, 0.62, r2)); // vignette
      col *= 1.0 - fade; // (dimmed under the end's titles)
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
