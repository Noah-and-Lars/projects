// A cinematic breakdown of a gun: the camera glides up to one part at a
// time, the part slides out the way it really comes out (with the pieces
// that come out with it), a line draws from it to a card naming it and
// saying what it does, then the part slides back and seats with a click and
// the camera sweeps on to the next. It ends pulled back on the whole gun.
//
//     import { Breakdown } from './showcase/breakdown.js';
//     import { AR15_BREAKDOWN } from './showcase/arSlrParts.js';
//     const show = new Breakdown({ script: AR15_BREAKDOWN, onClose: () => { ... } });
//     show.play();          // opens it over the page (call from a click: it may play sounds)
//     show.skip();          // closes it at once (as Esc does); onClose is called
//     show.dispose();       // frees everything (close() does this too)
//
// It covers the page with its own canvas and renderer (a second WebGL
// context, freed when it closes), so the game can simply stop drawing while
// it's open. While open: click or Right arrow goes to the next part, Left
// arrow back one, Space pauses, Esc (or the close button) closes; at the end
// Replay starts it again. Its keys don't reach the page underneath.
//
// What it shows is all in the script (see src/showcase/arSlrParts.js): the
// model, and the steps in order, each with the parts that move, how they
// move, where the camera looks from and the label. The whole show is a
// function of one clock (seek(t) shows any moment), so stepping, skipping
// and replaying are exact.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Pacing (seconds).
export const TIMING = {
  intro: 3.6, // the opening shot, with the gun's name
  travel: [0.9, 2.8], // the camera's sweep to a part: shortest, and longest (a half turn round the gun)
  move: 1.0, // a move that doesn't say how long it takes
  line: 0.4, // the leader line drawing
  card: 0.25, // the card fading in (and out)
  read: { base: 1.1, word: 0.1, min: 3, max: 5 }, // how long a label stays: base + per word
  back: 0.5, // a part going back takes this share of the time it took to come out
  backMin: 0.35,
  closeTravel: 1.0, // the camera taking in a whole chain of parts going back
  settle: 0.15, // after the last part of a chain seats, before the camera moves on
  outro: 2.6, // the sweep back to the whole gun
};

// How the shots are framed: how much of the free part of the screen the
// parts fill, the camera's field of view (degrees), how far the camera
// drifts round while a label is up (degrees a second), how much the rest of
// the gun dims while a part is out.
const FRAME = { fill: 0.86, fov: 30, drift: 0.6, dim: 0.42 };
const UP = new THREE.Vector3(0, 1, 0);

export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2); // in and out
// The camera's moves: in and out more gently than ease, so a long swing
// round the gun never whips through the middle (at most 1.6 times its
// average speed, where ease peaks at 3).
const glide = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const seat = (x) => (x * x * (3 - x)) / 2; // slow start, arrives quickly: a part going home
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const rad = THREE.MathUtils.degToRad;

let stylesAdded = false;
// Adds breakdown.css to the page (once). Exported for the other films that
// share its look (src/showcase/cinematic/film.js uses its labels).
export function addBreakdownStyles() {
  if (stylesAdded) return;
  stylesAdded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./breakdown.css', import.meta.url).href;
  document.head.appendChild(link);
}

// Names to nodes: '*' matches any run of letters, '!' leaves out.
function matcher(patterns) {
  const toRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const take = patterns.filter((p) => !p.startsWith('!')).map(toRe);
  const leave = patterns.filter((p) => p.startsWith('!')).map((p) => toRe(p.slice(1)));
  return (name) => take.some((re) => re.test(name)) && !leave.some((re) => re.test(name));
}

const words = (text) => text.split(/\s+/).filter(Boolean).length;

export class Breakdown {
  constructor({ script, container = document.body, onClose = null, sound = true, clickToAdvance = true, autoplay = true } = {}) {
    if (!script) throw new Error('Breakdown: no script');
    this.script = script;
    this.container = container;
    this.onClose = onClose;
    this.sound = sound;
    this.clickToAdvance = clickToAdvance;
    this.autoplay = autoplay;
    this.t = 0;
    this.paused = false;
    this.speed = 1;
    this.open = false;
    this.ready = null;
    this.frame = this.frame.bind(this);
    this.onKey = this.onKey.bind(this);
    this.onResize = () => { this.layoutDirty = true; };
  }

  // Opens it and plays from the start (loading the model the first time).
  async play() {
    addBreakdownStyles();
    if (!this.root) this.buildDom();
    this.root.hidden = false;
    this.open = true;
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    if (this.sound && !this.audio) {
      try { this.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.audio = null; }
    }
    if (!this.ready) this.ready = this.setUp();
    try {
      await this.ready;
    } catch (error) {
      if (!this.open) return; // closed while it loaded
      this.loading.textContent = 'The breakdown couldn’t load.';
      throw error;
    }
    if (!this.open) return;
    this.loading.hidden = true;
    this.seek(0);
    this.paused = false;
    this.last = performance.now();
    if (this.autoplay) this.renderer.setAnimationLoop(this.frame);
  }

  // Closes it now (Esc, the close button). onClose is called once.
  skip() {
    this.close();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.dispose();
    if (this.onClose) this.onClose();
  }

  // Frees the renderer, the model and the page elements.
  dispose() {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.releaseSharedTextures();
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        for (const m of [].concat(o.material || [])) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m[key]) m[key].dispose();
          m.dispose();
        }
      });
      if (this.scene.environment) this.scene.environment.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    // (Nothing big stays reachable from here, whatever still holds this.)
    this.scene = this.gun = this.parts = this.moving = this.shots = this.timeline = this.entering = null;
    if (this.audio) { this.audio.close().catch(() => {}); this.audio = null; }
    if (this.root) { this.root.remove(); this.root = null; }
    this.ready = null;
  }

  // (Keeps three.js's shared lookup texture from holding this renderer, its
  // canvas and so this whole show after it closes: see below.)
  releaseSharedTextures() {
    releaseSharedTextures(this.renderer, this.scene);
  }

  // ---- The page ----

  buildDom() {
    const root = (this.root = document.createElement('div'));
    root.className = 'bd-root';
    root.innerHTML = `
      <canvas class="bd-canvas"></canvas>
      <div class="bd-vignette"></div>
      <svg class="bd-lines" xmlns="http://www.w3.org/2000/svg"></svg>
      <div class="bd-card" hidden><div class="bd-kicker"></div><h2 class="bd-title"></h2><p class="bd-text"></p></div>
      <div class="bd-titlecard" hidden><div class="bd-name"></div><div class="bd-sub"></div><div class="bd-credit"></div>
        <div class="bd-buttons"><button type="button" class="bd-replay">Replay</button><button type="button" class="bd-done">Close</button></div></div>
      <button type="button" class="bd-close" aria-label="Close the breakdown">Close <kbd>Esc</kbd></button>
      <div class="bd-hint">Click or <kbd>→</kbd> next part · <kbd>←</kbd> back · <kbd>Space</kbd> pause</div>
      <div class="bd-progress"><div class="bd-progress-fill"></div></div>
      <div class="bd-loading">Loading…</div>`;
    const $ = (s) => root.querySelector(s);
    this.canvas = $('.bd-canvas');
    this.svg = $('.bd-lines');
    this.leaders = []; // a line, dot and ring for each part a label points at
    this.card = $('.bd-card');
    this.cardKicker = $('.bd-kicker');
    this.cardTitle = $('.bd-title');
    this.cardText = $('.bd-text');
    this.titleCard = $('.bd-titlecard');
    this.titleCard.querySelector('.bd-name').textContent = this.script.name;
    this.titleCard.querySelector('.bd-sub').textContent = this.script.subtitle || '';
    this.creditLine = this.titleCard.querySelector('.bd-credit');
    this.creditLine.textContent = this.script.credit || '';
    this.buttons = this.titleCard.querySelector('.bd-buttons');
    this.progressBar = $('.bd-progress-fill');
    this.hint = $('.bd-hint');
    this.loading = $('.bd-loading');
    const stop = (e) => e.stopPropagation();
    $('.bd-close').addEventListener('click', (e) => { stop(e); this.close(); });
    $('.bd-done').addEventListener('click', (e) => { stop(e); this.close(); });
    $('.bd-replay').addEventListener('click', (e) => { stop(e); this.seek(0); this.paused = false; });
    for (const b of root.querySelectorAll('button')) b.addEventListener('pointerdown', stop);
    root.addEventListener('pointerdown', (e) => {
      if (this.clickToAdvance && e.button === 0 && this.timeline) this.next();
    });
    this.container.appendChild(root);
  }

  onKey(e) {
    if (!this.open) return;
    const keys = { Escape: () => this.close(), ArrowRight: () => this.next(), ArrowLeft: () => this.prev(), Space: () => { this.paused = !this.paused; }, Enter: () => this.next() };
    const act = keys[e.code];
    if (!act) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.timeline || e.code === 'Escape') act();
  }

  // ---- Loading ----

  async setUp() {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.03).texture;
    scene.environmentIntensity = 0.9;
    room.dispose();
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
    key.position.set(0.6, 1.0, 0.8);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.4);
    rim.position.set(-0.5, 0.6, -1.0);
    scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x30343a, 0.35));
    this.camera = new THREE.PerspectiveCamera(FRAME.fov, 1, 0.005, 20);

    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(String(this.script.model));
    if (!this.renderer) throw new Error('closed while loading');
    this.gun = gltf.scene;
    scene.add(this.gun);
    this.gun.updateMatrixWorld(true);
    // The parts: every mesh under the model's root, with its resting place,
    // its own copy of its material (so it can dim alone) and its bounds.
    this.parts = new Map();
    this.gun.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.geometry.computeBoundingBox();
      o.matrixAutoUpdate = false;
      this.parts.set(o.name, {
        node: o,
        rest: o.matrix.clone(),
        restPos: new THREE.Vector3().setFromMatrixPosition(o.matrix),
        box: o.geometry.boundingBox.clone(),
        color: o.material.color.clone(),
        env: o.material.envMapIntensity ?? 1,
        dim: 1,
        opacity: o.material.opacity,
        transparent: o.material.transparent,
      });
    });
    this.buildTimeline();
    // Compile shaders and upload textures now, not on the first frames.
    // (Parts that come in from out of the picture are drawn see-through only
    // while they fade, and solid once in, so they sort with the solid parts
    // and not with the lenses: both their shaders are made now.)
    this.layoutDirty = true;
    this.layout();
    renderer.compile(scene, this.camera);
    if (this.entering.length) {
      for (const part of this.entering) { part.node.material.transparent = true; part.node.visible = true; }
      renderer.compile(scene, this.camera);
      for (const part of this.entering) part.node.material.transparent = part.transparent;
    }
  }

  // ---- The timeline ----

  nodesFor(patterns) {
    const test = matcher(patterns);
    const found = [...this.parts.values()].filter((p) => test(p.node.name));
    if (!found.length) console.warn('Breakdown: no parts match', patterns.join(' '));
    return found;
  }

  buildTimeline() {
    const steps = [];
    const moves = []; // every move, in the order they first happen
    const keys = []; // camera keyframes: { t, shot, mode: 'travel' | 'hold' }
    const clicks = [];
    let t = 0;
    keys.push({ t: 0, shot: 'intro-a', mode: 'hold' });
    keys.push({ t: TIMING.intro, shot: 'intro-b', mode: 'hold' });
    t = TIMING.intro;
    let lastView = { az: 25, el: 8 };
    const open = []; // steps whose parts are still out
    this.script.steps.forEach((spec, index) => {
      const view = { az: 25, el: 10, ...(spec.view || {}) };
      const step = { index, spec, view, moves: [], key: 'step' + index };
      // The camera's sweep: longer for a bigger turn.
      const turn = Math.abs(((view.az - lastView.az + 540) % 360) - 180) + Math.abs(view.el - lastView.el);
      const travel = lerp(TIMING.travel[0], TIMING.travel[1], clamp01(turn / 180));
      step.travelStart = t;
      t += travel;
      step.outStart = t;
      keys.push({ t, shot: step.key, mode: 'travel' });
      let cursor = t;
      for (const m of spec.moves || []) {
        const time = m.time ?? TIMING.move;
        const start = m.after != null ? step.outStart + m.after : cursor;
        const move = {
          step: index,
          parts: this.nodesFor(m.nodes),
          path: [new THREE.Vector3(), ...(m.path || (m.by ? [m.by] : [])).map((p) => new THREE.Vector3(...p))],
          turn: m.turn ? { axis: new THREE.Vector3(...m.turn.axis).normalize(), angle: rad(m.turn.deg), pivot: m.turn.pivot } : null,
          outStart: start,
          outEnd: start + time,
          inStart: Infinity,
          inEnd: Infinity,
          click: m.click !== false,
          // enter: the parts aren't there till this move brings them in (along
          // its path from the far end to where they rest, fading in), and
          // they fade away at the far end when it goes back.
          enter: !!m.enter,
        };
        if (move.enter && move.click) clicks.push(move.outEnd);
        if (move.turn && typeof move.turn.pivot === 'string') {
          const p = this.parts.get(move.turn.pivot);
          if (!p) throw new Error('Breakdown: no pivot part ' + move.turn.pivot);
          move.turn.pivot = p.restPos.clone();
        } else if (move.turn) move.turn.pivot = new THREE.Vector3(...(move.turn.pivot || [0, 0, 0]));
        let length = 0;
        for (let i = 1; i < move.path.length; i++) length += move.path[i].distanceTo(move.path[i - 1]);
        move.length = length;
        cursor = move.outEnd;
        step.moves.push(move);
        moves.push(move);
      }
      step.outEnd = Math.max(step.outStart, ...step.moves.map((m) => m.outEnd));
      step.lineStart = Math.max(step.outStart + 0.2, step.outEnd - 0.25);
      step.holdStart = step.lineStart + TIMING.line + TIMING.card;
      const read = Math.min(TIMING.read.max, Math.max(TIMING.read.min, TIMING.read.base + TIMING.read.word * words(spec.text || '')));
      step.holdEnd = step.holdStart + read;
      step.labelEnd = step.holdEnd + TIMING.card;
      // The next step (or the parts going back) starts as the card fades.
      t = spec.keep ? step.labelEnd : step.holdEnd + TIMING.card * 0.5;
      keys.push({ t: step.holdEnd, shot: step.key, mode: 'hold', drift: FRAME.drift * (step.holdEnd - step.outStart) });
      open.push(step);
      lastView = view;
      if (!spec.keep) {
        // Parts go back: the latest out first.
        const closing = open.splice(open.length - Math.min(open.length, spec.close ?? open.length));
        const chain = closing.length > 1;
        step.closeStart = t;
        if (chain) {
          step.closeKey = 'close' + index;
          keys.push({ t: t + TIMING.closeTravel, shot: step.closeKey, mode: 'travel', drift: 0, from: step.key, fromDrift: FRAME.drift * (step.holdEnd - step.outStart) });
          t += TIMING.closeTravel * 0.55;
        }
        // (Moves that came out together go back together.)
        let at = t;
        let prev = null;
        for (const s of closing.reverse()) {
          for (const m of [...s.moves].reverse()) {
            const time = Math.max(TIMING.backMin, (m.outEnd - m.outStart) * TIMING.back);
            const together = prev && prev.step === m.step && m.outEnd > prev.outStart + 0.05;
            m.inStart = together ? prev.inStart : at;
            m.inEnd = m.inStart + time;
            if (m.click && !m.enter && !(together && Math.abs(m.inEnd - prev.inEnd) < 0.08)) clicks.push(m.inEnd);
            at = Math.max(at, m.inStart + time * 0.85);
            prev = m;
          }
        }
        step.closing = closing;
        step.closeEnd = Math.max(at, ...closing.flatMap((s) => s.moves.map((m) => m.inEnd)));
        // (After a chain the camera waits for the last part to seat; after a
        // single part it sets off as the part arrives.)
        t = chain ? step.closeEnd + TIMING.settle : step.closeEnd - Math.min(0.3, 0.4 * (step.closeEnd - step.closeStart));
        if (chain) keys.push({ t, shot: step.closeKey, mode: 'hold' });
        else keys.push({ t, shot: step.key, mode: 'hold', drift: FRAME.drift * (t - step.outStart) });
      }
      step.end = t;
      steps.push(step);
    });
    this.outroStart = t;
    t += TIMING.outro;
    keys.push({ t, shot: 'outro', mode: 'travel' });
    this.outroEnd = t;
    this.duration = t;
    // Each part's moves, in order: a part's place is its moves applied
    // latest-first to where it rests, so it rides on parts that came out
    // before it.
    this.moving = new Map();
    for (const move of moves) for (const p of move.parts) {
      if (!this.moving.has(p)) this.moving.set(p, []);
      this.moving.get(p).push(move);
    }
    this.entering = [];
    for (const [part, list] of this.moving) {
      part.enters = list.filter((mv) => mv.enter);
      if (part.enters.length) this.entering.push(part);
    }
    this.timeline = { steps, moves, keys, clicks };
  }

  // How far out a move is at time t (0 home, 1 out).
  progress(move, t) {
    if (t <= move.outStart) return 0;
    if (t < move.outEnd) return ease((t - move.outStart) / (move.outEnd - move.outStart));
    if (t < move.inStart) return 1;
    if (t < move.inEnd) return 1 - seat((t - move.inStart) / (move.inEnd - move.inStart));
    return 0;
  }

  moveMatrix(move, p, out) {
    if (move.enter) p = 1 - p; // (out is where it rests; home is the far end)
    // Along its path by arc length.
    const offset = new THREE.Vector3();
    let left = p * move.length;
    for (let i = 1; i < move.path.length && left > 0; i++) {
      const a = move.path[i - 1], b = move.path[i];
      const len = a.distanceTo(b);
      const f = len > 0 ? Math.min(1, left / len) : 1;
      offset.lerpVectors(a, b, f);
      left -= len;
    }
    out.makeTranslation(offset.x, offset.y, offset.z);
    if (move.turn) {
      const { pivot, axis, angle } = move.turn;
      const m = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);
      m.multiply(new THREE.Matrix4().makeRotationAxis(axis, angle * p));
      m.multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
      out.multiply(m);
    }
    return out;
  }

  // Each moving part's matrix at time t (in the model's frame).
  pose(t) {
    const result = new Map();
    const m = new THREE.Matrix4();
    for (const [part, list] of this.moving) {
      const total = new THREE.Matrix4();
      for (const move of list) {
        const p = this.progress(move, t);
        if (p > 0 || move.enter) total.multiply(this.moveMatrix(move, p, m));
      }
      result.set(part, total.multiply(part.rest));
    }
    return result;
  }

  // The corners of parts' bounds at time t.
  corners(parts, t, into = []) {
    const pose = this.pose(t);
    for (const part of parts) {
      const matrix = pose.get(part) || part.rest;
      const b = part.box;
      for (let i = 0; i < 8; i++) {
        into.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(matrix));
      }
    }
    return into;
  }

  // ---- Layout and shots ----

  // Where the card goes and which part of the screen is left for the parts,
  // for this window; then every shot framed for it.
  layout() {
    if (!this.renderer) return;
    if (this.size && (this.root.clientWidth !== this.size.w || this.root.clientHeight !== this.size.h)) this.layoutDirty = true;
    if (!this.layoutDirty) return;
    this.layoutDirty = false;
    const w = Math.max(1, this.root.clientWidth), h = Math.max(1, this.root.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const portrait = w / h < 1.05 || w < 560;
    const m = Math.round(Math.max(16, Math.min(40, w * 0.035)));
    const top = 64, bottom = 64;
    // Card size for each step's text at this width.
    const cardW = portrait ? w - 2 * m : Math.round(Math.min(440, Math.max(260, w * 0.3)));
    this.card.style.width = cardW + 'px';
    this.card.hidden = false;
    this.card.style.visibility = 'hidden';
    const heights = this.timeline.steps.map((s, i) => {
      this.fillCard(s, i);
      return this.card.offsetHeight;
    });
    this.card.style.visibility = '';
    this.card.hidden = true;
    this.cardIndex = -1;
    this.cards = this.timeline.steps.map((s, i) => {
      const ch = heights[i];
      if (portrait) {
        const y = h - bottom - ch;
        return { x: m, y, w: cardW, h: ch, side: 'bottom', free: { x0: m, x1: w - m, y0: top, y1: Math.max(top + 80, y - 36) } };
      }
      const left = s.spec.card === 'left';
      const x = left ? m : w - m - cardW;
      const y = Math.round(Math.min(h - bottom - ch, Math.max(top, h * 0.5 - ch * 0.55)));
      const free = left ? { x0: x + cardW + 56, x1: w - m, y0: top, y1: h - bottom } : { x0: m, x1: x - 56, y0: top, y1: h - bottom };
      return { x, y, w: cardW, h: ch, side: left ? 'left' : 'right', free };
    });
    // Shots.
    const full = { x0: m, x1: w - m, y0: top, y1: h - bottom };
    const titled = { x0: m, x1: w - m, y0: top, y1: h * 0.66 };
    const all = [...this.parts.values()];
    const shownAt = (t) => all.filter((p) => !p.enters || !p.enters.length || p.enters.some((mv) => this.progress(mv, t) > 0));
    const whole = this.corners(shownAt(0), 0);
    this.shots = new Map();
    this.shots.set('intro-a', this.frameShot(whole, { az: 70, el: 18 }, titled, 0.9));
    this.shots.set('intro-b', this.frameShot(whole, { az: 28, el: 8 }, titled, 0.9));
    this.shots.set('outro', this.frameShot(this.corners(shownAt(this.duration), this.duration), { az: 24, el: 9 }, titled, 0.9));
    for (const step of this.timeline.steps) {
      const parts = new Set(step.moves.flatMap((mv) => mv.parts));
      if (step.spec.view && step.spec.view.frame) for (const p of this.nodesFor(step.spec.view.frame)) parts.add(p);
      for (const a of anchorsOf(step.spec)) {
        const anchor = this.parts.get(a.name);
        if (anchor) parts.add(anchor);
      }
      const pts = this.corners([...parts], step.outStart);
      this.corners([...parts], step.holdStart, pts);
      this.shots.set(step.key, this.frameShot(pts, step.view, this.cards[step.index].free, FRAME.fill, step.view.min));
      if (step.closeKey) {
        const back = new Set(step.closing.flatMap((s) => s.moves.flatMap((mv) => mv.parts)));
        const cp = this.corners([...back], step.closeStart);
        this.corners([...back], step.end, cp);
        this.shots.set(step.closeKey, this.frameShot(cp, step.view, full, 0.8));
      }
    }
  }

  // A shot from (az, el) that fits the points into a region of the screen
  // (pixels): its camera looks at `target` from `dist` away.
  frameShot(points, view, region, fill = FRAME.fill, min = 0) {
    const { w, h } = this.size;
    const fov = view.fov || FRAME.fov;
    const box = new THREE.Box3().setFromPoints(points);
    if (min) {
      // Never closer than showing `min` metres round the parts.
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      box.expandByVector(new THREE.Vector3(Math.max(0, min - s.x), Math.max(0, min - s.y), Math.max(0, min - s.z)).multiplyScalar(0.5));
      box.expandByPoint(c);
    }
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    const dir = dirOf(view.az, view.el);
    const f = dir.clone().negate();
    const r = new THREE.Vector3().crossVectors(f, UP).normalize();
    const u = new THREE.Vector3().crossVectors(r, f);
    const tanY = Math.tan(rad(fov) / 2), tanX = tanY * (w / h);
    // The region in normalised screen coordinates (-1..1, y up).
    const rx0 = (region.x0 / w) * 2 - 1, rx1 = (region.x1 / w) * 2 - 1;
    const ry0 = 1 - (region.y1 / h) * 2, ry1 = 1 - (region.y0 / h) * 2;
    const rcx = (rx0 + rx1) / 2, rcy = (ry0 + ry1) / 2;
    const rw = ((rx1 - rx0) / 2) * fill, rh = ((ry1 - ry0) / 2) * fill;
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.01, box.getSize(new THREE.Vector3()).length() / 2);
    let depth = radius / Math.max(0.05, Math.min(rh * tanY, rw * tanX)) + radius;
    const cam = centre.clone().addScaledVector(dir, depth);
    const q = new THREE.Vector3();
    for (let iter = 0; iter < 8; iter++) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) {
        q.subVectors(p, cam);
        const z = q.dot(f);
        if (z < 0.01) { behind = true; break; }
        const x = q.dot(r) / (z * tanX), y = q.dot(u) / (z * tanY);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (behind) { cam.addScaledVector(dir, depth); depth *= 2; continue; }
      depth = q.subVectors(centre, cam).dot(f);
      const k = Math.max((x1 - x0) / (2 * rw), (y1 - y0) / (2 * rh));
      // Slide sideways so the parts sit in the middle of the region, and in
      // or out so they fill it.
      cam.addScaledVector(r, ((x0 + x1) / 2 - rcx) * depth * tanX);
      cam.addScaledVector(u, ((y0 + y1) / 2 - rcy) * depth * tanY);
      cam.addScaledVector(dir, depth * (k - 1));
      depth *= k;
    }
    return { az: view.az, el: view.el, fov, dist: depth, target: cam.clone().addScaledVector(f, depth) };
  }

  // The camera at time t: between its keyframes, a sweep (eased, round
  // the gun, pulling back a little on a big turn) or a slow drift.
  cameraAt(t) {
    const keys = this.timeline.keys;
    let i = keys.findIndex((k) => k.t > t);
    if (i === -1) i = keys.length;
    const shotOf = (k, end) => {
      const s = this.shots.get(k.shot);
      const drift = end ? k.drift || 0 : 0;
      return { ...s, az: s.az + drift };
    };
    if (i === 0) return this.shots.get(keys[0].shot);
    if (i === keys.length) {
      // After the end: a slow turn round the gun.
      const s = this.shots.get(keys[keys.length - 1].shot);
      return { ...s, az: s.az + (t - this.duration) * 3 };
    }
    const a = keys[i - 1], b = keys[i];
    // The shot the camera left from: the previous keyframe as it ended.
    let from = shotOf(a, true);
    if (b.from) from = { ...this.shots.get(b.from), az: this.shots.get(b.from).az + (b.fromDrift || 0) };
    const to = b.mode === 'hold' ? shotOf(b, true) : shotOf(b, false);
    const x = clamp01((t - a.t) / Math.max(1e-6, b.t - a.t));
    const wide = this.shots.get('outro');
    if (b.mode === 'hold') {
      if (a.shot === b.shot) return { ...to, az: lerp(from.az, to.az, x) };
      return mixShots(from, to, glide(x), wide);
    }
    return mixShots(from, to, glide(x), wide);
  }

  // ---- Running ----

  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.advance(dt * this.speed);
    this.draw();
  }

  advance(dt) {
    const before = this.t;
    this.t = this.t + dt;
    if (this.audio && dt > 0) for (const c of this.timeline.clicks) if (c > before && c <= this.t) this.click();
  }

  // Shows the moment t of the show (seconds).
  seek(t) {
    this.t = Math.max(0, t);
    if (this.renderer) this.draw();
  }

  // The start of the next step (or the end), and back to the start of this
  // one (or the previous, if this one has only just started).
  next() {
    const s = this.timeline.steps.find((st) => st.travelStart > this.t + 0.05);
    this.seek(s ? s.travelStart : Math.max(this.t, this.outroStart));
  }

  prev() {
    const steps = this.timeline.steps;
    let i = steps.findLastIndex((st) => st.travelStart <= this.t);
    if (i >= 0 && this.t - steps[i].travelStart < 1.5) i--;
    this.seek(i >= 0 ? steps[i].travelStart : 0);
  }

  // Draws time t now (for tests and stills): returns milliseconds spent.
  renderAt(t) {
    const start = performance.now();
    this.seek(t);
    return performance.now() - start;
  }

  draw() {
    if (!this.renderer) return;
    this.layout();
    const t = this.t;
    // Parts.
    const pose = this.pose(t);
    for (const [part, matrix] of pose) {
      part.node.matrix.copy(matrix);
      part.node.matrixWorldNeedsUpdate = true;
    }
    // The step on screen, if any, and how far into it.
    const steps = this.timeline.steps;
    const step = steps.find((s) => t >= s.travelStart && t < s.end) || null;
    // Dim the rest of the gun while a step's parts are out.
    let dim = 0;
    let focus = null;
    if (step) {
      dim = Math.min(clamp01((t - step.outStart + 0.2) / 0.5), clamp01((step.labelEnd + 0.2 - t) / 0.5));
      focus = new Set(step.moves.flatMap((m) => m.parts));
    }
    for (const part of this.parts.values()) {
      const k = focus && !focus.has(part) ? 1 - FRAME.dim * dim : 1;
      if (Math.abs(k - part.dim) > 0.002) {
        part.dim = k;
        part.node.material.color.copy(part.color).multiplyScalar(k);
        part.node.material.envMapIntensity = part.env * (0.35 + 0.65 * k);
      }
    }
    // Parts brought in from out of the picture: seen only while in.
    for (const part of this.entering) {
      const k = Math.max(...part.enters.map((mv) => clamp01(this.progress(mv, t) / 0.25)));
      part.node.visible = k > 0;
      part.node.material.opacity = part.opacity * k;
      part.node.material.transparent = k < 1 || part.transparent;
    }
    // Camera, with a small settle shake after each click.
    const shot = this.cameraAt(t);
    const pos = shot.target.clone().addScaledVector(dirOf(shot.az, shot.el), shot.dist);
    const sinceClick = this.timeline.clicks.reduce((best, c) => (c <= t && t - c < best ? t - c : best), Infinity);
    if (sinceClick < 0.18) {
      const a = shot.dist * 0.0025 * (1 - sinceClick / 0.18);
      pos.y += Math.sin(sinceClick * 90) * a;
    }
    this.camera.fov = shot.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(pos);
    this.camera.lookAt(shot.target);
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    this.drawLabel(step, t);
    this.drawTitles(t);
    this.progressBar.style.width = (100 * clamp01(t / this.duration)).toFixed(2) + '%';
    // (The controls' hint shows through the first part's label, and while
    // it's paused; after that it would sit over the parts in close shots.)
    const first = steps[0];
    const hint = this.paused || !first || t < first.labelEnd ? '1' : '0';
    if (this.hint.style.opacity !== hint) this.hint.style.opacity = hint;
  }

  fillCard(step, i) {
    const n = this.timeline.steps.length;
    this.cardKicker.textContent = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    this.cardTitle.textContent = step.spec.title;
    this.cardText.textContent = step.spec.text || '';
  }

  // A leader (line, dot and pulsing ring) for each of the label's parts.
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

  // The label: a line draws from each of its parts to the card, the card
  // fades in, and both go before the parts go back.
  drawLabel(step, t) {
    const hideFrom = (n) => {
      for (const l of this.leaders.slice(n)) {
        l.line.setAttribute('points', '');
        l.dot.style.opacity = 0;
        l.ring.style.opacity = 0;
      }
    };
    if (!step || t < step.lineStart || t >= step.labelEnd) {
      this.card.hidden = true;
      return hideFrom(0);
    }
    const box = this.cards[step.index];
    if (this.cardIndex !== step.index) {
      this.fillCard(step, step.index);
      this.cardIndex = step.index;
    }
    Object.assign(this.card.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px' });
    // The anchors: the middle of each label part (plus offset), where it is now.
    let anchors = anchorsOf(step.spec).map((a) => ({ part: this.parts.get(a.name), offset: a.offset })).filter((a) => a.part);
    if (!anchors.length && step.moves[0]?.parts[0]) anchors = [{ part: step.moves[0].parts[0] }];
    const { w, h } = this.size;
    const draw = clamp01((t - step.lineStart) / TIMING.line);
    const fadeOut = clamp01((step.labelEnd - t) / TIMING.card);
    const pulse = ((t - step.lineStart) % 1.6) / 1.6;
    // Where each anchor is on screen. (Its line meets the card a little
    // apart from the others': see below.)
    const spots = anchors.map(({ part, offset }) => {
      const p = new THREE.Vector3();
      // (The offset is in metres in the part's own frame, so it stays on
      // the part when the part is turned, as the bolt carrier is with the
      // upper. It's turned with the part but not scaled: a quantized
      // mesh's node carries a scale, and the box is in the mesh's units.)
      part.box.getCenter(p).applyMatrix4(part.node.matrix);
      if (offset) p.add(new THREE.Vector3(...offset).applyMatrix4(new THREE.Matrix4().extractRotation(part.node.matrix)));
      p.project(this.camera);
      return { ax: (p.x + 1) * 0.5 * w, ay: (1 - p.y) * 0.5 * h };
    });
    const lines = leaderPaths(spots, box);
    spots.forEach(({ ax, ay }, i) => {
      const pts = lines[i];
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      const { line, dot, ring } = this.leader(i);
      line.setAttribute('points', pts.map((q) => q.join(',')).join(' '));
      line.style.strokeDasharray = `${len} ${len}`;
      line.style.strokeDashoffset = String(len * (1 - ease(draw)));
      line.style.opacity = fadeOut;
      dot.setAttribute('cx', ax);
      dot.setAttribute('cy', ay);
      dot.style.opacity = Math.min(1, draw * 3) * fadeOut;
      ring.setAttribute('cx', ax);
      ring.setAttribute('cy', ay);
      ring.setAttribute('r', 4 + pulse * 10);
      ring.style.opacity = (1 - pulse) * 0.8 * fadeOut * Math.min(1, draw * 3);
    });
    hideFrom(anchors.length);
    const cardIn = clamp01((t - step.lineStart - TIMING.line) / TIMING.card);
    this.card.hidden = false;
    this.card.style.opacity = Math.min(cardIn, fadeOut);
    this.card.style.transform = `translateY(${(1 - ease(cardIn)) * 8}px)`;
  }

  // The gun's name at the start, and at the end with the credit and buttons.
  drawTitles(t) {
    const introFade = Math.min(clamp01((t - 0.4) / 0.8), clamp01((TIMING.intro - 0.3 - t) / 0.6));
    const outroFade = clamp01((t - this.outroEnd + 0.6) / 0.8);
    const k = Math.max(introFade, outroFade);
    this.titleCard.hidden = k <= 0;
    this.titleCard.style.opacity = k;
    const ending = outroFade > 0;
    this.creditLine.style.display = ending ? '' : 'none';
    this.buttons.style.display = ending ? '' : 'none';
  }

  // A small mechanical click: a burst of filtered noise and a low knock.
  click() {
    const ctx = this.audio;
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const length = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    noise.connect(band).connect(gain).connect(ctx.destination);
    noise.start(now);
    const knock = ctx.createOscillator();
    knock.frequency.setValueAtTime(220, now);
    knock.frequency.exponentialRampToValueAtTime(90, now + 0.06);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.18, now);
    kg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    knock.connect(kg).connect(ctx.destination);
    knock.start(now);
    knock.stop(now + 0.09);
  }

  // Timings and draw counts, for checking.
  stats() {
    const info = this.renderer ? this.renderer.info : null;
    return {
      duration: this.duration,
      steps: this.timeline.steps.map((s) => ({ title: s.spec.title, start: +s.travelStart.toFixed(2), label: +s.lineStart.toFixed(2), end: +s.end.toFixed(2) })),
      triangles: info ? info.render.triangles : 0,
      calls: info ? info.render.calls : 0,
      textures: info ? info.memory.textures : 0,
    };
  }
}

// The leader lines from points on screen ({ ax, ay } in pixels) to a card
// ({ x, y, w, h, side: 'left' | 'right' | 'bottom' }): one polyline each
// (lists of [x, y]), ending on the card's edge. Of the ways to give the
// lines their places on the card, the one where no line crosses or brushes
// past another; first try, the points' order up (or across) the screen.
// (Also used by src/showcase/cinematic/film.js.)
export function leaderPaths(spots, box) {
  const lineFor = ({ ax, ay }, k) => {
    if (box.side === 'bottom') {
      const x = Math.min(box.x + box.w - 24, Math.max(box.x + 24, ax));
      return [[ax, ay], [x, box.y - 28], [x, box.y]];
    }
    const edge = box.side === 'right' ? box.x : box.x + box.w;
    const y = box.y + 30 + k * 12;
    const elbow = box.side === 'right' ? Math.max(ax + 10, edge - 44) : Math.min(ax - 10, edge + 44);
    return [[ax, ay], [elbow, y], [edge, y]];
  };
  const sorted = spots.map((sp, i) => i).sort((i, j) => (box.side === 'bottom' ? spots[i].ax - spots[j].ax : spots[i].ay - spots[j].ay));
  let best = null;
  for (const order of permutations(sorted)) {
    const lines = new Array(spots.length);
    order.forEach((i, r) => { lines[i] = lineFor(spots[i], r - (spots.length - 1) / 2); });
    let clash = 0;
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) clash += polylinesNear(lines[i], lines[j], 6);
    if (!best || clash < best.clash) best = { clash, lines };
    if (clash === 0) break;
  }
  return best.lines;
}

// three.js shares one small texture between all renderers (its DFG lookup
// table for shiny materials) and never frees it; each renderer that uses
// it hangs a listener on it, which would keep the renderer, its canvas and
// whatever drew with it alive after it closes. This takes the renderer's
// off: it's the listener that renderer put on the scene's own textures.
// Call it before renderer.dispose().
export function releaseSharedTextures(renderer, scene) {
  let own = null, lut = null;
  scene.traverse((o) => {
    if (!o.isMesh || (own && lut)) return;
    const m = o.material;
    own = own || (m.map && m.map._listeners && m.map._listeners.dispose && m.map._listeners.dispose[0]) || null;
    const uniforms = renderer.properties.get(m).uniforms;
    lut = lut || (uniforms && uniforms.dfgLUT && uniforms.dfgLUT.value) || null;
  });
  if (own && lut) lut.removeEventListener('dispose', own);
}

// The parts a step's label points at: anchor is a name, or a list of names
// and { name, offset } (offset: [x, y, z] metres; a plain name takes the
// step's offset).
function anchorsOf(spec) {
  return [].concat(spec.anchor || []).map((a) => (typeof a === 'string' ? { name: a, offset: spec.offset } : a));
}

// The direction from the target to the camera for (az, el) in degrees.
function dirOf(az, el) {
  const a = rad(az), e = rad(el);
  return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
}

// Between two shots: the target slides, the camera swings round the shorter
// way, the distance eases in proportion; on a big swing it rises a little
// (looking down over the gun rather than along it), and on a big swing or a long
// slide for how close the camera is it pulls back a little on the way, so
// it never cuts through the gun. A half turn passes the gun end on, where
// its near end would fill the picture: on one it rises and pulls back, at
// least most of the way to the shot of the whole gun (wide), looking
// towards the gun's middle.
function mixShots(a, b, x, wide = null) {
  const daz = ((b.az - a.az + 540) % 360) - 180;
  const swing = Math.min(1, Math.abs(daz) / 120);
  const half = Math.min(1, Math.max(0, (Math.abs(daz) - 70) / 50));
  const slide = Math.min(1, a.target.distanceTo(b.target) / Math.min(a.dist, b.dist));
  const bump = Math.sin(Math.PI * x);
  const dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), x)) * (1 + (0.2 * swing + 0.4 * slide) * bump);
  return {
    az: a.az + daz * x,
    el: lerp(a.el, b.el, x) + bump * (12 * swing + 6 * half),
    fov: lerp(a.fov, b.fov, x),
    dist: wide ? Math.max(1, (half * wide.dist) / dist) ** bump * dist : dist,
    target: wide ? a.target.clone().lerp(b.target, x).lerp(wide.target, 0.85 * half * bump) : a.target.clone().lerp(b.target, x),
  };
}

// Every order of a short list (the first as given).
function permutations(list) {
  if (list.length <= 1) return [list.slice()];
  const out = [];
  list.forEach((x, i) => {
    for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

// How many pairs of segments of two polylines (lists of [x, y]) cross or
// come within `gap` pixels of each other (ignoring their shared last point:
// the lines all end on the card's edge).
function polylinesNear(a, b, gap) {
  let n = 0;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    if (i === a.length - 1 && j === b.length - 1) continue;
    if (segmentDistance(a[i - 1], a[i], b[j - 1], b[j]) < gap) n++;
  }
  return n;
}
function segmentDistance(p, q, r, s) {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const d1 = cross(r, s, p), d2 = cross(r, s, q), d3 = cross(p, q, r), d4 = cross(p, q, s);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const toSeg = (x, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / l)) : 0;
    return Math.hypot(x[0] - a[0] - t * dx, x[1] - a[1] - t * dy);
  };
  return Math.min(toSeg(p, r, s), toSeg(q, r, s), toSeg(r, p, q), toSeg(s, p, q));
}
