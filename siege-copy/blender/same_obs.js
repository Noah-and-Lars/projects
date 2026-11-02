// Collision, nav and layout of every map must be identical in the copy and the live game.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const snap = async (page) => {
    const p = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
    await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); } catch (e) {} });
    await p.goto('http://127.0.0.1:8123/' + page);
    await p.waitForFunction(() => window.__sg && window.__sg.W && (!window.__sgAssets || window.__sgAssets.done), null, { timeout: 180000 });
    return p.evaluate(() => {
      const S = window.__sg; S.G.on = false; const out = {};
      for (const k of ['hotel', 'port', 'manor']) {
        S.sgScene.remove(S.W.group); S.sgBuildMap(k); const M = S.W;
        const r = v => Math.round(v * 1000);
        out[k] = JSON.stringify({ obs: M.obs.map(o => [o.k, o.m, o.b, r(o.x0), r(o.x1), r(o.y0), r(o.y1), r(o.z0), r(o.z1)]), panels: M.panels.map(p => [p.k, p.n, p.cols, p.rows]), sites: M.sites.map(s => [r(s.a.x), r(s.a.z), r(s.b.x), r(s.b.z)]), nav: M.nav ? (M.nav.nodes || M.nav).length : 0, lights: M.lights.length });
      }
      return out;
    });
  };
  const a = await snap('siege/index.html'), b = await snap('siege-copy/index.html');
  for (const k in a) console.log(k, a[k] === b[k] ? 'SAME' : 'DIFFERENT', a[k].length, b[k].length);
  await browser.close();
})();
