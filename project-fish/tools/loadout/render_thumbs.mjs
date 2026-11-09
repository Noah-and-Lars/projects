// Saves the loadout menu's pictures: serves the project folder, opens
// tools/loadout/thumbs.html in a headless Chromium and writes every picture
// it draws to the folder given (assets/loadout/thumbs).
//
//   npm run build-loadout-thumbs
//   node tools/loadout/render_thumbs.mjs assets/loadout/thumbs [name prefix,...]
//
// It needs Playwright with its Chromium (npm install --no-save playwright &&
// npx playwright install chromium), or PLAYWRIGHT pointing at an installed
// copy's index.mjs. three.js comes from node_modules (npm install), not the
// CDN. WebGL runs in software (SwiftShader), so the same files give the same
// pictures on any machine.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'assets/loadout/thumbs'));
const ONLY = process.argv[3] || '';
const THREE_DIR = path.join(ROOT, 'node_modules/three');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };

if (!fs.existsSync(path.join(THREE_DIR, 'build/three.module.js'))) {
  console.error('three.js is missing: run npm install in project-fish first.');
  process.exit(1);
}
let chromium;
try {
  const where = process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright';
  ({ chromium } = await import(where));
} catch {
  console.error('Playwright is missing: npm install --no-save playwright && npx playwright install chromium (or set PLAYWRIGHT to its index.mjs).');
  process.exit(1);
}

// The project folder, read only, on a free local port.
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
  // three.js from node_modules instead of the CDN.
  await page.route('https://cdn.jsdelivr.net/npm/three@0.184.0/**', (route) => {
    const file = path.join(THREE_DIR, route.request().url().split('three@0.184.0/')[1]);
    route.fulfill({ path: file, contentType: 'text/javascript' });
  });
  await page.goto(`http://127.0.0.1:${port}/tools/loadout/thumbs.html${ONLY ? `?only=${encodeURIComponent(ONLY)}` : ''}`);
  await page.waitForFunction(() => window.thumbsDone, null, { timeout: 30 * 60 * 1000, polling: 500 });
  const error = await page.evaluate(() => window.thumbsError);
  const thumbs = await page.evaluate(() => window.thumbs);
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, url] of Object.entries(thumbs)) {
    const data = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, `${name}.webp`), data);
    console.log(`${name}.webp  ${(data.length / 1024).toFixed(0)} KB`);
  }
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
