// In-game views as the player sees them: the room, the held gun and the post-processing.
// node inshot.js <page> <out-dir> <maps> [gun] [quality]
const { chromium } = require('playwright');
const fs = require('fs');
const [, , page = 'siege-copy/index.html', out = 'in', mapsArg = 'hotel,manor,port', gun = 'r4c', quality = 'high'] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(q => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '9', quality: q })); } catch (e) {} }, quality);
  await p.goto('http://127.0.0.1:8123/' + page);
  await p.waitForFunction(() => window.__sg && window.__sg.W && (!window.__sgAssets || window.__sgAssets.done), null, { timeout: 180000 });
  fs.mkdirSync(out, { recursive: true });
  for (const key of mapsArg.split(',')) {
    const views = await p.evaluate(k => {
      const S = window.__sg; S.G.on = false; window.requestAnimationFrame = () => 0;
      document.querySelectorAll('body > *:not(canvas)').forEach(e => e.style.visibility = 'hidden');
      S.sgScene.remove(S.W.group); S.sgBuildMap(k);
      return S.W.rooms.filter(r => !r.out && r.cells.length >= 10).sort((a, b) => b.cells.length - a.cells.length).slice(0, 5).map(r => ({ n: r.n, f: r.f, bb: r.bb, cx: r.cx, cz: r.cz }));
    }, key);
    let i = 0;
    for (const v of views) {
      const url = await p.evaluate(([v, gun]) => {
        const S = window.__sg, M = S.W, cam = S.sgCam, C = 1.5;
        const ex = (v.bb[0] + 0.7) * C, ez = (v.bb[1] + 0.7) * C, tx = (v.cx + 0.5) * C, tz = (v.cz + 0.5) * C, y = M.floors[v.f].y + 1.6;
        cam.position.set(ex, y, ez); cam.rotation.set(-0.1, Math.atan2(-(tx - ex), -(tz - ez)), 0); cam.fov = 78; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        const P = { yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, onGround: true, crouch: 0, slot: 0, w: { keys: [gun, gun], rel: 0 } };
        S.vmSet(gun); S.vmRoot.visible = true; S.vmT.sw = 0; S.VA.lastYaw = null;
        for (let k = 0; k < 30; k++) S.sgxViewAnim(P, 1 / 30);
        S.vmCam2.fov = 57; S.vmCam2.aspect = innerWidth / innerHeight; S.vmCam2.updateProjectionMatrix();
        const R = S.renderer();
        S.SGPOST.frame(R, () => { R.clear(); R.render(S.sgScene, cam); R.clearDepth(); R.render(S.vmScene, S.vmCam2); });
        return R.domElement.toDataURL('image/jpeg', 0.9);
      }, [v, gun]);
      const f = `${out}/${key}-${i++}-${v.n.replace(/[^A-Za-z0-9]+/g, '_')}.jpg`; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(f);
    }
  }
  await browser.close();
})();
