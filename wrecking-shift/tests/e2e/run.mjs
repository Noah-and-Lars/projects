import { assert, openGame, serve, shot } from './harness.mjs';

const { srv, url } = await serve();
let failed = 0;
async function test(name, fn) {
  const t = Date.now();
  try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
}

await test('boot + spawn + screenshot', async () => {
  const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
  await page.evaluate(() => window.__game.step(30));
  const s = await page.evaluate(() => window.__game.stats());
  assert(s.bodies >= 6, 'bodies present');
  assert(s.grounded, 'player standing on ground: ' + JSON.stringify(s.pos));
  await shot(page, 'm1-spawn');
  // walk forward 1 s
  const z0 = s.pos.z;
  await page.evaluate(() => { window.__game.key('KeyW', true); window.__game.step(60); window.__game.key('KeyW', false); });
  const s2 = await page.evaluate(() => window.__game.stats());
  assert(s2.pos.z < z0 - 3, 'walked forward: ' + (z0 - s2.pos.z));
  // look at the house and whack it
  await page.evaluate(() => { window.__game.setView(1, 0.05, -6.2, 0, 0); window.__game.step(5); });
  const v0 = (await page.evaluate(() => window.__game.stats())).voxels;
  await page.evaluate(() => { for (let i = 0; i < 4; i++) { window.__game.useTool(0); window.__game.step(4); } });
  const v1 = (await page.evaluate(() => window.__game.stats())).voxels;
  assert(v1 < v0 - 50, 'sledge removed voxels: ' + (v0 - v1));
  await shot(page, 'm2-sledge');
  await page.evaluate(() => { window.__game.setView(6, 0.05, 8, 0.5, 0.1); window.__game.useTool(2); window.__game.step(40); });
  await shot(page, 'm3-explosion');
  assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
  await browser.close();
});

srv.close();
if (failed) { console.log(failed + ' e2e test(s) failed'); process.exit(1); }
console.log('e2e ok');
