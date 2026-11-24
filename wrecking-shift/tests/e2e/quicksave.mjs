import { assert, openGame, serve, shot } from './harness.mjs';
const { srv, url } = await serve();
let failed = 0;
try {
  const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
  const r = await page.evaluate(() => {
    const G = window.__game, g = G.game;
    G.ui.startMission('housewarming');
    G.step(30);
    const v0 = G.stats().voxels, b0 = G.stats().bodies;
    const saved = g.ext.quicksave.save();
    G.explode(1, 1.2, -8, 1.6); G.step(60);
    const v1 = G.stats().voxels;
    G.setView(5, 0.05, 5, 0, 0);
    const loaded = g.ext.quicksave.load();
    G.step(10);
    const v2 = G.stats().voxels, b2 = G.stats().bodies;
    const st = G.ui.state();
    // trip the alarm -> saving must be refused
    g.ext.mission.current.triggerAlarm('test'); G.step(2);
    const refused = g.ext.quicksave.save() === false;
    return { saved, loaded, v0, v1, v2, b0, b2, phase: st.phase ?? st.mission?.phase, refused, pos: G.stats().pos };
  });
  console.log(JSON.stringify(r));
  assert(r.saved && r.loaded, 'save/load ran');
  assert(r.v1 < r.v0 - 500, 'explosion removed voxels');
  assert(r.v2 === r.v0 && r.b2 === r.b0, `world restored: ${r.v0} -> ${r.v2}, bodies ${r.b0} -> ${r.b2}`);
  assert(r.refused, 'no quicksave during alarm');
  assert(Math.abs(r.pos.x - 5) > 1, 'player position restored');
  await shot(page, 'qs-after-load');
  assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
  await browser.close();
  console.log('ok   quicksave round trip');
} catch (e) { failed++; console.log('FAIL quicksave: ' + (e.stack || e)); }
srv.close();
process.exit(failed ? 1 : 0);
