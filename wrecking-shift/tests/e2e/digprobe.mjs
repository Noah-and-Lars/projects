// Probe: dig into the ground (bombs + many sledge-size carves) and look into the crater
// node tests/e2e/digprobe.mjs [level] [x] [z] [prefix]
import { serve, openGame, outDir } from './harness.mjs';
const [level = 'harbor', X = '6', Z = '-45', pre = 'dig'] = process.argv.slice(2);
const { srv, url } = await serve();
const { browser, page, errors } = await openGame(url, `test=1&level=${level}`);
const info = await page.evaluate(({ X, Z }) => {
  const g = window.__game; g.render(); g.game.toolsEnabled = false;
  const h = g.sim.raycast({ x: X, y: 40, z: Z }, { x: 0, y: -1, z: 0 }, 80);
  const y0 = h.point.y;
  for (let k = 0; k < 6; k++) { g.sim.carve({ x: X, y: y0 - k * 0.4, z: Z }, 1.5, 1.2, 0.8, { silent: true }); g.step(2); }
  g.step(60);
  const out = [];
  for (let k = 0; k < 6; k++) { const r = g.sim.raycast({ x: X + (k - 2.5) * 0.4, y: 40, z: Z }, { x: 0, y: -1, z: 0 }, 80); out.push(r ? r.body.name + '@' + r.point.y.toFixed(2) + ':' + (r.palette >> 3) : 'MISS'); }
  g.game.cameraOverride = { eye: { x: X + 4, y: y0 + 3, z: Z + 4 }, yaw: Math.PI / 4, pitch: -0.55 }; g.render(); g.render();
  return { y0, out, stats: g.game.renderer.stats().volume };
}, { X: +X, Z: +Z });
console.log(JSON.stringify(info));
await page.screenshot({ path: `${outDir}/${pre}-crater.png`, timeout: 240000 });
await page.evaluate(() => { const g = window.__game; g.game.cameraOverride = { eye: { x: g.game.cameraOverride.eye.x - 3.2, y: g.game.cameraOverride.eye.y + 1, z: g.game.cameraOverride.eye.z - 3.2 }, yaw: Math.PI / 4, pitch: -1.3 }; g.render(); });
await page.screenshot({ path: `${outDir}/${pre}-crater-later.png`, timeout: 240000 });
console.log('errors', errors.slice(0, 3));
await browser.close(); srv.close();
