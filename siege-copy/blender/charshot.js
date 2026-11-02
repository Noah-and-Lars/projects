// Third-person look at the operators: a line-up in one of the hotel's rooms in different poses.
// node charshot.js <page> <out.png> [pose: idle|walk|run|crouch|dead|mix] [dist]
const { chromium } = require('playwright');
const fs = require('fs');
const [, , page = 'siege-copy/index.html', out = 'chars.png', pose = 'mix', dist = '3.4'] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await browser.newContext({ viewport: { width: 1100, height: 620 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/WebSocket|404/.test(m.text())) console.log('console:', m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '9', quality: 'medium' })); } catch (e) {} });
  await p.goto('http://127.0.0.1:8123/' + page);
  await p.waitForFunction(() => window.__sg && window.__sg.W && (!window.__sgAssets || window.__sgAssets.done), null, { timeout: 180000 });
  const url = await p.evaluate(([pose, dist]) => {
    const S = window.__sg; S.G.on = false; window.requestAnimationFrame = () => 0;
    document.querySelectorAll('body > *:not(canvas)').forEach(e => e.style.visibility = 'hidden');
    S.sgScene.remove(S.W.group); S.sgBuildMap('hotel');
    const R = S.W.rooms.find(r => r.n === 'Grand Lobby'), y = S.W.floors[R.f].y;
    const cx = (R.cx + 0.5) * 1.5, cz = (R.cz + 0.5) * 1.5;
    const ops = Object.keys(S.SG_OPS).slice(0, 5);
    const poses = pose === 'mix' ? ['idle', 'walk', 'run', 'crouch', 'dead'] : ops.map(() => pose);
    ops.forEach((op, i) => {
      const M = S.sgPerson(op), x = cx + (i - 2) * 1.1, z = cz;
      const P = { yaw: 0.25 * (i - 2) * 0.4, vx: 0, vz: 0, flashT: 0, w: null };
      const ps = poses[i];
      const sp = ps === 'walk' ? 2.6 : ps === 'run' ? 4.6 : 0;
      P.vx = -Math.sin(P.yaw) * sp; P.vz = -Math.cos(P.yaw) * sp;
      M.g.position.set(x, y, z); M.g.rotation.y = P.yaw; S.sgScene.add(M.g);
      for (let k = 0; k < (ps === 'dead' ? 40 : 17); k++) S.sgAnimPerson(M, 1 / 30, sp, ps === 'crouch', 0, ps === 'run' ? 0 : -0.05, ps === 'dead', P);
      S.sgTintPerson(M, S.sgLightProbe(x, y, z));
    });
    const cam = S.sgCam; cam.position.set(cx, y + 1.45, cz - +dist); cam.rotation.set(-0.12, Math.PI, 0); cam.fov = 60; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    S.vmRoot.visible = false;
    const r = S.renderer(); r.clear(); r.render(S.sgScene, cam);
    return r.domElement.toDataURL('image/png');
  }, [pose, dist]);
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); console.log(out);
  await browser.close();
})();
