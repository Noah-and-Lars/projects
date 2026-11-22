// End-to-end smoke test in real Chromium: Yard renders, Test drives, save/reload works.
// Usage: npm run build && node tools/e2e.mjs [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4417', '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('4417')) r(); }); setTimeout(r, 5000); });
const url = 'http://localhost:4417/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const results = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__tw && window.__tw.yard.grid.size > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/1-yard.png` });
  results.yardParts = await page.evaluate(() => window.__tw.yard.grid.size);

  // Place a block with the mouse: hover the floor in front of the car and click.
  const before = results.yardParts;
  await page.mouse.move(720, 700);
  await page.mouse.click(720, 700);
  await page.waitForTimeout(300);
  results.afterPlace = await page.evaluate(() => window.__tw.yard.grid.size);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  results.afterUndo = await page.evaluate(() => window.__tw.yard.grid.size);
  results.placeWorked = results.afterPlace > before && results.afterUndo === before;

  // Save to IndexedDB and reload the page.
  await page.evaluate(() => { window.__tw.yard.name = 'E2E Buggy'; return window.__tw.yard.save(); });
  await page.reload();
  await page.waitForFunction(() => window.__tw && window.__tw.yard.grid.size > 0, null, { timeout: 30000 });
  results.savedList = await page.evaluate(async () => {
    const req = indexedDB.open('tidewright');
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    return await new Promise((r) => { const q = db.transaction('vehicles').objectStore('vehicles').getAllKeys(); q.onsuccess = () => r(q.result); });
  });

  // Test drive.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__tw.mode === 'drive', null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/2-drive-start.png` });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/3-driving.png` });
  results.frameCpuMs = await page.evaluate(() => window.__tw.perf());
  results.hud = await page.evaluate(() => ({ speed: document.querySelector('.speed')?.textContent, gear: document.querySelector('.gear')?.textContent, perf: document.querySelector('.perf')?.textContent }));
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/4-seat-cam.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  results.backToYard = await page.evaluate(() => window.__tw.mode);

  // Phone-sized touch layout.
  const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  phone.on('pageerror', (e) => errors.push('phone: ' + e));
  await phone.goto(url + '?touch');
  await phone.waitForFunction(() => window.__tw && window.__tw.yard.grid.size > 0, null, { timeout: 30000 });
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: `${out}/5-phone-yard.png` });
  await phone.evaluate(() => window.__tw.yard.test());
  await phone.waitForFunction(() => window.__tw.mode === 'drive', null, { timeout: 60000 });
  await phone.waitForTimeout(1500);
  const gas = await phone.$('.touch-btn.gas');
  const box = await gas.boundingBox();
  await phone.mouse.move(box.x + 40, box.y + 50);
  await phone.mouse.down();
  await phone.waitForTimeout(3000);
  await phone.screenshot({ path: `${out}/6-phone-drive.png` });
  results.phoneSpeed = await phone.evaluate(() => document.querySelector('.speed')?.textContent);
  await phone.mouse.up();
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { server.kill(); }
}
console.log(JSON.stringify({ results, errors }, null, 2));
process.exit(errors.length ? 1 : 0);
