// Benchmarks from BUILD_BRIEF section 10. Serve the rillstone folder first
// (python3 -m http.server 8765), then: node tools/bench.cjs [render] [bodies]
const { chromium } = require('playwright');
const which = new Set(process.argv.slice(2));
const all = which.size === 0;
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  if (all || which.has('render')) {
    for (const mode of ['meshes', 'batched']) for (const r of ['webgl', 'webgpu-gl', 'webgpu']) {
      const p = await b.newPage({ viewport: { width: 960, height: 540 } });
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(`http://localhost:8765/tools/bench/render.html?r=${r}&mode=${mode}`);
      try { await p.waitForFunction(() => window.__bench, null, { timeout: 180000 }); console.log(JSON.stringify(await p.evaluate(() => window.__bench))); }
      catch (e) { console.log(r, mode, 'failed', errs.join('; ') || e.message); }
      await p.close();
    }
  }
  if (all || which.has('bodies')) {
    const p = await b.newPage();
    p.on('console', m => console.log('  ' + m.text()));
    p.on('pageerror', e => console.log('pageerror', e.message));
    await p.goto('http://localhost:8765/tools/bench/bodies.html' + (process.env.Q || ''));
    await p.waitForFunction(() => window.__bench, null, { timeout: 300000 });
    console.log(JSON.stringify(await p.evaluate(() => window.__bench)));
  }
  await b.close();
})();
