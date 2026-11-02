// Screenshots of Siege maps from fixed viewpoints.
// node shot.js <page-path under siege root, e.g. siege-copy/index.html> <out-dir> [maps comma list] [w] [h]
const { chromium } = require('playwright');
const [, , page = 'siege-copy/index.html', out = 'shots', mapsArg = '', W = 1280, H = 720] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: +W, height: +H } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  p.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[sgx]')) console.log('console:', m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '1.0.1', quality: 'high' })); } catch (e) {} });
  await p.goto('http://127.0.0.1:8123/' + page, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__sg && window.__sg.W, null, { timeout: 120000 });
  if (await p.evaluate(() => !!window.__sgAssets)) await p.waitForFunction(() => window.__sgAssets.done, null, { timeout: 180000 });
  const maps = mapsArg ? mapsArg.split(',') : await p.evaluate(() => Object.keys(window.__sg.W.D ? { hotel: 1, port: 1, manor: 1 } : {}));
  require('fs').mkdirSync(out, { recursive: true });
  for (const key of maps) {
    const views = await p.evaluate(k => {
      const S = window.__sg; S.G.on = false; window.requestAnimationFrame = () => 0; { S.sgScene.remove(S.W.group); const t0 = performance.now(); S.sgBuildMap(k); console.log('[sgx] build ' + k + ' ' + Math.round(performance.now() - t0) + ' ms, models ' + (S.W.mdl ? S.W.mdl.length : 0) + ', tris ' + (() => { let n = 0; S.W.group.traverse(o => { if (o.isMesh && o.geometry.index) n += o.geometry.index.count / 3; }); return n; })()); }
      document.querySelectorAll('body > *:not(canvas)').forEach(e => e.style.visibility = 'hidden');
      const M = S.W, CELL = 2.4 * 0 + (M.Wd ? (M.group ? 1 : 1) : 1);
      const rooms = M.rooms.filter(r => r.cells.length >= 8).sort((a, b) => b.cells.length - a.cells.length).slice(0, 8);
      return rooms.map(r => ({ id: r.id, n: r.n, f: r.f, bb: r.bb, cx: r.cx, cz: r.cz, out: r.out }));
    }, key);
    let i = 0;
    for (const v of views) {
      const file = `${out}/${key}-${String(i++).padStart(2, '0')}-${v.n.replace(/[^A-Za-z0-9]+/g, '_')}.png`;
      await p.evaluate(v => {
        const S = window.__sg, M = S.W, cam = S.sgCam, C = M.cellSize || 2.5;
        const [x0, z0, x1, z1] = v.bb; const CELLv = 1.5;
        // stand near one corner of the room, look across to the middle
        const ex = (x0 + 0.7) * CELLv, ez = (z0 + 0.7) * CELLv, tx = (v.cx + 0.5) * CELLv, tz = (v.cz + 0.5) * CELLv;
        const y = M.floors[v.f].y + 1.65;
        cam.position.set(ex, y, ez); cam.rotation.set(-0.12, Math.atan2(-(tx - ex), -(tz - ez)), 0);
        cam.aspect = innerWidth / innerHeight; cam.fov = 78; cam.updateProjectionMatrix();
        const r = S.renderer(); r.clear(); r.render(S.sgScene, cam);
      }, v);
      await p.screenshot({ path: file });
      console.log(file);
    }
  }
  await browser.close();
})();
