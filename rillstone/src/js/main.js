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
  }

  // Lantern: a warm point light near the player at night and underground.
  const lantern = new THREE.PointLight(0xffc27a, 0, 18, 1.6);
  scene.add(lantern);
  let lanternManual = null;

  const state = { mode: 'title', time: 0.32, day: 1, simTick: 0, playing: false };
  const menu = createMenu(ui, {
    settings, input,
    onPlay: () => play(),
    onSettingsChanged: () => { view.applySettings(); audio.apply(); },
    items: [{ label: 'Return to claim post', onclick: () => { const s = spawnPoint(); teleport(s.x, height(s.x, s.z) + 1, s.z, s.yaw); play(); } }],
  });
  function play() {
    state.mode = 'play'; state.playing = true;
    menu.showTitle(false); menu.showPause(false); menu.closeSettings(); menu.showPause(false);
    hud.show(true);
    if (!TEST) input.lock();
  }
  input.onLockChange = (locked) => {
    if (!locked && state.mode === 'play' && !TEST) { state.mode = 'pause'; menu.showPause(true); }
  };
  canvas.addEventListener('click', () => { if (state.mode === 'play' && !input.locked && !TEST) input.lock(); });

  async function teleport(x, y, z, yaw) {
    await physics.call({ op: 'teleportPlayer', pos: [x, y, z] });
    player.teleported(x, y, z);
    if (yaw !== undefined) player.yaw = yaw;
  }

  // Frame loop.
  let caveF = 0;
  let last = performance.now(), acc = 0, simAcc = 0, fps = 0, fpsT = 0, frames = 0;
  const timings = { physics: 0, sim: 0, render: 0 };
  const controls = () => state.mode === 'play' && (input.locked || TEST);
  function simTick() {
    state.simTick++;
    if (state.simTick % SIM_HZ === 0) items.mergePiles();
  }
  async function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    input.poll();
    if (controls()) player.look(input.look()); else input.look();
    if (input.pressed('debug')) hud.toggleDebug();
    if (input.pressed('lantern')) lanternManual = !(lanternManual ?? lantern.intensity > 0);

    // Physics: steps owed at 60 Hz, one message in flight at a time.
    acc += dt;
    const n = Math.min(6, Math.floor(acc * 60));
    if (n > 0 && !physics.inFlight) {
      acc -= n / 60;
      const intent = player.intent(input, controls());
      const t0 = performance.now();
      physics.step(n, intent).then((r) => { if (r.player) player.stepped(r.player); timings.physics = performance.now() - t0; });
    }
    if (acc > 0.25) acc = 0.25;
    // Sim tick (20 Hz): machines, economy... (M2+).
    simAcc += dt;
    while (simAcc >= 1 / SIM_HZ) { simAcc -= 1 / SIM_HZ; const t1 = performance.now(); simTick(); timings.sim = performance.now() - t1; }

    // Time of day.
    if (state.mode === 'play') { state.time += dt / DAY_SECONDS; if (state.time >= 1) { state.time -= 1; state.day++; } }
    player.camera(camera, Math.min(1, acc * 60), dt);
    // Safety net: fell through the world somehow? Back to the claim post.
    if (!player.fly && ((player.cur.y < height(player.cur.x, player.cur.z) - 25 && !adit.contains(player.cur.x, player.cur.y, player.cur.z)) || player.cur.y < -40) && !state.rescuing) {
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
    hands.update(dt, input, controls());
    fx.update(dt);
    hud.clock(state.time, state.day);
    hud.wallet(0, null);
    const t2 = performance.now();
    if (!state.noRender) view.render();
    timings.render = performance.now() - t2;
    frames++; fpsT += dt; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    if (hud.debugOn()) {
      const ri = view.renderer.info.render, st = physics.stats;
      hud.debug.textContent = `${fps.toFixed(0)} fps\nphysics step ${(st.stepMs || 0).toFixed(2)} ms (rtt ${timings.physics.toFixed(1)})\nsim ${timings.sim.toFixed(2)} ms · render ${timings.render.toFixed(1)} ms\ndraw calls ${ri.calls} · tris ${(ri.triangles / 1000).toFixed(0)}k\nbodies awake ${st.awake ?? 0} / asleep ${st.asleep ?? 0} · items ${items.ents.size}\nremesh queue ${claims.busy} · mesh ${avg(claims.stats.meshMs).toFixed(1)} ms · collider ${avg(claims.stats.colliderMs).toFixed(1)} ms\npos ${player.cur.x.toFixed(1)} ${player.cur.y.toFixed(1)} ${player.cur.z.toFixed(1)}`;
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Test hook (BUILD_BRIEF section 12). Pointer Lock doesn't work headless,
  // so ?test=1 lets tests drive the game directly.
  const api = { ready: true, physics, version: physics.version, seed: SEED };
  if (TEST) Object.assign(api, {
    THREE, view, player, input, state, settings, hud, menu, water, flora, claims, items, hands, audio, lootRng,
    places: { TOWN, HAMLET, ADIT, CLAIMS, FALLS_Z, spawn: spawnPoint() },
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
