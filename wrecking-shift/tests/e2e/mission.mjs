// E2E: menus, HUD, demo heist (collect -> alarm -> escape), fail screen, map view.
// Run standalone (`node tests/e2e/mission.mjs`, needs dist/) or via run.mjs (default export).
import { pathToFileURL } from 'node:url';
import { assert, openGame, serve, shot } from './harness.mjs';

/** look from (feet) toward a world point */
async function lookFrom(page, feet, target) {
  await page.evaluate(([f, t]) => {
    const g = window.__game;
    g.setView(f.x, f.y, f.z, 0, 0);
    const e = g.player.eye;
    const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, [feet, target]);
}
const centerOf = (page, tag) => page.evaluate((tag) => {
  for (const b of window.__game.sim.bodies.values()) if (b.tags.has(tag)) return b.center();
  return null;
}, tag);
const pressE = (page) => page.evaluate(() => { const g = window.__game; g.key('KeyE', true); g.step(1); g.key('KeyE', false); g.step(1); });
const ui = (page) => page.evaluate(() => window.__game.ui.state());

export default async function runMissionTests(url) {
  let failed = 0;
  async function test(name, fn) {
    const t = Date.now();
    try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
    catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
  }

  await test('menus: title, job board, briefing, shop, settings', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => window.__game.ui.openMenu('main'));
    assert(await page.isVisible('.ws-title'), 'title visible');
    await shot(page, 'ui-01-main');
    await page.click('[data-act=play]');
    assert((await ui(page)).menu === 'missions', 'job board open');
    await shot(page, 'ui-02-missions');
    await page.click('[data-act=brief]');
    assert((await ui(page)).menu === 'briefing', 'briefing open');
    await shot(page, 'ui-03-briefing');
    await page.evaluate(() => { window.__game.ui.openMenu('main'); window.__game.ui.openMenu('shop'); });
    await shot(page, 'ui-04-shop');
    await page.evaluate(() => window.__game.ui.openMenu('settings'));
    await page.fill('#ws-fov', '95');
    await page.dispatchEvent('#ws-fov', 'input');
    assert(await page.evaluate(() => window.__game.game.fov) === 95, 'fov applied from settings');
    await shot(page, 'ui-05-settings');
    await page.evaluate(() => window.__game.ui.openMenu('sandbox'));
    await shot(page, 'ui-06-sandbox');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('demo heist: HUD, take target, alarm, map, escape, success', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.startMission('housewarming'); window.__game.step(30); });
    let s = await ui(page);
    assert(s.missionId === 'housewarming' && s.phase === 'planning', 'mission running: ' + JSON.stringify(s));
    assert(s.objectives.length === 3, 'three objectives');
    // walk into the house and look at the idol
    const idol = await centerOf(page, 'target:idol');
    assert(idol, 'idol exists');
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => window.__game.step(2));
    s = await ui(page);
    assert(s.prompt && s.prompt.includes('Gold Idol'), 'prompt: ' + s.prompt);
    await shot(page, 'ui-10-hud-prompt');
    await pressE(page);
    await page.evaluate(() => window.__game.step(60));
    s = await ui(page);
    assert(s.phase === 'alarm', 'alarm after taking the idol: ' + s.phase);
    assert(s.timeLeft > 57 && s.timeLeft < 60, 'timer counting: ' + s.timeLeft);
    await shot(page, 'ui-11-alarm');
    const clockTxt = await page.textContent('.ws-alarm .clock span');
    assert(/^0:5\d$/.test(clockTxt.trim()), 'clock on screen: ' + clockTxt);
    // map view
    await page.evaluate(() => window.__game.ui.toggleMap(true));
    await shot(page, 'ui-12-map');
    assert(await page.isVisible('.ws-map .ws-mk .esc'), 'escape marker on the map');
    await page.evaluate(() => window.__game.ui.toggleMap(false));
    // server box in the shed
    const server = await centerOf(page, 'target:server');
    await lookFrom(page, { x: server.x - 1.3, y: 0.2, z: server.z }, server);
    await page.evaluate(() => window.__game.step(2));
    await pressE(page);
    s = await ui(page);
    assert(s.objectives[1].done, 'server taken');
    assert(s.escapeOpen, 'escape open');
    await shot(page, 'ui-13-escape-open');
    // clock out at the van marker
    await page.evaluate(() => { window.__game.setView(0, 0.05, 5, 0, 0.6); window.__game.step(2); });
    await pressE(page);
    s = await ui(page);
    assert(s.phase === 'success', 'success: ' + s.phase);
    await page.evaluate(() => window.__game.step(60));
    s = await ui(page);
    assert(s.menu === 'success', 'success screen: ' + s.menu);
    await shot(page, 'ui-14-success');
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('wrecking-shift-save-v1')).missions.housewarming.best);
    assert(best > 200, 'saved best score ' + best);
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('fail: alarm runs out, helicopter arrives, fail screen; pause menu', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&mission=housewarming');
    await page.evaluate(() => window.__game.step(20));
    let s = await ui(page);
    assert(s.missionId === 'housewarming', '?mission= starts the job');
    await page.evaluate(() => window.__game.ui.openMenu('pause'));
    await shot(page, 'ui-20-pause');
    await page.click('[data-act=resume]');
    const idol = await centerOf(page, 'target:idol');
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => window.__game.step(2));
    await pressE(page);
    await page.evaluate(() => window.__game.step(60 * 50));
    s = await ui(page);
    assert(s.phase === 'alarm' && s.timeLeft < 10, 'late in the countdown: ' + s.timeLeft);
    // look at the helicopter from the escape point
    const heli = await page.evaluate(() => window.__game.ui && window.__game.game.ext.mission.current.heli);
    assert(heli, 'helicopter flying');
    await lookFrom(page, { x: 0, y: 0.05, z: 5 }, heli.pos);
    await shot(page, 'ui-21-heli');
    await page.evaluate(() => window.__game.step(60 * 10 + 60));
    s = await ui(page);
    assert(s.phase === 'failed', 'failed: ' + s.phase);
    assert(s.menu === 'fail', 'fail screen: ' + s.menu);
    await shot(page, 'ui-22-fail');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('1280x720 layout: title, briefing, HUD, success', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1', { width: 1280, height: 720 });
    await page.evaluate(() => window.__game.ui.openMenu('main'));
    await shot(page, 'ui-30-main-720');
    await page.evaluate(() => window.__game.ui.openMenu('briefing', 'housewarming'));
    await shot(page, 'ui-31-briefing-720');
    await page.evaluate(() => { window.__game.ui.startMission('housewarming'); window.__game.step(10); window.__game.selectTool('sledge'); });
    const idol = await centerOf(page, 'target:idol');
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => { window.__game.step(2); window.__game.game.player.damage(0.45, 'test'); window.__game.step(1); });
    await shot(page, 'ui-32-hud-720');
    await page.evaluate(() => window.__game.ui.toggleMap(true));
    await shot(page, 'ui-33-map-720');
    await page.evaluate(() => window.__game.ui.toggleMap(false));
    await page.evaluate(() => window.__game.ui.startSandbox('testyard'));
    await page.evaluate(() => {
      window.__game.step(5);
      window.__game.ui.toggleDebug(true);
      window.__game.game.ext.vehicles = { list: [], current: { name: 'Harbour Van', speedKmh: 47.6, health: 0.7 } };
    });
    const st = await ui(page);
    assert(st.sandbox && !st.missionId, 'sandbox mode');
    await shot(page, 'ui-34-sandbox-720');
    assert(await page.isVisible('.ws-speedo'), 'speedometer shown in a vehicle');
    assert(!(await page.isVisible('.ws-tools')), 'tool bar hidden while driving');
    await page.evaluate(() => { delete window.__game.game.ext.vehicles; window.__game.ui.toggleDebug(false); });
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('title menu shows on a normal boot', async () => {
    const { browser, page, errors } = await openGame(url, '');
    await page.waitForSelector('.ws-title', { timeout: 30000 });
    const s = await ui(page);
    assert(s.menu === 'main' && s.session === 'menu', 'main menu on boot: ' + JSON.stringify(s));
    assert(await page.evaluate(() => window.__game.game.paused), 'game paused under the menu');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  return failed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { srv, url } = await serve();
  const failed = await runMissionTests(url);
  srv.close();
  if (failed) { console.log(failed + ' mission e2e test(s) failed'); process.exit(1); }
  console.log('mission e2e ok');
}
