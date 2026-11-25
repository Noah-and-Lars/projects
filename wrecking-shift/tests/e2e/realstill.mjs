// Real game loop (rAF, no test mode): stand still in sandbox and record everything that feeds the picture per frame.
// node tests/e2e/realstill.mjs [level] [query]
import { serve, outDir } from './harness.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require('/opt/node-tools/node_modules/playwright');
const level = process.argv[2] ?? 'harbor', extra = process.argv[3] ?? '';
const { srv, url } = await serve();
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url + '?sandbox=' + level + (extra ? '&' + extra : ''));
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 });
await page.waitForFunction(() => !window.__game.game.loading && window.__game.game.level, null, { timeout: 240000 });
await page.evaluate(() => window.__game.ui.closeMenus?.());
await page.waitForTimeout(4000);
if (process.env.WALK) { // walk forward, then stop and let the bob settle a moment
  await page.keyboard.down('KeyW'); await page.waitForTimeout(+process.env.WALK); await page.keyboard.up('KeyW');
  await page.waitForTimeout(+(process.env.SETTLE ?? 1500));
}
const r = await page.evaluate(() => new Promise((resolve) => {
  const game = window.__game.game, R = game.renderer;
  const rec = [];
  const orig = R.render.bind(R);
  const snap = () => {
    const cam = R.camera; cam.updateMatrixWorld();
    const u = {};
    for (const [k, v] of Object.entries(R.look)) { const x = v.value; u[k] = x == null ? null : x.isVector3 || x.isColor ? x.toArray().join(',') : typeof x === 'number' ? x : x.isTexture ? 'tex' + x.id + ':' + x.version : String(x); }
    return {
      cam: cam.matrixWorld.elements.map((e) => e.toFixed(7)).join(','),
      proj: cam.projectionMatrix.elements.map((e) => e.toFixed(7)).join(','),
      sun: R.sun.position.toArray().map((e) => e.toFixed(5)).join(',') + '|' + R.sun.target.position.toArray().map((e) => e.toFixed(5)).join(','),
      shadowCam: R.sun.shadow.camera.matrixWorld.elements.map((e) => e.toFixed(5)).join(','),
      bob: JSON.stringify(game.viewBob), shake: R.shake, punch: R.punch, stride: game.player.stride.toFixed(6), vel: JSON.stringify(game.player.vel),
      lamps: R.lamps.group.children.filter((l) => l.isLight).map((l) => l.position.toArray().map((e) => e.toFixed(3)).join(',') + '@' + l.intensity.toFixed(3) + (l.visible ? '' : 'h')).join(';'),
      u: JSON.stringify(u), fog: R.scene.fog.near + ',' + R.scene.fog.far,
      res: R.post.renderSize.join('x') + ' q' + R.effectiveQuality, ticks: game.sim.tick,
    };
  };
  R.render = (sim, dt, full) => { orig(sim, dt, full); rec.push(snap()); if (rec.length >= 120) { R.render = orig; resolve(rec); } };
}));
const keys = Object.keys(r[0]);
const changes = {};
for (const k of keys) { let n = 0; const ex = []; for (let i = 1; i < r.length; i++) if (r[i][k] !== r[i - 1][k]) { n++; if (ex.length < 2) ex.push([r[i - 1][k], r[i][k]]); } changes[k] = n; if (n && k !== 'ticks') console.log('CHANGED', k, n, '\n  ', JSON.stringify(ex).slice(0, 700)); }
console.log('frames', r.length, 'sim ticks', r[0].ticks, '->', r[r.length - 1].ticks, 'res', r[0].res);
console.log('errors', errors.slice(0, 3));
await page.screenshot({ path: `${outDir}/realstill-${level}.png` });
await browser.close(); srv.close();
