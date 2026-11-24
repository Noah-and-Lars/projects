// Voxel look probe: close-ups of untouched / hammered / bombed walls (node tests/e2e/voxlook.mjs [prefix])
import { serve, openGame, outDir } from './harness.mjs';
const pre = process.argv[2] ?? 'vox';
const { srv, url } = await serve();
const { browser, page, errors } = await openGame(url, 'test=1&level=harbor');
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.__game; g.render(); g.step(60);
  const h = g.sim.raycast({ x: -10.4, y: 20, z: -32.4 }, { x: 0, y: -1, z: 0 }, 40);
  g.setView(-10.4, h.point.y + 0.02, -32.4, Math.PI / 2, -0.05); g.step(30); g.selectTool('sledge'); g.step(40); });
await ev(() => window.__game.render());
await page.screenshot({ path: `${outDir}/${pre}-1-wall.png` });
// three hammer blows, screenshot a few ticks after the last impact (chips in the air)
await ev(() => { const g = window.__game; for (const [dy, dyaw] of [[0, 0], [-0.12, 0.08], [0.1, -0.1]]) { g.player.pitch = -0.05 + dy; g.player.yaw = Math.PI / 2 + dyaw; g.buttons(1); g.step(2); g.buttons(0); g.step(46); } g.player.pitch = -0.05; g.player.yaw = Math.PI / 2;
  g.buttons(1); g.step(2); g.buttons(0); g.step(16); });
await ev(() => window.__game.render());
await page.screenshot({ path: `${outDir}/${pre}-2-hammer-chips.png` });
await ev(() => { const g = window.__game; g.step(240); g.render(); });
await page.screenshot({ path: `${outDir}/${pre}-3-hammered.png` });
// step back and look at the debris on the floor
await ev(() => { const g = window.__game; g.game.cameraOverride = { eye: { x: -9.8, y: g.player.eye.y, z: -31.6 }, yaw: Math.PI / 2 + 0.35, pitch: -0.55 }; g.render(); });
await page.screenshot({ path: `${outDir}/${pre}-4-debris.png` });
// bomb on the brick office wall (16.2, 6.2, -7.0 faces -z)
await ev(() => { const g = window.__game; g.game.cameraOverride = null;
  const h = g.sim.raycast({ x: 16, y: 20, z: -11 }, { x: 0, y: -1, z: 0 }, 40);
  g.setView(16, h.point.y + 0.02, -8.3, Math.PI + 0.5, 0.1); g.step(20); g.render(); });
await page.screenshot({ path: `${outDir}/${pre}-5a-brick-close.png` });
await ev(() => { const g = window.__game; const h = g.sim.raycast({ x: 16, y: 20, z: -11 }, { x: 0, y: -1, z: 0 }, 40);
  g.setView(16, h.point.y + 0.02, -11, Math.PI, 0.05); g.step(20); g.explode(16, h.point.y + 1.2, -7.05, 1.4); g.step(8); g.render(); });
await page.screenshot({ path: `${outDir}/${pre}-5-blast.png` });
await ev(() => { const g = window.__game; g.step(300); g.render(); });
await page.screenshot({ path: `${outDir}/${pre}-6-blast-after.png` });
console.log('errors', errors.slice(0, 5));
await browser.close(); srv.close();
