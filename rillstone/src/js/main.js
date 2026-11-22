// Entry point: boots the renderer, physics worker and world, runs the frame
// loop (fixed 60 Hz physics, 20 Hz sim tick) and exposes the test hook.
import * as THREE from 'three';
import { createPhysics } from './core/physics.js';
import { loadSettings } from './core/settings.js';
import { createInput } from './core/input.js';
import { urlSeed } from './core/rng.js';
import { createScene, DAY_SECONDS } from './render/scene.js';
import { buildTerrain } from './render/terrain.js';
import { buildWater } from './render/water.js';
import { buildFlora } from './render/flora.js';
import { buildAdit } from './render/adit.js';
import { createPlayer, MOVE } from './game/player.js';
import { claimDefs, brush } from './world/claims.js';
import { createClaims } from './render/claimMesh.js';
import { createItems } from './game/items.js';
import { createHands } from './game/hands.js';
import { createFX } from './render/fx.js';
import { createAudio } from './core/audio.js';
import { claimPostGeometry } from './defs/items.js';
import { mulberry32 } from './core/rng.js';
import { createEconomy } from './sim/economy.js';
import { createVehicles } from './game/vehicles.js';
import { createTown } from './game/town.js';
import { createPanels } from './ui/panels.js';
import { createSaves, SAVE_VERSION } from './core/save.js';
import { readChunk, writeChunk, relicSpot, VEINS } from './world/claims.js';
import { rollLoot } from './sim/loot.js';
import { PUMP_STAGES } from './defs/progression.js';
import { createProgress } from './game/progress.js';
import { createWorkshop } from './game/workshop.js';
import { createHeavy } from './game/heavy.js';
import { h } from './ui/dom.js';
import { createBed, slotCard } from './game/bed.js';
import { createMachines } from './game/machines.js';
import { createAutomation } from './game/automation.js';
import { createHUD } from './ui/hud.js';
import { createMenu } from './ui/menu.js';
import { HALF, spawnPoint, height, ADIT, TOWN, HAMLET, CLAIMS, riverX, waterY, FALLS_Z } from './world/valley.js';

const TEST = new URLSearchParams(location.search).has('test');
const SEED = urlSeed();
const SIM_HZ = 20;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

async function boot() {
  const settings = loadSettings();
  const canvas = document.getElementById('game');
  const ui = document.getElementById('ui');
  const view = createScene(canvas, settings);
  const { scene, camera } = view;
  const input = createInput(canvas, settings);
  const hud = createHUD(ui);
  const physics = await createPhysics({ gravity: MOVE.gravity });

  // World.
  const terrain = buildTerrain(scene, view.materials);
  const water = buildWater(scene);
  const flora = buildFlora(scene, view.materials, 99);
  const adit = buildAdit(scene, view.materials);
  await physics.call({ op: 'batch', ops: [
    ...terrain.colliders.map(c => ({ op: 'setStatic', ...c })),
    ...flora.colliders, ...adit.colliders,
    // Invisible walls round the valley, so following the river (which cuts
    // through the edge mountains) can't take you off the map.
    ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([sx, sz], i) => ({ op: 'setStaticBox', key: 'bound' + i, hx: sx ? 1 : HALF, hy: 200, hz: sz ? 1 : HALF, pos: [sx * (HALF - 12), 100, sz * (HALF - 12)] })),
  ] });

  // Claims: voxel volumes, meshed in workers.
  const claims = await createClaims(scene, view.materials, physics);
  await claims.settle();
  // Claim posts at each diggable plot.
  for (const c of claimDefs()) {
    const post = new THREE.Mesh(claimPostGeometry(c.name), view.materials.vcolor);
    const px = c.x0 - 1.2, pz = c.cz + 2;
    post.position.set(px, height(px, pz) - 0.05, pz); post.rotation.y = -Math.PI / 2; post.castShadow = true;
    scene.add(post);
    physics.post({ op: 'setStaticBox', key: 'post-' + c.id, hx: 0.1, hy: 0.8, hz: 0.1, pos: [px, height(px, pz) + 0.75, pz] });
  }
  const fx = createFX(scene);
  const audio = createAudio(settings, (t) => hud.caption(t));
  const items = createItems({ scene, physics, materials: view.materials });
  physics.onLost = (id) => { const s = spawnPoint(); if (items.get(id)) { physics.removeBody(id); const e = items.get(id); e.loc = 'held'; items.place(id, [s.x + 1, height(s.x + 1, s.z) + 0.5, s.z]); } };
  const lootRng = mulberry32((SEED * 2654435761) ^ 0x10ad);
  const hands = createHands({ scene, camera, physics, items, claims, water, fx, audio, hud, rng: lootRng, materials: view.materials });

  const economy = createEconomy(mulberry32((SEED * 31 + 7) >>> 0)); economy.init();
  hands.owns = (id) => economy.owns(id);
  const panels = createPanels(ui, {
    onOpen: () => { if (state.mode === 'play') state.mode = 'panel'; input.unlock(); },
    onClose: () => { if (state.mode === 'panel') { state.mode = 'play'; if (!TEST) input.lock(); } },
  });
  const vehicles = createVehicles({ scene, physics, items, materials: view.materials, hud, audio });
  hands.vehicles = vehicles;
  const town = createTown({ scene, physics, materials: view.materials, items, vehicles, economy, hud, audio, panels });
  await town.build();
  hands.props = town;
  const saves = createSaves();
  const bed = createBed({ panels, items, vehicles, hands, hud, audio });
  const machines = createMachines({ scene, physics, materials: view.materials, items, claims, water, economy, hud, audio, panels, rng: mulberry32((SEED * 977 + 3) >>> 0), fx, height });
  hands.machines = machines;
  const auto = createAutomation({ machines, items, scene, materials: view.materials, hud, audio, panels, fx, claims, economy, brush: (id, c, r, mode, b) => brush(claims.volumes.get(id), c, r, mode, b) });
  machines.panelRows = auto.panelRows;
  hands.auto = auto;
  // Take one thing out of a bin or crate into your hands (or drop it if they're full).
  auto.takeFrom = (m, i) => {
    const it = m.state.contents.splice(i, 1)[0]; if (!it) return;
    const e = items.spawn(it.stage === 'crafted' ? 'crafted' : 'nugget', [0, 0, 0], { item: it, loc: 'held' });
    if (!hands.hand) hands.hand = e.id; else { e.loc = 'held'; const p = machines._int.toWorld(m, [0, 1.3, 0.8]); items.place(e.id, p); }
    audio.play('pickup');
  };
  // Riding a lift: up to the top deck, or back down.
  hands.onLift = async (m) => { const top = machines._int.toWorld(m, [0, 4.15, 0]), bottom = machines._int.toWorld(m, [0, 0.4, -1.2]); const up = player.cur.y < m.pos[1] + 2; const p = up ? top : bottom; await teleport(p[0], p[1] + 1, p[2]); audio.play('pickup'); };
  hands.onVehicle = (id) => bed.open(id);

  // Player.
  const player = createPlayer(settings);
  const sp = spawnPoint();
  const spawnY = height(sp.x, sp.z) + 1.0;
  await physics.call({ op: 'createPlayer', pos: [sp.x, spawnY, sp.z], stepUp: MOVE.stepUp });
  player.teleported(sp.x, spawnY, sp.z);
  player.yaw = sp.yaw;
  // Starting gear (BUILD_BRIEF 3.6): shovel in hand, pan in the swap slot, a
  // bucket by the claim post. The lantern is worn.
  hands.give('pan'); hands.give('shovel');
  {
    const g = claimDefs()[0], bx = g.x0 - 1.6, bz = g.cz + 3.2;
    items.spawn('bucket', [bx, height(bx, bz) + 0.4, bz], { data: { loads: [], contents: [] } });
    // The old hauler, parked beside the claim.
    const tx = g.x0 - 5, tz = g.z0 - 2;
    await vehicles.spawn('hauler', [tx, height(tx, tz) + 1.4, tz], Math.PI / 2);
  }

  // Lantern: a warm point light near the player at night and underground.
  const lantern = new THREE.PointLight(0xffc27a, 0, 18, 1.6);
  scene.add(lantern);
  let lanternManual = null;
  const progress = createProgress({ items, hands, economy, hud, audio, adit, physics, lantern });
  const heavy = createHeavy({ scene, physics, items, vehicles, claims, economy, machines, hud, audio, fx, materials: view.materials, height, hands });
  const workshop = createWorkshop({ scene, physics, materials: view.materials, items, economy, town, hud, audio, panels, fx, getStats: () => ({ playTime: state.playTime }) });

  const state = { mode: 'title', time: 0.32, day: 1, simTick: 0, playing: false, slot: 1, playTime: 0, autosaveT: 0 };
  const menu = createMenu(ui, {
    settings, input,
    onPlay: () => play(),
    onSettingsChanged: () => { view.applySettings(); audio.apply(); },
    items: [
      { label: 'Save game', onclick: () => openSaves('save') },
      { label: 'Load game', onclick: () => openSaves('load') },
      { label: 'Return to claim post', onclick: () => { if (vehicles.driving) exitVehicle(); const s = spawnPoint(); teleport(s.x, height(s.x, s.z) + 1, s.z, s.yaw); play(); } },
    ],
  });
  function play() {
    if (panels.open) panels.close();
    state.mode = 'play'; state.playing = true;
    menu.showTitle(false); menu.showPause(false); menu.closeSettings(); menu.showPause(false);
    hud.show(true);
    if (!TEST) input.lock();
  }
  input.onLockChange = (locked) => {
    if (!locked && state.mode === 'play' && !TEST && !panels.open) { state.mode = 'pause'; menu.showPause(true); }
  };

  // ---- Saving (BUILD_BRIEF section 9) ----
  function snapshot() {
    const chunks = [];
    for (const vol of claims.volumes.values()) for (const ck of vol.modified) { const c = readChunk(vol, ck); chunks.push({ claim: vol.id, key: ck, dens: c.dens, band: c.band }); }
    return {
      saveVersion: SAVE_VERSION, seed: SEED, time: state.time, day: state.day, playTime: state.playTime,
      player: { pos: player.cur.toArray(), yaw: player.yaw, pitch: player.pitch }, hands: { hand: hands.hand, slot: hands.slot },
      items: items.serialize(), vehicles: vehicles.serialize(), economy: economy.serialize(), chunks,
      machines: machines.serialize(), clock: items.clock, rails: heavy.serialize(),
    };
  }
  async function restore(snap) {
    for (const c of snap.chunks || []) { const vol = claims.volumes.get(c.claim); if (vol) writeChunk(vol, c.key, c.dens, c.band); }
    await claims.settle();
    items.restore(snap.items || []);
    items.clock = snap.clock || 0;
    machines.restore(snap.machines || []);
    hands.hand = snap.hands?.hand ?? null; hands.slot = snap.hands?.slot ?? null;
    for (const v of [...vehicles.list.values()]) await vehicles.remove(v.id);
    for (const v of snap.vehicles || []) await vehicles.spawn(v.type, v.pos, 0, v);
    heavy.restore(snap.rails);
    economy.restore(snap.economy || {});
    workshop.applyStage();
    state.time = snap.time ?? state.time; state.day = snap.day ?? 1; state.playTime = snap.playTime || 0;
    const p = snap.player?.pos; if (p) await teleport(p[0], p[1] + 0.05, p[2], snap.player.yaw);
    town.newDay();
  }
  async function saveTo(slot, quiet) {
    try { await saves.save(slot, snapshot()); state.slot = slot; if (!quiet) hud.toast(`Saved to slot ${slot}`); return true; }
    catch (e) { hud.toast('Save failed: ' + e.message, 'err'); return false; }
  }
  function loadSlot(slot) {
    // Loading rebuilds the world from scratch: reload, then restore at boot.
    try { sessionStorage.setItem('rill-load', String(slot)); } catch (_) {}
    location.reload();
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  async function openSaves(mode) {
    const list = await saves.list();
    const fmt = (m) => m.empty ? 'Empty' : `Day ${m.day} · § ${m.scrip.toLocaleString('en-GB')} · ${new Date(m.savedAt).toLocaleString()}`;
    const fileIn = h('input', { type: 'file', accept: '.rillsave', style: { display: 'none' }, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const snap = await saves.importFile(f); await saves.save(state.slot, snap); hud.toast(`Imported into slot ${state.slot}`); loadSlot(state.slot); } catch (err) { hud.toast('Import failed: ' + err.message, 'err'); }
    } });
    const body = h('div', {},
      h('p', { class: 'small' }, mode === 'save' ? 'Pick a slot. The game also autosaves to your current slot every 3 minutes.' : 'Load a saved game.'),
      ...list.map(m => h('div', { class: 'entry' }, h('b', {}, `Slot ${m.slot}${m.slot === state.slot ? ' (current)' : ''}`),
        mode === 'save' ? h('button', { class: 'btn primary', onclick: async () => { await saveTo(m.slot); openSaves('save'); } }, 'Save here')
          : h('button', { class: 'btn primary', disabled: !!m.empty, onclick: () => loadSlot(m.slot) }, 'Load'),
        h('span', { class: 'desc' }, fmt(m)))),
      h('h3', {}, 'Backup'),
      h('div', { class: 'entry' }, h('b', {}, 'Export this game'), h('button', { class: 'btn', onclick: () => download(saves.exportBlob(snapshot()), `rillstone-day${state.day}.rillsave`) }, 'Export'), h('span', { class: 'desc' }, 'Download a .rillsave file (browsers can clear site data).')),
      h('div', { class: 'entry' }, h('b', {}, 'Import a .rillsave'), h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Import'), h('span', { class: 'desc' }, `Replaces slot ${state.slot}.`)), fileIn);
    menu.showPause(false);
    panels.show('saves', mode === 'save' ? 'Save game' : 'Load game', body);
  }
  // Title: continue the newest save.
  saves.list().then((list) => {
    const latest = list.filter(m => !m.empty).sort((a, b) => b.savedAt - a.savedAt)[0];
    const items2 = [];
    if (latest) items2.push({ label: `Continue (slot ${latest.slot}, day ${latest.day})`, onclick: () => loadSlot(latest.slot) });
    if (list.some(m => !m.empty)) items2.push({ label: 'Load game', onclick: () => openSaves('load') });
    menu.setTitleItems(items2);
  });

  // ---- Vehicles: get in and out ----
  async function exitVehicle() {
    const p = vehicles.exit();
    if (p) await teleport(p[0], Math.max(p[1], height(p[0], p[2]) + 1.0), p[2]);
  }
  function toggleVehicle() {
    if (vehicles.driving) return exitVehicle();
    const info = hands.aimInfo();
    const v = info.kind === 'vehicle' && info.dist < 4.5 ? vehicles.list.get(info.id) : vehicles.nearest(player.cur.toArray(), 3.5);
    if (v) { vehicles.enter(v.id); hud.toast(`${v.def.name} · WASD drive · Space brake · H (hold) unflip · F get out`); }
  }
  canvas.addEventListener('click', () => { if (state.mode === 'play' && !input.locked && !TEST) input.lock(); });

  async function teleport(x, y, z, yaw) {
    await physics.call({ op: 'teleportPlayer', pos: [x, y, z] });
    player.teleported(x, y, z);
    if (yaw !== undefined) player.yaw = yaw;
  }

  // Frame loop.
  let caveF = 0;
  const driveEl = h('div', { id: 'drive', class: 'hidden' }); hud.el.append(driveEl);
  const scanCanvas = h('canvas', { id: 'scanner', width: 220, height: 220 });
  let last = performance.now(), acc = 0, simAcc = 0, fps = 0, fpsT = 0, frames = 0;
  const timings = { physics: 0, sim: 0, render: 0 };
  const controls = () => state.mode === 'play' && (input.locked || TEST);
  function simTick() {
    state.simTick++;
    machines.tick(1 / SIM_HZ);
    items.clock += 1 / SIM_HZ;
    if (state.simTick % SIM_HZ === 0) { items.mergePiles(); items.cool(); }
  }
  async function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    input.poll();
    const lookD = input.look();
    if (controls() && !vehicles.driving) player.look(lookD);
    if (input.pressed('debug')) hud.toggleDebug();
    if (input.pressed('lantern')) lanternManual = !(lanternManual ?? lantern.intensity > 0);
    if (controls() && input.pressed('vehicle')) toggleVehicle();

    // Physics: steps owed at 60 Hz, one message in flight at a time.
    acc += dt;
    const n = Math.min(6, Math.floor(acc * 60));
    if (n > 0 && !physics.inFlight) {
      acc -= n / 60;
      const intent = player.intent(input, controls() && !vehicles.driving);
      intent.drive = vehicles.driving;
      const t0 = performance.now();
      physics.step(n, intent).then((r) => { if (r.player) player.stepped(r.player); timings.physics = performance.now() - t0; });
    }
    if (acc > 0.25) acc = 0.25;
    // Sim tick (20 Hz): machines, economy... (M2+).
    simAcc += dt;
    while (simAcc >= 1 / SIM_HZ) { simAcc -= 1 / SIM_HZ; const t1 = performance.now(); simTick(); timings.sim = performance.now() - t1; }

    // Time of day.
    if (state.mode === 'play') { state.time += dt / DAY_SECONDS; if (state.time >= 1) { state.time -= 1; state.day++; economy.newDay(state.day); town.newDay(); hud.toast(`Day ${state.day}: new market wants on the chalkboards`); } }
    player.camera(camera, Math.min(1, acc * 60), dt);
    if (vehicles.driving) vehicles.camera(camera, controls() ? lookD : { x: 0, y: 0 }, dt);
    // Safety net: fell through the world somehow? Back to the claim post.
    if (!player.fly && !vehicles.driving && ((player.cur.y < height(player.cur.x, player.cur.z) - 25 && !adit.contains(player.cur.x, player.cur.y, player.cur.z)) || player.cur.y < -40) && !state.rescuing) {
      state.rescuing = true;
      const s = spawnPoint();
      teleport(s.x, height(s.x, s.z) + 1, s.z, s.yaw).then(() => { state.rescuing = false; hud.toast('Back at your claim post'); });
    }
    const inAdit = adit.contains(camera.position.x, camera.position.y, camera.position.z);
    // Underground the sky light fades (never below the minimum ambient).
    caveF += ((inAdit ? Math.min(1, (camera.position.x - ADIT.x + 2) / 8) : 0) - caveF) * Math.min(1, dt * 4);
    view.setTime(state.time, caveF);
    water.update(now / 1000, view.env);

    const wantLantern = lanternManual ?? (view.env.night > 0.4 || inAdit);
    lantern.intensity += ((wantLantern ? 9 : 0) - lantern.intensity) * Math.min(1, dt * 6);
    lantern.position.copy(camera.position).add(new THREE.Vector3(0.25, -0.35, -0.3).applyQuaternion(camera.quaternion));

    claims.update(player.cur.toArray());
    items.update();
    hands.moveSpeed = player.grounded ? player.speed : 0;
    vehicles.night = view.env.night > 0.3;
    vehicles.update(dt, input, controls(), Math.min(1, acc * 60));
    hands.update(dt, input, controls() && !vehicles.driving);
    hands.setVisible?.(!vehicles.driving);
    town.update(dt);
    machines.update(dt);
    const dv = vehicles.driving ? vehicles.list.get(vehicles.driving) : null;
    if (dv && controls()) {
      if (dv.def.hopper && input.pressed('use')) heavy.dig(dv);
      if (dv.def.hopper && input.pressed('secondary')) heavy.dump(dv);
    }
    heavy.update(dt);
    progress.update(dt, dv ? dv.group.position.toArray() : camera.position.toArray(), { scanner: !!dv?.def.scanner });
    workshop.update(dt);
    hud.hotbar([slotCard(items, hands.hand), slotCard(items, hands.slot)]);
    const dh = vehicles.hud();
    driveEl.classList.toggle('hidden', !dh);
    if (dh) {
      const html = `<div class="pill">${dh.speed.toFixed(0)} km/h</div><div class="pill">Fuel<div class="gauge"><i style="width:${(dh.fuel * 100).toFixed(0)}%"></i></div></div>` + (dh.bed ? `<div class="pill">Bed ${dh.cargo} · ${dh.kg.toFixed(0)} kg</div>` : '') + (dh.hopper != null ? `<div class="pill">Hopper ${dh.hopper} / ${dh.hopperMax} · <kbd>LMB</kbd> dig · <kbd>RMB</kbd> empty</div>` : '');
      if (driveEl.dataset.html !== html) { driveEl.dataset.html = html; driveEl.innerHTML = html; if (dh.scanner) driveEl.append(scanCanvas); }
      if (dh.scanner) heavy.drawScanner(scanCanvas, dh.v);
    }
    if (state.mode === 'play') { state.playTime += dt; state.autosaveT += dt; if (state.autosaveT > 180) { state.autosaveT = 0; saveTo(state.slot, true); } }
    fx.update(dt);
    hud.clock(state.time, state.day);
    hud.wallet(economy.state.scrip, economy.state.standing);
    const t2 = performance.now();
    if (!state.noRender) view.render();
    timings.render = performance.now() - t2;
    frames++; fpsT += dt; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    if (hud.debugOn()) {
      const ri = view.renderer.info.render, st = physics.stats;
      hud.debug.textContent = `${fps.toFixed(0)} fps\nphysics step ${(st.stepMs || 0).toFixed(2)} ms (rtt ${timings.physics.toFixed(1)})\nsim ${timings.sim.toFixed(2)} ms · render ${timings.render.toFixed(1)} ms\ndraw calls ${ri.calls} · tris ${(ri.triangles / 1000).toFixed(0)}k\nbodies awake ${st.awake ?? 0} / asleep ${st.asleep ?? 0} · items ${items.ents.size} · machines ${machines.counts().mach}\nremesh queue ${claims.busy} · mesh ${avg(claims.stats.meshMs).toFixed(1)} ms · collider ${avg(claims.stats.colliderMs).toFixed(1)} ms\npos ${player.cur.x.toFixed(1)} ${player.cur.y.toFixed(1)} ${player.cur.z.toFixed(1)}`;
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }
  let pending = null;
  try { pending = sessionStorage.getItem('rill-load'); sessionStorage.removeItem('rill-load'); } catch (_) {}
  if (pending) { const snap = await saves.load(+pending); if (snap) { await restore(snap); state.slot = +pending; play(); hud.toast(`Loaded slot ${pending}`); } }
  requestAnimationFrame(frame);

  // Test hook (BUILD_BRIEF section 12). Pointer Lock doesn't work headless,
  // so ?test=1 lets tests drive the game directly.
  const api = { ready: true, physics, version: physics.version, seed: SEED };
  if (TEST) Object.assign(api, {
    THREE, view, player, input, state, settings, hud, menu, water, flora, claims, items, hands, audio, lootRng, economy, vehicles, town, panels, saves, bed, machines, auto, progress, workshop, heavy, adit, snapshot, restore, saveTo, loadSlot, toggleVehicle, exitVehicle,
    places: { TOWN, HAMLET, ADIT, CLAIMS, FALLS_Z, spawn: spawnPoint() },
    relicSpot, veins: VEINS, rollLoot, pumpStages: PUMP_STAGES,
    height, riverX, waterY,
    play,
    teleport: (x, y, z, yaw, pitch) => { if (pitch !== undefined) player.pitch = pitch; return teleport(x, y ?? height(x, z) + 1, z, yaw); },
    look: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
    setTime: (f) => { state.time = ((f % 1) + 1) % 1; },
    fly: (v) => { player.fly = v; },
    // Skip drawing while a test runs many physics ticks (software GL is slow).
    noRender: (v) => { state.noRender = v; hands.manualAim = v; },
    tick: async (n = 1) => { for (let i = 0; i < n; i++) { const r = await physics.step(1, player.intent(input, true)); if (r.player) { player.stepped(r.player); player.stepped(r.player); } } return physics.player; },
    playerState: () => ({ pos: player.cur.toArray(), grounded: player.grounded, yaw: player.yaw, pitch: player.pitch }),
    give: (type, data) => hands.give(type, data),
    brush: (claimId, centre, radius, mode = 'dig', maxBand = 4) => brush(claims.volumes.get(claimId), centre, radius, mode, maxBand),
    // Aim the camera at a world point from where the player stands.
    aimAt: (x, y, z) => { player.camera(camera, 1, 0); const c = camera.position; const dx = x - c.x, dy = y - c.y, dz = z - c.z; player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(dy, Math.hypot(dx, dz)); player.camera(camera, 1, 0); camera.updateMatrixWorld(); },
    // Refresh the aim ray now (normally it lags one frame).
    refreshAim: async () => { const o = camera.getWorldPosition(new THREE.Vector3()), d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); const q = physics.query({ type: 'ray', o: o.toArray(), d: d.toArray(), max: 8 }); await physics.step(0, player.intent(input, false)); hands.aim = await q; return hands.aimInfo(); },
    frames: (k = 2) => new Promise(res => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }),
  });
  window.__rill = api;
}
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:10px;top:10px;color:#a00;background:#fff;padding:8px">${String(e && e.stack || e)}</pre>`); });
