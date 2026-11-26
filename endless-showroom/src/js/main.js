// Endless Showroom: entry point, game loop and glue.
//
// Every screen runs the local shopper itself and sends its state to the
// others. The host (net.js) also runs the clock, the staff (staff.js) and all
// changes to furniture and food (world.js). Solo play is simply being the
// host of a room with nobody else in it.
import * as THREE from 'three';
import { World, CHUNK, CEIL, setLampGlow, setSkyLight , ROOMS, GARDEN_ROOMS } from './world.js';
import { TYPES, ITEMS, FOOD_KEYS, TV_CHANNELS, itemDims, itemMatrix, itemParts, itemQuat, cleanQuat, furnitureGeometry, itemGeometry } from './furniture.js';
import { moveBody, bodyFits } from './physics.js';
import { StaffSim } from './staff.js';
import { createNet, myName, cleanName, myShirt, storeWeek, publicSeed } from './net.js';
import { input, initInput, initTouch, lockPointer, endFrame, pollGamepad } from './input.js';
import { makeShopper, makeStaff, animate, setHeld, nameTag, nameHash, SHIRT_COLORS } from './models.js';
import { makeBody, stepBody, bodyPose, bodyMatrix, makeBall, stepBall, ballMatrix } from './fall.js';
import { initAudio, sfx, setAmbience, setVolume, setMusic, setMusicVolume, musicState } from './audio.js';
import * as audioMod from './audio.js';
import { DAY_LEN, DAY_SCALE, setDayScale, cycleLen, nightLen, cascade, isNight, isHostile, clockText, lightLevel, applyLight, weekday, isRestockDay, restockEpoch } from './env.js';
import { clamp, lerp, angLerp } from './rng.js';
import * as ach from './achievements.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { uniforms, storeMaterial, SURF, makeFixtures, makeDust, setLowQuality, furnitureMaterial as furnitureMaterialRef } from './mats.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const darkEl = $('dark');
const IS_TOUCH = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;

// ---------------------------------------------------------------- settings
const settings = { sens: 1, vol: 0.7, music: 0.5, fov: 75, low: IS_TOUCH, voice: true, invert: false, short: false, calm: false, tips: true, snap: 0 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('es-settings') || '{}')); } catch (_) {}
const saveSettings = () => { try { localStorage.setItem('es-settings', JSON.stringify(settings)); } catch (_) {} };
const stats = { best: 0, days: 0 };
try { Object.assign(stats, JSON.parse(localStorage.getItem('es-stats') || '{}')); } catch (_) {}
const saveStats = () => { try { localStorage.setItem('es-stats', JSON.stringify(stats)); } catch (_) {} };

// ---------------------------------------------------------------- renderer
setLowQuality(settings.low);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, settings.low ? 1 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d3c8);
scene.fog = new THREE.Fog(0xd8d3c8, 10, 70);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 200);
scene.add(camera);
// Soft reflections for metal and gloss, from a generic indoor room.
{
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
}

const hemi = new THREE.HemisphereLight(0xfff6e8, 0x7d7466, 1.0);
const amb = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(hemi, amb);
// Lamps are your light at night: the six nearest lit lamps (standing ones,
// and any being carried, yours included) each get a real light.
const lampLights = [];
for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffd59a, 0, 11, 1.6); scene.add(l); lampLights.push(l); }

// Floor and ceiling: one big plane each that follows the player.
function tileTexture(draw, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// Speckled vinyl tiles, 2/3 m square, with the odd scuff.
const floorTex = tileTexture((x, s) => {
  const n = 6, w = s / n;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 205 + Math.floor(rnd() * 10) - ((i + j) % 2) * 5;
    x.fillStyle = `rgb(${v},${v - 3},${v - 9})`; x.fillRect(i * w, j * w, w, w);
    for (let k = 0; k < 220; k++) {
      const g = rnd();
      x.fillStyle = g < 0.5 ? `rgba(70,64,58,${0.12 + rnd() * 0.25})` : g < 0.8 ? `rgba(255,255,255,${0.2 + rnd() * 0.3})` : `rgba(150,120,90,${0.15 + rnd() * 0.2})`;
      const r = 0.6 + rnd() * 1.6; x.fillRect(i * w + rnd() * w, j * w + rnd() * w, r, r);
    }
  }
  for (let k = 0; k < 7; k++) { // scuffs
    x.strokeStyle = `rgba(60,55,50,${0.05 + rnd() * 0.06})`; x.lineWidth = 2 + rnd() * 6; x.lineCap = 'round';
    x.beginPath(); const px = rnd() * s, py = rnd() * s; x.moveTo(px, py); x.quadraticCurveTo(px + rnd() * 60 - 30, py + rnd() * 60 - 30, px + rnd() * 90 - 45, py + rnd() * 90 - 45); x.stroke();
  }
  x.fillStyle = 'rgba(95,88,80,0.55)';
  for (let i = 0; i <= n; i++) { x.fillRect(i * w - 1, 0, 2, s); x.fillRect(0, i * w - 1, s, 2); }
});
floorTex.repeat.set(300 / 4, 300 / 4); // the texture covers 4 m
const floorGeo = new THREE.PlaneGeometry(300, 300);
floorGeo.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(floorGeo.attributes.position.count).fill(SURF.floor), 1));
const floor = new THREE.Mesh(floorGeo, storeMaterial({ map: floorTex, vertexColors: false }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
// Acoustic ceiling tiles; the light fittings are separate (mats.js).
const ceilTex = tileTexture((x, s) => {
  x.fillStyle = '#dedbd4'; x.fillRect(0, 0, s, s);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 4000; k++) { x.fillStyle = `rgba(120,115,105,${rnd() * 0.25})`; x.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); }
  const n = 5, w = s / n; x.fillStyle = '#aaa69d';
  for (let i = 0; i <= n; i++) { x.fillRect(i * w - 2, 0, 4, s); x.fillRect(0, i * w - 2, s, 4); }
});
ceilTex.repeat.set(300 / 6, 300 / 6);
const ceilMat = new THREE.MeshBasicMaterial({ map: ceilTex, color: 0xffffff });
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), ceilMat);
ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 6.5; // not added: there is no roof
const lights = { hemi, amb, ceil: ceilMat.color };
// The store's light comes down out of the fog from fittings you can't see.
uniforms.uCeil.value = 8;
uniforms.uGain.value = 2.7;
const fixtures = makeFixtures(scene);
for (const m of fixtures.meshes) m.visible = false;
// Fog up where the roof should be: slow drifting layers of murk.
const sky = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 70; k++) {
    const px = rnd() * 256, py = rnd() * 256, r = 20 + rnd() * 60;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const gr = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.12 + rnd() * 0.18})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5, 5);
  const layers = [9, 13, 18, 25, 34].map((h, i) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(4 + i, 4 + i);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.5, side: THREE.DoubleSide, fog: true }));
    m.rotation.x = Math.PI / 2; m.position.y = h; m.renderOrder = 3; m.userData = { h, sp: 0.004 + i * 0.002, dir: i % 2 ? 1 : -1 };
    scene.add(m); return m;
  });
  return {
    update(dt, x, z, L) {
      for (const m of layers) {
        m.position.x = x; m.position.z = z;
        // the layer follows you, but its pattern stays put in the world (and drifts slowly)
        const t = m.material.map, u = m.userData; u.drift = (u.drift || 0) + u.sp * u.dir * dt;
        t.offset.set(((x / 240) * t.repeat.x + u.drift) % 1, ((z / 240) * t.repeat.y + u.drift * 0.6) % 1);
        m.material.color.setScalar(0.25 + 0.75 * L); m.material.opacity = 0.32 + 0.18 * L;
      }
    },
  };
})();
// The sky: eye-level fog at the horizon, shading up to the colour of the fog
// overhead, so the pillars dissolve into the same haze they rise into.
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
  uniforms: { uLow: { value: scene.fog.color }, uHigh: { value: uniforms.uSkyFog.value } },
  vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 uLow, uHigh; varying vec3 vD; void main() { gl_FragColor = vec4(mix(uLow, uHigh, smoothstep(0.02, 0.55, vD.y)), 1.0);\n#include <colorspace_fragment>\n}',
  side: THREE.BackSide, depthWrite: false, fog: false,
}));
skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
skyDome.onBeforeRender = (r, s, cam) => skyDome.position.copy(cam.position);
const dust = makeDust(scene);

// ---------------------------------------------------------------- world
const world = new World(scene);
let staffSim = null;
// The piece you're holding, floating where you aim, and its outline: green
// when letting go would leave it fixed in place, white when it would drop.
const heldMesh = new THREE.Mesh(new THREE.BufferGeometry(), furnitureMaterialRef);
heldMesh.visible = false; heldMesh.matrixAutoUpdate = false; heldMesh.frustumCulled = false; scene.add(heldMesh);
let heldMeshKey = '';
const holdBox = new THREE.Box3Helper(new THREE.Box3(), 0xffffff);
holdBox.visible = false; scene.add(holdBox);
const highlight = new THREE.Box3Helper(new THREE.Box3(), 0xffd34d);
highlight.visible = false; scene.add(highlight);

// ---------------------------------------------------------------- state
const net = createNet({
  members: onMembers, hostChanged: onHostChanged, player: onPlayer, request: (from, q) => hostRequest(from, q),
  world: onWorld, staff: onStaffSnap, clock: onClock, hit: (d) => hurt(d, 'staff'), chat: onChat, caught: onCaught,
  need: onNeed, full: onFull, push: onPushRequest, whistle: onWhistle, noise: onNoise, offer: onOffer, reset: onWeekReset,
});

const INV = 16, HOTBAR = 8;
const P = {
  x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, radius: 0.35, height: 1.75, step: 0.45, gravity: 22, onGround: true, isPlayer: true,
  hp: 100, food: 100, en: 100, alive: true, carry: null, inv: new Array(INV).fill(null), invId: new Array(INV).fill(null), sel: 0, third: false,
  nights: 0, hurtT: 99, respawnT: 0, stepAcc: 0, eatCd: 0, speed: 0, deadAt: 0, carryDist: 3, canClimb: false, climbing: false,
  using: null, whistleT: 0, sprinting: false, crouch: false, eyeH: 1.6,
};
const waypoints = []; // { x, y, z, name, death }
const clock = { day: 1, t: 30, ev: '' };
let mode = 'menu', paused = false, chatOpen = false, lastPhase = '', warned = false;
const remotes = new Map(); // id -> { model, tag, buf, name, st }
const staffViews = new Map(); // id -> { model, buf, seen }
let myModel = null;
const pendingFull = { got: false };

// ---------------------------------------------------------------- UI helpers
function show(id) { for (const s of ['menu', 'how', 'settings', 'pause', 'loading', 'achievements']) $(s).classList.toggle('hidden', s !== id); }
let returnTo = 'menu';
function announce(title, sub, secs = 5) {
  const a = $('announce');
  a.innerHTML = ''; a.append(title); if (sub) { const s = document.createElement('small'); s.textContent = sub; a.append(s); }
  a.classList.remove('hidden');
  clearTimeout(announce.t); announce.t = setTimeout(() => a.classList.add('hidden'), secs * 1000);
}
function showDayTitle() {
  const el = $('daytitle');
  el.innerHTML = '';
  const a = document.createElement('div'); a.className = 'dt-day'; a.textContent = `DAY ${clock.day}`;
  const b = document.createElement('div'); b.className = 'dt-week'; b.textContent = weekday(clock.day);
  el.append(a, b);
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function chatLine(name, msg, sys) {
  const d = document.createElement('div');
  if (sys) { d.className = 'sys'; d.textContent = msg; }
  else { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b, msg); }
  const log = $('chat-log'); log.append(d);
  while (log.children.length > 8) log.firstChild.remove();
  d._t = performance.now();
}
function toast(msg) { chatLine('', msg, true); }

// ---------------------------------------------------------------- menus
$('name-in').value = myName();
$('name-in').addEventListener('change', () => { const n = cleanName($('name-in').value) || 'Shopper'; $('name-in').value = n; try { localStorage.setItem('es-name', n); } catch (_) {} });
// Achievements: a toast when one unlocks, and the list on the menu.
ach.onUnlock((a) => { sfx.morning(); announce(`🏆 ${a.name}`, a.desc, 5); });
function renderAchievements() {
  const box = $('ach-list'); box.innerHTML = '';
  const all = ach.list();
  $('ach-count').textContent = `${all.filter((a) => a.got).length} / ${all.length}`;
  for (const a of all) {
    const d = document.createElement('div'); d.className = 'ach' + (a.got ? ' got' : '');
    const b = document.createElement('b'); b.textContent = (a.got ? '🏆 ' : '🔒 ') + a.name;
    const sm = document.createElement('small'); sm.textContent = a.desc;
    d.append(b, sm); box.append(d);
  }
}
$('b-ach').onclick = () => { returnTo = 'menu'; renderAchievements(); show('achievements'); };
$('p-ach').onclick = () => { returnTo = 'pause'; renderAchievements(); show('achievements'); };

// Day length for the stores you start (solo, or a room you create).
function refreshDayLen() {
  for (const b of document.querySelectorAll('#daylen button')) b.classList.toggle('on', (b.dataset.v === 'short') === !!settings.short);
}
for (const b of document.querySelectorAll('#daylen button')) b.onclick = () => { settings.short = b.dataset.v === 'short'; saveSettings(); refreshDayLen(); };
refreshDayLen();

// Shirt colour picker on the menu.
{
  const row = $('shirts');
  SHIRT_COLORS.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'sw-btn'; b.style.background = '#' + c.toString(16).padStart(6, '0');
    b.title = 'Shirt colour'; b.setAttribute('aria-label', 'Shirt colour ' + (i + 1));
    b.onclick = () => { try { localStorage.setItem('es-shirt', String(i)); } catch (_) {} mark(); };
    row.append(b);
  });
  const mark = () => { const v = myShirt(); [...row.children].forEach((b, i) => b.classList.toggle('on', i === v)); };
  mark();
}
function nameIsArcade() { try { const a = JSON.parse(localStorage.getItem('arcade-acct') || 'null'); return !!(a && a.name); } catch (_) { return false; } }
if (nameIsArcade()) $('name-in').disabled = true;
function refreshBest() { $('best').textContent = stats.best ? `Most nights survived: ${stats.best} · Nights survived in total: ${stats.days}` : ''; }
refreshBest();

async function goOnline(how) {
  initAudio();
  $('menu-msg').textContent = '';
  show('loading'); $('loading-msg').textContent = how === 'join' ? 'Joining room…' : 'Finding a store…';
  try {
    let r;
    if (how === 'quick') r = await net.quick();
    else if (how === 'create') { await net.create(); r = 'ok'; }
    else r = await net.join($('code-in').value);
    if (r === 'full') { show('menu'); $('menu-msg').textContent = how === 'join' ? 'That room is full.' : 'Every public store is full. Try a private room.'; return; }
    if (r === 'bad') { show('menu'); $('menu-msg').textContent = 'Type a room code first.'; return; }
    startGame(net.seed, !net.isHost());
  } catch (e) {
    net.leave();
    show('menu');
    $('menu-msg').textContent = "Couldn't reach the online server. You can still play solo.";
  }
}
$('b-online').onclick = () => goOnline('quick');
$('b-create').onclick = () => goOnline('create');
$('b-join').onclick = () => goOnline('join');
$('code-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') goOnline('join'); });
$('b-solo').onclick = () => { initAudio(); startGame((Math.random() * 4294967296) >>> 0, false); saveSolo(); };
$('b-continue').onclick = () => { const sv = loadSolo(); if (!sv) return; initAudio(); startGame(sv.seed >>> 0, false, sv); };

// ---------------------------------------------------------------- public stores
// A public store is this week's store: the same layout for everyone from the
// start of Sunday to the end of Saturday (Sydney time), and nothing built in it
// is thrown away when the last person leaves. There's no server storage, so
// every player's browser keeps a copy of the week's store (every 20 s and on
// leaving). The first one back into an empty store brings their copy back, and
// anyone who joins offers theirs to the host, which fills in whatever it's
// missing or has an older version of (never anything changed live since). At
// the start of Sunday the host opens a fresh store for everyone.
const PUB_KEY = 'es-pub-';
const liveIds = new Set(); // changed live while we've been here: an offered copy never overrides these
let offered = false, weekCheckT = 0;
function pubLoad() {
  try {
    const c = JSON.parse(localStorage.getItem(PUB_KEY + net.room) || 'null');
    return c && c.v === 1 && c.week === net.week && (c.seed >>> 0) === (world.seed >>> 0) && Array.isArray(c.mods) ? c : null;
  } catch (_) { return null; }
}
function pubSave() {
  if (!net.on || !net.isPublic || mode !== 'play' || storeWeek() !== net.week) return;
  try {
    localStorage.setItem(PUB_KEY + net.room, JSON.stringify({ v: 1, week: net.week, seed: world.seed >>> 0, day: clock.day, t: +clock.t.toFixed(1), at: Date.now(), mods: world.allMods().map(([id, st]) => [id, st.c ? Object.assign({}, st, { c: 0 }) : st]) }));
    // copies of other weeks are no use any more
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PUB_KEY) || k === PUB_KEY + net.room) continue;
      let c = null; try { c = JSON.parse(localStorage.getItem(k)); } catch (_) {}
      if (!c || c.week !== net.week) localStorage.removeItem(k);
    }
  } catch (_) {}
}
// First into an empty public store: bring back our copy of it. Returns how many changes.
function pubRestore() {
  const c = pubLoad(); if (!c) return 0;
  let n = 0;
  for (const e of c.mods) if (Array.isArray(e) && typeof e[0] === 'string' && e[1] && world.applyState(e[0], Object.assign({}, e[1], { c: 0 }))) n++;
  clock.day = Math.max(1, c.day | 0); clock.t = clamp(+c.t || 30, 0, cycleLen(clock.day) - 1); world.setDay(clock.day);
  return n;
}
// Joining a public store that has people in it: offer the host our copy.
function pubOffer() {
  if (!net.on || !net.isPublic || net.isHost() || mode !== 'play') return;
  const c = pubLoad(); if (!c) return;
  const m = c.mods.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && e[1] && +e[1].tm > 0), size = 80, n = Math.ceil(m.length / size);
  for (let i = 0; i < n; i++) net.send('of', { i, n, m: m.slice(i * size, (i + 1) * size), d: c.day | 0, t: +c.t || 0 });
}
// The host merges an offered copy: what it doesn't know about, or only knows
// an older version of from a saved copy. Changes made live win.
function onOffer(from, p) {
  if (!net.isPublic || mode !== 'play' || !Array.isArray(p.m)) return;
  const now = Date.now(), weekStart = (net.week * 864e5) - 14 * 3600e3, u = [];
  for (const e of p.m.slice(0, 80)) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !e[1] || typeof e[1] !== 'object') continue;
    const id = e[0], tm = +e[1].tm;
    if (!(tm > weekStart && tm < now + 60000) || liveIds.has(id) || tm <= (world.modTime.get(id) || 0)) continue;
    const cur = world.items.get(id);
    if (cur && cur.c) continue; // someone's holding it right now
    if (!world.applyState(id, Object.assign({}, e[1], { c: 0, tm }))) continue;
    u.push([id, Object.assign({ tm }, world.mods.get(id))]);
  }
  for (let i = 0; i < u.length; i += 80) net.send('w', { u: u.slice(i, i + 80) });
  // a store that started again from day 1 takes the day the copy had got to
  if ((p.i | 0) === 0 && (p.d | 0) > clock.day) { clock.day = Math.min(9999, p.d | 0); clock.t = clamp(num(p.t), 0, cycleLen(clock.day) - 1); world.setDay(clock.day); }
  if (u.length) toast(`Someone brought back ${u.length} change${u.length === 1 ? '' : 's'} to this week's store.`);
}
// Sunday: the host opens this week's fresh store, and everyone moves into it.
function checkWeek(dt) {
  if ((weekCheckT -= dt) > 0) return;
  weekCheckT = 10;
  if (!net.on || !net.isPublic || !net.isHost() || mode !== 'play') return;
  const wk = storeWeek();
  if (wk <= net.week) return;
  const sd = publicSeed(net.room, wk);
  net.send('rs', { sd, wk });
  newWeek(sd, wk);
}
function onWeekReset(p) {
  const wk = p.wk | 0;
  if (!net.isPublic || mode !== 'play' || wk <= net.week) return;
  newWeek(p.sd >>> 0, wk);
}
function newWeek(sd, wk) {
  try { localStorage.removeItem(PUB_KEY + net.room); } catch (_) {}
  net.week = wk; net.seed = sd; net.set({ sd });
  startGame(sd, false);
  announce('A new week', "The store has been reset for the week. Everything built last week is gone.", 7);
}
setInterval(() => { if (mode === 'play') pubSave(); }, 20000);
addEventListener('pagehide', () => { if (mode === 'play') pubSave(); });

// ---------------------------------------------------------------- solo saves
// A solo store is saved every 20 s and when you leave, so you can carry on later.
function saveSolo() {
  if (net.on || mode !== 'play') return;
  try {
    localStorage.setItem('es-solo', JSON.stringify({
      v: 1, seed: world.seed, day: clock.day, t: +clock.t.toFixed(1), k: DAY_SCALE, mods: world.allMods().map(([id, st]) => [id, st.c ? Object.assign({}, st, { c: 0 }) : st]), waypoints,
      P: { x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), yaw: +P.yaw.toFixed(2), hp: P.alive ? Math.ceil(P.hp) : 100, food: Math.ceil(P.food), en: Math.ceil(P.en), nights: P.nights, inv: P.inv, invId: P.invId },
    }));
  } catch (_) {}
  refreshContinue();
}
function loadSolo() { try { const s = JSON.parse(localStorage.getItem('es-solo') || 'null'); return s && s.v === 1 && s.seed ? s : null; } catch (_) { return null; } }
function refreshContinue() {
  const sv = loadSolo(), b = $('b-continue');
  b.classList.toggle('hidden', !sv);
  if (sv) b.textContent = `Continue Solo · Day ${sv.day} (${weekday(sv.day)})`;
}
refreshContinue();
setInterval(() => { if (mode === 'play' && !net.on && P.alive) saveSolo(); }, 20000);
addEventListener('pagehide', () => { if (mode === 'play' && !net.on) saveSolo(); });
$('b-how').onclick = () => { returnTo = 'menu'; show('how'); };
$('b-settings').onclick = () => { returnTo = 'menu'; openSettings(); };
for (const b of document.querySelectorAll('.back')) b.onclick = () => show(returnTo);
$('p-resume').onclick = resume;
$('p-how').onclick = () => { returnTo = 'pause'; show('how'); };
$('p-settings').onclick = () => { returnTo = 'pause'; openSettings(); };
$('p-leave').onclick = leaveGame;

function openSettings() {
  $('s-sens').value = settings.sens; $('s-vol').value = settings.vol; $('s-music').value = settings.music; $('s-fov').value = settings.fov; $('s-low').checked = settings.low; $('s-voice').checked = settings.voice; $('s-invert').checked = settings.invert; $('s-calm').checked = settings.calm; $('s-tips').checked = settings.tips !== false; $('s-snap').value = String(settings.snap || 0);
  show('settings');
}
$('s-sens').oninput = (e) => { settings.sens = +e.target.value; saveSettings(); };
$('s-vol').oninput = (e) => { settings.vol = +e.target.value; setVolume(settings.vol); saveSettings(); };
$('s-fov').oninput = (e) => { settings.fov = +e.target.value; camera.fov = settings.fov; camera.updateProjectionMatrix(); saveSettings(); };
$('s-low').onchange = (e) => { settings.low = e.target.checked; setLowQuality(settings.low); renderer.setPixelRatio(Math.min(devicePixelRatio, settings.low ? 1 : 1.75)); saveSettings(); };
setVolume(settings.vol);
setMusicVolume(settings.music);
$('s-voice').onchange = (e) => { settings.voice = e.target.checked; saveSettings(); };
$('s-invert').onchange = (e) => { settings.invert = e.target.checked; saveSettings(); };
$('s-calm').onchange = (e) => { settings.calm = e.target.checked; saveSettings(); };
$('death-wake').onclick = () => { if (!P.alive && P.respawnT <= 0) { respawn(); if (!IS_TOUCH) lockPointer(canvas); } };
$('s-tips').onchange = (e) => { settings.tips = e.target.checked; saveSettings(); };
$('s-snap').onchange = (e) => { settings.snap = +e.target.value || 0; saveSettings(); };
$('s-music').oninput = (e) => { settings.music = +e.target.value; setMusicVolume(settings.music); saveSettings(); };

// Ctrl+W can't be stopped by a page, so while you're in a store the browser asks first.
addEventListener('beforeunload', (e) => { if (mode === 'play') { saveSolo?.(); e.preventDefault(); e.returnValue = ''; } });
initInput(canvas, {
  wantLock: () => { if (mode === 'play' && !paused && !invOpen) lockPointer(canvas); },
  lockLost: () => { if (mode === 'play' && !chatOpen && !invOpen && !IS_TOUCH && P.alive) pause(); },
});
if (IS_TOUCH) { document.body.classList.add('touch'); }

function pause() { if (mode !== 'play') return; paused = true; returnTo = 'pause'; show('pause'); $('pause-room').textContent = roomText(); }
function resume() { paused = false; show(null); if (!IS_TOUCH) lockPointer(canvas); }
function roomText() { return net.on ? (net.isPublic ? `Public store ${net.room.replace('pub', '#')}` : `Private room code: ${net.room}`) : 'Solo store'; }

// ---------------------------------------------------------------- game start / leave
function startGame(seed, waitForState, save) {
  setDayScale(save ? +save.k || 1 : waitForState || (net.on && net.isPublic) ? 1 : settings.short ? 0.5 : 1);
  world.reset(seed);
  clock.day = 1; clock.t = 30;
  world.setDay(1);
  if (save) { // carry on a saved solo store
    for (const [id, st] of save.mods || []) if (Array.isArray([id, st]) && st) world.applyState(id, Object.assign({}, st, { c: 0 }));
    clock.day = Math.max(1, save.day | 0); clock.t = clamp(+save.t || 30, 0, cycleLen(clock.day) - 1);
    world.setDay(clock.day);
  }
  liveIds.clear(); offered = false;
  let restored = 0;
  if (net.on && net.isPublic && !waitForState) restored = pubRestore();
  remotes.forEach((r) => { scene.remove(r.model.root); if (r.heldMesh) scene.remove(r.heldMesh); }); remotes.clear();
  staffViews.forEach((s) => scene.remove(s.model.root)); staffViews.clear();
  staffSim = net.isHost() ? new StaffSim(world) : null;
  Object.assign(P, { hp: 100, food: 100, en: 100, alive: true, carry: null, inv: new Array(INV).fill(null), invId: new Array(INV).fill(null), sel: 0, nights: 0, vy: 0, hurtT: 99, using: null, whistleT: 0, whistleHold: null, sit: null });
  waypoints.length = 0;
  if (save && save.P) {
    const sp = save.P;
    Object.assign(P, { hp: clamp(+sp.hp || 100, 1, 100), food: clamp(+sp.food || 100, 0, 100), en: clamp(+sp.en || 100, 0, 100), nights: sp.nights | 0, yaw: +sp.yaw || 0 });
    (sp.inv || []).slice(0, INV).forEach((k, i) => { if (ITEMS[k]) { P.inv[i] = k; P.invId[i] = (sp.invId || [])[i] || null; } });
    for (const w of save.waypoints || []) waypoints.push({ x: +w.x, y: +w.y, z: +w.z, name: String(w.name).slice(0, 30), death: !!w.death });
    spawnAt(+sp.x || 0, +sp.z || 0, 3);
    P.y = Math.max(0, +sp.y || 0);
  } else { // like everyone else, you start somewhere random in the store
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 130;
    spawnAt(Math.cos(a) * d, Math.sin(a) * d, 10);
  }
  P.startX = P.x; P.startZ = P.z;
  if (myModel) scene.remove(myModel.root);
  myModel = makeShopper(nameHash(net.id), myShirt()); scene.add(myModel.root);
  mode = 'play'; paused = false; lastPhase = ''; warned = false;
  show(null);
  $('hud').classList.remove('hidden');
  $('death').classList.add('hidden');
  $('room-tag').textContent = roomText(); $('room-tag').classList.remove('hidden');
  $('chat-log').innerHTML = '';
  if (IS_TOUCH) initTouchOnce(); else lockPointer(canvas);
  buildHotbar();
  if (waitForState) {
    pendingFull.got = false; net.send('need', {});
    let tries = 0;
    const retry = setInterval(() => { if (pendingFull.got || !net.on || mode !== 'play' || ++tries > 5) { clearInterval(retry); return; } net.send('need', {}); }, 4000);
  }
  if (net.on) toast(`Joined ${roomText().toLowerCase()}. Press Enter to chat.`);
  if (net.on && net.isPublic) toast(restored ? `This week's store is back as it was left (${restored} changes). It resets at the start of Sunday.` : "This is this week's store: whatever is built here stays until it resets at the start of Sunday.");
  showDayTitle();
  if (save) { announce(`Welcome back · Day ${clock.day}`, 'Your solo store is just as you left it.', 5); return; }
  announce('Welcome to the store', net.on ? 'You\'re somewhere in the aisles. Whistle (H) to find the others, gather food, and be ready for closing time.' : 'Gather food, build somewhere high, and be ready for closing time.', 7);
}
let touchReady = false;
function initTouchOnce() { if (!touchReady) { initTouch($('touch')); touchReady = true; } $('touch').classList.remove('hidden'); }

function leaveGame() {
  if (!net.on) saveSolo(); else pubSave();
  net.leave();
  mode = 'menu'; paused = false;
  $('hud').classList.add('hidden'); $('death').classList.add('hidden'); $('touch').classList.add('hidden');
  heldMesh.visible = false; holdBox.visible = false; highlight.visible = false;
  try { document.exitPointerLock(); } catch (_) {}
  show('menu'); refreshBest();
  setMusic('', 0);
}

// Find a free spot near (x, z), searching outward.
function spawnAt(x, z, spread) {
  world.update([{ x, z, render: true }]);
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2, d = (i / 80) * spread;
    const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
    if (bodyFits(world, sx, 0, sz, P.radius + 0.1, P.height)) { P.x = sx; P.z = sz; P.y = 0; P.vy = 0; return; }
  }
  P.x = x; P.z = z; P.y = 0;
}

// ---------------------------------------------------------------- networking handlers
function onMembers(list) {
  for (const [id, r] of remotes) if (!list.some((m) => m.id === id)) { scene.remove(r.model.root); if (r.heldMesh) scene.remove(r.heldMesh); remotes.delete(id); toast(`${r.name} left the store.`); }
  releaseOrphans(list);
  for (const m of list) if (m.id !== net.id && !remotes.has(m.id)) {
    const model = makeShopper(nameHash(m.id), (m.lk | 0) >= 0 && (m.lk | 0) < 10 && m.lk !== undefined ? m.lk | 0 : -1);
    const name = cleanName(m.n) || 'Shopper';
    const tag = nameTag(name); tag.position.y = 2.15; model.root.add(tag);
    model.root.visible = false;
    scene.add(model.root);
    remotes.set(m.id, { model, tag, name, buf: [], st: null, seen: 0 });
    if (mode === 'play') toast(`${name} entered the store.`);
  }
  updateRoster();
  $('room-tag').textContent = `${roomText()} · ${list.length} player${list.length === 1 ? '' : 's'}`;
}
// The host lets go of anything held by someone who has left: it drops where
// it was picked up from.
function releaseOrphans(list = net.members()) {
  if (!net.isHost() || !net.on) return;
  const ids = [];
  for (const it of world.items.values()) if (it.c && it.c !== net.id && !list.some((m) => m.id === it.c)) { world.edit(it, { c: null }); ids.push(it.id); }
  if (ids.length) broadcastItems(ids);
}
function onHostChanged(isMe) {
  if (isMe && mode === 'play') {
    staffSim = new StaffSim(world);
    releaseOrphans();
    staffViews.forEach((s) => scene.remove(s.model.root)); staffViews.clear();
    toast('You are now hosting this store.');
  } else if (!isMe) staffSim = null;
}
// Numbers from the network: finite, and within the store's sane range.
const num = (v, d = 0) => (Number.isFinite(+v) ? clamp(+v, -1e6, 1e6) : d);
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
function onPlayer(id, p) {
  const r = remotes.get(id); if (!r) return;
  const st = { t: performance.now(), x: num(p.x), y: clamp(num(p.y), 0, CEIL), z: num(p.z), ry: num(p.ry), a: p.a ? 1 : 0, ct: has(TYPES, p.ct) ? p.ct : '', cv: p.cv | 0, n: p.n | 0, hp: clamp(num(p.hp, 100), 0, 100), sp: p.sp ? 1 : 0, cr: p.cr ? 1 : 0, tc: p.tc ? 1 : 0, si: p.si ? 1 : 0, ho: null };
  if (st.ct && Array.isArray(p.ho) && p.ho.length === 7) {
    const o = cleanQuat(p.ho.slice(3)), hx = num(p.ho[0]), hz = num(p.ho[2]);
    if (o && Math.hypot(hx - st.x, hz - st.z) < 12) st.ho = { x: hx, y: clamp(num(p.ho[1]), 0, CEIL), z: hz, o };
  }
  r.buf.push(st); if (r.buf.length > 20) r.buf.shift();
  r.st = st; r.seen = performance.now();
}
// Our requests still waiting for the host: item id -> sequence number. A
// change the host made before our latest request is old news, so we don't let
// it undo what we just did.
const pending = new Map();
let reqSeq = 0;
function onWorld(list) {
  for (const e of list) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !e[1] || typeof e[1] !== 'object') continue;
    const id = e[0], st = e[1], mine = st.rf === net.id;
    const pend = pending.get(id);
    if (pend && performance.now() - pend.t > 5000) pending.delete(id); // the echo got lost: stop waiting
    else if (pend) {
      if (!mine || (st.rs | 0) < pend.s) continue; // stale: our newer request is still on its way
      pending.delete(id);
    }
    if (mine && st.rj) { // the host said no: somebody else took that food first
      const i = P.invId.indexOf(id);
      if (i >= 0) { P.inv[i] = null; P.invId[i] = null; buildHotbar(); toast('Somebody else took that first.'); }
    }
    const it = world.applyState(id, st);
    if (!it) continue;
    if (P.carry && P.carry.id === it.id && it.c !== net.id) {
      if (it.c) toast('Somebody else grabbed that first.');
      P.carry = null;
    } else if (it.c === net.id && (!P.carry || P.carry.id !== it.id) && !flying.some((f) => f.carry.id === it.id)) {
      // the host thinks we're holding something we aren't: put it back down
      request({ a: 'place', id: it.id, x: it.x, y: it.y, z: it.z, r: it.r, tl: it.tl, o: it.o, an: it.a ? 1 : 0 });
    }
  }
}
function onStaffSnap(list) { ingestStaff(list, performance.now()); }
function onClock(p) {
  if (p.k !== undefined && setDayScale(+p.k)) refreshDayLen();
  const d = Math.max(1, p.d | 0), t = clamp(num(p.t), 0, cycleLen(d));
  if (d !== clock.day) { clock.day = d; world.setDay(d); clock.t = t; }
  else if (Math.abs(t - clock.t) > 1.5) clock.t = t;
  else clock.t += (t - clock.t) * 0.3;
}
function onChat(from, m) {
  if (!m) return;
  const r = remotes.get(from);
  chatLine(r ? r.name : 'Shopper', m); sfx.chat();
  if (r) showBubble(r, m);
}
// A speech bubble over a shopper's head for a few seconds.
function showBubble(r, text) {
  if (r.bubble) { r.model.root.remove(r.bubble); r.bubble.material.map.dispose(); r.bubble.material.dispose(); }
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const x = c.getContext('2d');
  x.font = '600 30px system-ui, sans-serif';
  const words = text.split(/\s+/), lines = [''];
  for (const w of words) { const t = (lines[lines.length - 1] + ' ' + w).trim(); if (x.measureText(t).width > 440 && lines[lines.length - 1]) { if (lines.length === 3) break; lines.push(w); } else lines[lines.length - 1] = t; }
  const h = 24 + lines.length * 36;
  x.fillStyle = 'rgba(255,255,255,0.94)'; x.beginPath(); x.roundRect(16, 160 - h - 14, 480, h, 18); x.fill();
  x.beginPath(); x.moveTo(240, 146); x.lineTo(272, 146); x.lineTo(256, 160); x.fill();
  x.fillStyle = '#1c2430'; x.textAlign = 'center'; x.textBaseline = 'top';
  lines.forEach((l, i) => x.fillText(l, 256, 160 - h - 14 + 14 + i * 36));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  sp.scale.set(1.9, 0.6, 1); sp.position.y = 2.75; sp.renderOrder = 11;
  r.model.root.add(sp); r.bubble = sp; r.bubbleT = 7;
}
function onCaught(from, p) { const r = remotes.get(from); toast(`${r ? r.name : 'Someone'} was caught by the staff${p.n ? ` after ${p.n} night${p.n === 1 ? '' : 's'}` : ''}.`); }
function onNeed(from) {
  // Send the newcomer every change, in parts small enough for the server.
  const mods = world.allMods(), size = 80, n = Math.max(1, Math.ceil(mods.length / size));
  for (let i = 0; i < n; i++) net.send('full', { to: from, i, n, m: mods.slice(i * size, (i + 1) * size), d: clock.day, t: clock.t, k: DAY_SCALE });
}
function onFull(p) {
  if (!Array.isArray(p.m)) return;
  pendingFull.got = true;
  if (net.isPublic && !offered) { offered = true; setTimeout(pubOffer, 1500); }
  for (const [id, s] of p.m) if (typeof id === 'string') world.applyState(id, s);
  onClock(p);
}

// ---------------------------------------------------------------- host: requests and changes
function broadcastItems(ids, extra) {
  const u = [];
  for (const id of ids) {
    const it = world.items.get(id); if (!it) continue;
    const st = world.stateOf(it);
    if (extra && extra[id]) Object.assign(st, extra[id]);
    world.mods.set(id, world.stateOf(it));
    st.tm = Date.now(); world.modTime.set(id, st.tm); liveIds.add(id);
    u.push([id, st]);
  }
  if (u.length) net.send('w', { u });
}
// The host applies a request (its own or someone else's) and tells everyone.
// Furniture stays exactly where it's put, even in mid-air.
function hostRequest(from, q) {
  if (!q || typeof q.id !== 'string') return;
  const it = world.items.get(q.id);
  if (!it) return;
  const echo = { [it.id]: { rf: from, rs: q.s | 0 } };
  if (q.a === 'take') {
    if (it.k === 'i') {
      if (world.isGone(it) && from !== net.id) { echo[it.id].rj = 1; broadcastItems([it.id], echo); return; }
      world.edit(it, { g: true, d: restockEpoch(clock.day) });
      broadcastItems([it.id], echo);
      return;
    }
    if (world.isGone(it) || (it.c && it.c !== from)) { broadcastItems([it.id], echo); return; }
    world.edit(it, { c: from });
    broadcastItems([it.id], echo);
  } else if (q.a === 'drop' && it.k === 'i') {
    // food or a kit put down from someone's inventory (so it must be taken)
    if (!it.g && from !== net.id) { broadcastItems([it.id], echo); return; }
    world.edit(it, { x: num(q.x, it.x), y: clamp(num(q.y), 0, CEIL), z: num(q.z, it.z), g: false, c: null });
    broadcastItems([it.id], echo);
  } else if (q.a === 'use') {
    const u = it.k === 'f' && TYPES[it.t].use;
    if (u === 'gift' && !it.c && !world.isGone(it)) {
      // a gift box opens into something: usually food, sometimes a kit or a torch
      world.edit(it, { g: true });
      const roll = Math.random(), t = roll < 0.15 ? 'medkit' : roll < 0.25 ? 'torch' : FOOD_KEYS[(Math.random() * FOOD_KEYS.length) | 0];
      const nid = 'gift:' + it.id + ':' + Date.now().toString(36);
      const b = world.itemBox(it);
      world.applyState(nid, { t, k: 'i', v: 0, x: it.x, y: b.y0, z: it.z, r: 0 });
      broadcastItems([it.id, nid], echo);
      return;
    }
    if ((u === 'strip' || u === 'colour' || u === 'tv') && !it.c && !world.isGone(it)) world.edit(it, { s: q.s == null ? (it.s ? 0 : 1) : Math.max(0, Math.min(u === 'tv' ? TV_CHANNELS : 7, q.s | 0)) });
    else if (u && !['flush', 'gift', 'squeak', 'drum', 'tune', 'boot'].includes(u) && !it.c && !world.isGone(it)) world.edit(it, { s: it.s ? 0 : 1 });
    broadcastItems([it.id], echo);
  } else if (q.a === 'place') {
    if (it.c !== from) { broadcastItems([it.id], echo); return; }
    const x = num(q.x, it.x), y = clamp(num(q.y), 0, CEIL), z = num(q.z, it.z);
    const o = cleanQuat(q.o);
    world.edit(it, o ? { x, y, z, o, a: !!q.an, c: null } : { x, y, z, r: (q.r | 0) & 3, tl: ((q.tl | 0) % 3 + 3) % 3, o: null, a: !!q.an, c: null });
    broadcastItems([it.id], echo);
  }
}
// Ask the host; if we are the host, just do it.
function request(q) {
  if (net.isHost()) { hostRequest(net.id, q); return; }
  q.s = ++reqSeq; pending.set(q.id, { s: q.s, t: performance.now() });
  net.send('q', q);
}
// The staff give you a few seconds after the lights go out before they start.
const staffEnv = () => ({ hostile: isHostile(clock.t) && clock.t >= DAY_LEN + 5, event: '' });
// A shove, on the host: knock the member of staff down (or, in fog, it hurts you).
function onPushRequest(from, p) {
  if (!staffSim) return;
  const who = from === net.id ? P : (remotes.get(from) || {}).st;
  if (!who) return;
  const res = staffSim.push(p.id | 0, who.x, who.z, staffEnv());
  if (res === 'immune') { if (from === net.id) hurt(10, 'staff'); else net.send('h', { to: from, d: 10 }); }
}
function onWhistle(from, p) {
  const x = num(p.x), y = clamp(num(p.y), 0, CEIL), z = num(p.z), long = !!p.k, d = Math.hypot(x - P.x, y - P.y, z - P.z);
  const r = remotes.get(from), name = r ? r.name : 'Someone';
  const hear = long ? WHISTLE.hearLong : WHISTLE.hear;
  if (d < hear) sfx.whistle(panTo(x, z), Math.max(0.12, 1 - d / hear), long, d / hear);
  if (d < WHISTLE.tagRange) {
    addBeacon(x, y + 2.2, z, name, long);
    toast(`${name} ${long ? 'is whistling for help' : 'whistled'} (${Math.round(d)} m ${dirWord(x, z)}).`);
  }
  if (r) showBubble(r, long ? '!! Help' : '!');
  if (staffSim && isHostile(clock.t)) staffSim.noise(x, z, long ? WHISTLE.staffLong : WHISTLE.staff);
}
// Where a sound at (x, z) sits left to right for you (-1 to 1), and which way it is in words.
function panTo(x, z) { const a = Math.atan2(x - P.x, z - P.z) - P.yaw; return clamp(-Math.sin(a), -1, 1); }
function dirWord(x, z) {
  let a = Math.atan2(-(x - P.x), -(z - P.z)) - P.yaw; // 0 = straight ahead
  a = ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const k = Math.round(a / (Math.PI / 4));
  return ['behind you', 'behind you to the right', 'to your right', 'ahead to the right', 'ahead', 'ahead to the left', 'to your left', 'behind you to the left', 'behind you'][k + 4];
}

// ---------------------------------------------------------------- player
function hurt(d, why) {
  if (!P.alive || mode !== 'play') return;
  P.hp -= d; P.hurtT = 0; feel.shake = Math.min(1, 0.5 + d / 30);
  $('hurt').style.opacity = 1; setTimeout(() => { $('hurt').style.opacity = 0; }, 180);
  sfx.hurt();
  if (P.hp <= 0) die(why);
}
function die(why) {
  P.hp = 0; P.alive = false; P.deadAt = performance.now();
  P.respawnT = 2.5; // the Wake up button unlocks after a moment
  P.using = null;
  sfx.death();
  if (P.carry) { // let go of what we carried where we stand
    const it = world.items.get(P.carry.id);
    if (it) request({ a: 'place', id: it.id, x: P.x, y: world.supportHeight(P.x - 0.3, P.z - 0.3, P.x + 0.3, P.z + 0.3, P.y + 0.1, it), z: P.z, o: P.carry.o, an: 0 });
    P.carry = null;
  }
  P.inv = new Array(INV).fill(null); P.invId = new Array(INV).fill(null); buildHotbar();
  for (let i = waypoints.length - 1; i >= 0; i--) if (waypoints[i].death) waypoints.splice(i, 1);
  waypoints.push({ x: P.x, y: P.y + 1, z: P.z, name: 'Where you were caught', death: true });
  $('death').classList.remove('hidden');
  const head = { hunger: 'You starved.', fall: 'You fell too far.', food: 'Something you ate finished you off.', glass: 'You cut yourself on broken glass.' }[why] || 'You were caught.';
  $('death-head').textContent = head;
  $('death-msg').textContent = `You survived ${P.nights} night${P.nights === 1 ? '' : 's'}.`;
  const L = P.life || {};
  const fav = L.ate ? Object.entries(L.ate).sort((a, b) => b[1] - a[1])[0] : null;
  $('death-stats').innerHTML = [['Furniture placed', L.placed | 0], ['Staff shoved', L.shoves | 0], ['Things eaten', L.eaten | 0], ['Favourite food', fav ? `${ITEMS[fav[0]].name} (${fav[1]})` : '—'], ['Distance walked', `${Math.round(L.dist || 0)} m`], ['Highest point', `${(L.high || 0).toFixed(1)} m`]]
    .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
  $('death-wake').disabled = true;
  if (document.pointerLockElement) document.exitPointerLock?.();
  net.send('x', { n: P.nights, w: why });
  $('death-best').textContent = `Day ${clock.day} · your best: ${Math.max(stats.best, P.nights)} night${Math.max(stats.best, P.nights) === 1 ? '' : 's'}`;
  P.nights = 0;
}
function respawn() {
  // Wake up somewhere else in the store.
  const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60;
  spawnAt(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 10);
  Object.assign(P, { hp: 100, food: 70, en: 70, alive: true, vy: 0, hurtT: 99, life: {} });
  $('death').classList.add('hidden');
  announce('You wake up in another aisle', 'Your things are gone. A marker shows where you were caught.', 5);
}

const CHAT_TIPS = [
  'A bowl of stew fills you up more than anything else in the cafeteria.',
  'Hold H for a long whistle. Friends see "needs help" over where you are.',
  'At night, bang a toy drum somewhere else to pull the staff away, then run.',
  'Sit down (F on a chair or sofa) to get your breath back faster.',
  'Walk into a ball to kick it. Sprint into it to kick it further.',
  'Staff can see straight through pallets, coffee tables and ladders. Use something solid.',
  'A beanbag breaks a fall from any side. A bed or a sofa only from on top.',
  'Each shove costs energy. Keep a drink for nights.',
  'Hold F to wind up a throw. Let go of F to throw it.',
  'Press F on a lamp to switch it off before the staff notice it.',
  'Crouch while sprinting to slide under a gap.',
  'Read the pillar screens to tell your friends where you are.',
  'Nights get a little longer every day.',
  'Food comes back on Mondays and Fridays.',
  'A closed door stops the staff. They can\'t open it.',
  'Broken glass in the garden rooms will hurt you if you use it.',
  'Light strips that touch each other change colour together.',
  'A head torch lights the way while it\'s in your hand. Click to switch it on.',
  'A giant plush bear breaks a fall from any side.',
  'Gift boxes have something inside. Press F to open one.',
];
const life = () => P.life || (P.life = {}); // this life's numbers, for the death screen
// A hard landing. Beds, sofas and mattresses soften it if you land on top of
// them; a beanbag softens it from any side (more). A long drop onto a bed
// bounces you back up.
function landed(v) {
  let soft = null, plush = false;
  world.forBoxes(P.x - 0.2, P.z - 0.2, P.x + 0.2, P.z + 0.2, (b) => {
    if (!b.item || b.item.k !== 'f' || Math.abs(b.y1 - P.y) > 0.08) return;
    const t = TYPES[b.item.t]; if (!t.soft) return;
    if (t.plush) plush = true;
    if (t.soft === 'any') soft = 'any';
    else if (!soft && b.y1 >= world.itemBox(b.item).y1 - 0.25) soft = 'top';
  });
  const k = soft === 'any' ? 1.66 : soft === 'top' ? 1.38 : 1;
  const raw = (v - 13) * 9, dmg = plush ? 0 : Math.max(0, (v - 13 * k) * 9 / k); // a giant plush bear takes the whole fall
  if (soft && raw >= P.hp && dmg < P.hp) { ach.unlock('cushion'); if (plush) ach.unlock('bear'); toast('That would have killed you. The cushioning saved you.'); }
  if (soft === 'top' && v > 16) { P.vy = v * 0.35; P.onGround = false; }
  if (dmg > 0) hurt(dmg, 'fall');
}
function updatePlayer(dt) {
  const k = input.keys;
  const busy = paused || chatOpen || invOpen;
  if (!paused && !chatOpen && !invOpen) {
    P.yaw -= input.lookDX * 0.0022 * settings.sens;
    P.pitch = clamp(P.pitch - input.lookDY * 0.0022 * settings.sens * (settings.invert ? -1 : 1), -1.5, 1.5);
  }
  let fx = 0, fz = 0;
  if (!busy && P.alive) {
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    fx += input.move.x; fz += input.move.y;
  }
  const m = Math.hypot(fx, fz);
  if (m > 1) { fx /= m; fz /= m; }
  const moving = m > 0.1;
  // Sitting: you stay on the seat until you move, jump or crouch (or someone
  // takes the seat away).
  if (P.sit) {
    const it = world.items.get(P.sit.id);
    const gone = !P.alive || !it || !world.active(it) || it.c || Math.abs(it.x - P.sit.ix) > 0.01 || Math.abs(it.y - P.sit.iy) > 0.01 || Math.abs(it.z - P.sit.iz) > 0.01;
    if (gone || (!busy && (moving || k.has('Space') || k.has('KeyC')))) standUp(gone ? null : it);
    else { P.x = P.sit.x; P.y = P.sit.y; P.z = P.sit.z; P.vy = 0; P.onGround = true; }
  }
  // Crouch (C or Ctrl): low enough to get through gaps the staff can't.
  const wantCrouch = !busy && P.alive && (k.has('KeyC') || (!P.carry && (k.has('ControlLeft') || k.has('ControlRight'))));
  // crouching while sprinting is a slide: a burst along the ground, harder when you're hurt
  if (wantCrouch && !P.crouch && P.sprinting && P.onGround && !P.carry) {
    const cost = 4 * (1 + (1 - P.hp / 100));
    if (P.en >= cost) {
      P.en -= cost; P.slideT = 0.75;
      P.slideX = -Math.sin(P.yaw) * (fz < 0 ? 1 : 0) + Math.cos(P.yaw) * fx * 0.5; P.slideZ = -Math.cos(P.yaw) * (fz < 0 ? 1 : 0) - Math.sin(P.yaw) * fx * 0.5;
      const l = Math.hypot(P.slideX, P.slideZ) || 1; P.slideX /= l; P.slideZ /= l;
      sfx.slide(); ach.count('slides', 'slide', 10);
    }
  }
  if (wantCrouch && !P.crouch) { P.crouch = true; P.height = 1.0; }
  else if (!wantCrouch && P.crouch && bodyFits(world, P.x, P.y, P.z, P.radius - 0.02, 1.75)) { P.crouch = false; P.height = 1.75; }
  const wantSprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && moving && fz < 0.3 && !P.crouch;
  const sprint = wantSprint && P.en > 0;
  P.sprinting = sprint;
  const speed = (P.crouch ? 2.2 : sprint ? 7.4 : 4.6) * (P.carry ? 0.85 : 1);
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let dx = (fx * cos + fz * sin) * speed * dt, dz = (-fx * sin + fz * cos) * speed * dt;
  if (P.slideT > 0) { // sliding: fast, then slowing to a crouch
    P.slideT -= dt;
    const v = 3 + 7.5 * Math.max(0, P.slideT / 0.75);
    dx = P.slideX * v * dt; dz = P.slideZ * v * dt;
    if (!P.onGround || P.slideT <= 0) P.slideT = 0;
  }
  if (!busy && P.alive && k.has('Space') && P.onGround) { P.vy = 7.2; P.onGround = false; P.en = Math.max(0, P.en - 1.5); }
  // walk into a ladder to climb it (shelving can't be climbed: stack furniture)
  P.canClimb = !busy && P.alive && fz < -0.3;
  const ox = P.x, oz = P.z, wasAir = !P.onGround;
  P.landSpeed = 0;
  world.withHeld = true;
  if (P.alive && !P.sit) { moveBody(world, P, dx, dz, dt); rideHeld(); if (!P.carry && !busy) kickBalls(P.x - ox, P.z - oz, dt, sprint); }
  world.withHeld = false;
  P.speed = Math.hypot(P.x - ox, P.z - oz) / dt;
  if (P.alive) { life().dist = (life().dist || 0) + Math.min(1, Math.hypot(P.x - ox, P.z - oz)); if (P.onGround && P.y > (life().high || 0)) life().high = P.y; }
  if (wasAir && P.onGround && P.landSpeed > 4) { sfx.land(); feel.dip = Math.min(0.5, P.landSpeed * 0.035); }
  if (P.landSpeed > 13) landed(P.landSpeed);
  // footsteps
  if (P.onGround && P.speed > 0.5) { P.stepAcc += P.speed * dt; if (P.stepAcc > (sprint ? 2.2 : 1.7)) { P.stepAcc = 0; if (P.y < 0.05 && world.sectionAt(P.x, P.z) === 'garden') sfx.grassStep(); else sfx.step(!sprint); } }
  if (P.alive) {
    // Energy: sprinting burns it; a moment after you stop it comes back by
    // itself, quickly standing still, slowly walking, and more slowly the
    // hungrier or more hurt you are (not at all when starving). Food and drink
    // still give it back at once.
    const hurtK = 1 + 0.8 * (1 - P.hp / 100);
    if (sprint || P.slideT > 0 || !P.onGround) P.restT = 0; else P.restT = (P.restT || 0) + dt;
    if (sprint) P.en = Math.max(0, P.en - (3.2 + (P.carry ? 0.15 : 0)) * hurtK * dt);
    else if (P.restT > 1.2 && P.food > 0) {
      const regen = (moving ? 0.6 : P.sit ? 3.0 : 2.0) * (P.carry ? 0.6 : 1) * (0.4 + 0.6 * P.food / 100) / hurtK;
      P.en = Math.min(100, P.en + regen * dt);
    }
    // Hunger runs down more slowly, and faster the less energy you have (twice as
    // fast with none). No food, and your health goes quickly.
    P.food = Math.max(0, P.food - dt * (100 / 1100) * (P.en <= 0 ? 2 : 1 + 0.5 * (1 - P.en / 100)) * (sprint ? 1.3 : 1));
    if (P.food <= 0) { P.hp -= dt * 1.5; if (P.hp <= 0) die('hunger'); }
    // a growling stomach, and a heart you can hear when you're nearly done
    if (P.food < 10) { P.growlT = (P.growlT || 0) - dt; if (P.growlT <= 0) { P.growlT = 35; sfx.growl(); } } else P.growlT = 0;
    if (P.hp <= 10) { P.beatT = (P.beatT || 0) - dt; if (P.beatT <= 0) { P.beatT = 0.95; sfx.heartbeat(); } }
    P.hurtT += dt;
    // a first aid kit takes a moment
    if (P.using) {
      P.using.t -= dt;
      if (P.using.t <= 0) { const u = P.using; P.using = null; applyItem(u.key); }
    }
  }
  updateWhistle(dt);
  if (P.y < -5) { P.y = 0; } // safety
}


// ---------------------------------------------------------------- ray picking
// A ray against the collision boxes (and, if asked, food and rugs). Returns
// { t, box, n:[x,y,z] } for the nearest hit, or the floor.
function raycast(ox, oy, oz, dx, dy, dz, maxT, withSmall) {
  let best = { t: maxT, box: null, n: null };
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  const test = (b) => {
    let t0 = 0, t1 = best.t, nAxis = -1, nSign = 0;
    const o = [ox, oy, oz], d = [dx, dy, dz], lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return; continue; }
      let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a], s = -1;
      if (ta > tb) { const tt = ta; ta = tb; tb = tt; s = 1; }
      if (ta > t0) { t0 = ta; nAxis = a; nSign = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return;
    }
    if (t0 > 0 && t0 < best.t && nAxis >= 0) { const n = [0, 0, 0]; n[nAxis] = nSign; best = { t: t0, box: b, n }; }
  };
  world.forBoxes(Math.min(ox, ex) - 0.1, Math.min(oz, ez) - 0.1, Math.max(ox, ex) + 0.1, Math.max(oz, ez) + 0.1, test);
  if (withSmall) world.forItems(Math.min(ox, ex) - 0.5, Math.min(oz, ez) - 0.5, Math.max(ox, ex) + 0.5, Math.max(oz, ez) + 0.5, (it) => {
    if (!world.active(it)) return;
    if (it.k === 'i' || TYPES[it.t].flat) { const b = world.itemBox(it); if (it.k === 'f') b.y1 = b.y0 + 0.06; test(b); }
  });
  if (dy < 0) { const tf = -oy / dy; if (tf > 0 && tf < best.t) best = { t: tf, box: null, n: [0, 1, 0], floor: true }; }
  return best;
}

let target = null, placement = null;
function eye() { return [P.x, P.y + P.eyeH, P.z]; }
function lookDir() { const cp = Math.cos(P.pitch); return [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp]; }

// The member of staff you're facing, close enough to shove.
function staffInReach() {
  let best = null, bd = 3.0;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  for (const [id, v] of staffViews) {
    const p = v.model.root.position, dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
    if (d > bd || Math.abs(p.y - P.y) > 1.8) continue;
    if ((dx * fx + dz * fz) / (d || 1) < 0.8) continue;
    bd = d; best = id;
  }
  return best;
}

function updateInteraction(dt) {
  target = null; placement = null;
  highlight.visible = false; holdBox.visible = false;
  const prompt = $('prompt');
  let text = '';
  if (!P.alive || paused || invOpen) { prompt.classList.add('hidden'); return; }
  const [ex, ey, ez] = eye(), [dx, dy, dz] = lookDir();
  const pressedUse = input.pressed.has('KeyE');
  const clicked = input.clicked || input.pressed.has('Mouse0');
  if (!P.carry) {
    const hit = raycast(ex, ey, ez, dx, dy, dz, 3.2, true);
    const it = hit.box && hit.box.item;
    if (it && world.active(it)) {
      target = it;
      const b = world.itemBox(it);
      highlight.box.min.set(b.x0, b.y0, b.z0); highlight.box.max.set(b.x1, Math.max(b.y1, b.y0 + 0.05), b.z1);
      highlight.visible = true;
      if (it.k === 'i') {
        const free = P.inv.indexOf(null);
        const info = ITEMS[it.t];
        text = free >= 0 ? `<b>E</b> Take ${info.name} <span class="stat">${itemStats(info)}</span>` : 'Your inventory is full (16 items)';
        if ((pressedUse || (IS_TOUCH && clicked)) && free >= 0) {
          P.inv[free] = it.t; P.invId[free] = it.id; buildHotbar(); sfx.pick();
          if (!P.inv.includes(null)) ach.unlock('full');
          if (!net.isHost()) { world.edit(it, { g: true, d: restockEpoch(clock.day) }); }
          request({ a: 'take', id: it.id });
        }
      } else {
        // Hold E to pick a piece up: half a second, longer for heavy ones.
        const t = TYPES[it.t], need = t.heavy || 0.5;
        if (input.keys.has('KeyE')) { if (P.pickId !== it.id) { P.pickId = it.id; P.pickT = 0; } P.pickT += dt; }
        else P.pickId = null;
        const pct = P.pickId === it.id ? Math.min(1, P.pickT / need) : 0;
        const left = need - (P.pickId === it.id ? P.pickT : 0);
        text = pct > 0 ? `Picking up ${t.name}… <span class="stat">${Math.round(pct * 100)}%${need > 10 ? ` · ${Math.floor(left / 60)}:${String(Math.ceil(left % 60)).padStart(2, '0')} left` : ''}</span>` : `<b>Hold E</b> Pick up ${t.name}${need > 60 ? ' <span class="stat">(very heavy: takes about 5½ minutes)</span>' : need > 1 ? ' <span class="stat">(heavy)</span>' : ''}`;
        if (t.use) text += ` · <b>F</b> ${useWord(it)}`;
        else if (t.seat && !P.sit) text += ' · <b>F</b> sit';
        if (pct >= 1) { P.pickId = null; if (it.t === 'safe') ach.unlock('patience'); pickUp(it); }
        else if (t.use && input.pressed.has('KeyF')) useItem(it);
        else if (t.seat && !P.sit && input.pressed.has('KeyF')) sitDown(it, ex + dx * hit.t, ez + dz * hit.t);
      }
    }
    // A click shoves the member of staff in front of you, or uses the selected item.
    const sid = staffInReach();
    if (sid != null && !target) text = text || '<b>Click</b> Shove';
    if (clicked && !(IS_TOUCH && target && target.k === 'i')) {
      if (sid != null && isHostile(clock.t)) shove(sid);
      else useSelected();
    }
  } else {
    // Holding a piece: it floats where you aim, like dragging it with your
    // hands out. R turns it about the chosen axis (1/2/3, or T to cycle);
    // Ctrl turns it a little (15°), Shift a quarter turn, Ctrl+Shift+R squares
    // it up. Let go touching anything and it stays put (click); let go in
    // mid-air and it drops.
    const c = P.carry, t = TYPES[c.t];
    // Ctrl (or Alt: Ctrl+W can't be stopped from closing the tab) turns in small steps
    const ctrl = input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('AltLeft') || input.keys.has('AltRight');
    const shift = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    for (let i = 1; i <= 3; i++) if (input.pressed.has('Digit' + i)) c.axis = i - 1;
    if (input.pressed.has('KeyT')) c.axis = (c.axis + 1) % 3;
    if (input.pressed.has('KeyR') || input.rclicked) {
      if (ctrl && shift && input.pressed.has('KeyR')) c.q.identity();
      else {
        const step = (ctrl ? 15 : shift ? 90 : 45) * Math.PI / 180;
        c.q.premultiply(_rq.setFromAxisAngle(rotAxis(c.axis), step)).normalize();
      }
      c.o = cleanQuat([c.q.x, c.q.y, c.q.z, c.q.w]);
      sfx.click();
    }
    if (input.wheel) P.carryDist = clamp(P.carryDist - input.wheel * 0.4, 1.5, 4.5);
    // hold F to wind up a throw, let go to throw it
    if (input.keys.has('KeyF')) c.charge = Math.min(1, (c.charge || 0) + dt / 1.1);
    else if (c.charge > 0) { const k = c.charge; c.charge = 0; throwCarry(k); return; }
    const [w, h, d] = itemDims(c.t, 0, 0, c.o);
    const hit = raycast(ex, ey, ez, dx, dy, dz, P.carryDist, false);
    const hp = [ex + dx * hit.t, ey + dy * hit.t, ez + dz * hit.t];
    let px = hp[0], pz = hp[2], py;
    if (hit.n && hit.n[1] > 0.5) py = hp[1];                         // resting on top of something
    else if (hit.n && hit.n[1] < -0.5) py = hp[1] - h;               // pressed up under something
    else if (hit.n) { px += hit.n[0] * (w / 2 + 0.01); pz += hit.n[2] * (d / 2 + 0.01); py = hp[1] - h / 2; } // against a side
    else py = hp[1] - h / 2;                                         // in mid-air
    if (settings.snap) { const g = settings.snap; px = Math.round(px / g) * g; pz = Math.round(pz / g) * g; if (!(hit.n && hit.n[1] > 0.5)) py = Math.round(py / g) * g; }
    py = clamp(py, 0, CEIL - h);
    // the piece follows your aim with a little lag, like something heavy
    const k = c.fresh ? 1 : 1 - Math.exp(-dt * 24); // stiff, smooth follow
    c.fresh = false;
    const ox = c.x, oy = c.y, oz = c.z;
    c.x += (px - c.x) * k; c.y += (py - c.y) * k; c.z += (pz - c.z) * k;
    // how fast your hands are moving it (it keeps that when you let go)
    if (dt > 0) { const kv = Math.min(1, dt * 12); c.vel = c.vel || [0, 0, 0]; c.vel[0] += ((c.x - ox) / dt - c.vel[0]) * kv; c.vel[1] += ((c.y - oy) / dt - c.vel[1]) * kv; c.vel[2] += ((c.z - oz) / dt - c.vel[2]) * kv; }
    c.dq.slerp(c.q, 1 - Math.exp(-dt * 22));
    const item = world.items.get(c.id);
    const sticks = touches(c.t, c.o, c.x, c.y, c.z, item);
    c.sticks = sticks;
    // you can't let go of it on top of someone (a player or a member of staff)
    c.blocked = onSomeone(c.t, c.o, c.x, c.y, c.z);
    placement = { x: c.x, y: c.y, z: c.z, o: c.o, ok: true, sticks };
    holdBox.box.min.set(c.x - w / 2, c.y, c.z - d / 2); holdBox.box.max.set(c.x + w / 2, c.y + h, c.z + d / 2);
    holdBox.material.color.setHex(c.blocked ? 0xff4444 : sticks ? 0x44ff66 : 0xffffff);
    holdBox.visible = true;
    const axisName = ['X', 'Y', 'Z'][c.axis];
    if (c.charge > 0) text = `Throwing ${t.name}… <span class="stat">${Math.round(c.charge * 100)}% power</span>`;
    else text = `Holding ${t.name} · <b>E</b>/click let go ${c.blocked ? '<span class="stat">(not on someone)</span>' : sticks ? '<span class="stat">(stays put)</span>' : '<span class="stat">(falls)</span>'} · <b>R</b> rotate on <b>${axisName}</b> (<b>1 2 3</b> axis · <b>Ctrl</b> 15° · <b>Shift</b> 90°) · <b>wheel</b> closer/farther · hold <b>F</b> throw`;
    if (pressedUse || clicked || input.pressed.has('KeyQ')) letGo();
  }
  if (P.using) text = `Using ${ITEMS[P.using.key].name}… ${Math.max(0, P.using.t).toFixed(1)} s`;
  if (text) { prompt.innerHTML = text; prompt.classList.remove('hidden'); } else prompt.classList.add('hidden');
}
function pickUp(it) {
  const q = itemQuat(it.r, it.tl, it.o);
  const [w, h, d] = itemDims(it.t, it.r, it.tl, it.o);
  const [ex, ey, ez] = eye();
  P.carryDist = clamp(Math.hypot(it.x - ex, it.y + h / 2 - ey, it.z - ez), 1.5, 4.5);
  P.carry = { id: it.id, t: it.t, v: it.v, q, dq: q.clone(), o: cleanQuat([q.x, q.y, q.z, q.w]), axis: 1, x: it.x, y: it.y, z: it.z, sticks: true, fresh: false };
  sfx.pick();
  if (!net.isHost()) { world.edit(it, { c: net.id }); }
  request({ a: 'take', id: it.id });
}
// The axis R turns about: 1 is side to side (tips it toward you), 2 is upright
// (spins it), 3 is front to back (rolls it). Side and front follow where you
// face, squared to the store's grid.
const _rq = new THREE.Quaternion(), _ra = new THREE.Vector3();
function rotAxis(i) {
  if (i === 1) return _ra.set(0, 1, 0);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  const alongX = Math.abs(fx) > Math.abs(fz); // facing mostly along x
  if (i === 2) return alongX ? _ra.set(Math.sign(fx), 0, 0) : _ra.set(0, 0, Math.sign(fz));
  return alongX ? _ra.set(0, 0, -Math.sign(fx)) : _ra.set(Math.sign(fz), 0, 0);
}
// Collision boxes of a piece at a pose, in world space.
function poseBoxes(t, o, x, y, z, out = []) {
  const parts = itemParts(t, 0, 0, o);
  if (parts) for (const p of parts) out.push({ x0: x + p[0], y0: y + p[1], z0: z + p[2], x1: x + p[3], y1: y + p[4], z1: z + p[5] });
  else { const [w, h, d] = itemDims(t, 0, 0, o); out.push({ x0: x - w / 2, y0: y, z0: z - d / 2, x1: x + w / 2, y1: y + h, z1: z + d / 2 }); }
  return out;
}
// Is a piece at this pose touching or overlapping anything (the floor, a wall,
// a pillar, the ceiling, other furniture)? Then letting go leaves it fixed.
function touches(t, o, x, y, z, skip) {
  if (y <= 0.03) return true;
  const g = 0.04;
  for (const b of poseBoxes(t, o, x, y, z)) {
    if (b.y1 >= CEIL - 0.03) return true;
    let hit = false;
    world.forBoxes(b.x0 - g, b.z0 - g, b.x1 + g, b.z1 + g, (o2) => {
      if (hit || (o2.item && o2.item === skip)) return;
      if (o2.y1 > b.y0 - g && o2.y0 < b.y1 + g) hit = true;
    });
    if (hit) return true;
  }
  return false;
}
// Is a piece at this pose overlapping a player (you or a friend) or a member of staff?
function onSomeone(t, o, x, y, z) {
  const bodies = [{ x: P.x, y: P.y, z: P.z, h: P.height }];
  for (const r of remotes.values()) if (r.st && r.st.a) bodies.push({ x: r.model.root.position.x, y: r.model.root.position.y, z: r.model.root.position.z, h: 1.75 });
  for (const v of staffViews.values()) bodies.push({ x: v.model.root.position.x, y: v.model.root.position.y, z: v.model.root.position.z, h: 1.9 });
  for (const b of poseBoxes(t, o, x, y, z)) for (const q of bodies) {
    if (b.x1 > q.x - 0.3 && b.x0 < q.x + 0.3 && b.z1 > q.z - 0.3 && b.z0 < q.z + 0.3 && b.y1 > q.y + 0.05 && b.y0 < q.y + q.h) return true;
  }
  return false;
}
function letGo() {
  const c = P.carry; if (!c) return;
  if (c.blocked) { sfx.deny(); return; }
  const item = world.items.get(c.id);
  if (touches(c.t, c.o, c.x, c.y, c.z, item)) { placeCarry({ x: c.x, y: c.y, z: c.z, o: c.o, a: 1 }); return; }
  // nothing touching: it falls on its own, keeping how your hands were moving it
  const hv = c.vel || [0, 0, 0], sp = Math.hypot(hv[0], hv[1], hv[2]), lim = sp > 7 ? 7 / sp : 1;
  launchBody(c, new THREE.Vector3(hv[0] * lim, hv[1] * lim, hv[2] * lim), new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
  P.carry = null;
}
function placeCarry(p, carry = P.carry, quiet = false) {
  const id = carry.id;
  const it = world.items.get(id);
  if (it && !net.isHost()) { world.edit(it, { x: p.x, y: p.y, z: p.z, o: p.o, a: !!p.a, c: null }); }
  if (P.carry === carry) P.carry = null;
  if (!quiet) {
    if (p.a) sfx.place(); else sfx.land();
    ach.count('placed', 'build50', 50); ach.count('placed2', 'build500', 500);
    life().placed = (life().placed | 0) + 1;
  }
  request({ a: 'place', id, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), o: p.o, an: p.a ? 1 : 0 });
}
// Sit down on a chair, sofa, bench, stool or bed (F). You sit where you aim
// along it, facing however you like; you get your breath back faster sitting.
const _sq = new THREE.Quaternion(), _sv = new THREE.Vector3();
function sitDown(it, hx, hz) {
  const t = TYPES[it.t];
  if (P.carry || it.c || !P.onGround) return;
  const q = itemQuat(it.r, it.tl, it.o, _sq);
  if (_sv.set(0, 1, 0).applyQuaternion(q).y < 0.99) { sfx.deny(); toast("You can't sit on that while it's on its side."); return; }
  // where you aimed, in the seat's own space: along its width, at its seat line
  _sv.set(hx - it.x, 0, hz - it.z).applyQuaternion(q.clone().invert());
  const half = t.w / 2 - 0.3;
  _sv.x = half > 0 ? clamp(_sv.x, -half, half) : 0; _sv.z = t.seat[1]; _sv.y = 0;
  _sv.applyQuaternion(q);
  const b = world.itemBox(it);
  const x = clamp(it.x + _sv.x, b.x0 + 0.05, b.x1 - 0.05), z = clamp(it.z + _sv.z, b.z0 + 0.05, b.z1 - 0.05), y = it.y + t.seat[0];
  // room to sit up (a table top or the bunk above you is in the way)
  let blocked = false;
  world.forBoxes(x - 0.18, z - 0.18, x + 0.18, z + 0.18, (o) => { if (o.item !== it && o.y1 > y + 0.05 && o.y0 < y + 0.95) blocked = true; });
  if (blocked) { sfx.deny(); toast("There isn't room to sit there."); return; }
  P.sit = { id: it.id, x, y, z, ix: it.x, iy: it.y, iz: it.z };
  P.crouch = false; P.slideT = 0; P.vy = 0;
  sfx.place();
  if (!stats.sitTip) { stats.sitTip = 1; saveStats(); toast('You sit down. You get your breath back faster sitting. Move, jump or crouch to stand up.'); }
}
// Get up: step off the front of the seat (or wherever there's room), else
// stand on top of it.
function standUp(it) {
  const s = P.sit; P.sit = null;
  if (!it) return; // the seat's gone: you're left where you were
  for (const r of [0.5, 0.8, 1.2]) for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const a = P.yaw + k * Math.PI / 4, x = s.x - Math.sin(a) * r, z = s.z - Math.cos(a) * r;
    const y = world.supportHeight(x - 0.15, z - 0.15, x + 0.15, z + 0.15, s.y + 0.1, null);
    if (y > s.y - 1.2 && bodyFits(world, x, y, z, P.radius, P.height)) { P.x = x; P.y = y; P.z = z; return; }
  }
  const top = world.itemBox(it).y1;
  if (bodyFits(world, s.x, top, s.z, P.radius, P.height)) P.y = top;
}
// Walk into a ball and you kick it: harder the faster you're going.
const kickedAt = new Map();
function kickBalls(mx, mz, dt, sprint) {
  const sp = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
  if (sp < 0.6) return;
  const now = performance.now();
  world.forItems(P.x - 1, P.z - 1, P.x + 1, P.z + 1, (it) => {
    const t = it.k === 'f' && TYPES[it.t];
    if (!t || !t.ball || !world.active(it) || now - (kickedAt.get(it.id) || 0) < 400) return;
    const r = t.ball[0], bx = it.x - P.x, bz = it.z - P.z, d = Math.hypot(bx, bz);
    if (d > P.radius + r + 0.1 || it.y > P.y + 1.0 || it.y + 2 * r < P.y - 0.05) return;
    const ux = bx / Math.max(d, 1e-4), uz = bz / Math.max(d, 1e-4);
    if ((mx * ux + mz * uz) / Math.hypot(mx, mz) < 0.2) return; // only what you're walking into
    kickedAt.set(it.id, now);
    const power = sp * 1.1 + (sprint ? 1.8 : 0.6), lift = (sprint ? 2.6 : 1.4) * Math.min(1, 0.25 / r);
    const c = { id: it.id, t: it.t, v: it.v, x: it.x, y: it.y, z: it.z, o: [0, 0, 0, 1] };
    if (!net.isHost()) world.edit(it, { c: net.id });
    request({ a: 'take', id: it.id });
    launchBody(c, new THREE.Vector3(ux * power, lift, uz * power), new THREE.Vector3());
    sfx.bounce(r, 0.8);
  });
}
// Noisy toys: you hear them nearby, and at night the staff come to look.
const NOISES = { squeak: 12, tune: 20, drum: 35 };
function makeNoise(kind) {
  const p = { x: +P.x.toFixed(1), y: +P.y.toFixed(1), z: +P.z.toFixed(1), k: kind };
  net.send('nz', p);
  if (staffSim && isHostile(clock.t)) staffSim.noise(P.x, P.z, NOISES[kind]);
}
function onNoise(from, p) {
  if (!has(NOISES, p.k)) return;
  const x = num(p.x), z = num(p.z), d = Math.hypot(x - P.x, num(p.y) - P.y, z - P.z), r = NOISES[p.k] * 1.6;
  if (d < r) sfx[p.k](Math.max(0.1, 1 - d / r), panTo(x, z));
  if (staffSim && isHostile(clock.t)) staffSim.noise(x, z, NOISES[p.k]);
}
// Put everything in your inventory down in a little pile at your feet.
function dropAll() {
  let n = 0;
  for (let i = 0; i < INV; i++) if (P.inv[i]) { dropSelected(i, n++); }
  if (n) { buildHotbar(); toast(`You put down ${n} thing${n === 1 ? '' : 's'}.`); }
}
// Switch a lamp off or on, open or close a door, turn a TV on, flush.
function useWord(it) {
  const u = TYPES[it.t].use;
  return u === 'lamp' ? (it.s ? 'switch on' : 'switch off') : u === 'door' ? (it.s ? 'close' : 'open') : u === 'tv' ? (it.s ? 'turn off' : 'turn on')
    : u === 'strip' || u === 'colour' ? (it.s >= 7 ? 'switch off' : it.s === 6 ? 'fade through colours' : it.s ? 'change colour' : 'switch on') : u === 'music' ? (it.s ? 'stop the record' : 'play a record')
    : u === 'roll' ? 'roll' : u === 'gift' ? 'open' : u === 'button' ? 'press' : u === 'ding' || u === 'boot' ? 'switch on' : u === 'squeak' ? 'squeeze' : u === 'drum' ? 'bang the drum' : u === 'tune' ? 'play a tune' : 'flush';
}
// Light strips dropped touching each other are linked: changing one changes
// them all (strips placed earlier only join once one of them is used).
function linkedStrips(it) {
  const out = [it], seen = new Set([it.id]);
  for (let i = 0; i < out.length && out.length < 40; i++) {
    const b = world.itemBox(out[i]), g = 0.06;
    world.forItems(b.x0 - g, b.z0 - g, b.x1 + g, b.z1 + g, (o) => {
      if (seen.has(o.id) || o.t !== 'lightStrip' || !world.active(o)) return;
      const c = world.itemBox(o);
      if (c.x0 > b.x1 + g || c.x1 < b.x0 - g || c.z0 > b.z1 + g || c.z1 < b.z0 - g || c.y0 > b.y1 + g || c.y1 < b.y0 - g) return;
      seen.add(o.id); out.push(o);
    });
  }
  return out;
}
const BUTTON_LINES = ['Nothing happens.', 'Somewhere, a light flickers.', 'A distant chime answers.', 'The button feels very satisfied.', 'You hear the PA clear its throat. Then nothing.', 'That was easy.'];
function useItem(it) {
  const u = TYPES[it.t].use;
  if (u === 'flush') { sfx.flush(); return; }
  if (u === 'ding') { sfx.ding(); return; }
  if (u === 'squeak' || u === 'drum' || u === 'tune') { sfx[u](); makeNoise(u); if (isHostile(clock.t) && !stats.noiseTip) { stats.noiseTip = 1; saveStats(); toast('That was loud. The staff will have heard it.'); } return; }
  if (u === 'boot') { sfx.boot(); toast('The console starts up, plays its little tune, and goes back to sleep.'); return; }
  if (u === 'button') { sfx.click(); setTimeout(() => sfx.ding(), 250); toast(BUTTON_LINES[(Math.random() * BUTTON_LINES.length) | 0]); return; }
  if (u === 'roll') { sfx.land(); const n = 1 + ((Math.random() * 6) | 0); toast(`You rolled a ${n}.`); const m = `rolled a ${n} on the foam dice`; net.send('c', { m }); chatLine(myName(), m); return; }
  if (u === 'strip' || u === 'colour') {
    // off, six colours, then a slow fade through them all
    const next = it.s >= 7 ? 0 : (it.s | 0) + 1;
    sfx.switchOn();
    for (const o of u === 'strip' ? linkedStrips(it) : [it]) { if (!net.isHost()) world.edit(o, { s: next }); request({ a: 'use', id: o.id, s: next }); }
    return;
  }
  if (u === 'gift') { sfx.pick(); if (!net.isHost()) world.edit(it, { g: true }); request({ a: 'use', id: it.id }); ach.unlock('gift'); return; }
  if (u === 'door') {
    // don't close a door on yourself
    const open = !it.s;
    if (!open) { const b = world.itemBox(it); if (P.x > b.x0 - 0.3 && P.x < b.x1 + 0.3 && P.z > b.z0 - 0.3 && P.z < b.z1 + 0.3 && P.y < b.y1) { sfx.deny(); return; } }
    sfx.door(open);
  } else sfx.switchOn();
  if (u === 'lamp' && !it.s) ach.count('lampsOff', 'lights', 10);
  // a TV comes on to whatever channel it lands on
  const next = it.s ? 0 : u === 'tv' ? 1 + ((Math.random() * TV_CHANNELS) | 0) : 1;
  if (!net.isHost()) world.edit(it, { s: next });
  request({ a: 'use', id: it.id, s: next });
}
function shove(id) {
  if (P.eatCd > 0) return;
  if (P.en < 4) { sfx.deny(); toast("You're too tired to shove. Rest a moment, or eat or drink something."); P.eatCd = 0.6; return; }
  P.en -= 4 + Math.random() * 4; // a shove takes 4 to 8 energy
  P.eatCd = 0.6;
  sfx.shove();
  ach.count('shoves', 'shove20', 20);
  life().shoves = (life().shoves | 0) + 1;
  feel.shake = Math.max(feel.shake, 0.3);
  if (net.isHost()) onPushRequest(net.id, { id });
  else net.send('pu', { id });
}
function itemStats(it) {
  const parts = [];
  if (it.food) parts.push(`+${it.food} hunger`);
  if (it.en) parts.push(`+${it.en} energy`);
  if (it.hp) parts.push(`${it.hp > 0 ? '+' : ''}${it.hp} health`);
  return parts.join(' · ');
}
function useSelected(slot = P.sel) {
  const key = P.inv[slot];
  if (!key || P.eatCd > 0 || P.using) return;
  const it = ITEMS[key];
  // a head torch isn't used up: clicking switches it on and off while it's in your hand
  if (it.tool) { P.torchOn = !P.torchOn; sfx.switchOn(); toast(P.torchOn ? 'Head torch on.' : 'Head torch off.'); return; }
  if (it.hp > 0 && !it.food && !it.en && P.hp >= 100) { toast("You're not hurt."); return; }
  P.eatCd = 0.5;
  P.inv[slot] = null; P.invId[slot] = null; buildHotbar();
  if (it.use) { P.using = { key, t: it.use }; sfx.heal(); return; }
  applyItem(key);
}
// Put the selected item down at your feet (to keep food in your base).
function dropSelected(slot = P.sel, k = 0) {
  const key = P.inv[slot], id = P.invId[slot];
  if (!key) return;
  const it = id && world.items.get(id);
  P.inv[slot] = null; P.invId[slot] = null; if (!k) buildHotbar();
  if (!it) return;
  // several at once go down in a little spiral, so they don't land in one spot
  const sa = k * 2.4, sr = k ? 0.12 + 0.05 * Math.sqrt(k) : 0;
  const fx = P.x - Math.sin(P.yaw) * 0.7 + Math.cos(sa) * sr, fz = P.z - Math.cos(P.yaw) * 0.7 + Math.sin(sa) * sr;
  const fy = world.supportHeight(fx - 0.1, fz - 0.1, fx + 0.1, fz + 0.1, P.y + 0.6, null);
  if (!net.isHost()) world.edit(it, { x: fx, y: fy, z: fz, g: false, c: null });
  request({ a: 'drop', id, x: +fx.toFixed(3), y: +fy.toFixed(3), z: +fz.toFixed(3) });
  sfx.place();
}
// Throw what you're carrying: it flies in an arc and lands where it lands.
// Without energy you can't throw far.
const flying = [];
function throwCarry(charge = 1) {
  const c = P.carry; if (!c) return;
  const [dx, dy, dz] = lookDir(), power = (P.en > 5 ? 3 + 8 * charge : 3.5);
  const hv = c.vel || [0, 0, 0];
  const vel = new THREE.Vector3(dx * power + hv[0] * 0.5, dy * power + 2.5 + hv[1] * 0.5, dz * power + hv[2] * 0.5);
  // it leaves your hands turning end over end a little
  const spin = new THREE.Vector3(-dz, 0, dx).multiplyScalar(-(1.5 + 3 * charge) * (0.6 + Math.random() * 0.8)).add(new THREE.Vector3(0, (Math.random() - 0.5) * 2, 0));
  launchBody(c, vel, spin);
  P.carry = null; P.en = Math.max(0, P.en - 1 - 3 * charge);
  sfx.shove();
}
// A piece moving on its own (thrown, or falling after you let go), as a rigid
// body (fall.js). It stays ours until it comes to rest, so nobody grabs it in
// mid-air; everyone else sees it fall as our "held" piece.
function launchBody(c, vel, spin) {
  const t = TYPES[c.t];
  const mesh = new THREE.Mesh(furnitureGeometry(c.t, c.v), furnitureMaterialRef);
  mesh.matrixAutoUpdate = false; scene.add(mesh);
  if (t.ball) { // a ball: a bouncing, rolling sphere
    const body = makeBall(t.ball[0], t.ball[1], new THREE.Vector3(c.x, c.y + t.ball[0], c.z), vel);
    c.o = [0, 0, 0, 1];
    ballMatrix(body, mesh.matrix);
    flying.push({ mesh, body, carry: c, pos: [c.x, c.y, c.z], hitT: 0 });
    return;
  }
  const q = itemQuat(0, 0, c.o), h = itemDims(c.t, 0, 0, c.o)[1];
  const body = makeBody(t.w, t.h, t.d, new THREE.Vector3(c.x, c.y + h / 2, c.z), q, vel, spin);
  bodyMatrix(body, mesh.matrix);
  flying.push({ mesh, body, carry: c, pos: [c.x, c.y, c.z], hitT: 0 });
}
function updateFlying(dt) {
  for (let k = flying.length - 1; k >= 0; k--) {
    const f = flying[k], b = f.body, item = world.items.get(f.carry.id);
    // the solid boxes it could reach this frame
    const r = (b.ball ? b.r : Math.hypot(b.he.x, b.he.y, b.he.z)) + b.v.length() * dt + 0.3;
    const boxes = [];
    world.forBoxes(b.p.x - r, b.p.z - r, b.p.x + r, b.p.z + r, (o) => { if (o.held || (item && o.item === item)) return; if (o.y1 > b.p.y - r && o.y0 < b.p.y + r) boxes.push(o); });
    if (b.ball) {
      const impact = stepBall(b, Math.min(dt, 0.05), boxes, CEIL);
      f.hitT -= dt;
      if (impact > 0.6 && f.hitT <= 0) { sfx.bounce(b.r, impact / 5); f.hitT = 0.06; }
      ballMatrix(b, f.mesh.matrix);
      f.pos = [b.p.x, Math.max(0, b.p.y - b.r), b.p.z];
      if (b.done) { scene.remove(f.mesh); flying.splice(k, 1); placeCarry({ x: b.p.x, y: Math.max(0, b.p.y - b.r), z: b.p.z, o: null, a: 0 }, f.carry, true); }
      continue;
    }
    const impact = stepBody(b, Math.min(dt, 0.05), boxes, CEIL);
    f.hitT -= dt;
    if (impact > 1.6 && f.hitT <= 0) { sfx.land(); f.hitT = 0.12; }
    bodyMatrix(b, f.mesh.matrix);
    const pose = bodyPose(b);
    f.pos = [pose.x, pose.y, pose.z]; f.carry.o = cleanQuat(pose.o);
    if (b.done) {
      scene.remove(f.mesh);
      flying.splice(k, 1);
      const o = cleanQuat(pose.o);
      placeCarry({ x: pose.x, y: pose.y, z: pose.z, o, a: 0 }, f.carry);
    }
  }
}
function applyItem(key) {
  const it = ITEMS[key];
  if (key !== 'medkit') ach.count('eaten', 'eat50', 50);
  life().eaten = (life().eaten | 0) + 1;
  { const a = life().ate || (life().ate = {}); a[key] = (a[key] | 0) + 1; }
  if (it.food) P.food = Math.min(100, P.food + it.food);
  if (it.en) P.en = Math.min(100, P.en + it.en);
  if (it.hp > 0) P.hp = Math.min(100, P.hp + it.hp);
  if (it.hp < 0) { toast(key === 'glass' ? 'Ouch. That was broken glass.' : "That didn't taste right."); hurt(-it.hp, key === 'glass' ? 'glass' : 'food'); }
  if (it.food) sfx.eat(); else if (it.hp > 0 && !it.en) sfx.heal(); else sfx.drink();
}

// ---------------------------------------------------------------- hotbar / HUD
// Little rendered pictures of each food and supply, made once.
let icons = null;
function makeIcons() {
  icons = {};
  try {
    const S = 96, rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 1.5); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const buf = new Uint8Array(S * S * 4), c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const k of Object.keys(ITEMS)) {
      const it = ITEMS[k], m = new THREE.Mesh(itemGeometry(k), mat);
      m.rotation.y = 0.7; sc.add(m);
      const r = Math.max(it.w, it.d, it.h);
      cam.position.set(0, it.h / 2 + r * 1.1, r * 2.6); cam.lookAt(0, it.h / 2, 0);
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
      for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
      ctx.putImageData(img, 0, 0);
      icons[k] = c.toDataURL();
      sc.remove(m);
    }
    renderer.setRenderTarget(prevTarget); renderer.setClearColor(0x000000, prevClear);
    rt.dispose(); mat.dispose();
  } catch (_) { icons = {}; }
}
function slotEl(key, i, small) {
  const s = document.createElement('div'); s.className = 'slot' + (i === P.sel ? ' sel' : '');
  const k = document.createElement('span'); k.className = 'k'; k.textContent = i < HOTBAR ? i + 1 : ''; s.append(k);
  if (key) {
    const it = ITEMS[key];
    if (icons[key]) { const im = document.createElement('img'); im.className = 'ic'; im.src = icons[key]; im.alt = ''; s.append(im); }
    else { const sw = document.createElement('div'); sw.className = 'sw'; sw.style.background = '#' + it.color.toString(16).padStart(6, '0'); s.append(sw); }
    const n = document.createElement('span'); n.className = 'nm'; n.textContent = it.name; s.append(n);
    s.title = `${it.name}: ${itemStats(it)}`;
  }
  return s;
}
// The hotbar shows the first 8 of your 16 slots; G opens all of them.
function buildHotbar() {
  if (!icons) makeIcons();
  const hb = $('hotbar'); hb.innerHTML = '';
  for (let i = 0; i < HOTBAR; i++) {
    const s = slotEl(P.inv[i], i);
    s.addEventListener('touchstart', (e) => { e.stopPropagation(); if (P.sel === i) useSelected(); else { P.sel = i; buildHotbar(); } }, { passive: true });
    hb.append(s);
  }
  const grid = $('inv-grid'); grid.innerHTML = '';
  P.inv.forEach((key, i) => {
    const s = slotEl(key, i);
    s.addEventListener('click', () => { P.sel = i < HOTBAR ? i : P.sel; useSelected(i); });
    s.addEventListener('contextmenu', (e) => { e.preventDefault(); dropSelected(i); });
    grid.append(s);
  });
  $('inv-count').textContent = `${P.inv.filter(Boolean).length} / ${INV}`;
}
let invOpen = false;
function toggleInventory(open = !invOpen, noLock = false) {
  invOpen = open;
  $('inv').classList.toggle('hidden', !open);
  if (open) { input.keys.clear(); try { document.exitPointerLock(); } catch (_) {} }
  else if (!noLock && !IS_TOUCH && mode === 'play' && !paused) lockPointer(canvas);
}
$('inv-close').onclick = () => toggleInventory(false);
$('inv-dropall').onclick = () => { if (P.alive) dropAll(); };
function updateRoster() {
  const r = $('roster');
  r.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = net.on ? `${roomText()} · ${remotes.size + 1}/8` : 'Solo'; r.append(h);
  const row = (name, alive, extra) => { const d = document.createElement('div'); if (!alive) d.className = 'dead'; const a = document.createElement('span'); a.textContent = name; const b = document.createElement('span'); b.textContent = extra; d.append(a, b); r.append(d); };
  row(myName() + ' (you)', P.alive, `${Math.ceil(P.hp)} hp · ${P.nights} nights`);
  for (const [id, x] of remotes) row(x.name + (net.host() && net.host().id === id ? ' ★' : ''), !x.st || x.st.a, x.st ? `${Math.ceil(x.st.hp)} hp · ${x.st.n} nights` : '…');
}
let hudT = 0;
function updateHud(dt) {
  hudT -= dt;
  const bars = document.querySelectorAll('#bars .bar i');
  bars[0].style.width = P.hp + '%'; bars[1].style.width = P.food + '%'; bars[2].style.width = P.en + '%';
  const nums = document.querySelectorAll('#bars .bar em');
  nums[0].textContent = Math.ceil(P.hp); nums[1].textContent = Math.ceil(P.food); nums[2].textContent = Math.ceil(P.en);
  $('bars').classList.toggle('starving', P.food <= 0); $('bars').classList.toggle('tired', P.en <= 0);
  const wh = $('whistle');
  wh.textContent = P.whistleHold != null ? 'Whistling… hold for help' : P.whistleT > 0 ? `Whistle ${Math.ceil(P.whistleT)} s` : 'H · Whistle · hold for help';
  wh.classList.toggle('cool', P.whistleT > 0);
  updateMarks();
  const night = isNight(clock.t);
  $('clock').classList.toggle('night', isHostile(clock.t));
  $('clock-day').textContent = `Day ${clock.day} · ${weekday(clock.day)}`;
  $('clock-time').textContent = clockText(clock.t, clock.day);
  const tm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  $('clock-phase').textContent = night ? `Closed · opens in ${tm(cycleLen(clock.day) - clock.t)}` : `Open · closes in ${tm(DAY_LEN - clock.t)}`;
  $('survived').textContent = `Nights survived: ${P.nights}`;
  const showRoster = input.keys.has('Tab');
  $('roster').classList.toggle('hidden', !showRoster); $('room-tag').classList.toggle('hidden', showRoster);
  if (showRoster && hudT <= 0) { updateRoster(); hudT = 0.5; }
  const now = performance.now();
  for (const d of $('chat-log').children) d.style.opacity = chatOpen || now - d._t < 12000 ? 1 : 0;
  if (!P.alive) {
    P.respawnT -= dt;
    const ready = P.respawnT <= 0;
    $('death-wake').disabled = !ready;
    $('death-timer').textContent = ready ? 'Press Space or Wake up when you\'re ready.' : '';
    if (ready && (input.pressed.has('Space') || input.pressed.has('Enter'))) respawn();
  }
}

// ---------------------------------------------------------------- clock & announcements
let lastTick = -1;
function updateClock(dt) {
  if (net.isHost()) {
    clock.t += dt;
    const C = cycleLen(clock.day);
    if (clock.t >= C) { clock.t -= C; clock.day++; world.setDay(clock.day); }
  } else clock.t = Math.min(cycleLen(clock.day) - 0.001, clock.t + dt);
  const phase = isNight(clock.t) ? 'night' : 'day';
  if (lastPhase && phase !== lastPhase) {
    if (phase === 'night') {
      sfx.lightsOff(false);
      announce('The store is now closed', 'The lights are out and the staff are hunting. Get somewhere high or stay hidden.', 6);
      warned = false;
    } else {
      sfx.lightsOn();
      if (P.alive) {
        P.nights++; if (P.nights > stats.best) stats.best = P.nights; stats.days++; saveStats();
        ach.unlock('night1'); if (P.nights >= 7) ach.unlock('week'); if (P.nights >= 30) ach.unlock('month');
      }
      const restock = isRestockDay(clock.day) ? ' Food and first aid have been restocked.' : '';
      announce(`Good morning!`, `The store is open.${restock} Tonight runs ${Math.round(nightLen(clock.day))} s.`, 7);
      showDayTitle();
    }
  }
  if (phase === 'day' && clock.t > DAY_LEN - 30 && !warned) { warned = true; sfx.chime(); announce('The store closes in 30 seconds', 'Find somewhere safe.', 4); }
  // the last five seconds before closing tick down
  const left = Math.ceil(DAY_LEN - clock.t);
  if (phase === 'day' && left <= 5 && left >= 1 && left !== lastTick) { lastTick = left; sfx.tick(6 - left); }
  // the odd tip in chat (can be turned off in Settings)
  if (settings.tips !== false && P.alive && (tipT -= dt) <= 0) { tipT = 200 + Math.random() * 120; const d = document.createElement('div'); d.className = 'tip'; d.textContent = 'Tip: ' + CHAT_TIPS[(Math.random() * CHAT_TIPS.length) | 0]; d._t = performance.now(); $('chat-log').append(d); }
  // tips on your first day
  if (stats.days === 0 && clock.day === 1) for (const [at, tip] of TIPS) if (clock.t >= at && clock.t - dt < at) toast('Tip: ' + tip);
  // the odd announcement over the PA during the day
  if (phase === 'day') for (const f of PA_TIMES) { const at = f * DAY_LEN; if (clock.t >= at && clock.t - dt < at) { const line = PA_LINES[(clock.day * 3 + Math.round(f * 100)) % PA_LINES.length]; sfx.chime(); setTimeout(() => announcePA(line), 1200); } }
  // hunger and energy warnings
  if (P.alive && P.food < 20 && !warn.food) { warn.food = true; toast("You're getting very hungry. Find something to eat."); }
  if (P.food > 30) warn.food = false;
  if (P.alive && P.en < 10 && !warn.en) { warn.en = true; toast("You're exhausted. Stand still for a bit to get your breath back, or eat or drink."); }
  if (P.en > 20) warn.en = false;
  lastPhase = phase;
}
const warn = { food: false, en: false };
const TIPS = [
  [40, 'Look at furniture and press E to pick it up. Click or press E again to put it down, even in mid-air.'],
  [70, 'Food and first aid are in cafeterias, kitchens and snack bars. Press G to see your inventory.'],
  [110, 'At 22:00 the lights go out and the staff start hunting. They climb about a metre, so get higher than that.'],
  [160, 'While holding a piece, press 1, 2 or 3 to pick an axis and R to rotate it. Pallets stood on end make good walls.'],
  [210, "You can't climb the shelving. To get up high, stack furniture and jump up it, or bring a ladder."],
  [260, 'Press Z to drop a waypoint at your base so you can find it again.'],
  [300, 'If a member of staff catches you, click to shove them over, then run and break their line of sight.'],
];
const PA_TIMES = [0.21, 0.58]; // fractions of the day
const PA_LINES = [
  'Good day, shoppers. Please remember to return any trolleys to the trolley bays.',
  'A reminder that our cafeteria is open all day. While stocks last.',
  'Shoppers are reminded that the store closes at ten o\'clock this evening.',
  'Lost something? Our helpful staff will be happy to show you the way. After closing.',
  'Today\'s special offer can be found in an aisle near you. Somewhere.',
  'Please do not climb on the shelving. Thank you.',
  'Would the shopper in the blue shirt please stay where you are.',
];
function announcePA(line) {
  chatLine('', '📢 ' + line, true);
  try {
    if (!('speechSynthesis' in window) || !settings.voice || settings.vol <= 0) return;
    const u = new SpeechSynthesisUtterance(line); u.rate = 0.95; u.pitch = 1.05; u.volume = 0.5 * settings.vol;
    speechSynthesis.speak(u);
  } catch (_) {}
}

// ---------------------------------------------------------------- staff (drawing)
function ingestStaff(list, now) {
  const seen = new Set();
  for (const e of list) {
    if (!Array.isArray(e) || e.length < 6) continue;
    const id = e[0] | 0; seen.add(id);
    let v = staffViews.get(id);
    if (!v) { v = { model: makeStaff(id), buf: [] }; scene.add(v.model.root); staffViews.set(id, v); }
    v.buf.push({ t: now, x: e[1] / 100, y: e[2] / 100, z: e[3] / 100, ry: e[4] / 100, f: e[5] | 0, s: (e[6] | 0) / 10, tg: typeof e[7] === 'string' ? e[7] : '' });
    if (v.buf.length > 12) v.buf.shift();
    v.seen = now;
  }
  for (const [id, v] of staffViews) if (!seen.has(id) && now - v.seen > 600) { scene.remove(v.model.root); staffViews.delete(id); }
}
// What they say when they're after you. Spoken in a flat, low voice where the
// browser can speak, and always shown as a subtitle.
const LINES = ['Closing time. Closing time.', "You can't stay here after hours.", 'Please put everything back and go home.', 'Shopping is over for today.', 'Why are you still here?', 'We are closed. We are closed.', 'Let me show you the way out.'];
const MANAGER_LINES = ['I will need to speak to you.', 'This is not acceptable.', 'Staff. To me.', 'You are holding up the stocktake.'];
let voiceT = 0, voiceN = 0;
function speak(line, vol, pitch = 0.05) {
  const el = $('voice');
  el.textContent = line; el.classList.remove('hidden');
  clearTimeout(speak.t); speak.t = setTimeout(() => el.classList.add('hidden'), 2600);
  try {
    if (!('speechSynthesis' in window) || settings.vol <= 0 || !settings.voice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.pitch = pitch; u.rate = 0.82; u.volume = clamp(vol * settings.vol, 0, 1);
    speechSynthesis.speak(u);
  } catch (_) {}
}
let murmurT = 0;
function drawStaff(dt, now) {
  const delay = net.isHost() ? 0 : 140;
  let nearest = Infinity, nearPan = 0, anyHostile = false, hunter = Infinity, hunterLook = null;
  for (const v of staffViews.values()) {
    const at = now - delay, b = v.buf;
    let i = b.length - 1; while (i > 0 && b[i - 1].t > at) i--;
    const s1 = b[i], s0 = i > 0 ? b[i - 1] : s1;
    const span = s1.t - s0.t, u = span > 0 ? clamp((at - s0.t) / span, 0, 1) : 1;
    const m = v.model;
    // climbs and drops are steps of up to 2 m: ease the height so they read as jumps
    const ty = lerp(s0.y, s1.y, u);
    v.y = v.y === undefined || Math.abs(ty - v.y) > 4 ? ty : v.y + (ty - v.y) * Math.min(1, dt * 9);
    m.root.position.set(lerp(s0.x, s1.x, u), v.y, lerp(s0.z, s1.z, u));
    m.root.rotation.y = angLerp(s0.ry, s1.ry, u);
    const hostile = !!(s1.f & 1) || isHostile(clock.t);
    m.eyes.visible = hostile;
    const carryingStock = m.stock && !isHostile(clock.t);
    if (m.stock) m.stock.visible = carryingStock;
    animate(m, s1.s, dt, { reach: s1.f & 2 ? now / 1000 : 0, climbing: !!(s1.f & 8) && !(s1.f & 4), down: !!(s1.f & 4), carrying: carryingStock });
    const d = Math.hypot(m.root.position.x - P.x, m.root.position.z - P.z);
    if (s1.f & 1) { anyHostile = true; if (d < nearest) { nearest = d; const a = Math.atan2(m.root.position.x - P.x, m.root.position.z - P.z) - P.yaw; nearPan = clamp(-Math.sin(a), -1, 1); } }
    if (s1.tg === net.id && d < hunter) { hunter = d; hunterLook = m.look; }
    if (s1.tg === net.id && d < 30) lastHunted = now;
    // heavy footsteps you can hear coming
    if (hostile && d < 18 && s1.s > 1) { v.stepAcc = (v.stepAcc || 0) + s1.s * dt; if (v.stepAcc > 1.5) { v.stepAcc = 0; const a = Math.atan2(m.root.position.x - P.x, m.root.position.z - P.z) - P.yaw; sfx.staffStep(clamp(-Math.sin(a), -1, 1), 1 - d / 18); } }
  }
  murmurT -= dt;
  if (anyHostile && nearest < 14 && murmurT <= 0) { sfx.staffNear(nearPan); murmurT = 0.5 + nearest / 10; }
  voiceT -= dt;
  if (hunter < 18 && voiceT <= 0 && P.alive) {
    // big ones sound deep, small ones high; the Floor Manager has its own lines
    const pitch = hunterLook ? (hunterLook.manager ? 0.0 : [0.0, 0.05, 0.6, 1.4][hunterLook.size]) : 0.05;
    const line = hunterLook && hunterLook.manager ? MANAGER_LINES[voiceN++ % MANAGER_LINES.length] : LINES[voiceN++ % LINES.length];
    speak(line, 1 - hunter / 22, pitch); voiceT = 4 + Math.random() * 2;
  }
}

// ---------------------------------------------------------------- remote shoppers (drawing)
const _hq0 = new THREE.Quaternion(), _hq1 = new THREE.Quaternion();
function drawRemotes(dt, now) {
  for (const r of remotes.values()) {
    const b = r.buf;
    if (!b.length || now - r.seen > 8000) { r.model.root.visible = false; continue; }
    const at = now - 130;
    let i = b.length - 1; while (i > 0 && b[i - 1].t > at) i--;
    const s1 = b[i], s0 = i > 0 ? b[i - 1] : s1;
    const span = s1.t - s0.t, u = span > 0 ? clamp((at - s0.t) / span, 0, 1) : 1;
    const m = r.model;
    const jump = Math.hypot(s1.x - s0.x, s1.z - s0.z) > 8;
    const nx = jump ? s1.x : lerp(s0.x, s1.x, u), nz = jump ? s1.z : lerp(s0.z, s1.z, u);
    const sp = Math.hypot(nx - m.root.position.x, nz - m.root.position.z) / Math.max(dt, 1e-3);
    m.root.position.set(nx, jump ? s1.y : lerp(s0.y, s1.y, u), nz);
    m.root.rotation.y = angLerp(s0.ry, s1.ry, u) + Math.PI;
    m.root.visible = !!s1.a;
    if (r.bubble && (r.bubbleT -= dt) <= 0) { r.model.root.remove(r.bubble); r.bubble.material.map.dispose(); r.bubble.material.dispose(); r.bubble = null; }
    { // names show faintly through the shelves, so friends can find each other
      const d = Math.hypot(nx - P.x, nz - P.z);
      r.tag.material.opacity = d < 20 ? 1 : d > 90 ? 0 : 0.35 + 0.65 * (1 - (d - 20) / 70) * 0.5;
      r.tag.scale.set(1.2 + d * 0.02, 0.3 + d * 0.005, 1);
    }
    setHeld(m, s1.ct && !s1.ho ? s1.ct : '', s1.cv);
    animate(m, s1.si ? 0 : Math.min(sp, 9), dt, { carrying: !!s1.ct, crouch: !!s1.cr, sit: !!s1.si });
    // what they're holding, floating where they aim
    r.hold = null;
    if (s1.ho && s1.a) {
      const h0 = s0.ho && s0.ct === s1.ct ? s0.ho : s1.ho, h1 = s1.ho;
      _hq0.set(...h0.o); _hq1.set(...h1.o); _hq0.slerp(_hq1, u);
      r.hold = { t: s1.ct, v: s1.cv, x: lerp(h0.x, h1.x, u), y: lerp(h0.y, h1.y, u), z: lerp(h0.z, h1.z, u), o: [_hq0.x, _hq0.y, _hq0.z, _hq0.w] };
      if (!r.heldMesh) { r.heldMesh = new THREE.Mesh(new THREE.BufferGeometry(), furnitureMaterialRef); r.heldMesh.matrixAutoUpdate = false; r.heldMesh.frustumCulled = false; scene.add(r.heldMesh); }
      const key = s1.ct + ':' + s1.cv;
      if (r.heldKey !== key) { r.heldKey = key; r.heldMesh.geometry = furnitureGeometry(s1.ct, s1.cv); }
      itemMatrix(r.heldMesh.matrix, s1.ct, r.hold.x, r.hold.y, r.hold.z, 0, 0, 1, r.hold.o);
      r.heldMesh.visible = true;
    } else if (r.heldMesh) r.heldMesh.visible = false;
  }
}

// ---------------------------------------------------------------- frame
let frameDt = 1 / 60, achT = 0, fortNear = 0, lastHunted = -1e9, tipT = 150;
let last = performance.now(), sendT = 0, staffSendT = 0, clockSendT = 0, chunkT = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frameDt = dt;
  if (mode !== 'play') { renderMenuBackdrop(dt); endFrame(); return; }
  pollGamepad(dt);
  if (input.pressed.has('Escape') && input.pad && !IS_TOUCH) { if (invOpen) toggleInventory(false); else if (paused) resume(); else pause(); }
  handleKeys();
  updateClock(dt);
  updateHeldBoxes();
  updatePlayer(dt);
  P.eatCd -= dt;
  // chunks around us (rendered) and around everyone else (data, for the host's staff)
  chunkT -= dt;
  if (chunkT <= 0) {
    chunkT = 0.1;
    const focus = [{ x: P.x, z: P.z, render: true }];
    if (net.isHost()) for (const r of remotes.values()) if (r.st) focus.push({ x: r.st.x, z: r.st.z, render: false });
    world.update(focus);
  }
  updateInteraction(dt);
  updateFlying(dt);
  updateRecords(dt);
  checkWeek(dt);
  { const ph = Math.floor(now / 800); if (ph !== world.fadePhase) { world.fadePhase = ph; if (world.hasFading) world.itemsDirty = true; } }
  achT -= dt;
  if (achT <= 0 && P.alive) {
    achT = 0.5;
    const sec = world.sectionAt(P.x, P.z);
    if (sec === 'food') ach.unlock('cafe');
    { const pl = world.pillarAt(P.x, P.z); if (pl && pl.type === 'lost' && Math.hypot(pl.x - P.x, pl.z - P.z) < 5) ach.unlock('landmark'); }
    if (P.y >= 4.3) ach.unlock('high');
    if (Math.hypot(P.x - P.startX, P.z - P.startZ) > 1000) ach.unlock('far');
    if (isNight(clock.t)) {
      world.forBoxes(P.x - 0.1, P.z - 0.1, P.x + 0.1, P.z + 0.1, (b) => { if (b.item && b.item.t === 'wardrobe' && b.y0 > P.y + 1.5 && b.y0 < P.y + 2.3) ach.unlock('hide'); });
    }
    world.forItems(P.x - 6, P.z - 6, P.x + 6, P.z + 6, (it) => { if (it.k === 'f' && it.t === 'pallet' && it.tl === 1 && !world.mods.has(it.id) && Math.hypot(it.x - P.x, it.z - P.z) < 4) fortNear++; }); // upturned pallets nobody moved: a fort
    if (fortNear > 5) ach.unlock('fort');
    fortNear = 0;
  }
  if (Math.random() < dt / (isNight(clock.t) ? 14 : 30)) sfx.distant(isNight(clock.t));
  // host: staff
  if (net.isHost() && staffSim) {
    const players = [{ id: net.id, x: P.x, y: P.y, z: P.z, alive: P.alive, sprinting: P.sprinting, crouch: P.crouch }];
    for (const [id, r] of remotes) if (r.st && now - r.seen < 6000) players.push({ id, x: r.st.x, y: r.st.y, z: r.st.z, alive: !!r.st.a, sprinting: !!r.st.sp, crouch: !!r.st.cr });
    const out = staffSim.update(dt, players, staffEnv(), clock.day);
    for (const h of out.hits) { if (h.to === net.id) hurt(h.d, 'staff'); else net.send('h', { to: h.to, d: h.d }); }
    const snap = staffSim.snapshot();
    ingestStaff(snap, now);
    if (now >= staffSendT && net.on) { staffSendT = now + 125; net.send('s', { s: snap }); }
    if (now >= clockSendT && net.on) { clockSendT = now + 1000; net.send('g', { d: clock.day, t: +clock.t.toFixed(2), k: DAY_SCALE }); }
  }
  drawStaff(dt, now);
  drawRemotes(dt, now);
  // send our state
  if (now >= sendT && net.on) {
    sendT = now + 100;
    const hold = myHold();
    net.send('p', { x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), ry: +P.yaw.toFixed(2), a: P.alive ? 1 : 0, ct: hold ? hold.t : '', cv: hold ? hold.v : 0, ho: hold ? [hold.x, hold.y, hold.z].map((n) => +n.toFixed(2)).concat(hold.o) : 0, n: P.nights, hp: Math.ceil(P.hp), sp: P.sprinting ? 1 : 0, cr: P.crouch ? 1 : 0, tc: torchLit() ? 1 : 0, si: P.sit ? 1 : 0 });
  }
  // light and camera
  const L = lightLevel(clock.t, clock.day);
  lights.cascade = cascade(clock.t, clock.day);
  if (lights.cascade && !lights.cascadeAt) { lights.cascadeAt = [P.x, P.z]; }
  if (!lights.cascade) lights.cascadeAt = null;
  if (lights.cascadeAt) { lights.cx = lights.cascadeAt[0]; lights.cz = lights.cascadeAt[1]; }
  applyLight(scene, lights, L, settings.low);
  setAmbience(isHostile(clock.t), L > 0.5);
  // badly hurt: everything goes quiet and cloudy; being hunted: the chase music
  const low = P.alive && P.hp <= 10;
  $('lowhp').style.opacity = low ? 0.55 + 0.25 * Math.sin(now / 160) : P.alive && P.hp <= 25 ? 0.25 : 0;
  setMusic(low ? 'low' : isNight(clock.t) && P.alive && now - lastHunted < 4000 ? 'chase' : isNight(clock.t) ? 'night' : 'day', clock.day);
  updateLamps(L);
  floor.position.set(Math.round(P.x / 4) * 4, 0, Math.round(P.z / 4) * 4);
  uniforms.uTime.value = (now / 1000) % 10000;
  sky.update(dt, P.x, P.z, L);
  setSkyLight(isNight(clock.t) ? 0 : 1, false);
  const vig = (0.45 + 0.55 * (1 - L)).toFixed(2);
  if (darkEl.style.opacity !== vig) darkEl.style.opacity = vig;
  dust.update(dt, P.x, P.z, L);
  placeCamera(dt);
  updateHud(dt);
  world.flushItems();
  renderer.render(scene, camera);
  autoResolution(dt);
  endFrame();
}

// Keep the frame rate up: if frames are slow for a few seconds, draw at a
// lower resolution; if they're quick again, go back up.
const res = { acc: 0, n: 0, scale: 1 };
function autoResolution(dt) {
  if (document.hidden) return;
  res.acc += dt; res.n++;
  if (res.acc < 3) return;
  const avg = res.acc / res.n; res.acc = 0; res.n = 0;
  const max = Math.min(devicePixelRatio, settings.low ? 1 : 1.75);
  if (avg > 0.028 && res.scale > 0.5) res.scale = Math.max(0.5, res.scale - 0.15);
  else if (avg < 0.016 && res.scale < 1) res.scale = Math.min(1, res.scale + 0.1);
  else return;
  renderer.setPixelRatio(max * res.scale);
}

const _v = new THREE.Vector3();
let lampT = 0, lampList = [];
function updateLamps(L) {
  lampT -= 1 / 60;
  if (lampT <= 0) {
    lampT = 0.25;
    lampList = [];
    const mine = myHold();
    if (mine && TYPES[mine.t].lamp) lampList.push({ mine: true });
    if (torchLit()) lampList.push({ head: true });
    for (const r of remotes.values()) if (r.st && r.st.a && r.st.tc) { const p = r.model.root.position; lampList.push({ x: p.x, y: p.y + 1.7, z: p.z }); }
    for (const r of remotes.values()) if (r.hold && TYPES[r.hold.t].lamp) lampList.push({ x: r.hold.x, y: r.hold.y + itemDims(r.hold.t, 0, 0, r.hold.o)[1] * 0.85, z: r.hold.z });
    for (const it of world.lampsNear(P.x, P.z, 30, 6)) { const tt = TYPES[it.t]; lampList.push({ x: it.x, y: it.y + itemDims(it.t, it.r, it.tl, it.o)[1] * (tt.glowY ?? 1) + (tt.glowY != null ? -0.1 : 0.08), z: it.z, col: world.lightColor(it), k: tt.glowK || (tt.use === 'tv' ? 0.5 : 1) }); }
    lampList = lampList.slice(0, lampLights.length);
  }
  const k = Math.max(0, 1 - L * 1.4);
  setLampGlow(k * 0.9);
  lampLights.forEach((l, i) => {
    const e = lampList[i];
    if (!e || k <= 0) { l.intensity = 0; return; }
    if (e.mine) { const h = myHold(); if (h) l.position.set(h.x, h.y + itemDims(h.t, 0, 0, h.o)[1] * 0.85, h.z); }
    else if (e.head) l.position.set(P.x - Math.sin(P.yaw) * 0.6, P.y + P.eyeH + 0.1, P.z - Math.cos(P.yaw) * 0.6);
    else l.position.set(e.x, e.y, e.z);
    l.color.setHex(e.col || 0xffd59a);
    l.intensity = 9 * k * (e.k || 1);
  });
}


// Camera feel: head bob while walking, a wider view when sprinting, a dip on
// landing, and a shake when you're hit.
const feel = { bob: 0, dip: 0, shake: 0, fov: 0 };
function placeCamera(dt) {
  const moving = P.onGround && P.speed > 0.5 && P.alive;
  feel.bob += moving ? dt * P.speed * 1.9 : 0;
  const bobAmt = moving && !settings.calm ? Math.min(1, P.speed / 5) : 0;
  if (settings.calm) { feel.shake = 0; feel.dip = 0; }
  feel.dip = Math.max(0, feel.dip - dt * 1.6);
  feel.shake = Math.max(0, feel.shake - dt * 2.5);
  const sprinting = P.speed > 6;
  feel.fov += ((sprinting && !settings.calm ? 7 : 0) - feel.fov) * Math.min(1, dt * 6);
  const fov = settings.fov + feel.fov;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const sh = feel.shake * feel.shake;
  P.eyeH += ((P.sit ? 0.82 : P.crouch ? 0.85 : 1.6) - P.eyeH) * Math.min(1, dt * 12);
  // ease the camera over steps (but follow jumps and falls exactly)
  feel.camY = feel.camY === undefined || Math.abs(P.y - feel.camY) > 1.2 || !P.onGround ? P.y : feel.camY + (P.y - feel.camY) * Math.min(1, dt * 14);
  const ey = feel.camY + P.eyeH + Math.sin(feel.bob * 2) * 0.045 * bobAmt - feel.dip * 0.4;
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * sh * 0.12, P.yaw + (Math.random() - 0.5) * sh * 0.12, Math.sin(feel.bob) * 0.006 * bobAmt + (Math.random() - 0.5) * sh * 0.08, 'YXZ');
  myModel.root.position.set(P.x, P.y, P.z);
  myModel.root.rotation.y = P.yaw + Math.PI;
  setHeld(myModel, '', 0);
  animate(myModel, P.speed, dt, { carrying: !!P.carry, crouch: P.crouch, sit: !!P.sit });
  if (P.third && P.alive) {
    const [dx, dy, dz] = lookDir();
    const hit = raycast(P.x, ey, P.z, -dx, -dy, -dz, 4, false);
    const dist = Math.max(0.6, hit.t - 0.3);
    camera.position.set(P.x - dx * dist, ey - dy * dist + 0.3, P.z - dz * dist);
    myModel.root.visible = true;
  } else if (!P.alive) {
    // caught: the camera drifts up and circles where it happened
    const k = Math.min(1, (performance.now() - P.deadAt) / 2500), a = performance.now() / 4000;
    camera.position.set(P.x + Math.cos(a) * (1 + k * 3), P.y + 0.5 + k * 3, P.z + Math.sin(a) * (1 + k * 3));
    camera.lookAt(P.x, P.y + 0.3, P.z);
    myModel.root.visible = true;
    myModel.body.rotation.x = -1.45; myModel.body.position.y = 0.2;
  } else {
    camera.position.set(P.x + Math.cos(P.yaw) * Math.sin(feel.bob) * 0.025 * bobAmt, ey, P.z - Math.sin(P.yaw) * Math.sin(feel.bob) * 0.025 * bobAmt);
    myModel.root.visible = false;
    myModel.body.rotation.x = 0;
  }
  if (window.__cam) { const c = window.__cam; camera.position.set(c[0], c[1], c[2]); camera.rotation.set(c[4], c[3], 0, 'YXZ'); } // tests: a fixed camera
  // the piece we're holding
  if (P.carry && P.alive) {
    const c = P.carry, key = c.t + ':' + c.v;
    if (key !== heldMeshKey) { heldMeshKey = key; heldMesh.geometry = furnitureGeometry(c.t, c.v); }
    itemMatrix(heldMesh.matrix, c.t, c.x, c.y, c.z, 0, 0, 1, cleanQuat([c.dq.x, c.dq.y, c.dq.z, c.dq.w]) || c.o);
    heldMesh.visible = true;
  } else heldMesh.visible = false;
}

// What we're holding (or what we just let go of, still in the air), for others to see.
// A record player that's playing: a little tune, louder the closer you are.
const RECORD_TUNE = [64, 67, 71, 69, 67, 64, 62, 64, 60, 64, 67, 72, 71, 67, 69, 0];
let recordT = 0, recordStep = 0, recordNear = 99, recordScan = 0;
function updateRecords(dt) {
  if ((recordScan -= dt) <= 0) {
    recordScan = 0.5; recordNear = 99;
    world.forItems(P.x - 14, P.z - 14, P.x + 14, P.z + 14, (it) => { if (it.t === 'recordPlayer' && it.s && world.active(it)) recordNear = Math.min(recordNear, Math.hypot(it.x - P.x, it.z - P.z)); });
  }
  if (recordNear > 14 || (recordT -= dt) > 0) return;
  recordT = 0.3;
  const n = RECORD_TUNE[recordStep++ % RECORD_TUNE.length];
  if (n) sfx.recordNote(n, Math.max(0, 1 - recordNear / 14));
}
// The head torch shines while it's the selected hotbar item and switched on.
const torchLit = () => P.alive && P.torchOn && P.inv[P.sel] === 'torch';
function myHold() {
  if (P.carry && P.alive) return { t: P.carry.t, v: P.carry.v, x: P.carry.x, y: P.carry.y, z: P.carry.z, o: P.carry.o };
  const f = flying[flying.length - 1];
  if (f) return { t: f.carry.t, v: f.carry.v, x: f.pos[0], y: f.pos[1], z: f.pos[2], o: f.carry.o };
  return null;
}
// Furniture someone else is holding is solid to you: they can put it under
// your feet and lift you. Your own held piece isn't solid to you (or you could
// stand on it, raise it, jump, raise it again and fly), and nor is anyone
// else's while you're carrying something yourself (or two people could lift
// each other in turns, all the way up).
const prevTops = new Map();
function updateHeldBoxes() {
  const out = [], tops = new Map();
  const add = (key, h) => {
    const list = poseBoxes(h.t, h.o, h.x, h.y, h.z), prev = prevTops.get(key);
    list.forEach((b, i) => { b.py1 = prev && prev.length === list.length ? prev[i] : b.y1; b.held = key; out.push(b); });
    tops.set(key, list.map((b) => b.y1));
  };
  if (!P.carry) for (const [id, r] of remotes) if (r.hold) add(id, r.hold);
  prevTops.clear(); for (const [k, v] of tops) prevTops.set(k, v);
  world.held = out;
}
function rideHeld() {
  const r = P.radius * 0.8;
  let top = -1;
  for (const b of world.held) {
    if (b.x1 <= P.x - r || b.x0 >= P.x + r || b.z1 <= P.z - r || b.z0 >= P.z + r) continue;
    // it was under our feet and has come up: we go up with it
    if (b.py1 <= P.y + 0.08 && b.y1 > P.y - 0.02 && b.y1 - P.y < 1.2 && b.y1 > top) top = b.y1;
  }
  if (top >= 0 && top > P.y && bodyFits(world, P.x, top, P.z, P.radius - 0.02, P.height)) { P.y = top; P.vy = Math.max(0, P.vy); P.onGround = true; }
}

function handleKeys() {
  const p = input.pressed;
  if (chatOpen) return;
  if (p.has('Enter') || p.has('Slash')) { openChat(); return; }
  if (p.has('Escape') && (IS_TOUCH || invOpen)) { if (invOpen) { toggleInventory(false, true); pause(); } else pause(); return; }
  if (p.has('KeyG') || p.has('KeyI')) toggleInventory();
  if (p.has('KeyV')) P.third = !P.third;
  if (p.has('KeyH')) whistleKey();
  if (p.has('KeyQ') && !P.carry && P.alive && !invOpen) { if (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')) dropAll(); else dropSelected(); }
  if (p.has('KeyZ')) setWaypoint(input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));
  if (p.has('F1')) { pause(); returnTo = 'pause'; show('how'); }
  if (!P.carry) for (let i = 0; i < HOTBAR; i++) if (p.has('Digit' + (i + 1))) { P.sel = i; buildHotbar(); }
  if (input.wheel && !P.carry) { P.sel = (P.sel + input.wheel + HOTBAR) % HOTBAR; buildHotbar(); }
}

// ---------------------------------------------------------------- whistle and waypoints
// Whistling (H). Tap it for a short two-note whistle ("over here"); hold it
// for a long one ("help!"). Everyone within 400 m sees a ! marker with your
// name where you whistled for a few seconds (an arrow at the edge of the
// screen when it's off to one side), and hears it if they're close enough,
// muffled by distance. At night the staff hear it too and come to look: a
// long whistle carries further. 25 s between whistles; a little energy each.
const WHISTLE = { cool: 25, hold: 0.4, hear: 140, hearLong: 200, tagRange: 400, staff: 45, staffLong: 70, tag: 5, tagLong: 8 };
const beacons = [];
function addBeacon(x, y, z, name, long) {
  for (let i = beacons.length - 1; i >= 0; i--) if (beacons[i].name === name) beacons.splice(i, 1);
  beacons.push({ x, y, z, name, long, t: long ? WHISTLE.tagLong : WHISTLE.tag });
}
// H goes down: start timing the whistle; it goes off when you let go (short)
// or once you've held it long enough (long).
function whistleKey() {
  if (!P.alive) return;
  if (P.whistleT > 0) { sfx.deny(); return; }
  P.whistleHold = 0;
}
function updateWhistle(dt) {
  P.whistleT = Math.max(0, P.whistleT - dt);
  if (P.whistleHold == null) return;
  if (!P.alive || chatOpen) { P.whistleHold = null; return; }
  P.whistleHold += dt;
  if (P.whistleHold >= WHISTLE.hold) whistle(true);
  else if (!input.keys.has('KeyH')) whistle(false);
}
function whistle(long) {
  P.whistleHold = null;
  if (!P.alive || P.whistleT > 0) return;
  P.whistleT = WHISTLE.cool; P.en = Math.max(0, P.en - (long ? 4 : 2));
  ach.count('whistles', 'whistle', 10);
  sfx.whistle(0, 1, long, 0);
  net.send('wh', { x: +P.x.toFixed(1), y: +P.y.toFixed(1), z: +P.z.toFixed(1), k: long ? 1 : 0 });
  if (staffSim && isHostile(clock.t)) staffSim.noise(P.x, P.z, long ? WHISTLE.staffLong : WHISTLE.staff);
  if (!stats.whistleTip) { stats.whistleTip = 1; saveStats(); toast(long ? 'You whistled for help. Anyone within 400 m sees where you are, and at night the staff hear it too.' : 'You whistled. Anyone within 400 m sees where you are. Hold H for a long whistle that calls for help.'); }
}
// Z drops a waypoint where you stand (up to 4; the oldest goes). Shift+Z clears them.
function setWaypoint(clear) {
  if (clear) { for (let i = waypoints.length - 1; i >= 0; i--) if (!waypoints[i].death) waypoints.splice(i, 1); toast('Waypoints cleared.'); return; }
  const mine = waypoints.filter((w) => !w.death);
  if (mine.length >= 4) waypoints.splice(waypoints.indexOf(mine[0]), 1);
  const n = [1, 2, 3, 4].find((k) => !waypoints.some((w) => w.name === 'Waypoint ' + k)) || 1;
  waypoints.push({ x: P.x, y: P.y + 1.2, z: P.z, name: 'Waypoint ' + n });
  sfx.pick(); toast(`Waypoint ${n} set. Shift+Z clears your waypoints.`);
}
// Markers drawn over the 3D view: waypoints, and the ! where someone just
// whistled. A whistle marker that's off the screen (or behind you) sits at
// the edge of the screen with an arrow pointing the way.
const markPool = [];
const _cv = new THREE.Vector3();
function updateMarks() {
  const host = $('marks');
  const list = [];
  for (const w of waypoints) list.push({ x: w.x, y: w.y, z: w.z, cls: w.death ? 'wp death' : 'wp', label: w.name });
  for (let i = beacons.length - 1; i >= 0; i--) { const b = beacons[i]; b.t -= frameDt; if (b.t <= 0) beacons.splice(i, 1); }
  for (const b of beacons) list.push({ x: b.x, y: b.y, z: b.z, cls: b.long ? 'whistle help' : 'whistle', label: b.long ? `!! ${b.name} needs help` : `! ${b.name}`, edge: true, fade: b.t < 1 });
  while (markPool.length < list.length) { const d = document.createElement('div'); host.append(d); markPool.push(d); }
  const W = innerWidth, H = innerHeight, M = 36;
  markPool.forEach((el, i) => {
    const m = list[i];
    if (!m) { el.style.display = 'none'; return; }
    _cv.set(m.x, m.y, m.z).applyMatrix4(camera.matrixWorldInverse);
    const behind = _cv.z > -0.1;
    _v.set(m.x, m.y, m.z).project(camera);
    let sx = (_v.x + 1) / 2 * W, sy = (1 - _v.y) / 2 * H, arrow = null;
    const off = behind || sx < M || sx > W - M || sy < M || sy > H - M;
    if (off && !m.edge) { el.style.display = 'none'; return; }
    if (off) {
      // the way to it on the screen: from the middle towards it (its direction in view space if it's behind you)
      let dx = _cv.x, dy = -_cv.y;
      if (!behind) { dx = sx - W / 2; dy = sy - H / 2; }
      if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dx = 1;
      const k = Math.min((W / 2 - M) / Math.max(1e-6, Math.abs(dx)), (H / 2 - M) / Math.max(1e-6, Math.abs(dy)));
      sx = W / 2 + dx * k; sy = H / 2 + dy * k;
      arrow = Math.atan2(dy, dx);
    }
    el.style.display = '';
    el.className = 'mark ' + m.cls + (arrow != null ? ' edge' : '') + (m.fade ? ' fade' : '');
    el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
    const dist = Math.round(Math.hypot(m.x - P.x, m.z - P.z));
    const label = m.label ? `${m.label} · ${dist} m` : '';
    if (arrow != null) el.innerHTML = `<i class="arr" style="transform: rotate(${(arrow * 180 / Math.PI).toFixed(0)}deg)"></i>${label}`;
    else el.textContent = label;
  });
}

// ---------------------------------------------------------------- chat
const chatIn = $('chat-in');
function openChat() {
  if (!net.on) { toast('Chat works in online rooms.'); return; }
  chatOpen = true; input.typing = true; input.keys.clear();
  chatIn.classList.remove('hidden'); chatIn.value = ''; setTimeout(() => chatIn.focus(), 0);
}
function closeChat() { chatOpen = false; input.typing = false; chatIn.classList.add('hidden'); chatIn.blur(); }
chatIn.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const m = chatIn.value.trim().slice(0, 120);
    if (m) { net.send('c', { m }); chatLine(myName(), m); }
    closeChat();
  } else if (e.key === 'Escape') closeChat();
});

// ---------------------------------------------------------------- menu backdrop
let menuInit = false, menuT = 0;
// Behind the menu: night in the store, the camera slowly circling one of the
// big grid pillars and looking up it into the fog.
function renderMenuBackdrop(dt) {
  if (!menuInit) { menuInit = true; world.reset(1234567); }
  menuT += dt;
  const px = HALF_C, pz = HALF_C, a = 0.55 + menuT * 0.03, r = 5.8;
  const x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
  world.update([{ x, z, render: true }]);
  // clear the floor round the pillar so nothing blocks the view
  world.forItems(px - 7, pz - 7, px + 7, pz + 7, (it) => { if (!it.g && Math.hypot(it.x - px, it.z - pz) < 7) world.edit(it, it.k === 'f' ? { g: true } : { g: true, d: world.epoch }); });
  const L = 0.1;
  lights.cascade = null;
  applyLight(scene, lights, L, settings.low);
  floor.position.set(Math.round(x / 4) * 4, 0, Math.round(z / 4) * 4);
  sky.update(dt, x, z, L);
  camera.position.set(x, 1.5, z);
  // face the pillar, tilted up so it rises out of sight into the murk
  camera.rotation.set(0.6 + Math.sin(menuT * 0.11) * 0.035, a + 0.36, 0, 'YXZ'); // the pillar sits to the right of the menu
  // a single lamp glowing somewhere at the pillar's foot
  lampLights.forEach((l, i) => { l.intensity = 0; });
  lampLights[0].position.set(px + 2.2, 0.9, pz + 2.0); lampLights[0].color.setHex(0xffc27a); lampLights[0].intensity = 4;
  // and the caged lamps on the pillar, washing its faces in a dim orange (they flicker now and then)
  const fl = Math.sin(menuT * 13.0) + Math.sin(menuT * 31.0) > 1.75 ? 0.35 : 1;
  for (const [i, nx, nz] of [[1, 0, 1], [2, 1, 0], [3, 0, -1], [4, -1, 0]]) { const l = lampLights[i]; l.position.set(px + nx * 1.75, 4.5, pz + nz * 1.75); l.color.setHex(0xff9a4a); l.intensity = 2.6 * fl; }
  setLampGlow(0.6); setSkyLight(0, false);
  dust.update(dt, x, z, L);
  world.flushItems();
  renderer.render(scene, camera);
}
const HALF_C = 12; // the grid pillar in the middle of chunk 0, 0

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// Test hook for tools/test.cjs.
window.__game = { P, clock, world, net, renderer, TYPES, ITEMS, get music() { return musicState(); }, get notes() { return audioMod.noteCount; }, get mode() { return mode; }, staffViews, remotes, startSolo: () => $('b-solo').click(),
  placeForTest: (x, y, z) => { if (!P.carry) return false; placeCarry({ x, y, z, o: P.carry.o, a: 1 }); return true; },   pubSaveForTest: () => pubSave(), leaveForTest: () => leaveGame(), weekForTest: () => { net.week -= 1; weekCheckT = 0; checkWeek(0); return net.week; }, storeWeek, publicSeed,
  sitForTest: (id) => { const it = world.items.get(id); if (it) sitDown(it, it.x, it.z); return !!P.sit; }, get beacons() { return beacons; }, whistleForTest: (from, p) => onWhistle(from, p), dropAllForTest: () => dropAll(),
  useItemForTest: (id) => { const it = world.items.get(id); if (it) useItem(it); }, nightLen, roomNames: () => ROOMS.map((r) => [r.name, 'showroom']).concat(GARDEN_ROOMS.map((r) => [r.name, 'garden'])), useForTest: () => useSelected(), shoveForTest: () => { const id = staffInReach(); if (id != null) shove(id); return id; }, restockEpoch, spawnAt, get placement() { return placement; }, grabForTest: (id) => { const it = world.items.get(id); if (it && world.active(it) && !P.carry) pickUp(it); return !!P.carry; }, setClock: (t, d) => { clock.t = t; if (d) { clock.day = d; world.setDay(d); } }, get staff() { return staffSim; }, get flying() { return flying.map((f) => ({ t: f.carry.t, age: +f.body.age.toFixed(2), v: +f.body.v.length().toFixed(3), w: f.body.w ? +f.body.w.length().toFixed(3) : 0, ball: !!f.body.ball, still: +f.body.still.toFixed(2), y: +f.body.p.y.toFixed(3), touching: !!f.body.touching })); } };
