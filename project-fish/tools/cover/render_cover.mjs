// Saves Project Fish's cover art: serves the project folder, opens
// tools/cover/cover.html in a headless Chromium once per layout and writes
// the JPEG each one draws.
//
//   npm run build-cover
//   node tools/cover/render_cover.mjs [layout,...]
//
// Layouts and where they go (paths from the project-fish folder):
//   thumb  thumb.jpg            1280x720, the arcade's tile
//   cover  cover.jpg            1200x1800, the box art
//   og     assets/cover/og.jpg  1200x630, the picture link previews show
//
// It needs Playwright with its Chromium (npm install --no-save playwright &&
// npx playwright install chromium), or PLAYWRIGHT pointing at an installed
// copy's index.mjs. three.js comes from node_modules (npm install), not the
// CDN. WebGL runs in software (SwiftShader), so the same files give the same
// pictures on any machine; each layout takes a minute or two.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const THREE_DIR = path.join(ROOT, 'node_modules/three');
const OUTPUTS = { thumb: 'thumb.jpg', cover: 'cover.jpg', og: 'assets/cover/og.jpg' };
const ONLY = (process.argv[2] || Object.keys(OUTPUTS).join(',')).split(',').filter(Boolean);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };

for (const name of ONLY) {
  if (!OUTPUTS[name]) {
    console.error(`No layout called ${name} (there are ${Object.keys(OUTPUTS).join(', ')}).`);
    process.exit(1);
  }
}
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
  for (const layout of ONLY) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('page:', m.text()); });
    // three.js from node_modules instead of the CDN.
    await page.route('https://cdn.jsdelivr.net/npm/three@0.184.0/**', (route) => {
      const file = path.join(THREE_DIR, route.request().url().split('three@0.184.0/')[1]);
      route.fulfill({ path: file, contentType: 'text/javascript' });
    });
    await page.goto(`http://127.0.0.1:${port}/tools/cover/cover.html?layout=${layout}`);
    await page.waitForFunction(() => window.coverDone, null, { timeout: 30 * 60 * 1000, polling: 500 });
    const error = await page.evaluate(() => window.coverError);
    if (error) {
      console.error(`${layout}: ${error}`);
      process.exitCode = 1;
    } else {
      const url = await page.evaluate(() => window.coverImage);
      const data = Buffer.from(url.split(',')[1], 'base64');
      const out = path.join(ROOT, OUTPUTS[layout]);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data);
      console.log(`${OUTPUTS[layout]}  ${(data.length / 1024).toFixed(0)} KB`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
