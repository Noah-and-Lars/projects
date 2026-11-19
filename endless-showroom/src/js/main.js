// Endless Showroom: entry point, game loop and glue.
//
// Every screen runs the local shopper itself and sends its state to the
// others. The host (net.js) also runs the clock, the staff (staff.js) and all
// changes to furniture and food (world.js). Solo play is simply being the
// host of a room with nobody else in it.
import * as THREE from 'three';
import { World, CHUNK, CEIL } from './world.js';
import { TYPES, ITEMS, footprint, furnitureGeometry } from './furniture.js';
import { moveBody, bodyFits } from './physics.js';
import { StaffSim } from './staff.js';
import { createNet, myName, cleanName } from './net.js';
import { input, initInput, initTouch, lockPointer, endFrame } from './input.js';
import { makeShopper, makeStaff, animate, setHeld, nameTag, nameHash } from './models.js';
import { initAudio, sfx, setAmbience, setVolume } from './audio.js';
import { DAY_LEN, CYCLE, EVENTS, eventFor, isNight, isHostile, clockText, lightLevel, applyLight } from './env.js';
import { clamp, lerp, angLerp } from './rng.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const IS_TOUCH = matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;

// ---------------------------------------------------------------- settings
const settings = { sens: 1, vol: 0.7, fov: 75, low: IS_TOUCH };
try { Object.assign(settings, JSON.parse(localStorage.getItem('es-settings') || '{}')); } catch (_) {}
const saveSettings = () => { try { localStorage.setItem('es-settings', JSON.stringify(settings)); } catch (_) {} };
const stats = { best: 0, days: 0 };
try { Object.assign(stats, JSON.parse(localStorage.getItem('es-stats') || '{}')); } catch (_) {}
const saveStats = () => { try { localStorage.setItem('es-stats', JSON.stringify(stats)); } catch (_) {} };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, settings.low ? 1 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d3c8);
scene.fog = new THREE.Fog(0xd8d3c8, 10, 70);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 200);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xfff8ec, 0x8c8474, 1.8);
const amb = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(hemi, amb);
const torch = new THREE.SpotLight(0xfff1d6, 0, 32, 0.52, 0.45, 1.3);
torch.position.set(0.25, -0.2, 0);
camera.add(torch); camera.add(torch.target); torch.target.position.set(0, -0.3, -5);

// Floor and ceiling: one big plane each that follows the player.
function tileTexture(draw, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const floorTex = tileTexture((x, s) => {
  const n = 4, w = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 196 + ((i * 7 + j * 13) % 5) * 4;
    x.fillStyle = `rgb(${v},${v - 4},${v - 10})`; x.fillRect(i * w, j * w, w, w);
    for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(90,80,70,${Math.random() * 0.08})`; x.fillRect(i * w + Math.random() * w, j * w + Math.random() * w, 2, 2); }
  }
  x.strokeStyle = 'rgba(80,72,64,0.45)'; x.lineWidth = 2;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * w, 0); x.lineTo(i * w, s); x.stroke(); x.beginPath(); x.moveTo(0, i * w); x.lineTo(s, i * w); x.stroke(); }
});
floorTex.repeat.set(300 / 4, 300 / 4); // 4 m texture = 1 m tiles
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const ceilTex = tileTexture((x, s) => {
  x.fillStyle = '#e4e2dc'; x.fillRect(0, 0, s, s);
  const n = 5, w = s / n; x.strokeStyle = '#b9b6ae'; x.lineWidth = 3;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * w, 0); x.lineTo(i * w, s); x.stroke(); x.beginPath(); x.moveTo(0, i * w); x.lineTo(s, i * w); x.stroke(); }
  // two long fluorescent panels
  for (const py of [w * 1, w * 3]) { x.fillStyle = '#ffffff'; x.shadowColor = '#fff'; x.shadowBlur = 20; x.fillRect(w * 0.5, py + w * 0.32, w * 4, w * 0.36); x.shadowBlur = 0; }
});
ceilTex.repeat.set(300 / 6, 300 / 6);
const ceilMat = new THREE.MeshBasicMaterial({ map: ceilTex, color: 0xffffff });
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), ceilMat);
ceiling.rotation.x = Math.PI / 2; ceiling.position.y = CEIL;
scene.add(ceiling);
const lights = { hemi, amb, ceil: ceilMat.color };

// ---------------------------------------------------------------- world
const world = new World(scene);
let staffSim = null;
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.4, depthWrite: false });
const ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMat);
ghost.visible = false; scene.add(ghost);
const highlight = new THREE.Box3Helper(new THREE.Box3(), 0xffd34d);
highlight.visible = false; scene.add(highlight);
// First-person view of what you're carrying.
const viewHeld = new THREE.Group(); viewHeld.position.set(0.42, -0.42, -0.9); camera.add(viewHeld);
let viewHeldKey = '';

// ---------------------------------------------------------------- state
const net = createNet({
  members: onMembers, hostChanged: onHostChanged, player: onPlayer, request: (from, q) => hostRequest(from, q),
  world: onWorld, staff: onStaffSnap, clock: onClock, hit: (d) => hurt(d, 'staff'), chat: onChat, caught: onCaught,
  need: onNeed, full: onFull,
});

const P = {
  x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, radius: 0.35, height: 1.75, step: 0.45, gravity: 22, onGround: true,
  hp: 100, food: 100, stam: 100, alive: true, carry: null, inv: [null, null, null, null, null], sel: 0, torch: false, third: false,
  nights: 0, hurtT: 99, stamT: 0, respawnT: 0, stepAcc: 0, eatCd: 0, speed: 0, deadAt: 0,
};
const clock = { day: 1, t: 30, ev: '' };
let mode = 'menu', paused = false, chatOpen = false, lastPhase = '', warned = false;
const remotes = new Map(); // id -> { model, tag, buf, name, st }
const staffViews = new Map(); // id -> { model, buf, seen }
let myModel = null;
const pendingFull = { parts: null, n: 0, timer: 0 };

// ---------------------------------------------------------------- UI helpers
function show(id) { for (const s of ['menu', 'how', 'settings', 'pause', 'loading']) $(s).classList.toggle('hidden', s !== id); }
let returnTo = 'menu';
function announce(title, sub, secs = 5) {
  const a = $('announce');
  a.innerHTML = ''; a.append(title); if (sub) { const s = document.createElement('small'); s.textContent = sub; a.append(s); }
  a.classList.remove('hidden');
  clearTimeout(announce.t); announce.t = setTimeout(() => a.classList.add('hidden'), secs * 1000);
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
$('b-solo').onclick = () => { initAudio(); startGame((Math.random() * 4294967296) >>> 0, false); };
$('b-how').onclick = () => { returnTo = 'menu'; show('how'); };
$('b-settings').onclick = () => { returnTo = 'menu'; openSettings(); };
for (const b of document.querySelectorAll('.back')) b.onclick = () => show(returnTo);
$('p-resume').onclick = resume;
$('p-how').onclick = () => { returnTo = 'pause'; show('how'); };
$('p-settings').onclick = () => { returnTo = 'pause'; openSettings(); };
$('p-leave').onclick = leaveGame;

function openSettings() {
  $('s-sens').value = settings.sens; $('s-vol').value = settings.vol; $('s-fov').value = settings.fov; $('s-low').checked = settings.low;
  show('settings');
}
$('s-sens').oninput = (e) => { settings.sens = +e.target.value; saveSettings(); };
$('s-vol').oninput = (e) => { settings.vol = +e.target.value; setVolume(settings.vol); saveSettings(); };
$('s-fov').oninput = (e) => { settings.fov = +e.target.value; camera.fov = settings.fov; camera.updateProjectionMatrix(); saveSettings(); };
$('s-low').onchange = (e) => { settings.low = e.target.checked; renderer.setPixelRatio(Math.min(devicePixelRatio, settings.low ? 1 : 1.75)); saveSettings(); };
setVolume(settings.vol);

initInput(canvas, {
  wantLock: () => { if (mode === 'play' && !paused) lockPointer(canvas); },
  lockLost: () => { if (mode === 'play' && !chatOpen && !IS_TOUCH) pause(); },
});
if (IS_TOUCH) { document.body.classList.add('touch'); }

function pause() { if (mode !== 'play') return; paused = true; returnTo = 'pause'; show('pause'); $('pause-room').textContent = roomText(); }
function resume() { paused = false; show(null); if (!IS_TOUCH) lockPointer(canvas); }
function roomText() { return net.on ? (net.isPublic ? `Public store ${net.room.replace('pub', '#')}` : `Private room code: ${net.room}`) : 'Solo store'; }

// ---------------------------------------------------------------- game start / leave
function startGame(seed, waitForState) {
  world.reset(seed);
  clock.day = 1; clock.t = 30; clock.ev = '';
  world.setDay(1);
  remotes.forEach((r) => scene.remove(r.model.root)); remotes.clear();
  staffViews.forEach((s) => scene.remove(s.model.root)); staffViews.clear();
  staffSim = net.isHost() ? new StaffSim(world) : null;
  Object.assign(P, { hp: 100, food: 100, stam: 100, alive: true, carry: null, inv: [null, null, null, null, null], sel: 0, nights: 0, vy: 0, hurtT: 99 });
  spawnAt(12 + (Math.random() - 0.5) * 6, 12 + (Math.random() - 0.5) * 6, 4);
  if (!myModel) { myModel = makeShopper(nameHash(net.id)); scene.add(myModel.root); }
  mode = 'play'; paused = false; lastPhase = ''; warned = false;
  show(null);
  $('hud').classList.remove('hidden');
  $('death').classList.add('hidden');
  $('room-tag').textContent = roomText(); $('room-tag').classList.remove('hidden');
  $('chat-log').innerHTML = '';
  if (IS_TOUCH) initTouchOnce(); else lockPointer(canvas);
  buildHotbar();
  if (waitForState) { pendingFull.parts = null; net.send('need', {}); }
  if (net.on) toast(`Joined ${roomText().toLowerCase()}. Press T to chat.`);
  announce('Welcome to the store', 'Find food, build somewhere high, and be ready for closing time.', 6);
}
let touchReady = false;
function initTouchOnce() { if (!touchReady) { initTouch($('touch')); touchReady = true; } $('touch').classList.remove('hidden'); }

function leaveGame() {
  net.leave();
  mode = 'menu'; paused = false;
  $('hud').classList.add('hidden'); $('death').classList.add('hidden'); $('touch').classList.add('hidden');
  ghost.visible = false; highlight.visible = false;
  try { document.exitPointerLock(); } catch (_) {}
  show('menu'); refreshBest();
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
  for (const [id, r] of remotes) if (!list.some((m) => m.id === id)) { scene.remove(r.model.root); remotes.delete(id); toast(`${r.name} left the store.`); }
  for (const m of list) if (m.id !== net.id && !remotes.has(m.id)) {
    const model = makeShopper(nameHash(m.id));
    const name = cleanName(m.n) || 'Shopper';
    const tag = nameTag(name); tag.position.y = 2.15; model.root.add(tag);
    model.root.visible = false;
    scene.add(model.root);
    remotes.set(m.id, { model, tag, name, buf: [], st: null, seen: 0 });
    if (mode === 'play') toast(`${name} entered the store.`);
  }
  updateRoster();
}
function onHostChanged(isMe) {
  if (isMe && mode === 'play') {
    staffSim = new StaffSim(world);
    staffViews.forEach((s) => scene.remove(s.model.root)); staffViews.clear();
    toast('You are now hosting this store.');
  } else if (!isMe) staffSim = null;
}
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
function onPlayer(id, p) {
  const r = remotes.get(id); if (!r) return;
  const st = { t: performance.now(), x: num(p.x), y: clamp(num(p.y), 0, CEIL), z: num(p.z), ry: num(p.ry), a: p.a ? 1 : 0, ct: TYPES[p.ct] ? p.ct : '', cv: p.cv | 0, n: p.n | 0, hp: clamp(num(p.hp, 100), 0, 100) };
  r.buf.push(st); if (r.buf.length > 20) r.buf.shift();
  r.st = st; r.seen = performance.now();
}
function onWorld(list) {
  for (const e of list) {
    if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
    const it = world.applyState(e[0], e[1]);
    if (!it) continue;
    if (P.carry && P.carry.id === it.id && it.c !== net.id && !(e[1] && e[1].keep)) {
      // Somebody else got there first, or the host put it down for us.
      if (it.c) toast('Somebody else grabbed that first.');
      P.carry = null;
    }
    if (e[1] && e[1].brk && Math.hypot(it.x - P.x, it.z - P.z) < 20) sfx.breakIt();
  }
}
function onStaffSnap(list) { ingestStaff(list, performance.now()); }
function onClock(p) {
  const d = Math.max(1, p.d | 0), t = clamp(num(p.t), 0, CYCLE);
  if (d !== clock.day) { clock.day = d; world.setDay(d); clock.t = t; }
  else if (Math.abs(t - clock.t) > 1.5) clock.t = t;
  else clock.t += (t - clock.t) * 0.3;
}
function onChat(from, m) { if (!m) return; const r = remotes.get(from); chatLine(r ? r.name : 'Shopper', m); sfx.chat(); }
function onCaught(from, p) { const r = remotes.get(from); toast(`${r ? r.name : 'Someone'} was caught by the staff${p.n ? ` after ${p.n} night${p.n === 1 ? '' : 's'}` : ''}.`); }
function onNeed(from) {
  // Send the newcomer every change, in parts small enough for the server.
  const mods = world.allMods(), size = 80, n = Math.max(1, Math.ceil(mods.length / size));
  for (let i = 0; i < n; i++) net.send('full', { to: from, i, n, m: mods.slice(i * size, (i + 1) * size), d: clock.day, t: clock.t });
}
function onFull(p) {
  if (!Array.isArray(p.m)) return;
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
function hostRequest(from, q) {
  if (!q || typeof q.id !== 'string') return;
  const it = world.items.get(q.id);
  if (!it) return;
  if (q.a === 'take') {
    if (it.k === 'i') {
      if (world.isGone(it) && from !== net.id) return;
      world.edit(it, { g: true, d: clock.day });
      const changed = [it.id];
      broadcastItems(changed);
      return;
    }
    if (world.isGone(it) || (it.c && it.c !== from)) { broadcastItems([it.id]); return; }
    const box = world.itemBox(it);
    world.edit(it, { c: from });
    const changed = [it.id, ...world.settle(box)];
    broadcastItems(changed);
  } else if (q.a === 'place') {
    if (it.c !== from) { broadcastItems([it.id]); return; }
    const x = num(q.x, it.x), y = clamp(num(q.y), 0, CEIL), z = num(q.z, it.z);
    if (Math.abs(x - it.x) > 80 && remotes.size === 0 && from !== net.id) return;
    world.edit(it, { x, y, z, r: (q.r | 0) & 3, c: null });
    broadcastItems([it.id]);
  }
}
// Ask the host; if we are the host, just do it.
function request(q) {
  if (net.isHost()) hostRequest(net.id, q);
  else net.send('q', q);
}

// ---------------------------------------------------------------- player
function hurt(d, why) {
  if (!P.alive || mode !== 'play') return;
  P.hp -= d; P.hurtT = 0;
  $('hurt').style.opacity = 1; setTimeout(() => { $('hurt').style.opacity = 0; }, 180);
  sfx.hurt();
  if (P.hp <= 0) die(why);
}
function die(why) {
  P.hp = 0; P.alive = false; P.deadAt = performance.now();
  P.respawnT = 7;
  sfx.death();
  if (P.carry) { // drop what we carried where we stand
    const it = world.items.get(P.carry.id);
    if (it) { const y = world.supportHeight(P.x - 0.4, P.z - 0.4, P.x + 0.4, P.z + 0.4, P.y + 0.1, it); request({ a: 'place', id: it.id, x: P.x, y, z: P.z, r: P.carry.r }); }
    P.carry = null;
  }
  P.inv = [null, null, null, null, null]; buildHotbar();
  $('death').classList.remove('hidden');
  $('death-msg').textContent = why === 'hunger' ? 'You starved.' : why === 'fall' ? 'You fell too far.' : `You survived ${P.nights} night${P.nights === 1 ? '' : 's'}.`;
  net.send('x', { n: P.nights, w: why });
  P.nights = 0;
}
function respawn() {
  // Wake up somewhere else in the store.
  const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 40;
  spawnAt(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 10);
  Object.assign(P, { hp: 100, food: 80, stam: 100, alive: true, vy: 0, hurtT: 99 });
  $('death').classList.add('hidden');
  announce('You wake up in another aisle', 'Your things are gone. Find food and shelter.', 4);
}

function updatePlayer(dt) {
  const k = input.keys;
  const busy = paused || chatOpen;
  if (!busy) {
    P.yaw -= input.lookDX * 0.0022 * settings.sens;
    P.pitch = clamp(P.pitch - input.lookDY * 0.0022 * settings.sens, -1.5, 1.5);
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
  const wantSprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && moving && fz < 0.3;
  const sprint = wantSprint && P.stam > 1;
  let speed = (sprint ? 7.4 : 4.6) * (P.carry ? 0.85 : 1);
  const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  const dx = (fx * cos + fz * sin) * speed * dt, dz = (-fx * sin + fz * cos) * speed * dt;
  if (!busy && P.alive && k.has('Space') && P.onGround) { P.vy = 7.2; P.onGround = false; }
  const ox = P.x, oz = P.z, wasAir = !P.onGround;
  P.landSpeed = 0;
  if (P.alive) moveBody(world, P, dx, dz, dt);
  P.speed = Math.hypot(P.x - ox, P.z - oz) / dt;
  if (wasAir && P.onGround && P.landSpeed > 4) sfx.land();
  if (P.landSpeed > 13) hurt((P.landSpeed - 13) * 9, 'fall');
  // footsteps
  if (P.onGround && P.speed > 0.5) { P.stepAcc += P.speed * dt; if (P.stepAcc > (sprint ? 2.2 : 1.7)) { P.stepAcc = 0; sfx.step(!sprint); } }
  // stamina, hunger and health
  if (sprint) { P.stam = Math.max(0, P.stam - 22 * dt); P.stamT = 0.8; }
  else if ((P.stamT -= dt) <= 0) P.stam = Math.min(100, P.stam + 15 * dt);
  if (P.alive) {
    P.food = Math.max(0, P.food - dt * (100 / 600) * (sprint ? 1.8 : 1));
    if (P.food <= 0) { P.hp -= dt * 1.2; if (P.hp <= 0) die('hunger'); }
    P.hurtT += dt;
    if (P.food > 45 && P.hurtT > 6 && P.hp < 100) P.hp = Math.min(100, P.hp + dt * 0.8);
  }
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
    if (it.k === 'i' || TYPES[it.t].flat) { const b = world.itemBox(it); if (it.k === 'f') b.y1 = 0.06; test(b); }
  });
  if (dy < 0) { const tf = -oy / dy; if (tf > 0 && tf < best.t) best = { t: tf, box: null, n: [0, 1, 0], floor: true }; }
  return best;
}

let target = null, placement = null;
function eye() { return [P.x, P.y + 1.6, P.z]; }
function lookDir() { const cp = Math.cos(P.pitch); return [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp]; }

function updateInteraction(dt) {
  target = null; placement = null;
  highlight.visible = false; ghost.visible = false;
  const prompt = $('prompt');
  let text = '';
  if (!P.alive || paused) { prompt.classList.add('hidden'); return; }
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
        text = free >= 0 ? `<b>E</b> Take ${ITEMS[it.t].name}` : 'Your hands are full (5 items)';
        if ((pressedUse || (IS_TOUCH && clicked)) && free >= 0) {
          P.inv[free] = it.t; buildHotbar(); sfx.pick();
          if (!net.isHost()) { world.edit(it, { g: true, d: clock.day }); }
          request({ a: 'take', id: it.id });
        }
      } else {
        text = `<b>E</b> Pick up ${TYPES[it.t].name}`;
        if (pressedUse) {
          P.carry = { id: it.id, t: it.t, v: it.v, r: it.r };
          sfx.pick();
          if (!net.isHost()) { world.edit(it, { c: net.id }); }
          request({ a: 'take', id: it.id });
        }
      }
    }
    // use food from the hotbar
    if (clicked && !(IS_TOUCH && target && target.k === 'i')) useSelected();
  } else {
    const t = TYPES[P.carry.t];
    if (input.pressed.has('KeyR') || input.rclicked) P.carry.r = (P.carry.r + 1) & 3;
    const [w, d] = footprint(P.carry.t, P.carry.r);
    const hit = raycast(ex, ey, ez, dx, dy, dz, 5, false);
    let px, pz, maxY;
    const hp = [ex + dx * hit.t, ey + dy * hit.t, ez + dz * hit.t];
    if (hit.n && hit.n[1] > 0.5) { px = hp[0]; pz = hp[2]; maxY = hp[1] + 0.05; }
    else if (hit.n) { px = hp[0] + hit.n[0] * (w / 2 + 0.02); pz = hp[2] + hit.n[2] * (d / 2 + 0.02); maxY = hp[1] + 0.05; }
    else { px = hp[0]; pz = hp[2]; maxY = hp[1]; }
    if (px !== undefined) {
      px = Math.round(px * 4) / 4 + (w * 4 % 2 ? 0.125 : 0); pz = Math.round(pz * 4) / 4 + (d * 4 % 2 ? 0.125 : 0);
      const item = world.items.get(P.carry.id);
      const py = world.supportHeight(px - w / 2, pz - d / 2, px + w / 2, pz + d / 2, maxY, item);
      const box = { x0: px - w / 2, x1: px + w / 2, z0: pz - d / 2, z1: pz + d / 2, y0: py, y1: py + t.h };
      const pr = P.radius + 0.02;
      const onMe = !t.flat && box.x0 < P.x + pr && box.x1 > P.x - pr && box.z0 < P.z + pr && box.z1 > P.z - pr && box.y0 < P.y + P.height && box.y1 > P.y + 0.01;
      const ok = (t.flat || world.fits(box, item)) && !onMe && Math.hypot(px - P.x, pz - P.z) < 5;
      placement = { x: px, y: py, z: pz, r: P.carry.r, ok };
      ghost.geometry = furnitureGeometry(P.carry.t, P.carry.v);
      ghost.position.set(px, py + 0.005, pz); ghost.rotation.y = P.carry.r * Math.PI / 2;
      ghostMat.color.setHex(ok ? 0x44ff66 : 0xff4444);
      ghost.visible = true;
    }
    text = `Carrying ${t.name} · <b>E</b>/click place · <b>R</b> rotate · <b>Q</b> drop`;
    if (pressedUse || clicked) {
      if (placement && placement.ok) placeCarry(placement);
      else sfx.deny();
    } else if (input.pressed.has('KeyQ')) {
      const fx = P.x - Math.sin(P.yaw) * 1.2, fz = P.z - Math.cos(P.yaw) * 1.2;
      const item = world.items.get(P.carry.id);
      const fy = world.supportHeight(fx - w / 2, fz - d / 2, fx + w / 2, fz + d / 2, P.y + 0.5, item);
      const box = { x0: fx - w / 2, x1: fx + w / 2, z0: fz - d / 2, z1: fz + d / 2, y0: fy, y1: fy + t.h };
      if (t.flat || world.fits(box, item)) placeCarry({ x: fx, y: fy, z: fz, r: P.carry.r });
      else sfx.deny();
    }
  }
  if (text) { prompt.innerHTML = text; prompt.classList.remove('hidden'); } else prompt.classList.add('hidden');
}
function placeCarry(p) {
  const id = P.carry.id;
  const it = world.items.get(id);
  if (it && !net.isHost()) { world.edit(it, { x: p.x, y: p.y, z: p.z, r: p.r, c: null }); }
  P.carry = null;
  sfx.place();
  request({ a: 'place', id, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), r: p.r });
}
function useSelected() {
  const key = P.inv[P.sel];
  if (!key || P.eatCd > 0) return;
  const it = ITEMS[key];
  if (it.hp && !it.food && P.hp >= 100) { toast("You're not hurt."); return; }
  P.eatCd = 0.5;
  if (it.food) P.food = Math.min(100, P.food + it.food);
  if (it.hp) P.hp = Math.min(100, P.hp + it.hp);
  if (it.stam) P.stam = Math.min(100, P.stam + it.stam);
  P.inv[P.sel] = null; buildHotbar();
  if (it.food) sfx.eat(); else sfx.heal();
}

// ---------------------------------------------------------------- hotbar / HUD
function buildHotbar() {
  const hb = $('hotbar'); hb.innerHTML = '';
  P.inv.forEach((key, i) => {
    const s = document.createElement('div'); s.className = 'slot' + (i === P.sel ? ' sel' : '');
    const k = document.createElement('span'); k.className = 'k'; k.textContent = i + 1; s.append(k);
    if (key) {
      const it = ITEMS[key];
      const sw = document.createElement('div'); sw.className = 'sw'; sw.style.background = '#' + it.color.toString(16).padStart(6, '0'); s.append(sw);
      s.append(it.name);
    }
    s.addEventListener('touchstart', (e) => { e.stopPropagation(); if (P.sel === i) useSelected(); else { P.sel = i; buildHotbar(); } }, { passive: true });
    hb.append(s);
  });
}
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
  bars[0].style.width = P.hp + '%'; bars[1].style.width = P.food + '%'; bars[2].style.width = P.stam + '%';
  const night = isNight(clock.t);
  $('clock').classList.toggle('night', isHostile(clock.t, clock.ev));
  $('clock-day').textContent = `Day ${clock.day}`;
  $('clock-time').textContent = clockText(clock.t);
  $('clock-phase').textContent = isHostile(clock.t, clock.ev) ? (night ? `Closed · staff hunting · ${Math.ceil(CYCLE - clock.t)}s` : 'Power cut · staff hunting') : `Open · closing in ${Math.ceil(DAY_LEN - clock.t)}s`;
  const ev = $('event');
  if (clock.ev) { ev.textContent = EVENTS[clock.ev].name; ev.classList.remove('hidden'); } else ev.classList.add('hidden');
  $('survived').textContent = `Nights survived: ${P.nights}`;
  const showRoster = input.keys.has('Tab');
  $('roster').classList.toggle('hidden', !showRoster); $('room-tag').classList.toggle('hidden', showRoster);
  if (showRoster && hudT <= 0) { updateRoster(); hudT = 0.5; }
  const now = performance.now();
  for (const d of $('chat-log').children) d.style.opacity = chatOpen || now - d._t < 12000 ? 1 : 0;
  if (!P.alive) {
    P.respawnT -= dt;
    $('death-timer').textContent = P.respawnT > 0 ? `Waking up in ${Math.ceil(P.respawnT)}…` : '';
    if (P.respawnT <= 0) respawn();
  }
}

// ---------------------------------------------------------------- clock & announcements
function updateClock(dt) {
  if (net.isHost()) {
    clock.t += dt;
    if (clock.t >= CYCLE) { clock.t -= CYCLE; clock.day++; world.setDay(clock.day); }
  } else clock.t = Math.min(CYCLE - 0.001, clock.t + dt);
  clock.ev = eventFor(world.seed, clock.day);
  const phase = isNight(clock.t) ? 'night' : 'day';
  if (lastPhase && phase !== lastPhase) {
    if (phase === 'night') {
      sfx.chime();
      announce('The store is now closed', 'Staff are on the floor. Get somewhere high or stay hidden.', 6);
      warned = false;
    } else {
      sfx.morning();
      if (P.alive) { P.nights++; if (P.nights > stats.best) stats.best = P.nights; stats.days++; saveStats(); }
      const e = clock.ev && EVENTS[clock.ev];
      announce(`Good morning! Day ${clock.day}`, e ? `${e.name}: ${e.desc}` : 'The store is open. Food has been restocked.', 7);
    }
  }
  if (phase === 'day' && clock.t > DAY_LEN - 30 && !warned) { warned = true; sfx.chime(); announce('The store closes in 30 seconds', 'Find somewhere safe.', 4); }
  if (clock.ev === 'powercut' && Math.abs(clock.t - 120) < dt * 1.5) announce('Power cut!', 'The staff are restless in the dark.', 4);
  lastPhase = phase;
}

// ---------------------------------------------------------------- staff (drawing)
function ingestStaff(list, now) {
  const seen = new Set();
  for (const e of list) {
    if (!Array.isArray(e) || e.length < 6) continue;
    const id = e[0] | 0; seen.add(id);
    let v = staffViews.get(id);
    if (!v) { v = { model: makeStaff(), buf: [] }; scene.add(v.model.root); staffViews.set(id, v); }
    v.buf.push({ t: now, x: e[1] / 100, y: e[2] / 100, z: e[3] / 100, ry: e[4] / 100, f: e[5] | 0, s: (e[6] | 0) / 10 });
    if (v.buf.length > 12) v.buf.shift();
    v.seen = now;
  }
  for (const [id, v] of staffViews) if (!seen.has(id) && now - v.seen > 600) { scene.remove(v.model.root); staffViews.delete(id); }
}
let murmurT = 0;
function drawStaff(dt, now) {
  const delay = net.isHost() ? 0 : 140;
  let nearest = Infinity, nearPan = 0, anyHostile = false;
  for (const v of staffViews.values()) {
    const at = now - delay, b = v.buf;
    let i = b.length - 1; while (i > 0 && b[i - 1].t > at) i--;
    const s1 = b[i], s0 = i > 0 ? b[i - 1] : s1;
    const span = s1.t - s0.t, u = span > 0 ? clamp((at - s0.t) / span, 0, 1) : 1;
    const m = v.model;
    m.root.position.set(lerp(s0.x, s1.x, u), lerp(s0.y, s1.y, u), lerp(s0.z, s1.z, u));
    m.root.rotation.y = angLerp(s0.ry, s1.ry, u);
    const hostile = !!(s1.f & 1);
    m.eyes.visible = hostile;
    animate(m, s1.s, dt, { reach: s1.f & 6 ? now / 1000 : 0 });
    const d = Math.hypot(m.root.position.x - P.x, m.root.position.z - P.z);
    if (hostile) { anyHostile = true; if (d < nearest) { nearest = d; const a = Math.atan2(m.root.position.x - P.x, m.root.position.z - P.z) - P.yaw; nearPan = clamp(-Math.sin(a), -1, 1); } }
    if ((s1.f & 4) && Math.random() < dt * 2.5 && d < 18) sfx.bash();
  }
  murmurT -= dt;
  if (anyHostile && nearest < 14 && murmurT <= 0) { sfx.staffNear(nearPan); murmurT = 0.5 + nearest / 10; }
}

// ---------------------------------------------------------------- remote shoppers (drawing)
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
    setHeld(m, s1.ct, s1.cv);
    animate(m, Math.min(sp, 9), dt, { carrying: !!s1.ct });
  }
}

// ---------------------------------------------------------------- frame
let last = performance.now(), sendT = 0, staffSendT = 0, clockSendT = 0, chunkT = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode !== 'play') { renderMenuBackdrop(dt); endFrame(); return; }
  handleKeys();
  updateClock(dt);
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
  // host: staff
  if (net.isHost() && staffSim) {
    const players = [{ id: net.id, x: P.x, y: P.y, z: P.z, alive: P.alive }];
    for (const [id, r] of remotes) if (r.st && now - r.seen < 6000) players.push({ id, x: r.st.x, y: r.st.y, z: r.st.z, alive: !!r.st.a });
    const out = staffSim.update(dt, players, { hostile: isHostile(clock.t, clock.ev), event: clock.ev });
    for (const h of out.hits) { if (h.to === net.id) hurt(h.d, 'staff'); else net.send('h', { to: h.to, d: h.d }); }
    if (out.items.length) {
      const ids = [], extra = {};
      for (const { it, broke } of out.items) {
        if (broke) {
          const box = world.itemBox(it);
          world.edit(it);
          ids.push(it.id, ...world.settle(box)); extra[it.id] = { brk: 1 };
          if (Math.hypot(it.x - P.x, it.z - P.z) < 20) sfx.breakIt();
        } else ids.push(it.id);
      }
      broadcastItems([...new Set(ids)], extra);
    }
    const snap = staffSim.snapshot();
    ingestStaff(snap, now);
    if (now >= staffSendT && net.on) { staffSendT = now + 125; net.send('s', { s: snap }); }
    if (now >= clockSendT && net.on) { clockSendT = now + 1000; net.send('g', { d: clock.day, t: +clock.t.toFixed(2) }); }
  }
  drawStaff(dt, now);
  drawRemotes(dt, now);
  // send our state
  if (now >= sendT && net.on) {
    sendT = now + 100;
    net.send('p', { x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), ry: +P.yaw.toFixed(2), a: P.alive ? 1 : 0, ct: P.carry ? P.carry.t : '', cv: P.carry ? P.carry.v : 0, n: P.nights, hp: Math.ceil(P.hp) });
  }
  // light and camera
  const L = lightLevel(clock.t, clock.ev, now / 1000);
  applyLight(scene, lights, L, clock.ev, settings.low);
  setAmbience(isHostile(clock.t, clock.ev), L > 0.5);
  torch.intensity = P.torch && P.alive ? 38 : 0;
  floor.position.set(Math.round(P.x / 4) * 4, 0, Math.round(P.z / 4) * 4);
  ceiling.position.set(Math.round(P.x / 6) * 6, CEIL, Math.round(P.z / 6) * 6);
  placeCamera(dt);
  updateHud(dt);
  world.flushItems();
  renderer.render(scene, camera);
  endFrame();
}

function placeCamera(dt) {
  const ey = P.y + 1.6;
  camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  myModel.root.position.set(P.x, P.y, P.z);
  myModel.root.rotation.y = P.yaw + Math.PI;
  setHeld(myModel, P.carry ? P.carry.t : '', P.carry ? P.carry.v : 0);
  animate(myModel, P.speed, dt, { carrying: !!P.carry });
  if (P.third && P.alive) {
    const [dx, dy, dz] = lookDir();
    const hit = raycast(P.x, ey, P.z, -dx, -dy, -dz, 4, false);
    const dist = Math.max(0.6, hit.t - 0.3);
    camera.position.set(P.x - dx * dist, ey - dy * dist + 0.3, P.z - dz * dist);
    myModel.root.visible = true;
  } else {
    camera.position.set(P.x, P.alive ? ey : P.y + 0.4, P.z);
    myModel.root.visible = false;
  }
  // first-person carried piece
  const key = P.carry && !P.third ? P.carry.t + ':' + P.carry.v : '';
  if (key !== viewHeldKey) {
    viewHeldKey = key;
    while (viewHeld.children.length) viewHeld.remove(viewHeld.children[0]);
    if (key) {
      const t = TYPES[P.carry.t];
      const mesh = new THREE.Mesh(furnitureGeometry(P.carry.t, P.carry.v), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
      const s = 0.38 / Math.max(t.w, t.d, t.h);
      mesh.scale.setScalar(s); mesh.position.set(0, -t.h * s / 2, 0); mesh.rotation.y = 0.5;
      viewHeld.add(mesh);
    }
  }
}

function handleKeys() {
  const p = input.pressed;
  if (chatOpen) return;
  if (p.has('KeyT') || p.has('Enter')) { openChat(); return; }
  if (p.has('Escape') && IS_TOUCH) { pause(); return; }
  if (p.has('KeyV')) P.third = !P.third;
  if (p.has('KeyF')) P.torch = !P.torch;
  if (p.has('KeyH')) { const pa = paused; pause(); if (!pa) { returnTo = 'pause'; show('how'); } }
  for (let i = 0; i < 5; i++) if (p.has('Digit' + (i + 1))) { P.sel = i; buildHotbar(); }
  if (input.wheel) { P.sel = (P.sel + input.wheel + 5) % 5; buildHotbar(); }
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
  applyLight(scene, lights, 1, '', settings.low);
  floor.position.set(Math.round(x / 4) * 4, 0, Math.round(z / 4) * 4);
  ceiling.position.set(Math.round(x / 6) * 6, CEIL, Math.round(z / 6) * 6);
  camera.position.set(x, 2.2, z);
  camera.rotation.set(-0.12, Math.PI + Math.sin(menuT * 0.07) * 0.6, 0, 'YXZ');
  torch.intensity = 0;
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
  useForTest: () => useSelected(), setClock: (t, d) => { clock.t = t; if (d) { clock.day = d; world.setDay(d); } }, get staff() { return staffSim; } };
