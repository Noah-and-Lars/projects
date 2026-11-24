// E2E: one mission played start to finish on each big map, in the real game (headless Chromium, dist/).
// Teleports with setView (fine here: the Node playthroughs in tests/unit/playthrough.test.ts are the honest runs),
// presses E / fires tools through the test hooks, and checks the success screen and score.
//   node tests/e2e/playthrough.mjs            (needs dist/: npx vite build)
import { assert, openGame, serve, shot } from './harness.mjs';

const ui = (page) => page.evaluate(() => window.__game.ui.state());
/** stand at feet position `feet` and look at world point `target` */
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
const pressE = (page) => page.evaluate(() => { const g = window.__game; g.key('KeyE', true); g.step(1); g.key('KeyE', false); g.step(1); });
const centers = (page, tag) => page.evaluate((tag) => {
  const out = [];
  for (const b of window.__game.sim.bodies.values()) if (b.tags.has(tag) && !b.removed) out.push(b.center());
  return out.sort((a, b) => a.x - b.x);
}, tag);
const escapePos = (page) => page.evaluate(() => window.__game.game.ext.mission.current.escapePos());

/** take a collect target standing 1.3 m away on the side `side` (unit x/z offset) */
async function take(page, c, side = { x: 0, z: 1 }, floorY = null) {
  await lookFrom(page, { x: c.x + side.x * 1.3, y: (floorY ?? c.y - 0.4) + 0.1, z: c.z + side.z * 1.3 }, c);
  await page.evaluate(() => window.__game.step(3));
  await lookFrom(page, { x: c.x + side.x * 1.3, y: (floorY ?? c.y - 0.4) + 0.1, z: c.z + side.z * 1.3 }, c);
  await pressE(page);
}
async function clockOut(page) {
  const e = await escapePos(page);
  await page.evaluate((e) => { window.__game.setView(e.x - 1.8, e.y - 0.9, e.z - 1.6, 0, 0.6); window.__game.step(3); }, e);
  await pressE(page);
  await page.evaluate(() => window.__game.step(90));
}

export default async function runPlaythroughTests(url) {
  let failed = 0;
  async function test(name, fn) {
    const t = Date.now();
    try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
    catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
  }

  await test('harbor: Paper Trail start to finish (log, idol -> alarm, server, van)', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.startMission('paper-trail'); window.__game.step(30); });
    let s = await ui(page);
    assert(s.missionId === 'paper-trail' && s.phase === 'planning', 'mission running: ' + JSON.stringify(s).slice(0, 200));
    const [log] = await centers(page, 'target:log');
    await take(page, log, { x: 0, z: 1 }, 1.8);
    const [idol] = await centers(page, 'target:idol');
    await take(page, idol, { x: 1, z: 0 }, 4.4);
    s = await ui(page);
    assert(s.phase === 'alarm', 'alarm after the idol: ' + s.phase);
    await shot(page, 'pt-harbor-1-alarm');
    const [server] = await centers(page, 'target:server');
    await take(page, server, { x: 1, z: 0 }, 4.5);
    s = await ui(page);
    assert(s.escapeOpen, 'escape open: ' + JSON.stringify(s.objectives));
    await clockOut(page);
    s = await ui(page);
    assert(s.phase === 'success', 'success: ' + s.phase);
    assert(s.menu === 'success', 'success screen: ' + s.menu);
    assert(s.result.score >= 300, 'score ' + s.result.score);
    await shot(page, 'pt-harbor-2-success');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('ridge: Private View start to finish (six pieces, van)', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.startMission('private-view'); window.__game.step(30); });
    const art = await centers(page, 'target:art');
    assert(art.length === 6, 'six pieces: ' + art.length);
    for (const a of art) await take(page, a, { x: 0, z: 1 }, 6.95);
    let s = await ui(page);
    assert(s.phase === 'alarm' && s.objectives.every((o) => o.done), 'all taken: ' + JSON.stringify(s.objectives));
    await shot(page, 'pt-ridge-1-gallery');
    await clockOut(page);
    s = await ui(page);
    assert(s.phase === 'success' && s.menu === 'success', 'success screen: ' + s.phase + ' ' + s.menu);
    assert(s.result.score >= 200, 'score ' + s.result.score);
    await shot(page, 'pt-ridge-2-success');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('works: Controlled Burn start to finish (pistol into four fuel tanks, van)', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.startMission('bund-fire'); window.__game.step(30); });
    await page.evaluate(() => window.__game.selectTool('pistol'));
    for (const [tx, tz] of [[43, -16], [55, -16], [43, -26], [55, -26]]) {
      for (let k = 0; k < 3; k++) {
        await lookFrom(page, { x: 49, y: 1.7, z: -7 }, { x: tx + (49 - tx) * 0.1, y: 4.6, z: tz + 1.6 });
        await page.evaluate(() => { const g = window.__game; g.buttons(1); g.step(2); g.buttons(0); g.step(10); });
      }
      await page.evaluate(() => window.__game.step(40));
      const s = await ui(page);
      if (s.objectives[0].done) break;
    }
    let s = await ui(page);
    assert(s.phase === 'alarm', 'heat sensor tripped: ' + s.phase);
    assert(s.objectives[0].done, 'tanks destroyed: ' + JSON.stringify(s.objectives[0]));
    await shot(page, 'pt-works-1-tanks');
    await clockOut(page);
    s = await ui(page);
    assert(s.phase === 'success' && s.menu === 'success', 'success screen: ' + s.phase + ' ' + s.menu);
    assert(s.result.score >= 150, 'score ' + s.result.score);
    await shot(page, 'pt-works-2-success');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  return failed;
}

const { pathToFileURL } = await import('node:url');
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { srv, url } = await serve();
  const failed = await runPlaythroughTests(url);
  srv.close();
  if (failed) { console.log(failed + ' playthrough e2e test(s) failed'); process.exit(1); }
  console.log('playthrough e2e ok');
}
