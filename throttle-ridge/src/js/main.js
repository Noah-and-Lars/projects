// Game entry point: state machine, fixed-timestep loop, glue between modules.
import { TRACKS, buildTrack } from './tracks.js';
import { STEP } from './physics.js';
import { createRace, startRacing, stepRace, restartPlayer, positionOf } from './race.js';
import { createRenderer, createView } from './render.js';
import { createCameraRig } from './camera.js';
import { createInput, isTouchDevice } from './input.js';
import { createAudio } from './audio.js';
import { createUI, ordinal } from './ui.js';
import { load, save } from './storage.js';
import { createAI } from './ai.js';
import { createNet } from './net.js';
import { createSpeedo } from './speedo.js';
import { BIKES } from './bike.js';

window.__trStarted = true;
const $ = (id) => document.getElementById(id);

// ---- Device / quality ----
const touch = isTouchDevice();
const phone = touch && Math.min(screen.width, screen.height) < 600;
const quality = {
  mobile: touch,
  maxDpr: 2,
  shadowSize: phone ? 1024 : touch ? 1536 : 2048,
  ao: !touch && !/[?&]noao/.test(location.search),
};

// Pre-compute track profiles for the track-select thumbnails.
for (const def of TRACKS) {
  const t = buildTrack(def);
  def.__profile = { xs: t.xs, ys: t.ys, minY: t.minY, maxY: t.maxY };
}

// ---- iOS / mobile gesture lockdown ----
const allowScroll = (e) => e.target.closest && e.target.closest('.scroll');
document.addEventListener('touchmove', (e) => { if (!allowScroll(e)) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && !e.target.closest('button, .tbtn')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Apple touch icon rendered at runtime (iOS needs a PNG).
try {
  const c = document.createElement('canvas'); c.width = c.height = 180;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 180); grd.addColorStop(0, '#2e1f5e'); grd.addColorStop(1, '#ff4d2e');
  g.fillStyle = grd; g.fillRect(0, 0, 180, 180);
  g.fillStyle = '#b27a45'; g.beginPath(); g.moveTo(0, 150); g.quadraticCurveTo(70, 150, 110, 95); g.lineTo(110, 180); g.lineTo(0, 180); g.fill();
  g.fillStyle = '#ffd23f'; g.font = 'italic 900 60px Arial Black, Arial, sans-serif'; g.textAlign = 'center';
  g.fillText('TR', 112, 80);
  $('apple-icon').href = c.toDataURL('image/png');
} catch (_) {}

// ---- Core systems ----
const canvas = $('game');
const renderer = createRenderer(canvas, quality);
const rig = createCameraRig();
const audio = createAudio();
let data = load();
audio.setMuted(data.muted);

const game = {
  state: 'menu', // menu | race | paused | results
  race: null, view: null, trackIndex: 0,
  acc: 0, gateDrop: 0, finishTimer: -1, lastCount: 4, resultsShown: false,
};

const ui = createUI({
  click: () => audio.click(),
  save: () => data,
  setSkill: (s) => { data.skill = s; save(data); },
  setBike: (k) => { data.bike = BIKES[k] ? k : 'stock'; save(data); if (net.on) net.set({ b: data.bike }); renderLobby(); },
  online: () => openOnline(),
  backToLobby: () => backToLobby(),
  startTrack: (i) => startRace(i),
  toggleMute,
  pause: () => pause(),
  resume: () => resume(),
  restart: () => startRace(game.trackIndex),
  quit: () => quitToMenu(),
  toMenu: () => quitToMenu(true),
  next: () => startRace(Math.min(TRACKS.length - 1, game.trackIndex + 1)),
});
ui.setMuted(data.muted);
ui.show('menu');
const speedo = createSpeedo($('speedoC'));

const input = createInput({
  onRestart: () => {
    if (game.state === 'race' && game.race.state === 'racing' && !game.race.player.finished) {
      restartPlayer(game.race);
      rig.addShake(0.2);
    } else if (game.state === 'results' && !game.online) startRace(game.trackIndex);
  },
  onPause: () => { if (game.state === 'race') pause(); else if (game.state === 'paused') resume(); },
  onMute: toggleMute,
});
if (touch) document.body.classList.add('touch');

function toggleMute() {
  data.muted = !data.muted;
  audio.setMuted(data.muted);
  ui.setMuted(data.muted);
  save(data);
}

// ---- Menu backdrop: a slow attract-mode race on track 1 ----
function setupAttract() {
  disposeView();
  game.race = createRace(TRACKS[0], { skill: 'medium', aiOnly: true });
  game.view = createView(renderer, game.race, quality);
  game.race.state = 'racing';
  game.attract = true;
  rig.state.init = false;
}

function disposeView() {
  if (game.view) game.view.dispose();
  game.view = null;
}

function startRace(i, online = null) {
  if (!online && i >= data.unlocked) return;
  if (!online && net.on) net.leave();
  disposeView();
  game.trackIndex = i;
  game.attract = false;
  game.online = !!online;
  game.race = createRace(TRACKS[i], { skill: data.skill, bike: data.bike, online });
  if (online) net.attach(game.race);
  game.view = createView(renderer, game.race, quality);
  game.state = 'race';
  game.gateDrop = 0;
  game.finishTimer = -1;
  game.lastCount = 4;
  game.resultsShown = false;
  game.acc = 0;
  rig.state.init = false;
  input.clear();
  ui.show(null);
  ui.stack.length = 0;
  ui.showHUD(true, `${i + 1}. ${TRACKS[i].name} · ${online ? 'ONLINE' : data.skill.toUpperCase()} · ${BIKES[data.bike].name}`);
  $('touch').classList.toggle('hidden', !touch);
  $('speedo').classList.remove('hidden');
  speedo.reset();
  $('btn-restart').classList.toggle('hidden', !!online);
  $('btn-quit').textContent = online ? 'LEAVE RACE' : 'QUIT TO MENU';
  // Let suspension settle before the countdown begins.
  for (let k = 0; k < 40; k++) stepRace(game.race);
  game.view.afterStep(); game.view.afterStep();
  game.race.countdown = 3.6;
}

function pause() {
  if (game.state !== 'race') return;
  game.state = 'paused';
  input.clear();
  if (game.race) game.race.playerInput = { throttle: 0, brake: 0, lean: 0 };
  audio.suspend();
  ui.show('pause');
}
function resume() {
  if (game.state !== 'paused') return;
  game.state = 'race';
  game.acc = 0;
  ui.show(null);
  ui.stack.length = 0;
}
function quitToMenu(toSelect = false) {
  if (game.online) { backToLobby(); return; }
  game.state = 'menu';
  audio.suspend();
  ui.showHUD(false);
  $('touch').classList.add('hidden');
  $('speedo').classList.add('hidden');
  setupAttract();
  if (!toSelect) { ui.stack.length = 0; ui.show('menu'); }
}

function finishRace() {
  const race = game.race, p = race.player;
  const position = placeOf(race, p);
  const def = TRACKS[game.trackIndex];
  const prevBest = data.best[def.id];
  const newBest = !prevBest || p.finishTime < prevBest;
  if (newBest) data.best[def.id] = p.finishTime;
  let unlockedNext = false;
  if (!game.online && position <= 2 && game.trackIndex + 1 < TRACKS.length && data.unlocked < game.trackIndex + 2) {
    data.unlocked = game.trackIndex + 2;
    unlockedNext = true;
  }
  save(data);
  game.state = 'results';
  audio.suspend();
  ui.showHUD(false);
  $('touch').classList.add('hidden');
  $('speedo').classList.add('hidden');
  ui.results({
    race, position, time: p.finishTime, best: data.best[def.id], newBest, unlockedNext, online: game.online,
    hasNext: game.trackIndex + 1 < TRACKS.length,
    nextLocked: game.trackIndex + 1 >= data.unlocked,
  });
}

// ---- Events from the simulation ----
function handleEvents(race) {
  for (const e of race.events) {
    const isPlayer = e.bike === 0 && !game.attract;
    if (!isPlayer) continue;
    if (e.type === 'land') {
      const k = Math.min(1, e.impact / 14);
      audio.land(k * (e.quality < 0.5 ? 1.3 : 1));
      if (e.impact > 7) rig.addShake(Math.min(0.9, (e.impact - 6) * 0.08));
      if (e.quality > 0.95 && race.player.airTime === 0 && e.impact < 9) { /* clean landing */ }
      if (e.quality < 0.35) ui.toast('Sketchy landing!', 900);
    } else if (e.type === 'crash') {
      audio.crash();
      rig.addShake(0.8);
      ui.toast('CRASH!', 900);
    } else if (e.type === 'finish') {
      audio.finish();
      ui.toast(`${ordinal(placeOf(race, race.player))} place!`, 1400);
      game.finishTimer = 1.6;
    }
  }
}

// Finishing place: by finish time (online, the other riders' times come from
// their own screens, so race.finishOrder only knows about this one).
function placeOf(race, bike) {
  if (!race.online) return race.finishOrder.indexOf(bike.id) + 1;
  return 1 + race.bikes.filter(b => b !== bike && b.finished && b.finishTime < bike.finishTime).length;
}

// ---- Online (1.1) ----
const net = createNet({
  lobby: () => renderLobby(),
  start: ({ track, players }) => startRace(track, { players }),
  remoteFinish: (b) => { if (game.state === 'race') ui.toast(`${b.name} finished!`, 1100); },
});
const onlineMsg = (t) => { $('online-msg').textContent = t || ''; };
function openOnline() {
  onlineMsg('');
  ui.show('online');
}
async function goOnline(how) {
  onlineMsg('Connecting...');
  for (const id of ['btn-quick', 'btn-create', 'btn-join']) $(id).disabled = true;
  try {
    const opts = { bike: data.bike, track: 0 };
    let r;
    if (how === 'quick') r = await net.quick(opts);
    else if (how === 'create') r = await net.create(opts);
    else r = await net.join($('join-code').value, opts);
    if (r === 'full') onlineMsg(how === 'quick' ? 'Every public room is full. Try again soon.' : 'That room is full (4 riders).');
    else if (r === 'bad') onlineMsg('Type a room code first.');
    else { onlineMsg(''); ui.stack.length = 0; ui.stack.push('menu'); ui.show('lobby'); renderLobby(); }
  } catch (e) {
    onlineMsg('Could not connect. Online play needs an arcade account and works on the arcade website.');
  }
  for (const id of ['btn-quick', 'btn-create', 'btn-join']) $(id).disabled = false;
}
$('btn-quick').addEventListener('click', () => { audio.click(); goOnline('quick'); });
$('btn-create').addEventListener('click', () => { audio.click(); goOnline('create'); });
$('btn-join').addEventListener('click', () => { audio.click(); goOnline('join'); });
$('join-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') goOnline('join'); });
$('btn-lobby-leave').addEventListener('click', () => { audio.click(); net.leave(); ui.stack.length = 0; ui.show('menu'); });
$('btn-lobby-start').addEventListener('click', () => { audio.click(); if (!net.start()) renderLobby(); });

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderLobby() {
  if (!net.on) return;
  ui.renderBike();
  const ms = net.members(), host = net.host(), amHost = net.isHost();
  $('lobby-title').textContent = net.isPublic ? 'Public race' : 'Room ' + net.room;
  const list = $('lobby-players');
  list.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const m = ms[i], li = document.createElement('li');
    if (!m) { li.className = 'empty'; li.textContent = 'Waiting for a rider...'; list.appendChild(li); continue; }
    const tags = [m.id === host?.id ? 'host' : '', m.s === 'race' ? 'racing' : ''].filter(Boolean).join(' · ');
    li.innerHTML = `<span class="${m.id === net.id ? 'me' : ''}">${esc(m.n || 'Rider')}${m.id === net.id ? ' (you)' : ''}</span><span class="tg">${tags}</span><span class="bk">${m.b === 'mid' ? BIKES.mid.name : BIKES.stock.name}</span>`;
    list.appendChild(li);
  }
  const k = (host && host.k) | 0;
  const tr = $('lobby-tracks');
  tr.innerHTML = '';
  TRACKS.forEach((def, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1}. ${def.name}`;
    b.classList.toggle('on', i === k);
    b.disabled = !amHost;
    b.addEventListener('click', () => { if (!net.isHost()) return; audio.click(); net.set({ k: i }); renderLobby(); });
    tr.appendChild(b);
  });
  const waiting = ms.filter(m => m.s === 'lobby').length;
  const cd = net.countdown();
  $('btn-lobby-start').classList.toggle('hidden', !amHost);
  $('btn-lobby-start').disabled = !net.canStart();
  $('lobby-msg').textContent = waiting < 2 ? 'Waiting for another rider to join...' + (net.isPublic ? '' : ' Share the code ' + net.room + '.')
    : cd > 0 ? `Race starts in ${cd}...`
    : amHost ? (net.isPublic ? 'Press START, or the race starts by itself.' : 'Pick a track and press START.')
    : 'Waiting for the host to start the race...';
}
function backToLobby() {
  game.online = false;
  game.state = 'menu';
  audio.suspend();
  ui.showHUD(false);
  $('touch').classList.add('hidden');
  $('speedo').classList.add('hidden');
  net.attach(null);
  setupAttract();
  if (net.on) { net.backToLobby(); ui.stack.length = 0; ui.stack.push('menu'); ui.show('lobby'); renderLobby(); }
  else { ui.stack.length = 0; ui.show('menu'); }
}
let resTick = 0;

// ---- Main loop ----
let last = performance.now();
const frameTimes = [];
let dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.resize(w, h);
  game.view?.setSize?.(w, h);
  // Touch devices in portrait: pause and show the rotate overlay (CSS).
  if (touch && h > w && game.state === 'race') pause();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => pause());

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  const race = game.race;
  if (!race || !game.view) return;

  // Online races never stop: the pause menu is only an overlay there.
  const running = game.state === 'race' || game.state === 'menu' || game.state === 'results' || (game.state === 'paused' && game.online);
  if (running) {
    if (game.state === 'race') race.playerInput = input.state();
    game.acc += dt;
    let steps = 0;
    while (game.acc >= STEP && steps < 5) {
      game.acc -= STEP; steps++;
      if (race.state === 'countdown') {
        race.countdown -= STEP;
        const n = Math.ceil(race.countdown - 0.6);
        if (n !== game.lastCount && n >= 1 && n <= 3) { game.lastCount = n; ui.countdown(String(n)); audio.beep(false); }
        if (race.countdown <= 0.6) { startRacing(race); ui.countdown('GO!'); audio.beep(true); }
      }
      stepRace(race);
      game.view.afterStep();
      handleEvents(race);
      if (game.attract && race.bikes.every(b => b.finished)) { setupAttract(); return; }
    }
    if (steps === 5) game.acc = 0;
    if (race.state === 'racing' && game.gateDrop < 1) game.gateDrop = Math.min(1, game.gateDrop + dt * 4);
    if (game.finishTimer > 0) {
      game.finishTimer -= dt;
      if (game.finishTimer <= 0 && game.state === 'race') finishRace();
    }
  }

  const alpha = running ? game.acc / STEP : 1;
  // Camera follows the player (or the leader in attract mode).
  const focus = game.attract ? race.bikes.reduce((a, b) => (b.chassis.getPosition().x > a.chassis.getPosition().x ? b : a)) : race.player;
  const ps = game.attract ? focus.chassis.getPosition() : game.view.playerState(alpha);
  const v = focus.chassis.getLinearVelocity();
  rig.update(running ? dt : 0, { x: ps.x, y: ps.y, vx: v.x, vy: v.y, airTime: focus.airTime }, race.track, game.view.laneZ);
  if (window.__game && window.__game.cine) window.__game.cine(rig.camera, game); // test hook: posed shots
  game.view.draw(alpha, running ? dt : 0, rig.camera, game.gateDrop);

  if (game.state === 'race') {
    ui.hud(race, positionOf(race, race.player));
    const p = race.player;
    audio.setEngine(p.rpm, p.input.throttle, true);
    speedo.update(p, dt);
  }
  if (game.online && race.online && game.state !== 'menu') {
    net.tick(race);
    if (game.state === 'results' && (resTick += dt) > 0.5) { resTick = 0; ui.resultsTable(race); }
  }

  // Adaptive resolution: drop pixel ratio if frames are slow.
  frameTimes.push(dt);
  if (frameTimes.length >= 90) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes.length = 0;
    if (avg > 1 / 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); }
  }
}

setupAttract();
resize();
$('loading').classList.add('hidden');
requestAnimationFrame(frame);

// Test hook for automated checks.
window.__game = {
  game, startRace, input, data: () => data, TRACKS, pause, resume, ui, createAI, rig, net, cine: null,
  // Advance the simulation quickly (used by automated tests).
  simulate(seconds, playerInput) {
    const race = game.race;
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n && game.state === 'race'; i++) {
      if (race.state === 'countdown') { race.countdown = 0; startRacing(race); }
      race.playerInput = playerInput || race.playerInput;
      stepRace(race); game.view.afterStep(); handleEvents(race);
      if (race.player.finished && game.finishTimer > 0) { finishRace(); break; }
    }
    return { x: race.player.chassis.getPosition().x, time: race.time, state: game.state };
  },
};
