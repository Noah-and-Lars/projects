// The held gun and hands on their own, driven by the first-person animation with a stand-in player.
// node vmtest.js <page> <out.png> <gun keys,comma> [states,comma]
const { chromium } = require('playwright');
const fs = require('fs');
const [, , page = 'siege-copy/index.html', out = 'vm.png', gunsArg = 'r4c', statesArg = 'idle,run,fire,rel15,rel25,rel40,rel55,rel70,rel80'] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '9', quality: 'low' })); } catch (e) {} });
  await p.goto('http://127.0.0.1:8123/' + page);
  await p.waitForFunction(() => window.__sg && window.__sg.W && (!window.__sgAssets || window.__sgAssets.done), null, { timeout: 180000 });
  const tiles = [];
  for (const key of gunsArg.split(',')) for (const st of statesArg.split(',')) {
    const url = await p.evaluate(([key, st]) => {
      const S = window.__sg; S.G.on = false; window.requestAnimationFrame = () => 0;
      const P = { yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, onGround: true, crouch: 0, slot: 0, w: { keys: [key, key], rel: 0 } };
      S.vmSet(key); S.vmRoot.visible = true; S.vmT.sw = 0; S.VA.lastYaw = null;
      for (let i = 0; i < 40; i++) { if (st === 'run') { P.vz = -5.4; } S.sgxViewAnim(P, 1 / 30); }
      if (st === 'fire') { S.sgxKick(S.SG_GUNS[key]); S.sgxViewAnim(P, 1 / 60); S.sgxViewAnim(P, 1 / 60); }
      if (st.startsWith('rel')) { const tot = S.SG_GUNS[key].rel; P.w.rel = tot * (1 - +st.slice(3) / 100); S.sgxViewAnim(P, 1 / 240); }
      if (st.startsWith('draw')) { S.vmT.sw = +st.slice(4) / 100; S.sgxViewAnim(P, 1 / 240); }
      const r = S.renderer(); r.setClearColor(0x5b6066, 1); r.setPixelRatio(1); r.setSize(960, 540, false);
      S.vmCam2.aspect = 960 / 540; S.vmCam2.updateProjectionMatrix(); S.vmScene.updateMatrixWorld(true);
      r.clear(); r.render(S.vmScene, S.vmCam2);
      return r.domElement.toDataURL('image/png');
    }, [key, st]);
    tiles.push({ key, st, b: Buffer.from(url.split(',')[1], 'base64') });
  }
  fs.mkdirSync(out + '.d', { recursive: true });
  tiles.forEach((t, i) => fs.writeFileSync(`${out}.d/${String(i).padStart(2, '0')}-${t.key}-${t.st}.png`, t.b));
  console.log(tiles.length, 'tiles');
  await browser.close();
})();
