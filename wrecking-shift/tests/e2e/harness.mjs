// Minimal static server + Playwright helpers for smoke tests against dist/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
export const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'out');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

export function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

export async function openGame(url, query = 'test=1', size = { width: 640, height: 360 }) {
  const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + '?' + query);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
  return { browser, page, errors };
}

export async function shot(page, name) {
  fs.mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => window.__game.render());
  const file = path.join(outDir, name + '.png');
  await page.screenshot({ path: file, timeout: 180000 });
  return file;
}

export function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}
