import { serve, outDir } from '../tests/e2e/harness.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require('/opt/node-tools/node_modules/playwright');
const { srv, url } = await serve();
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERR ' + e));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 300)); });
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: outDir + '/rp-1-menu.png' });
for (const id of process.argv.slice(2)) {
  const t = Date.now();
  await page.evaluate((id) => window.__game.ui.startMission(id), id);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.ui.closeMenus());
  await page.waitForTimeout(8000);
  const s = await page.evaluate(() => ({ st: window.__game.stats(), frames: window.__game.game.frameCount, q: window.__game.game.renderer.effectiveQuality, pend: window.__game.game.renderer.pendingChunks?.(), ui: window.__game.ui.state().phase }));
  console.log(id, 'ms', Date.now() - t, JSON.stringify(s).slice(0, 400));
  await page.screenshot({ path: outDir + `/rp-${id}.png`, timeout: 120000 }).catch(() => console.log('shot timeout'));
}
console.log('errors/warnings:', errors.length, errors.slice(0, 8));
await browser.close(); srv.close();
