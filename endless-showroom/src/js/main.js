// Endless Showroom: entry point, game loop and glue.
//
// Every screen runs the local shopper itself and sends its state to the
// others. The host (net.js) also runs the clock, the staff (staff.js) and all
// changes to furniture and food (world.js). Solo play is simply being the
// host of a room with nobody else in it.
import * as THREE from 'three';
import { World, CHUNK, CEIL, setLampGlow, setSkyLight } from './world.js';
import { TYPES, ITEMS, itemDims, itemMatrix, itemParts, itemQuat, cleanQuat, furnitureGeometry, itemGeometry } from './furniture.js';
import { moveBody, bodyFits } from './physics.js';
import { StaffSim } from './staff.js';
import { createNet, myName, cleanName, myShirt } from './net.js';
import { input, initInput, initTouch, lockPointer, endFrame, pollGamepad } from './input.js';
import { makeShopper, makeStaff, animate, setHeld, nameTag, nameHash, SHIRT_COLORS } from './models.js';
import { initAudio, sfx, setAmbience, setVolume, setMusic, setMusicVolume } from './audio.js';
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
ceiling.rotation.x = Math.PI / 2; ceiling.position.y = CEIL;
scene.add(ceiling);
const lights = { hemi, amb, ceil: ceilMat.color };
uniforms.uCeil.value = CEIL;
uniforms.uGain.value = 2.0;
const fixtures = makeFixtures(scene);
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
  need: onNeed, full: onFull, push: onPushRequest, whistle: onWhistle,
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
  setDayScale(save ? +save.k || 1 : waitForState ? 1 : settings.short ? 0.5 : 1);
  world.reset(seed);
  clock.day = 1; clock.t = 30;
  world.setDay(1);
  if (save) { // carry on a saved solo store
    for (const [id, st] of save.mods || []) if (Array.isArray([id, st]) && st) world.applyState(id, Object.assign({}, st, { c: 0 }));
    clock.day = Math.max(1, save.day | 0); clock.t = clamp(+save.t || 30, 0, cycleLen(clock.day) - 1);
    world.setDay(clock.day);
  }
  remotes.forEach((r) => { scene.remove(r.model.root); if (r.heldMesh) scene.remove(r.heldMesh); }); remotes.clear();
  staffViews.forEach((s) => scene.remove(s.model.root)); staffViews.clear();
  staffSim = net.isHost() ? new StaffSim(world) : null;
  Object.assign(P, { hp: 100, food: 100, en: 100, alive: true, carry: null, inv: new Array(INV).fill(null), invId: new Array(INV).fill(null), sel: 0, nights: 0, vy: 0, hurtT: 99, using: null, whistleT: 0 });
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
  showDayTitle();
  if (save) { announce(`Welcome back · Day ${clock.day}`, 'Your solo store is just as you left it.', 5); return; }
  announce('Welcome to the store', net.on ? 'You\'re somewhere in the aisles. Whistle (H) to find the others, gather food, and be ready for closing time.' : 'Gather food, build somewhere high, and be ready for closing time.', 7);
}
let touchReady = false;
function initTouchOnce() { if (!touchReady) { initTouch($('touch')); touchReady = true; } $('touch').classList.remove('hidden'); }

function leaveGame() {
  if (!net.on) saveSolo();
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
  const st = { t: performance.now(), x: num(p.x), y: clamp(num(p.y), 0, CEIL), z: num(p.z), ry: num(p.ry), a: p.a ? 1 : 0, ct: has(TYPES, p.ct) ? p.ct : '', cv: p.cv | 0, n: p.n | 0, hp: clamp(num(p.hp, 100), 0, 100), sp: p.sp ? 1 : 0, cr: p.cr ? 1 : 0, ho: null };
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
    if (u && u !== 'flush' && !it.c && !world.isGone(it)) world.edit(it, { s: it.s ? 0 : 1 });
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
  const x = num(p.x), z = num(p.z), d = Math.hypot(x - P.x, z - P.z);
  const r = remotes.get(from);
  if (d < 120) { const a = Math.atan2(x - P.x, z - P.z) - P.yaw; sfx.whistle(clamp(-Math.sin(a), -1, 1), Math.max(0.15, 1 - d / 120)); }
  if (r) { r.revealT = 8; toast(`${r.name} whistled${d < 120 ? ` (${Math.round(d)} m away)` : ''}.`); }
  if (staffSim && isHostile(clock.t)) staffSim.noise(x, z, 45);
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
  $('death-stats').innerHTML = [['Furniture placed', L.placed | 0], ['Staff shoved', L.shoves | 0], ['Things eaten', L.eaten | 0], ['Distance walked', `${Math.round(L.dist || 0)} m`]]
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
  'Meatballs fill you up more than anything else in the cafeteria.',
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
];
const life = () => P.life || (P.life = {}); // this life's numbers, for the death screen
// A hard landing. Beds, sofas and mattresses soften it if you land on top of
// them; a beanbag softens it from any side (more). A long drop onto a bed
// bounces you back up.
function landed(v) {
  let soft = null;
  world.forBoxes(P.x - 0.2, P.z - 0.2, P.x + 0.2, P.z + 0.2, (b) => {
    if (!b.item || b.item.k !== 'f' || Math.abs(b.y1 - P.y) > 0.08) return;
    const t = TYPES[b.item.t]; if (!t.soft) return;
    if (t.soft === 'any') soft = 'any';
    else if (!soft && b.y1 >= world.itemBox(b.item).y1 - 0.25) soft = 'top';
  });
  const k = soft === 'any' ? 1.66 : soft === 'top' ? 1.38 : 1;
  const raw = (v - 13) * 9, dmg = Math.max(0, (v - 13 * k) * 9 / k);
  if (soft && raw >= P.hp && dmg < P.hp) { ach.unlock('cushion'); toast('That would have killed you. The cushioning saved you.'); }
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
  // walk into shelving or a bookcase to climb it
  P.canClimb = !busy && P.alive && fz < -0.3;
  const ox = P.x, oz = P.z, wasAir = !P.onGround;
  P.landSpeed = 0;
  world.withHeld = true;
  if (P.alive) { moveBody(world, P, dx, dz, dt); rideHeld(); }
  world.withHeld = false;
  P.speed = Math.hypot(P.x - ox, P.z - oz) / dt;
  if (P.alive) life().dist = (life().dist || 0) + Math.min(1, Math.hypot(P.x - ox, P.z - oz));
  if (wasAir && P.onGround && P.landSpeed > 4) { sfx.land(); feel.dip = Math.min(0.5, P.landSpeed * 0.035); }
  if (P.landSpeed > 13) landed(P.landSpeed);
  // footsteps
  if (P.onGround && P.speed > 0.5) { P.stepAcc += P.speed * dt; if (P.stepAcc > (sprint ? 2.2 : 1.7)) { P.stepAcc = 0; if (P.y < 0.05 && world.sectionAt(P.x, P.z) === 'garden') sfx.grassStep(); else sfx.step(!sprint); } }
  if (P.alive) {
    // Energy drains all the time: slowly standing still, faster walking, fastest
    // sprinting, and faster still when you're hurt. Only food and drink bring it back.
    const hurtK = 1 + 0.8 * (1 - P.hp / 100);
    const drain = sprint ? 3.2 : moving || P.slideT > 0 ? 0.12 : 0.04;
    P.en = Math.max(0, P.en - (drain + (P.carry ? 0.15 : 0)) * hurtK * dt);
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
  P.whistleT = Math.max(0, P.whistleT - dt);
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
        text = pct > 0 ? `Picking up ${t.name}… <span class="stat">${Math.round(pct * 100)}%</span>` : `<b>Hold E</b> Pick up ${t.name}${need > 1 ? ' <span class="stat">(heavy)</span>' : ''}`;
        if (t.use) text += ` · <b>F</b> ${useWord(it)}`;
        if (pct >= 1) { P.pickId = null; if (it.t === 'safe') ach.unlock('patience'); pickUp(it); }
        else if (t.use && input.pressed.has('KeyF')) useItem(it);
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
    const ctrl = input.keys.has('ControlLeft') || input.keys.has('ControlRight');
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
    if (input.wheel) P.carryDist = clamp(P.carryDist - input.wheel * 0.5, 1.5, 8);
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
    const k = c.fresh ? 1 : 1 - Math.exp(-dt * 16);
    c.fresh = false;
    c.x += (px - c.x) * k; c.y += (py - c.y) * k; c.z += (pz - c.z) * k;
    c.dq.slerp(c.q, 1 - Math.exp(-dt * 22));
    const item = world.items.get(c.id);
    const sticks = touches(c.t, c.o, c.x, c.y, c.z, item);
    c.sticks = sticks;
    placement = { x: c.x, y: c.y, z: c.z, o: c.o, ok: true, sticks };
    holdBox.box.min.set(c.x - w / 2, c.y, c.z - d / 2); holdBox.box.max.set(c.x + w / 2, c.y + h, c.z + d / 2);
    holdBox.material.color.setHex(sticks ? 0x44ff66 : 0xffffff);
    holdBox.visible = true;
    const axisName = ['X', 'Y', 'Z'][c.axis];
    if (c.charge > 0) text = `Throwing ${t.name}… <span class="stat">${Math.round(c.charge * 100)}% power</span>`;
    else text = `Holding ${t.name} · <b>E</b>/click let go ${sticks ? '<span class="stat">(stays put)</span>' : '<span class="stat">(falls)</span>'} · <b>R</b> rotate on <b>${axisName}</b> (<b>1 2 3</b> axis · <b>Ctrl</b> 15° · <b>Shift</b> 90°) · <b>wheel</b> closer/farther · hold <b>F</b> throw`;
    if (pressedUse || clicked || input.pressed.has('KeyQ')) letGo();
  }
  if (P.using) text = `Using ${ITEMS[P.using.key].name}… ${Math.max(0, P.using.t).toFixed(1)} s`;
  if (text) { prompt.innerHTML = text; prompt.classList.remove('hidden'); } else prompt.classList.add('hidden');
}
function pickUp(it) {
  const q = itemQuat(it.r, it.tl, it.o);
  const [w, h, d] = itemDims(it.t, it.r, it.tl, it.o);
  const [ex, ey, ez] = eye();
  P.carryDist = clamp(Math.hypot(it.x - ex, it.y + h / 2 - ey, it.z - ez), 1.5, 8);
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
// How far a piece let go in mid-air falls before something holds it up.
function dropHeight(t, o, x, y, z, skip) {
  let gap = y;
  for (const b of poseBoxes(t, o, x, y, z)) {
    const s = world.supportHeight(b.x0, b.z0, b.x1, b.z1, b.y0 + 0.01, skip);
    gap = Math.min(gap, b.y0 - s);
  }
  return Math.max(0, gap);
}
function letGo() {
  const c = P.carry; if (!c) return;
  const item = world.items.get(c.id);
  if (touches(c.t, c.o, c.x, c.y, c.z, item)) { placeCarry({ x: c.x, y: c.y, z: c.z, o: c.o, a: 1 }); return; }
  // nothing touching: it drops straight down onto whatever is below
  const land = c.y - dropHeight(c.t, c.o, c.x, c.y, c.z, item);
  placeCarry({ x: c.x, y: land, z: c.z, o: c.o, a: 0 });
  P.carry = null;
}
function placeCarry(p, carry = P.carry) {
  const id = carry.id;
  const it = world.items.get(id);
  if (it && !net.isHost()) { world.edit(it, { x: p.x, y: p.y, z: p.z, o: p.o, a: !!p.a, c: null }); }
  if (P.carry === carry) P.carry = null;
  if (p.a) sfx.place(); else sfx.land();
  ach.count('placed', 'build50', 50); ach.count('placed2', 'build500', 500);
  life().placed = (life().placed | 0) + 1;
  request({ a: 'place', id, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), o: p.o, an: p.a ? 1 : 0 });
}
// Switch a lamp off or on, open or close a door, turn a TV on, flush.
function useWord(it) {
  const u = TYPES[it.t].use;
  return u === 'lamp' ? (it.s ? 'switch on' : 'switch off') : u === 'door' ? (it.s ? 'close' : 'open') : u === 'tv' ? (it.s ? 'turn off' : 'turn on') : 'flush';
}
function useItem(it) {
  const u = TYPES[it.t].use;
  if (u === 'flush') { sfx.flush(); return; }
  if (u === 'door') {
    // don't close a door on yourself
    const open = !it.s;
    if (!open) { const b = world.itemBox(it); if (P.x > b.x0 - 0.3 && P.x < b.x1 + 0.3 && P.z > b.z0 - 0.3 && P.z < b.z1 + 0.3 && P.y < b.y1) { sfx.deny(); return; } }
    sfx.door(open);
  } else sfx.switchOn();
  if (u === 'lamp' && !it.s) ach.count('lampsOff', 'lights', 10);
  if (!net.isHost()) world.edit(it, { s: it.s ? 0 : 1 });
  request({ a: 'use', id: it.id });
}
function shove(id) {
  if (P.eatCd > 0) return;
  if (P.en < 4) { sfx.deny(); toast("You're too tired to shove. Eat or drink something."); P.eatCd = 0.6; return; }
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
  if (it.hp > 0 && !it.food && !it.en && P.hp >= 100) { toast("You're not hurt."); return; }
  P.eatCd = 0.5;
  P.inv[slot] = null; P.invId[slot] = null; buildHotbar();
  if (it.use) { P.using = { key, t: it.use }; sfx.heal(); return; }
  applyItem(key);
}
// Put the selected item down at your feet (to keep food in your base).
function dropSelected(slot = P.sel) {
  const key = P.inv[slot], id = P.invId[slot];
  if (!key) return;
  const it = id && world.items.get(id);
  P.inv[slot] = null; P.invId[slot] = null; buildHotbar();
  if (!it) return;
  const fx = P.x - Math.sin(P.yaw) * 0.7, fz = P.z - Math.cos(P.yaw) * 0.7;
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
  const [w, h, d] = itemDims(c.t, 0, 0, c.o);
  const item = world.items.get(c.id);
  const [dx, dy, dz] = lookDir(), power = (P.en > 5 ? 3 + 8 * charge : 3.5);
  let x = c.x, y = c.y, z = c.z, vx = dx * power, vy = dy * power + 2.5, vz = dz * power;
  const pts = [];
  for (let i = 0; i < 200; i++) {
    const nx = x + vx * 0.025, ny = y + vy * 0.025, nz = z + vz * 0.025; vy -= 20 * 0.025;
    const b = { x0: nx - w / 2, x1: nx + w / 2, z0: nz - d / 2, z1: nz + d / 2, y0: Math.max(0, ny), y1: Math.max(0, ny) + h };
    if (ny <= 0 || (i > 2 && !world.fits(b, item))) break;
    x = nx; y = ny; z = nz; pts.push([x, y, z]);
  }
  const ly = y - dropHeight(c.t, c.o, x, y, z, item);
  pts.push([x, ly, z]);
  launch(c, pts, { x, y: ly, z, o: c.o, a: 0 });
  P.carry = null; P.en = Math.max(0, P.en - 1 - 3 * charge);
  sfx.shove();
}
// A piece moving on its own (thrown, or dropping after you let go). It stays
// ours until it lands, so nobody grabs it in mid-air.
function launch(c, pts, land) {
  const mesh = new THREE.Mesh(furnitureGeometry(c.t, c.v), furnitureMaterialRef);
  mesh.matrixAutoUpdate = false; scene.add(mesh);
  itemMatrix(mesh.matrix, c.t, c.x, c.y, c.z, 0, 0, 1, c.o);
  flying.push({ mesh, pts, i: 0, carry: c, land, pos: [c.x, c.y, c.z] });
}
function updateFlying(dt) {
  for (let k = flying.length - 1; k >= 0; k--) {
    const f = flying[k];
    f.i += dt / 0.025;
    const p = f.pts[Math.min(f.pts.length - 1, Math.floor(f.i))];
    if (p) { f.pos = p; itemMatrix(f.mesh.matrix, f.carry.t, p[0], p[1], p[2], 0, 0, 1, f.carry.o); }
    if (f.i >= f.pts.length) {
      scene.remove(f.mesh);
      flying.splice(k, 1);
      placeCarry(f.land, f.carry);
    }
  }
}
function applyItem(key) {
  const it = ITEMS[key];
  if (key !== 'medkit') ach.count('eaten', 'eat50', 50);
  life().eaten = (life().eaten | 0) + 1;
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
  wh.textContent = P.whistleT > 0 ? `Whistle ${Math.ceil(P.whistleT)} s` : 'H · Whistle';
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
  if (P.alive && P.en < 10 && !warn.en) { warn.en = true; toast("You're exhausted. Eat, drink, or stand still for a bit."); }
  if (P.en > 20) warn.en = false;
  lastPhase = phase;
}
const warn = { food: false, en: false };
const TIPS = [
  [40, 'Look at furniture and press E to pick it up. Click or press E again to put it down, even in mid-air.'],
  [70, 'Food and first aid are in cafeterias, kitchens and snack bars. Press G to see your inventory.'],
  [110, 'At 22:00 the lights go out and the staff start hunting. They climb about a metre, so get higher than that.'],
  [160, 'While holding a piece, press 1, 2 or 3 to pick an axis and R to rotate it. Pallets stood on end make good walls.'],
  [210, 'Shelving, bookcases and bunk beds can be climbed, by you and by the staff.'],
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
    animate(m, Math.min(sp, 9), dt, { carrying: !!s1.ct, crouch: !!s1.cr });
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
    net.send('p', { x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), ry: +P.yaw.toFixed(2), a: P.alive ? 1 : 0, ct: hold ? hold.t : '', cv: hold ? hold.v : 0, ho: hold ? [hold.x, hold.y, hold.z].map((n) => +n.toFixed(2)).concat(hold.o) : 0, n: P.nights, hp: Math.ceil(P.hp), sp: P.sprinting ? 1 : 0, cr: P.crouch ? 1 : 0 });
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
  ceiling.position.set(Math.round(P.x / 6) * 6, CEIL, Math.round(P.z / 6) * 6);
  uniforms.uTime.value = (now / 1000) % 10000;
  fixtures.update(P.x, P.z, L, uniforms.uEmerg.value, CEIL);
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
    for (const r of remotes.values()) if (r.hold && TYPES[r.hold.t].lamp) lampList.push({ x: r.hold.x, y: r.hold.y + itemDims(r.hold.t, 0, 0, r.hold.o)[1] * 0.85, z: r.hold.z });
    for (const it of world.lampsNear(P.x, P.z, 30, 6)) lampList.push({ x: it.x, y: it.y + itemDims(it.t, it.r, it.tl)[1] + 0.08, z: it.z });
    lampList = lampList.slice(0, lampLights.length);
  }
  const k = Math.max(0, 1 - L * 1.4);
  setLampGlow(k * 0.9);
  lampLights.forEach((l, i) => {
    const e = lampList[i];
    if (!e || k <= 0) { l.intensity = 0; return; }
    if (e.mine) { const h = myHold(); if (h) l.position.set(h.x, h.y + itemDims(h.t, 0, 0, h.o)[1] * 0.85, h.z); }
    else l.position.set(e.x, e.y, e.z);
    l.intensity = 9 * k;
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
  P.eyeH += ((P.crouch ? 0.85 : 1.6) - P.eyeH) * Math.min(1, dt * 12);
  // ease the camera over steps (but follow jumps and falls exactly)
  feel.camY = feel.camY === undefined || Math.abs(P.y - feel.camY) > 1.2 || !P.onGround ? P.y : feel.camY + (P.y - feel.camY) * Math.min(1, dt * 14);
  const ey = feel.camY + P.eyeH + Math.sin(feel.bob * 2) * 0.045 * bobAmt - feel.dip * 0.4;
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * sh * 0.12, P.yaw + (Math.random() - 0.5) * sh * 0.12, Math.sin(feel.bob) * 0.006 * bobAmt + (Math.random() - 0.5) * sh * 0.08, 'YXZ');
  myModel.root.position.set(P.x, P.y, P.z);
  myModel.root.rotation.y = P.yaw + Math.PI;
  setHeld(myModel, '', 0);
  animate(myModel, P.speed, dt, { carrying: !!P.carry, crouch: P.crouch });
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
  // the piece we're holding
  if (P.carry && P.alive) {
    const c = P.carry, key = c.t + ':' + c.v;
    if (key !== heldMeshKey) { heldMeshKey = key; heldMesh.geometry = furnitureGeometry(c.t, c.v); }
    itemMatrix(heldMesh.matrix, c.t, c.x, c.y, c.z, 0, 0, 1, cleanQuat([c.dq.x, c.dq.y, c.dq.z, c.dq.w]) || c.o);
    heldMesh.visible = true;
  } else heldMesh.visible = false;
}

// What we're holding (or what we just let go of, still in the air), for others to see.
function myHold() {
  if (P.carry && P.alive) return { t: P.carry.t, v: P.carry.v, x: P.carry.x, y: P.carry.y, z: P.carry.z, o: P.carry.o };
  const f = flying[flying.length - 1];
  if (f) return { t: f.carry.t, v: f.carry.v, x: f.pos[0], y: f.pos[1], z: f.pos[2], o: f.carry.o };
  return null;
}
// Furniture being held is solid to players: hold a piece under yourself and
// lift it, and you go up with it (that's how you get onto high shelves, or
// float). Someone else can carry you the same way.
const prevTops = new Map();
function updateHeldBoxes() {
  const out = [], tops = new Map();
  const add = (key, h) => {
    const list = poseBoxes(h.t, h.o, h.x, h.y, h.z), prev = prevTops.get(key);
    list.forEach((b, i) => { b.py1 = prev && prev.length === list.length ? prev[i] : b.y1; b.held = key; out.push(b); });
    tops.set(key, list.map((b) => b.y1));
  };
  if (P.carry && P.alive) add('me', P.carry);
  for (const [id, r] of remotes) if (r.hold) add(id, r.hold);
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
  if (p.has('KeyH')) whistle();
  if (p.has('KeyQ') && !P.carry && P.alive && !invOpen) dropSelected();
  if (p.has('KeyZ')) setWaypoint(input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));
  if (p.has('F1')) { pause(); returnTo = 'pause'; show('how'); }
  if (!P.carry) for (let i = 0; i < HOTBAR; i++) if (p.has('Digit' + (i + 1))) { P.sel = i; buildHotbar(); }
  if (input.wheel && !P.carry) { P.sel = (P.sel + input.wheel + HOTBAR) % HOTBAR; buildHotbar(); }
}

// ---------------------------------------------------------------- whistle and waypoints
// A whistle shows everyone nearby (staff in red, shoppers in blue) for a few
// seconds, and tells your friends where you are. At night it also brings the
// staff. 25 s between whistles; it costs a little energy.
let revealT = 0;
function whistle() {
  if (!P.alive || P.whistleT > 0) { if (P.whistleT > 0) sfx.deny(); return; }
  P.whistleT = 25; P.en = Math.max(0, P.en - 5);
  ach.count('whistles', 'whistle', 10);
  revealT = 6;
  sfx.whistle(0, 1);
  net.send('wh', { x: +P.x.toFixed(1), z: +P.z.toFixed(1) });
  if (staffSim && isHostile(clock.t)) staffSim.noise(P.x, P.z, 45);
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
// Markers drawn over the 3D view: waypoints always, and everyone nearby for a
// few seconds after a whistle.
const markPool = [];
function updateMarks() {
  const host = $('marks');
  const list = [];
  for (const w of waypoints) list.push({ x: w.x, y: w.y, z: w.z, cls: w.death ? 'wp death' : 'wp', label: w.name });
  revealT = Math.max(0, revealT - frameDt);
  if (revealT > 0) for (const v of staffViews.values()) { const p = v.model.root.position; if (Math.hypot(p.x - P.x, p.z - P.z) < 45) list.push({ x: p.x, y: p.y + 2.3, z: p.z, cls: 'staff', label: '' }); }
  for (const r of remotes.values()) {
    r.revealT = Math.max(0, (r.revealT || 0) - frameDt);
    if (r.st && r.st.a && (revealT > 0 || r.revealT > 0)) { const p = r.model.root.position; list.push({ x: p.x, y: p.y + 2.5, z: p.z, cls: 'mate', label: r.name }); }
  }
  while (markPool.length < list.length) { const d = document.createElement('div'); host.append(d); markPool.push(d); }
  markPool.forEach((el, i) => {
    const m = list[i];
    if (!m) { el.style.display = 'none'; return; }
    _v.set(m.x, m.y, m.z).project(camera);
    if (_v.z > 1 || _v.z < -1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.className = 'mark ' + m.cls;
    el.style.transform = `translate(${((_v.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - _v.y) / 2 * innerHeight).toFixed(0)}px)`;
    const dist = Math.round(Math.hypot(m.x - P.x, m.z - P.z));
    el.textContent = m.label ? `${m.label} · ${dist} m` : '';
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
function renderMenuBackdrop(dt) {
  if (!menuInit) { menuInit = true; world.reset(1234567); }
  menuT += dt;
  const x = 12 + Math.sin(menuT * 0.05) * 30, z = 12 + menuT * 1.2;
  world.update([{ x, z, render: true }]);
  applyLight(scene, lights, 1, settings.low);
  floor.position.set(Math.round(x / 4) * 4, 0, Math.round(z / 4) * 4);
  ceiling.position.set(Math.round(x / 6) * 6, CEIL, Math.round(z / 6) * 6);
  camera.position.set(x, 2.2, z);
  camera.rotation.set(-0.12, Math.PI + Math.sin(menuT * 0.07) * 0.6, 0, 'YXZ');
  for (const l of lampLights) l.intensity = 0;
  setLampGlow(0); setSkyLight(1, false);
  fixtures.update(x, z, 1, 0, CEIL);
  dust.update(dt, x, z, 1);
  world.flushItems();
  renderer.render(scene, camera);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// Test hook for tools/test.cjs.
window.__game = { P, clock, world, net, renderer, get mode() { return mode; }, staffViews, remotes, startSolo: () => $('b-solo').click(),
  useForTest: () => useSelected(), shoveForTest: () => { const id = staffInReach(); if (id != null) shove(id); return id; }, restockEpoch, spawnAt, get placement() { return placement; }, grabForTest: (id) => { const it = world.items.get(id); if (it && world.active(it) && !P.carry) pickUp(it); return !!P.carry; }, setClock: (t, d) => { clock.t = t; if (d) { clock.day = d; world.setDay(d); } }, get staff() { return staffSim; } };
