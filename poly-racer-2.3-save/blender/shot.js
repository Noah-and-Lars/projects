// Screenshot the game in headless Chromium (software WebGL). Serves a folder over http and runs a small script in the page.
//   node shot.js <folder> <out.png> [query] [js-to-run-before-shot] [waitMs]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [folder, out, query = '', js = '', waitMs = '4000'] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.fcm': 'application/octet-stream', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(folder, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});
(async () => {
  await new Promise(r => srv.listen(+(process.env.SHOT_PORT || 8765), '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.SHOT_W || 1280), height: +(process.env.SHOT_H || 720) } });
  if (process.env.SHOT_INIT) await page.addInitScript(process.env.SHOT_INIT);
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 300)));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:' + (process.env.SHOT_PORT || 8765) + '/index.html' + query, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  if (js) { try { const r = await page.evaluate(js); if (r !== undefined) logs.push('JS: ' + JSON.stringify(r).slice(0, 2000)); } catch (e) { logs.push('JSERR: ' + e.message); } }
  await page.waitForTimeout(+waitMs);
  await page.screenshot({ path: out, timeout: 240000 });
  console.log(logs.join('\n'));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
