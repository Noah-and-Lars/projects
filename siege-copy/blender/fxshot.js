// The new effects through the new post-processing: a burst into a wall, an explosion, a smoke grenade.
// node fxshot.js <page> <out-dir>
const { chromium } = require('playwright');
const fs = require('fs');
const [, , page = 'siege-copy/index.html', out = 'fx'] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '9', quality: 'high' })); } catch (e) {} });
  await p.goto('http://127.0.0.1:8123/' + page);
  await p.waitForFunction(() => window.__sg && window.__sg.W && (!window.__sgAssets || window.__sgAssets.done), null, { timeout: 180000 });
  fs.mkdirSync(out, { recursive: true });
  const shots = [['plain', 0, 0], ['burst', 1, 0.05], ['boom1', 2, 0.12], ['boom2', 0, 0.6], ['smoke', 3, 2.5]];
  await p.evaluate((process_map) => {
    const S = window.__sg; S.G.on = false; window.requestAnimationFrame = () => 0;
    document.querySelectorAll('body > *:not(canvas)').forEach(e => e.style.visibility = 'hidden');
    S.sgScene.remove(S.W.group); S.sgBuildMap(process_map);
    const R = S.W.rooms.filter(r => !r.out && r.cells.length > 20 && r.cells.length < 70).sort((a, b) => b.cells.length - a.cells.length)[0];
    const [x0, z0, x1, z1] = R.bb, y = S.W.floors[R.f].y;
    window.__fxv = { ex: (x0 + 0.7) * 1.5, ez: (z0 + 0.7) * 1.5, tx: (R.cx + 0.5) * 1.5, tz: (R.cz + 0.5) * 1.5, y };
    const v = window.__fxv, cam = S.sgCam;
    cam.position.set(v.ex, y + 1.6, v.ez); cam.rotation.set(-0.08, Math.atan2(-(v.tx - v.ex), -(v.tz - v.ez)), 0); cam.fov = 78; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    S.vmRoot.visible = false;
  }, process.env.FXMAP || 'hotel');
  for (const [name, act, t] of shots) {
    const url = await p.evaluate(([act, t]) => {
      const S = window.__sg, v = window.__fxv, cam = S.sgCam;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      if (act === 1) { // a burst into the far side of the room
        for (let i = 0; i < 9; i++) { const d = fwd.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.12)).normalize();
          S.sgTrace({ id: 'test', team: 0 }, { x: cam.position.x, y: cam.position.y - 0.1, z: cam.position.z }, d, 30, { pel: 0, n: 'test' }, true); }
      }
      if (act === 2) S.fxExplosion(v.tx, v.y + 0.4, v.tz, true);
      if (act === 3) S.fxCloud(v.tx, v.y, v.tz, 0xb8b4ac, 13, 3.6, 0.82);
      const R = S.renderer(), draw = R.render;
      for (let k = 0, n = Math.round(t / (1 / 60)); k < n; k++) { S.fxUpdate(1 / 60); S.fxLightsUpdate(1 / 60); }
      S.SGPOST.frame(R, () => { R.clear(); R.render(S.sgScene, cam); });
      return R.domElement.toDataURL('image/jpeg', 0.9);
    }, [act, t]);
    fs.writeFileSync(`${out}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64')); console.log(name);
  }
  await browser.close();
})();
