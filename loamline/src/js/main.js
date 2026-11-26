// Entry: renderer, the showroom (home + garage backdrop), and the run
// lifecycle.

import * as THREE from 'three';
import { COURSES } from './courses.js';
import { BIKES, emptyInput } from './physics.js';
import { buildBike, buildRider } from './models.js';
import { Game, resolveQuality } from './game.js';
import { ReplayView } from './replayview.js';
import { loadReplay } from './replay.js';
import { Input, bindTouch } from './input.js';
import { initAudio, setMuted, setMusic, sfx, holdMusicDuck } from './audio.js';
import { store, setting } from './storage.js';
import {
  show, currentScreen, buildCourseList, buildGarage, buildControls, buildSettings, Hud, renderFinish,
  updateCoins, menuKey, isTouch, buildReplays, $, $$,
} from './ui.js';

const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5000);

let pixelRatio = 1;
function applyQuality() {
  const q = resolveQuality(setting('quality'));
  const dpr = window.devicePixelRatio || 1;
  pixelRatio = q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : 1;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = q !== 'low';
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
applyQuality();
resize();
window.addEventListener('resize', resize);

const input = new Input();
const hud = new Hud();
bindTouch(input, $('#touch'));
let game = null;

// ------------------------------------------------------------ showroom --

const showroom = (() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9b89a);
  scene.fog = new THREE.Fog(0xd9b89a, 30, 90);
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x6b4a2e, 1.4);
  const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  scene.add(hemi, sun);
  // A dirt lip under the bike and a soft hill behind.
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 0.6, 40), new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 1 }));
  lip.position.y = -0.3; lip.receiveShadow = true;
  scene.add(lip);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; ground.receiveShadow = true;
  scene.add(ground);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.ConeGeometry(1.6 + Math.random(), 6 + Math.random() * 4, 7), new THREE.MeshStandardMaterial({ color: 0x3a5530, flatShading: true }));
    const r = 22 + Math.random() * 10;
    t.position.set(Math.cos(a) * r, 2.5, Math.sin(a) * r);
    scene.add(t);
  }
  const holder = new THREE.Group();
  scene.add(holder);
  let bike = null, rider = null, t = 0;
  const fakeSim = { speed: 0, grounded: true, steerVis: 0, barAngle: 0, pedalPhase: 0, whip: 0, hSpeed: () => 0 };
  void fakeSim;
  function rebuild() {
    holder.clear();
    const st = store();
    const def = BIKES[st.bike] || BIKES.trail;
    bike = buildBike(def.id, def.wb, st.colors[def.id] || def.color);
    rider = buildRider(st.kit);
    bike.root.add(rider.group);
    holder.add(bike.root);
  }
  rebuild();
  return {
    scene, rebuild,
    render(dt, mode) {
      t += dt;
      holder.rotation.y = t * 0.35;
      const garage = mode === 'garage';
      const camR = garage ? 4.6 : 5.2;
      const wide = window.innerWidth > window.innerHeight;
      // Slide the view sideways so the bike sits clear of the menus.
      const k = garage ? (wide ? 1.5 : 0) : (wide ? -1.5 : 0);
      const a = 0.6, rx = Math.cos(a), rz = -Math.sin(a);
      camera.position.set(Math.sin(a) * camR + rx * k, 1.7, Math.cos(a) * camR + rz * k);
      camera.lookAt(rx * k, 0.85, rz * k);
      camera.fov = 45; camera.updateProjectionMatrix();
      // Little idle sway: preload breathing.
      fakeSim.steerVis = Math.sin(t * 0.7) * 0.3;
      bike.update(dt, fakeSim);
      bike.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(bike.root.matrixWorld).invert();
      const L = (v) => v.applyMatrix4(inv);
      const sway = Math.sin(t * 1.3) * 0.04;
      rider.pose({
        bb: bike.bb.clone(),
        handL: L(bike.worldGrip(0, new THREE.Vector3())), handR: L(bike.worldGrip(1, new THREE.Vector3())),
        footL: L(bike.worldPedal(0, new THREE.Vector3())), footR: L(bike.worldPedal(1, new THREE.Vector3())),
        drop: 0.06 + sway, fore: 0, hipX: 0, torso: 0.1 + sway, hipYaw: Math.sin(t * 0.5) * 0.08, hipRoll: 0,
        headPitch: 0.05, headYaw: Math.sin(t * 0.5) * 0.3,
      });
      renderer.render(scene, camera);
    },
  };
})();

// ---------------------------------------------------------------- flow --

function goHome() {
  if (game) { game.dispose(); game = null; }
  holdMusicDuck(false);
  hud.show(false);
  document.body.classList.remove('replay-on');
  $('#replay-bar').classList.add('hidden');
  document.body.classList.remove('photo-on');
  $('#photo').classList.add('hidden');
  showroom.rebuild();
  show('home');
}

let loadingCourse = null;
function startCourse(course) {
  show('loading');
  $('#loading-text').textContent = `Building ${course.name}…`;
  loadingCourse = course;
  // Let the loading screen paint before the heavy build.
  requestAnimationFrame(() => setTimeout(() => {
    if (game) { game.dispose(); game = null; }
    applyQuality();
    const st = store();
    try {
      game = new Game({ renderer, scene: new THREE.Scene(), camera, course, bikeId: st.bike, input, hud });
    } catch (e) {
      console.error(e);
      $('#loading-text').textContent = 'Could not build the trail: ' + e.message;
      return;
    }
    show(null);
    hud.show(true);
    window.__game = game;
  }, 30));
}

// ------------------------------------------------------------- replays --
function startReplay(id) {
  const rec = loadReplay(id);
  if (!rec) return;
  const course = COURSES.find((c) => c.id === rec.meta.course);
  show('loading');
  $('#loading-text').textContent = `Loading replay: ${course ? course.name : ''}…`;
  requestAnimationFrame(() => setTimeout(() => {
    if (game) { game.dispose(); game = null; }
    applyQuality();
    try {
      game = new ReplayView({ renderer, scene: new THREE.Scene(), camera, rec, hud, input });
    } catch (e) {
      console.error(e);
      $('#loading-text').textContent = 'Could not load the replay: ' + e.message;
      return;
    }
    game.onExit = () => { goHome(); buildReplays(startReplay); show('replays'); };
    show(null);
    hud.reset(game);
    hud.show(true);
    document.body.classList.add('replay-on');
    $('#replay-bar').classList.remove('hidden');
    $('#rb-title').textContent = `${course ? course.name : rec.meta.course} · ${fmtClock(rec.meta.time)}`;
    window.__game = game;
  }, 30));
}
const fmtClock = (t) => { const m = Math.floor(t / 60), x = t - m * 60; return `${m}:${x < 10 ? '0' : ''}${x.toFixed(2)}`; };
const RATES = [0.25, 0.5, 1, 2];
$('#rb-play').onclick = () => { if (game && game.isReplay) { if (game.t >= game.duration) game.seek(0); game.playing = !game.playing; } };
$('#rb-rate').onclick = () => { if (game && game.isReplay) { game.rate = RATES[(RATES.indexOf(game.rate) + 1) % RATES.length]; $('#rb-rate').textContent = game.rate + '×'; } };
$('#rb-cam').onclick = () => { if (game && game.isReplay) game.rig.next(); };
$('#rb-exit').onclick = () => { if (game && game.isReplay) game.onExit(); };
$('#rb-seek').addEventListener('input', (e) => { if (game && game.isReplay) game.seek(e.target.value / 1000 * game.duration); });
window.addEventListener('keydown', (e) => {
  if (!game || !game.isReplay) return;
  if (e.code === 'Space') { e.preventDefault(); $('#rb-play').click(); }
  if (e.code === 'ArrowRight') game.seek(game.t + 5);
  if (e.code === 'ArrowLeft') game.seek(game.t - 5);
});

hud.onAct = (a) => input.action(a);
hud.onPause = (g) => {
  if (g.phase === 'finished') return;
  g.paused = !g.paused;
  holdMusicDuck(g.paused);
  if (g.paused) {
    buildSettings('#pause-settings', { inRun: true, onChange: () => applyRunSettings(g) });
    show('pause');
  } else show(null);
};
hud.onFinish = (g, d) => {
  setTimeout(() => {
    if (game !== g) return;
    renderFinish(g, d);
    show('finish');
    updateCoins();
  }, 1400);
};
hud.onPhoto = (g) => {
  const on = !document.body.classList.contains('photo-on');
  document.body.classList.toggle('photo-on', on);
  $('#photo').classList.toggle('hidden', !on);
  g.paused = on;
  if (on) {
    g.prevView = g.rig.view;
    g.rig.photo.yaw = g.sim.yaw + 2.2;
    g.rig.setView('photo');
  } else g.rig.setView(g.prevView || 'follow');
};

function applyRunSettings(g) {
  g.rig.setView(setting('camera'));
  g.world.setWeather(setting('weather'));
}

$('#scr-pause').addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]');
  if (!b || !game) return;
  sfx('click');
  const p = b.dataset.p;
  if (p === 'resume') { game.paused = false; holdMusicDuck(false); show(null); }
  if (p === 'restart') { game.paused = false; holdMusicDuck(false); show(null); game.restart(); }
  if (p === 'home') goHome();
});
$('#scr-finish').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b || !game) return;
  sfx('click');
  const f = b.dataset.f;
  const c = game.course;
  if (f === 'home') goHome();
  if (f === 'again') { show(null); game.restart(); }
  if (f === 'next') startCourse(COURSES[(COURSES.indexOf(c) + 1) % COURSES.length]);
  if (f === 'replay' && game.replayId) startReplay(game.replayId);
});
$('#photo-exit').onclick = () => game && hud.onPhoto(game);
$('#photo-save').onclick = () => {
  if (!game) return;
  game.renderNow = true;
  renderer.render(game.scene, camera);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `loamline-${game.course.id}-${Date.now()}.png`;
  a.click();
  sfx('click');
};
// Photo orbit: drag / wheel.
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (document.body.classList.contains('photo-on')) drag = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointermove', (e) => {
  if (!drag || !game) return;
  const ph = game.rig.photo;
  ph.yaw -= (e.clientX - drag.x) * 0.008;
  ph.pitch = Math.max(-0.1, Math.min(1.3, ph.pitch + (e.clientY - drag.y) * 0.006));
  drag = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  if (!game || !document.body.classList.contains('photo-on')) return;
  game.rig.photo.dist = Math.max(2, Math.min(20, game.rig.photo.dist * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive: true });

// Menu buttons.
for (const b of $$('[data-go]')) {
  b.addEventListener('click', () => {
    initAudio();
    sfx('click');
    let go = b.dataset.go;
    if (go === 'back') go = game ? 'pause' : 'home';
    if (go === 'courses') buildCourseList(startCourse);
    if (go === 'garage') buildGarage(() => showroom.rebuild());
    if (go === 'controls') buildControls();
    if (go === 'replays') buildReplays(startReplay);
    if (go === 'settings') buildSettings('#settings-body', { onChange: () => { applyQuality(); } });
    show(go);
  });
}
for (const b of $$('.mbtn')) b.addEventListener('pointerenter', () => sfx('tick', 0.25));

window.addEventListener('keydown', (e) => {
  initAudio();
  const scr = currentScreen();
  if (game && e.code === 'Escape') return; // the run's own pause toggle handles it
  if (scr && scr !== 'loading') {
    if (menuKey(e.code)) e.preventDefault();
  }
});
window.addEventListener('pointerdown', () => initAudio(), { once: true });
window.addEventListener('loam:setting', (e) => {
  if (e.detail.k === 'tilt') {
    if (e.detail.v) input.tilt.enable().then((ok) => { if (!ok) setting('tilt', false); });
    else input.tilt.disable();
  }
});

// Sound prefs.
setMuted(!setting('sound'));
setMusic(setting('music'));
if (setting('tilt') && isTouch()) input.tilt.enable();

// ---------------------------------------------------------------- loop --

let last = performance.now();
let slowFrames = 0, fpsCheckT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const scr = currentScreen();
  if (game) {
    game.update(dt);
    if (game.isReplay) {
      $('#rb-seek').value = Math.round(game.t / game.duration * 1000);
      $('#rb-play').textContent = game.playing ? '❚❚' : '▶';
    }
    renderer.render(game.scene, camera);
    // Running slowly: drop resolution once.
    fpsCheckT += dt;
    if (dt > 1 / 40) slowFrames++;
    if (fpsCheckT > 4) {
      if (slowFrames > 4 * 25 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.5);
        renderer.setPixelRatio(pixelRatio);
        resize();
        hud.flash('Running slowly: lowered resolution', 'info');
      }
      slowFrames = 0; fpsCheckT = 0;
    }
  } else if (scr !== 'loading') {
    showroom.render(dt, scr);
  } else if (!loadingCourse) {
    showroom.render(dt, 'home');
  }
}

// Boot.
document.fonts && document.fonts.load('italic 800 20px "Barlow Condensed"').catch(() => {});
setTimeout(() => { show('home'); requestAnimationFrame(frame); }, 50);
window.__loam = { startCourse, startReplay, COURSES, input, emptyInput };
