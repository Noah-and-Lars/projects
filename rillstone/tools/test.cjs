// Headless smoke test. Serve the rillstone folder first
// (python3 -m http.server 8765), then:
//   node tools/test.cjs <outdir> [--src]
// Tests the built single-file index.html; --src tests src/index.html instead.
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const flags = new Set(process.argv.slice(3));
const SRC = flags.has('--src');
const URL = 'http://localhost:8765/' + (SRC ? 'src/index.html' : 'index.html') + '?test=1&seed=1';

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  if (!SRC) await p.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('http://localhost:8765/') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    errs.push('blocked external request: ' + u); return r.abort();
  });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.__rill && window.__rill.ready, null, { timeout: 60000 });
  await p.waitForTimeout(3000);
  const stats = await p.evaluate(() => __rill.physics.stats);
  await p.screenshot({ path: `${out}/m0.png` });
  console.log(JSON.stringify({ stats, errors: errs }, null, 1));
  await b.close();
  if (errs.length || !(stats.bodies > 0)) process.exit(1);
})();
