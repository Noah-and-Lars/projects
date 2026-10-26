// Opens the game in headless Chromium and saves pictures that a test script draws.
//   HB_MODELS=<dir> node shot.mjs <out-prefix> <test.js> [quality] [wait-ms]
// The game folder is served over http; HB_MODELS serves another folder as models/ (for test builds).
// test.js runs in the page as an async function body and returns { name: dataURL, ... } (see shots.js).
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..');
const [outp, testf, quality = 'high', waitMs = '8000'] = process.argv.slice(2);
const MODELS = process.env.HB_MODELS ? path.resolve(process.env.HB_MODELS) : path.join(ROOT, 'models');
const types = { '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') u = '/index.html';
  const p = u.startsWith('/models/') ? path.join(MODELS, u.slice(8)) : path.join(ROOT, u);
  if (!(p.startsWith(ROOT) || p.startsWith(MODELS)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(0);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
pg.on('pageerror', e => console.log('pageerror', e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 300)); });
await pg.addInitScript(q => { try { localStorage.setItem('havocbay.settings.v1', JSON.stringify({ quality: q })); } catch (e) {} }, quality);
await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
await pg.waitForTimeout(+waitMs);
const res = await pg.evaluate(`(async () => { ${fs.readFileSync(testf, 'utf8')} })()`);
for (const [k, v] of Object.entries(res || {})) {
  if (typeof v === 'string' && v.startsWith('data:image')) { fs.writeFileSync(`${outp}-${k}.png`, Buffer.from(v.split(',')[1], 'base64')); console.log('wrote', `${outp}-${k}.png`); }
  else console.log(k, JSON.stringify(v));
}
await b.close(); srv.close();
