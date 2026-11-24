// E2E: challenge modes (menu, Rubble Rush, Snatch Sprint on a big map, results, restart / quit),
// photo mode, time-of-day / weather presets, flashlight, map edge (backdrop + soft boundary).
// Run standalone (`node tests/e2e/modes.mjs`, needs dist/) or via the test:e2e script.
import { pathToFileURL } from 'node:url';
import { assert, openGame, serve, shot } from './harness.mjs';

const ui = (page) => page.evaluate(() => window.__game.ui.state());
const ch = (page) => page.evaluate(() => {
  const c = window.__game.game.ext.challenge.current;
  return c ? { mode: c.mode, phase: c.phase, score: c.score, timeLeft: c.timeLeft, crates: c.cratesTaken, total: c.cratesTotal, ended: c.ended, voxels: c.voxels } : null;
});
const pressE = (page) => page.evaluate(() => { const g = window.__game; g.key('KeyE', true); g.step(1); g.key('KeyE', false); g.step(1); });
/** mean RGB of the centre of the frame, read back right after drawing */
const centreLuma = (page) => page.evaluate(() => {
  const G = window.__game, r = G.game.renderer;
  G.render();
  const gl = r.three.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(4 * 64 * 64);
  gl.readPixels((w >> 1) - 32, (h >> 1) - 32, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
  return s / (px.length / 4);
});

export default async function runModeTests(url) {
  let failed = 0;
  async function test(name, fn) {
    const t = Date.now();
    try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
    catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
  }

  await test('challenges: menu, Rubble Rush clock + score + results, retry, pause restart / quit', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.openMenu('main'); });
    await page.click('[data-act=open][data-id=challenges]');
    assert((await ui(page)).menu === 'challenges', 'challenges menu open');
    await page.click('[data-act=chmode][data-id=rubble]');
    await shot(page, 'modes-01-challenges');
    assert(await page.isVisible('[data-act=chmap][data-id=works]'), 'map list');
    assert(await page.isVisible('[data-act=atmos][data-key=tod][data-val=night]'), 'time picker');
    // play it on the small yard (same code path as the big maps, much faster to load)
    await page.evaluate(() => { window.__game.game.ext.challenge.start('rubble', 'testyard'); window.__game.ui.closeMenus(); window.__game.step(10); });
    let c = await ch(page);
    assert(c && c.mode === 'rubble' && c.phase === 'ready', 'rubble ready: ' + JSON.stringify(c));
    const tools = await page.evaluate(() => window.__game.game.belt.tools.filter((t) => t.unlocked).map((t) => [t.id, t.ammo]));
    assert(tools.length >= 10 && tools.every(([, a]) => a === null || a > 0), 'all tools with ammo: ' + JSON.stringify(tools));
    assert(!(await page.evaluate(() => window.__game.game.infiniteAmmo)), 'ammo is finite');
    await page.evaluate(() => { window.__game.setView(6, 0.05, 8, 0.5, 0.1); window.__game.step(2); });
    await shot(page, 'modes-02-rubble-warmup');
    assert(/waiting/i.test(await page.textContent('.ws-chclock')), 'clock waiting chip');
    // blow things up until the clock starts
    for (let i = 0; i < 6 && (await ch(page)).phase === 'ready'; i++) {
      await page.evaluate((i) => { window.__game.explode(1 + (i % 3), 1.2, -8 + (i >> 1), 1.6); window.__game.step(30); }, i);
    }
    c = await ch(page);
    assert(c.phase === 'running' && c.voxels >= 500, 'clock running after warm-up: ' + JSON.stringify(c));
    await page.evaluate(() => window.__game.step(120));
    c = await ch(page);
    assert(c.timeLeft < 89 && c.timeLeft > 80, 'clock counts down: ' + c.timeLeft);
    await shot(page, 'modes-03-rubble-running');
    const txt = await page.textContent('.ws-chclock .clock span');
    assert(/^1:2\d$/.test(txt.trim()), 'clock on screen: ' + txt);
    const hudScore = (await page.textContent('.ws-chal .big')).replace(/\D/g, '');
    assert(Number(hudScore) === c.score, `HUD score ${hudScore} = ${c.score}`);
    await page.evaluate(() => { window.__game.game.ext.challenge.expire(); window.__game.step(2); });
    c = await ch(page);
    assert(c.ended, 'ended');
    const r = await page.evaluate(() => window.__game.game.ext.challenge.lastResult);
    assert(r.outcome === 'time' && r.success && r.score === c.score && r.score >= 500, 'result: ' + JSON.stringify(r));
    await page.evaluate(() => window.__game.step(50));
    assert((await ui(page)).menu === 'chresult', 'results screen');
    await shot(page, 'modes-04-rubble-result');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('wrecking-shift-save-v1')).challenges);
    assert(save['rubble@testyard'].best === r.score, 'best saved: ' + JSON.stringify(save));
    // again -> fresh run; pause -> restart keeps the challenge; quit drops it
    await page.click('[data-act=chretry]');
    c = await ch(page);
    assert(c && c.phase === 'ready' && c.score === 0, 'retry: ' + JSON.stringify(c));
    await page.evaluate(() => { window.__game.explode(1, 1.2, -8, 1.4); window.__game.step(30); window.__game.ui.openMenu('pause'); });
    await shot(page, 'modes-05-pause-challenge');
    assert(await page.isVisible('[data-act=photo]'), 'photo button in pause');
    await page.click('[data-act=restart]');
    c = await ch(page);
    assert(c && c.score === 0 && (await ui(page)).menu === null, 'restart from pause: ' + JSON.stringify(c));
    // a mission start drops the challenge
    await page.evaluate(() => { window.__game.ui.startMission('housewarming'); window.__game.step(5); });
    assert((await ch(page)) === null && (await ui(page)).missionId === 'housewarming', 'mission replaces challenge');
    await page.evaluate(() => { window.__game.game.ext.challenge.start('rubble', 'testyard'); window.__game.step(5); });
    assert((await ui(page)).missionId === null && (await ch(page)), 'challenge replaces mission');
    await page.evaluate(() => window.__game.ui.openMenu('pause'));
    await page.click('[data-act=quit]');
    assert((await ch(page)) === null && (await ui(page)).menu === 'main', 'quit drops the challenge');
    await page.click('[data-act=open][data-id=challenges]');
    assert(/2,?\d{3}|\d{3,}/.test(await page.textContent('.ws-body')), 'menu lists bests');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('challenges: Snatch Sprint on harbor from the menu (crates, clock, escape, results), night + edge', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1', { width: 1280, height: 720 });
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.openMenu('main'); });
    await page.click('[data-act=open][data-id=challenges]');
    await page.click('[data-act=chmode][data-id=snatch]');
    await page.click('[data-act=chmap][data-id=harbor]');
    await shot(page, 'modes-10-challenges-720');
    await page.click('[data-act=chstart]');
    await page.evaluate(() => window.__game.step(20));
    let c = await ch(page);
    assert(c && c.mode === 'snatch' && c.total === 12 && c.phase === 'ready', 'snatch on harbor: ' + JSON.stringify(c));
    const st = await ui(page);
    assert(st.session === 'play' && !st.menu, 'playing');
    const crates = await page.evaluate(() => window.__game.game.ext.challenge.current.openCrates().map((k) => k.pos));
    assert(crates.length === 12, 'crates still lying around after settling: ' + crates.length);
    // look at the first crate from 1.2 m and lift it
    const take = async (k) => {
      await page.evaluate((k) => {
        const G = window.__game;
        G.setView(k.x, k.y + 0.1, k.z + 1.2, 0, 0); G.step(3);
        const c = G.game.ext.challenge.current.openCrates().find((o) => Math.hypot(o.pos.x - k.x, o.pos.z - k.z) < 0.6);
        const e = G.player.eye, t = c.pos;
        G.player.yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z));
        G.player.pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z));
        G.step(1);
      }, k);
    };
    await take(crates[0]);
    assert(/lift/i.test((await ui(page)).prompt ?? ''), 'crate prompt: ' + (await ui(page)).prompt);
    await shot(page, 'modes-11-snatch-crate-720');
    await pressE(page);
    c = await ch(page);
    assert(c.crates === 1 && c.phase === 'running', 'first crate starts the clock: ' + JSON.stringify(c));
    await take(crates[1]);
    await pressE(page);
    c = await ch(page);
    assert(c.crates === 2, 'second crate: ' + JSON.stringify(c));
    await page.evaluate(() => window.__game.ui.toggleMap(true));
    await shot(page, 'modes-12-snatch-map-720');
    await page.evaluate(() => window.__game.ui.toggleMap(false));
    // clock out
    const esc = await page.evaluate(() => window.__game.game.ext.challenge.current.escapePos());
    await page.evaluate((e) => { window.__game.setView(e.x, e.y + 0.1, e.z, 0, 0); window.__game.step(3); }, esc);
    await shot(page, 'modes-13-snatch-escape-720');
    await pressE(page);
    c = await ch(page);
    assert(c.ended, 'clocked out');
    const r = await page.evaluate(() => window.__game.game.ext.challenge.lastResult);
    assert(r.outcome === 'escaped' && r.score > 200 && r.crates === 2, 'result: ' + JSON.stringify(r));
    await page.evaluate(() => window.__game.step(50));
    assert((await ui(page)).menu === 'chresult', 'results');
    await shot(page, 'modes-14-snatch-result-720');
    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => window.__game.game.renderer.resize());
    await shot(page, 'modes-15-snatch-result');
    // night on the harbor: lamps + moonlight must keep it readable
    await page.click('[data-act=chretry]');
    await page.evaluate(() => {
      const G = window.__game, g = G.game;
      g.ext.atmos.apply('night'); G.setView(-1.5, 1.6, -40, Math.PI, -0.05); G.step(5); G.render();
    });
    await shot(page, 'modes-16-harbor-night');
    await page.evaluate(() => { window.__game.player.pitch = -0.6; });
    const dark = await centreLuma(page);
    await page.evaluate(() => window.__game.game.ext.atmos.flashlight.toggle(true));
    const lit = await centreLuma(page);
    await page.evaluate(() => { window.__game.player.pitch = -0.15; });
    await shot(page, 'modes-17-harbor-night-flashlight');
    assert(lit > dark + 3, `flashlight brightens the view: ${dark.toFixed(1)} -> ${lit.toFixed(1)}`);
    await page.evaluate(() => window.__game.game.ext.atmos.flashlight.toggle(false));
    // edge: walk off the map -> held inside, warning shown; backdrop beyond
    await page.evaluate(() => {
      const G = window.__game, g = G.game;
      g.ext.atmos.apply('sunset');
      const b = g.level.bounds;
      G.setView(b.max.x - 0.5, 3, 20, -Math.PI / 2, 0.02); G.step(2);
      G.key('KeyW', true); G.step(60); G.key('KeyW', false);
    });
    const pos = await page.evaluate(() => ({ p: window.__game.player.pos, b: window.__game.game.level.bounds, w: window.__game.game.ext.edge.warning }));
    assert(pos.p.x <= pos.b.max.x - 0.99 && pos.w, 'held inside the bounds with a warning: ' + JSON.stringify(pos));
    await shot(page, 'modes-18-harbor-edge');
    await page.evaluate(() => { const G = window.__game; G.game.cameraOverride = { eye: { x: 30, y: 30, z: 40 }, yaw: -0.9, pitch: -0.2 }; });
    await shot(page, 'modes-19-harbor-edge-view');
    await page.evaluate(() => { const G = window.__game; G.game.cameraOverride = { eye: { x: -40, y: 22, z: -30 }, yaw: 2.4, pitch: -0.12 }; });
    await shot(page, 'modes-19b-harbor-edge-land');
    await page.evaluate(() => { window.__game.game.cameraOverride = null; });
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('photo mode: freeze, hide HUD, free camera, FOV, restore; from the pause menu', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { window.__game.ui.startSandbox('testyard'); window.__game.step(20); window.__game.selectTool('sledge'); window.__game.render(); });
    const before = await page.evaluate(() => {
      const g = window.__game.game, c = g.renderer.camera;
      return { tick: g.sim.tick, fov: g.fov, q: g.renderer.quality, cam: [c.position.x, c.position.y, c.position.z], yaw: g.player.yaw };
    });
    assert(await page.isVisible('.ws-hud'), 'HUD visible');
    await page.keyboard.press('KeyP');
    let s = await page.evaluate(() => { const g = window.__game.game; return { a: g.ext.photo.active, paused: g.paused, ctl: g.controlsEnabled, ov: !!g.cameraOverride, q: g.renderer.quality }; });
    assert(s.a && s.paused && !s.ctl && s.ov, 'photo mode on: ' + JSON.stringify(s));
    assert(s.q === 'high', 'quality raised for stills: ' + s.q);
    assert(!(await page.isVisible('.ws-hud')) && !(await page.isVisible('#crosshair')), 'HUD + crosshair hidden');
    assert(await page.isVisible('.ws-photo-hint'), 'hint visible');
    // the real frame loop must not advance the sim; WASD + Space fly the camera
    const moved = await page.evaluate(() => {
      const G = window.__game, g = G.game;
      const t0 = g.sim.tick;
      G.key('KeyW', true); G.key('Space', true);
      let t = performance.now();
      for (let i = 0; i < 30; i++) { t += 16.7; g.frame(t); }
      G.key('KeyW', false); G.key('Space', false);
      const c = g.cameraOverride;
      return { dt: g.sim.tick - t0, eye: c.eye };
    });
    assert(moved.dt === 0, 'sim frozen: ' + moved.dt);
    assert(moved.eye.y > before.cam[1] + 0.5, 'camera flew up: ' + JSON.stringify(moved.eye));
    await page.mouse.move(320, 180);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    await page.evaluate(() => { const g = window.__game.game; let t = performance.now(); for (let i = 0; i < 3; i++) { t += 16.7; g.frame(t); } });
    const fov = await page.evaluate(() => window.__game.game.fov);
    assert(fov > before.fov, `wheel widens FOV ${before.fov} -> ${fov}`);
    await page.keyboard.press('KeyH');
    assert(!(await page.isVisible('.ws-photo-hint')), 'H hides the hint');
    await page.keyboard.press('KeyH');
    await shot(page, 'modes-20-photo');
    await page.keyboard.press('Escape');
    const after = await page.evaluate(() => {
      const g = window.__game.game;
      window.__game.render();
      const c = g.renderer.camera;
      return { a: g.ext.photo.active, paused: g.paused, ctl: g.controlsEnabled, ov: g.cameraOverride, fov: g.fov, q: g.renderer.quality, cam: [c.position.x, c.position.y, c.position.z], yaw: g.player.yaw, menu: window.__game.ui.state().menu, tick: g.sim.tick };
    });
    assert(!after.a && !after.paused && after.ctl && after.ov === null, 'restored: ' + JSON.stringify(after));
    assert(after.fov === before.fov && after.q === before.q && after.yaw === before.yaw && after.menu === null, 'fov / quality / view restored: ' + JSON.stringify(after));
    assert(Math.abs(after.cam[0] - before.cam[0]) < 0.05 && Math.abs(after.cam[2] - before.cam[2]) < 0.05, 'camera back at the player');
    assert(after.tick === before.tick, 'no ticks while in photo mode');
    assert(await page.isVisible('.ws-hud'), 'HUD back');
    // from the pause menu (button) -> P returns to the pause menu
    await page.evaluate(() => window.__game.ui.openMenu('pause'));
    await page.click('[data-act=photo]');
    assert(await page.evaluate(() => window.__game.game.ext.photo.active && window.__game.ui.state().menu === null), 'photo from pause');
    await page.keyboard.press('KeyP');
    s = await page.evaluate(() => ({ a: window.__game.game.ext.photo.active, menu: window.__game.ui.state().menu, paused: window.__game.game.paused }));
    assert(!s.a && s.menu === 'pause' && s.paused, 'back to the pause menu: ' + JSON.stringify(s));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('sandbox: time of day + weather before start and live from pause; flashlight; soft boundary', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => window.__game.ui.openMenu('sandbox'));
    await page.click('[data-act=atmos][data-key=tod][data-val=night]');
    await page.click('[data-act=atmos][data-key=weather][data-val=snow]');
    await shot(page, 'modes-30-sandbox-menu');
    await page.click('[data-act=sbx][data-id=testyard]');
    let s = await page.evaluate(() => { const g = window.__game.game; return { tod: g.renderer.timeOfDay, wx: g.ext.weather.get(), sbx: g.ext.mission.sandbox }; });
    assert(s.sbx && s.tod === 'night' && s.wx === 'snow', 'sandbox starts with the chosen look: ' + JSON.stringify(s));
    await page.evaluate(() => { window.__game.setView(6, 0.05, 8, 0.5, 0.0); window.__game.step(10); });
    await shot(page, 'modes-31-sandbox-night-snow');
    const dark = await centreLuma(page);
    await page.evaluate(() => window.__game.game.ext.atmos.flashlight.toggle(true));
    const lit = await centreLuma(page);
    await shot(page, 'modes-32-sandbox-flashlight');
    assert(lit > dark + 3, `flashlight brightens the view: ${dark.toFixed(1)} -> ${lit.toFixed(1)}`);
    // live from the pause menu
    await page.evaluate(() => window.__game.ui.openMenu('pause'));
    await shot(page, 'modes-33-pause-atmos');
    await page.click('[data-act=atmos][data-key=tod][data-val=day]');
    await page.click('[data-act=atmos][data-key=weather][data-val=rain]');
    s = await page.evaluate(() => { const g = window.__game.game; return { tod: g.renderer.timeOfDay, wx: g.ext.weather.get(), menu: window.__game.ui.state().menu }; });
    assert(s.tod === 'day' && s.wx === 'rain' && s.menu === 'pause', 'live switch: ' + JSON.stringify(s));
    await page.click('[data-act=atmos][data-key=weather][data-val=clear]');
    assert((await page.evaluate(() => window.__game.game.ext.weather.get())) === null, 'clear weather');
    await page.click('[data-act=resume]');
    await page.evaluate(() => window.__game.game.ext.atmos.flashlight.toggle(false));
    // soft boundary on the small map
    const r = await page.evaluate(() => {
      const G = window.__game, b = G.game.level.bounds;
      G.setView(b.min.x + 2, 0.05, 0, Math.PI / 2, 0); G.step(2);
      G.key('KeyW', true); G.step(90); G.key('KeyW', false);
      return { x: G.player.pos.x, min: b.min.x, warn: G.game.ext.edge.warning };
    });
    assert(r.x >= r.min + 0.99 && r.warn, 'held inside: ' + JSON.stringify(r));
    await shot(page, 'modes-34-edge-warning');
    await page.evaluate(() => { window.__game.game.cameraOverride = { eye: { x: 0, y: 14, z: 20 }, yaw: 0.6, pitch: -0.18 }; });
    await shot(page, 'modes-35-testyard-backdrop');
    await page.evaluate(() => { window.__game.game.cameraOverride = null; });
    // big screen pause + challenge menu layout
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => { window.__game.game.renderer.resize(); window.__game.ui.openMenu('pause'); });
    await shot(page, 'modes-36-pause-720');
    await page.evaluate(() => { window.__game.ui.openMenu('main'); });
    await shot(page, 'modes-37-main-720');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  return failed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { srv, url } = await serve();
  const failed = await runModeTests(url);
  srv.close();
  if (failed) { console.log(failed + ' mode e2e test(s) failed'); process.exit(1); }
  console.log('modes e2e ok');
}
