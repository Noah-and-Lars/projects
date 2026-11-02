// First-person views of the held guns: idle, sprinting, just after a shot and through a reload, for each slot.
// node vmshot.js <page> <out-dir>
const { chromium } = require('playwright');
const fs = require('fs');
const [, , page = 'siege-copy/index.html', out = 'shots/vm'] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '9', quality: 'low' })); } catch (e) {} });
  await p.goto('http://127.0.0.1:8123/' + page);
  await p.waitForFunction(() => window.__sg && window.__sg.W && (!window.__sgAssets || window.__sgAssets.done), null, { timeout: 180000 });
  const ok = await p.evaluate(() => {
    const S = window.__sg, $ = id => document.getElementById(id);
    $('sgPractice').click(); S.G.set.map = 'hotel'; $('sgStart').click();
    const R = S.renderer(), draw = R.render; R.render = () => {};
    for (let i = 0; i < 400 && !(S.me() && S.me().alive && S.me().w && (S.G.phase === 'prep' || S.G.phase === 'action')); i++) S.step(1, 0.5);
    R.render = draw;
    document.querySelectorAll('body > *:not(canvas)').forEach(e => e.style.visibility = 'hidden');
    S.G.on = false; window.requestAnimationFrame = () => 0;
    return !!(S.me() && S.me().alive);
  });
  console.log('alive', ok);
  fs.mkdirSync(out, { recursive: true });
  const states = (process.env.STATES || 'idle,fire,rel10,rel25,rel42,rel55,rel75,run').split(',');// ['idle', 'run', 'fire', 'rel10', 'rel25', 'rel42', 'rel55', 'rel75'];
  for (const slot of [0, 1]) for (const st of states) {
    const url = await p.evaluate(([slot, st, process_env_vmonly]) => {
      const S = window.__sg, P = S.me(), R = S.renderer(), draw = R.render; R.render = () => {};
      P.slot = slot; P.pitch = -0.05; P.onGround = true; P.vx = P.vz = 0; P.w.rel = 0; S.vmT.sw = 0;
      const tot = S.gunOf(P).rel || 2.5;
      for (let i = 0; i < 30; i++) { P.hp = 999; P.alive = true; P.w.rel = 0; P.vx = st === 'run' ? -Math.sin(P.yaw) * 5.4 : 0; P.vz = st === 'run' ? -Math.cos(P.yaw) * 5.4 : 0; S.step(1, 1 / 30); }
      if (st === 'fire') { S.sgxKick(S.gunOf(P)); S.step(2, 1 / 60); }
      if (st.startsWith('rel')) { const k = +st.slice(3) / 100; P.hp = 999; P.w.rel = tot * (1 - k); S.step(1, 1 / 120); }
      R.render = draw; const r = R; r.setClearColor(0x6a6e74, 1); r.clear(); if (!process_env_vmonly) r.render(S.sgScene, S.sgCam); else { S.sgScene.updateMatrixWorld(); S.sgCam.updateMatrixWorld(); S.vmScene.updateMatrixWorld(); } r.clearDepth(); r.render(S.vmScene, S.vmCam2);
      return r.domElement.toDataURL('image/png');
    }, [slot, st, !!process.env.VMONLY]);
    const f = `${out}/fp-${slot}-${st}.png`; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(f);
  }
  await browser.close();
})();
