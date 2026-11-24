// Fire & smoke smoke-test: ignite the tree and the house's wooden parts in the test yard, run ~600 ticks, screenshot.
import { assert, openGame, serve, shot } from './harness.mjs';

const { srv, url } = await serve();
let failed = 0;
async function test(name, fn) {
  const t = Date.now();
  try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
}

await test('fire: tree + house burn, flames and smoke render', async () => {
  const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
  await page.evaluate(() => window.__game.step(30));
  const lit = await page.evaluate(() => {
    const f = window.__game.game.fire;
    return {
      concrete: f.igniteNear({ x: 8.2, y: 1.5, z: -1.8 }, 0.3, 20), // shed pillars: concrete / metal, nothing burns
      tree: f.igniteNear({ x: 3, y: 0.4, z: 9 }, 0.6, 12) + f.igniteNear({ x: 3, y: 3.4, z: 10.4 }, 0.9, 30),
      table: f.igniteNear({ x: 1.8, y: 1.0, z: -10.3 }, 0.9, 30),
      floor: f.igniteNear({ x: -1.5, y: 0.3, z: -11 }, 0.8, 20),
    };
  });
  assert(lit.concrete === 0, 'nothing flammable at the shed: ' + JSON.stringify(lit));
  assert(lit.tree > 10 && lit.table > 5 && lit.floor > 3, 'ignited: ' + JSON.stringify(lit));
  const counts = [];
  const views = [
    ['f1-tree', [3, 0.05, 15.5, 0, 0.32]],
    ['f2-house', [0, 0.05, -16.2, Math.PI, 0.12]],
  ];
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => window.__game.step(120));
    const s = await page.evaluate(() => ({ fires: window.__game.game.fire.count(), health: window.__game.player.health }));
    counts.push(s.fires);
    if (k === 1 || k === 4) {
      for (const [name, v] of views) {
        await page.evaluate((v) => window.__game.setView(...v), v);
        await shot(page, `${name}-${(k + 1) * 2}s`);
      }
    }
  }
  const fx = await page.evaluate(() => window.__game.game.ext.fireFx.stats);
  console.log('     fire counts every 2 s:', counts.join(', '), ' fx:', JSON.stringify(fx));
  assert(Math.max(...counts) > 150, 'fire spread: ' + counts.join(','));
  assert(fx.flames > 50, 'flame particles: ' + JSON.stringify(fx));
  assert(fx.smoke > 20, 'smoke particles: ' + JSON.stringify(fx));
  // night-ish close-up + explosion smoke
  // night: fire lights must light the surroundings (dim the renderer's lights just for this shot)
  await page.evaluate(() => {
    const r = window.__game.game.renderer;
    window.__saved = { sun: r.sun?.intensity, hemi: r.hemi?.intensity, bg: r.scene.background };
    if (r.sun) r.sun.intensity = 0; if (r.hemi) r.hemi.intensity = 0.06;
    r.scene.background = null;
    window.__game.setView(3, 0.05, 15.5, 0, 0.32);
  });
  await shot(page, 'f5-night');
  await page.evaluate(() => {
    const r = window.__game.game.renderer, s = window.__saved;
    if (r.sun) r.sun.intensity = s.sun; if (r.hemi) r.hemi.intensity = s.hemi; r.scene.background = s.bg;
  });
  // close-up of the burning trunk
  await page.evaluate(() => { window.__game.setView(3.3, 0.05, 12.2, 0.1, 0.25); window.__game.step(30); });
  await shot(page, 'f4-closeup');
  // explosion: smoke + dust burst (render a few frames so the particles evolve)
  await page.evaluate(() => { window.__game.setView(-6, 0.05, 5, 0, 0.12); window.__game.explode(-6, 0.6, -2, 1.2); });
  for (let i = 0; i < 4; i++) await page.evaluate(() => { window.__game.step(3); window.__game.render(); });
  await shot(page, 'f3-explosion-0.3s');
  for (let i = 0; i < 12; i++) await page.evaluate(() => { window.__game.step(6); window.__game.render(); });
  await shot(page, 'f3-explosion-1.5s');
  // extinguish everything around the tree
  const out = await page.evaluate(() => window.__game.game.fire.extinguish({ x: 3, y: 4, z: 9 }, 6));
  assert(out > 0, 'extinguished ' + out);
  // quality switch must not throw
  await page.evaluate(() => { window.__game.game.ext.fireFx.setQuality('low'); window.__game.render(); window.__game.game.ext.fireFx.setQuality('medium'); });
  assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
  await browser.close();
});

srv.close();
if (failed) { console.log(failed + ' e2e test(s) failed'); process.exit(1); }
console.log('fire e2e ok');
