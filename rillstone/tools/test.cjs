// Headless smoke test. Serve the rillstone folder first
// (python3 -m http.server 8765), then:
//   node tools/test.cjs <outdir> [--src] [--shots] [--move]
// SCALE=2 takes screenshots at deviceScaleFactor 2 (for showing people).
// Tests the built single-file index.html; --src tests src/index.html instead.
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const flags = new Set(process.argv.slice(3));
const SRC = flags.has('--src'); flags.delete('--src');
const all = flags.size === 0;
const URL = 'http://localhost:8765/' + (SRC ? 'src/index.html' : 'index.html') + '?test=1&seed=1';
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

async function open(b, scale = 1) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
  const errs = [];
  if (!SRC) await p.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('http://localhost:8765/') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    errs.push('blocked external request: ' + u); return r.abort();
  });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.__rill && window.__rill.ready, null, { timeout: 90000 });
  return { p, errs };
}
// Fly the camera to a spot and time, then screenshot.
async function shot(p, name, { x, y, z, yaw = 0, pitch = 0, t = 0.5, fly = true }) {
  await p.evaluate(async ([x, y, z, yaw, pitch, t, fly]) => { __rill.fly(fly); __rill.setTime(t); await __rill.teleport(x, y, z, yaw, pitch); await __rill.tick(2); }, [x, y, z, yaw, pitch, t, fly]);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/${name}.png` });
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const { p, errs } = await open(b, +(process.env.SCALE || 1));
  await p.screenshot({ path: `${out}/title.png` });
  await p.evaluate(() => __rill.play());

  if (all || flags.has('--move')) {
    // Movement numbers from BUILD_BRIEF section 5, measured on the flat Gravel Bar plot.
    const g = await p.evaluate(() => __rill.places.CLAIMS[0]);
    const start = [g.cx, g.top + 1.2, g.cz];
    const run = (hold, secs, yaw = 0) => p.evaluate(async ([start, hold, secs, yaw]) => {
      const R = __rill; R.fly(false); R.noRender(true);
      await R.teleport(start[0], start[1], start[2], yaw, 0);
      await R.tick(40); // settle
      const a = R.playerState().pos;
      for (const k of hold) R.input.simulate(k, true);
      let maxY = a[1];
      for (let i = 0; i < Math.round(secs * 60); i++) { await R.tick(1); R.input.endFrame(); maxY = Math.max(maxY, R.playerState().pos[1]); if (hold.includes('jump')) R.input.simulate('jump', false); }
      for (const k of hold) R.input.simulate(k, false);
      R.input.endFrame(); R.noRender(false);
      const c = R.playerState().pos;
      return { dist: Math.hypot(c[0] - a[0], c[2] - a[2]), rise: maxY - a[1] };
    }, [start, hold, secs, yaw]);
    const walk = await run(['forward'], 2);
    check(Math.abs(walk.dist / 2 - 4.2) < 0.3, `walk speed ${(walk.dist / 2).toFixed(2)} m/s (want 4.2)`);
    const sprint = await run(['forward', 'sprint'], 2);
    check(Math.abs(sprint.dist / 2 - 6.8) < 0.4, `sprint speed ${(sprint.dist / 2).toFixed(2)} m/s (want 6.8)`);
    const crouch = await run(['forward', 'crouch'], 2);
    check(Math.abs(crouch.dist / 2 - 2.0) < 0.2, `crouch speed ${(crouch.dist / 2).toFixed(2)} m/s (want 2.0)`);
    const jump = await run(['jump'], 1.2);
    check(Math.abs(jump.rise - 1.1) < 0.12, `jump apex ${jump.rise.toFixed(2)} m (want 1.1)`);
    // Stand at the Gravel Bar and check we're on the ground, not falling forever.
    const st = await p.evaluate(() => __rill.playerState());
    check(st.grounded && st.pos[1] > 0, `player grounded at y=${st.pos[1].toFixed(2)}`);
    // Walk down the river to the map edge: the boundary must stop us.
    const edge = await p.evaluate(async () => {
      const R = __rill; R.fly(false); R.noRender(true);
      const z = 255, x = R.riverX(z);
      await R.teleport(x, R.height(x, z) + 1.2, z, Math.PI, 0); // yaw PI faces +z (south)
      await R.tick(30);
      R.input.simulate('forward', true); R.input.simulate('sprint', true);
      for (let i = 0; i < 60 * 12; i++) await R.tick(1);
      R.input.simulate('forward', false); R.input.simulate('sprint', false); R.input.endFrame(); R.noRender(false);
      return R.playerState().pos;
    });
    check(edge[2] < 300 - 10 && edge[1] > -5, `walking down the river stops at the boundary (z=${edge[2].toFixed(1)}, y=${edge[1].toFixed(1)})`);
  }

  if (all || flags.has('--shots')) {
    const P = await p.evaluate(() => { const { TOWN, ADIT, FALLS_Z, spawn } = __rill.places; return { TOWN, ADIT, FALLS_Z, spawn, sy: __rill.height(spawn.x, spawn.z), fx: __rill.riverX(-98), fy: __rill.waterY(-98) }; });
    const T = P.TOWN, A = P.ADIT;
    await shot(p, 'spawn-noon', { x: P.spawn.x, y: P.sy + 1.0, z: P.spawn.z, yaw: P.spawn.yaw, t: 0.5, fly: false });
    await shot(p, 'noon', { x: T.x - 70, y: T.y + 45, z: T.z + 60, yaw: -0.9, pitch: -0.35, t: 0.5 });
    await shot(p, 'dusk', { x: T.x - 40, y: T.y + 6, z: T.z + 30, yaw: -1.2, pitch: -0.05, t: 0.738 });
    await shot(p, 'night', { x: T.x - 40, y: T.y + 6, z: T.z + 30, yaw: -1.2, pitch: -0.05, t: 0.95 });
    await shot(p, 'cave-entrance', { x: A.x - 22, y: A.y + 1.7, z: A.z, yaw: -Math.PI / 2, pitch: 0.05, t: 0.5 });
    await shot(p, 'cave', { x: A.x + 14, y: A.y + 0.95, z: A.z, yaw: -Math.PI / 2, t: 0.5 });
    await shot(p, 'falls', { x: P.fx + 14, y: P.fy + 6, z: -98, yaw: 0.4, pitch: 0.1, t: 0.42 });
    // Brightness floor: night and cave screenshots must not be near-black.
    for (const n of ['night', 'cave']) {
      const lum = await p.evaluate(async (src) => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = 64; c.height = 36; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 36);
        const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return s / (d.length / 4);
      }, 'data:image/png;base64,' + require('fs').readFileSync(`${out}/${n}.png`).toString('base64'));
      check(lum > 30, `${n} mean brightness ${lum.toFixed(0)}/255 stays above the minimum ambient`);
    }
    // Settings panel.
    await p.evaluate(() => { __rill.menu.showPause(true); __rill.menu.openSettings(); });
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/settings.png` });
    await p.click('text=Keys'); await p.waitForTimeout(100);
    // Rebind "pick up" to KeyU through the UI and check it took.
    await p.click('button.key[data-act="pickup"][data-i="0"]');
    await p.keyboard.press('KeyU');
    const bound = await p.evaluate(() => __rill.settings.binds.pickup[0]);
    check(bound === 'KeyU', `rebinding pick up -> ${bound}`);
    await p.screenshot({ path: `${out}/settings-keys.png` });
    await p.click('text=Reset to defaults');
    await p.evaluate(() => { __rill.menu.closeSettings(); __rill.menu.showPause(false); });
  }
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
  if (fails.length) { console.log(`${fails.length} check(s) failed`); process.exit(1); }
})();
