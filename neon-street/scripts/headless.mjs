#!/usr/bin/env node
// Renders a few frames in headless Chromium and saves a screenshot.
//
//   npm run build && node scripts/headless.mjs --out shot.png
//
// Options:
//   --out <file>      screenshot path (default: headless.png)
//   --frames <n>      frames to render before capturing (default: 12)
//   --query <string>  extra URL query, e.g. "preset=ultra&scale=1"
//   --real-gpu        use the machine's GPU instead of the SwiftShader software renderer
//   --timeout <ms>    give up after this long (default: 600000)
//   --chrome <path>   Chromium executable (default: Playwright's bundled build)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(2);
}

let playwright;
try {
  playwright = await import('playwright');
} catch {
  const alt = process.env.PLAYWRIGHT_MODULE;
  if (!alt) {
    console.error('playwright is not installed. `npm i -D playwright` or set PLAYWRIGHT_MODULE.');
    process.exit(2);
  }
  playwright = await import(alt);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.png': 'image/png', '.wgsl': 'text/plain' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (url.pathname === '/') file = path.join(dist, 'index.html');
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const swArgs = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-vulkan=swiftshader', '--enable-unsafe-swiftshader'];
const gpuArgs = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-gl=angle', '--use-angle=vulkan'];
const launch = {
  args: [...(flag('real-gpu') ? gpuArgs : swArgs), '--no-sandbox'],
  headless: true,
};
const chrome = opt('chrome', null);
if (chrome) launch.executablePath = chrome;

const browser = await playwright.chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const consoleLines = [];
const seen = new Set();
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  if (m.type() !== 'error') return; // Dawn repeats each error as a warning too.
  if (line.includes('favicon') || line.includes('404')) return;
  consoleLines.push(line);
  // Only print the first few distinct errors; the rest are usually knock-on effects.
  const key = line.slice(0, 120);
  if (!seen.has(key) && seen.size < 6) {
    seen.add(key);
    console.log(line);
  }
});
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

const frames = parseInt(opt('frames', '12'), 10);
const extra = opt('query', 'preset=low&w=320&h=180');
const url = `http://127.0.0.1:${port}/?autostart=1&${extra}`;
console.log('opening', url);
const t0 = Date.now();
await page.goto(url);
const timeout = parseInt(opt('timeout', '600000'), 10);
try {
  await page.waitForFunction(
    (n) => (window.__neon && (window.__neon.frames >= n || window.__neon.errors.length > 0)),
    frames,
    { timeout, polling: 500 },
  );
} catch (e) {
  console.error('timed out waiting for frames:', e.message);
}
// Freeze the loop so the compositor can present the last frame for the capture
// (a software GPU can take many seconds per frame at higher settings).
const state = await page.evaluate(() => {
  if (window.__neon) window.__neon.pause = true;
  return JSON.parse(JSON.stringify(window.__neon ?? null));
});
if (flag('inspect')) {
  const info = await page.evaluate(() => JSON.parse(JSON.stringify(window.__neon?.inspect?.() ?? null)));
  console.log('inspect:', JSON.stringify(info));
}
const out = opt('out', 'headless.png');
try {
  // A broken pipeline never presents a frame, so don't wait long in that case.
  await page.screenshot({ path: out, timeout: state?.errors?.length ? 15000 : 180000 });
} catch (e) {
  console.error('screenshot failed:', e.message.split('\n')[0]);
}
await browser.close();
server.close();

console.log(JSON.stringify({ ...state, elapsedMs: Date.now() - t0, screenshot: out }, null, 2));
const errors = (state?.errors ?? []).concat(consoleLines.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]')));
if (errors.length) {
  console.error('errors:\n' + errors.join('\n'));
  process.exit(1);
}
