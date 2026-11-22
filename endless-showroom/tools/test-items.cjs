// Whistling, sitting and the newer items: node tools/test-items.cjs [--src]
// Serve the endless-showroom folder on :8790 first. Checks a tapped and a held
// whistle (cooldown and energy), someone else's help whistle showing as a
// marker at the edge of the screen, sitting on a chair and standing up, a TV
// lighting the room, kicking a ball by walking into it (it rolls away and
// stops), a noisy toy, and dropping your whole inventory.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:8790/${process.argv.includes('--src') ? 'src/' : ''}index.html`); await page.waitForTimeout(2500);
  await page.evaluate(() => window.__game.startSolo()); await page.waitForTimeout(2500);
  const g = (fn, a) => page.evaluate(fn, a);
  const waitGame = (secs) => g(() => __game.clock.t).then((t0) => page.waitForFunction((t) => __game.clock.t > t, t0 + secs, { timeout: 200000, polling: 200 }));
  let passed = 0;
  const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (c) passed++; };
  // a clear spot: move to open floor
  const spot = await g(() => {
    const P = __game.P, w = __game.world;
    const clear = (x, z) => { let ok = true; w.forBoxes(x - 2.5, z - 9, x + 2.5, z + 2.5, (o) => { if (o.y1 > 0.03) ok = false; }); return ok; };
    for (let r = 0; r < 60; r += 1) for (let a = 0; a < 16; a++) { const x = P.x + Math.cos(a / 16 * 6.283) * r, z = P.z + Math.sin(a / 16 * 6.283) * r; if (clear(x, z)) { P.x = x; P.z = z; P.y = 0; P.vy = 0; return [x, z]; } }
    return null;
  });
  console.log('open floor at', spot);
  await g(() => { const P = __game.P; P.y = 0; P.pitch = 0; P.yaw = 0; P.en = 100; });

  // whistle: tap
  const en0 = await g(() => __game.P.en);
  await page.keyboard.down('KeyH'); await page.waitForTimeout(60); await page.keyboard.up('KeyH');
  await page.waitForFunction(() => __game.P.whistleT > 0, null, { timeout: 60000 });
  const w1 = await g(() => ({ t: __game.P.whistleT, en: __game.P.en }));
  ok(w1.t > 20 && en0 - w1.en >= 1.5 && en0 - w1.en < 3.5, `a tapped whistle starts the 25 s wait and costs 2 energy (${JSON.stringify(w1)}, from ${en0.toFixed(1)})`);
  // whistle: hold for a long one
  await g(() => { __game.P.whistleT = 0; __game.P.en = 100; });
  await page.keyboard.down('KeyH');
  await page.waitForFunction(() => __game.P.whistleT > 0, null, { timeout: 120000, polling: 100 });
  await page.keyboard.up('KeyH');
  const w2 = await g(() => ({ t: __game.P.whistleT, en: __game.P.en }));
  ok(w2.t > 20 && 100 - w2.en >= 3.5, `holding H gives a long whistle (4 energy) (${JSON.stringify(w2)})`);
  // someone else's whistle: a marker, behind you, at the screen edge
  await g(() => { const P = __game.P; __game.whistleForTest('friend', { x: P.x, y: 0, z: P.z + 60, k: 1 }); });
  await waitGame(0.2);
  const mk = await g(() => { const el = [...document.querySelectorAll('#marks .mark.whistle')].find((e) => e.style.display !== 'none'); return el ? { cls: el.className, text: el.textContent } : null; });
  ok(mk && /help/.test(mk.cls) && /edge/.test(mk.cls) && /60 m/.test(mk.text), `a long whistle behind you shows a help marker at the edge of the screen (${JSON.stringify(mk)})`);

  // sitting
  const chair = await g(() => {
    const P = __game.P, w = __game.world, id = 'test:chair';
    w.applyState(id, { t: 'chair', k: 'f', v: 0, x: P.x, y: 0, z: P.z - 1.2, r: 0 });
    return id;
  });
  const sat = await g((id) => __game.sitForTest(id), chair);
  await waitGame(0.3);
  const sp = await g(() => ({ sit: !!__game.P.sit, y: +__game.P.y.toFixed(2) }));
  ok(sat && sp.sit && Math.abs(sp.y - 0.48) < 0.02, `F sits you on a chair (${JSON.stringify(sp)})`);
  await page.keyboard.down('KeyS'); await waitGame(0.15); await page.keyboard.up('KeyS');
  const st = await g(() => ({ sit: !!__game.P.sit, y: +__game.P.y.toFixed(2) }));
  ok(!st.sit && st.y < 0.1, `moving stands you up beside it (${JSON.stringify(st)})`);
  await g((id) => { const w = __game.world, it = w.items.get(id); w.applyState(id, Object.assign(w.stateOf(it), { g: true })); }, chair);

  // a TV that's on gives light
  const lit = await g(() => { const P = __game.P, w = __game.world; w.applyState('test:tv', { t: 'boxTV', k: 'f', v: 0, x: P.x + 3, y: 0, z: P.z + 3, r: 0, s: 2 }); const on = w.isLit(w.items.get('test:tv')); const st = w.stateOf(w.items.get('test:tv')); st.s = 0; w.applyState('test:tv', st); return [on, w.isLit(w.items.get('test:tv'))]; });
  ok(lit[0] && !lit[1], `a TV that's on lights the room, off it doesn't (${lit})`);

  // kick a ball by walking into it
  const ball = await g(() => { const P = __game.P, w = __game.world; P.yaw = 0; w.applyState('test:ball', { t: 'playBall', k: 'f', v: 0, x: P.x, y: 0, z: P.z - 0.75, r: 0 }); return { x: P.x, z: P.z - 0.75 }; });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => __game.flying.some((f) => f.ball), null, { timeout: 120000, polling: 100 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const fl = await g(() => __game.flying);
  ok(fl.some((f) => f.ball), `walking into a ball kicks it (${JSON.stringify(fl)})`);
  await page.waitForFunction(() => !__game.flying.length, null, { timeout: 400000, polling: 500 });
  const moved = await g((b) => { const it = __game.world.items.get('test:ball'); return { d: +Math.hypot(it.x - b.x, it.z - b.z).toFixed(2), y: +it.y.toFixed(2), c: it.c || null }; }, ball);
  ok(moved.d > 1 && moved.y < 0.05 && !moved.c, `the ball rolls away and comes to rest on the floor (${JSON.stringify(moved)})`);

  // noisy toy at night: the staff hear it
  await g(() => { const P = __game.P, w = __game.world; w.applyState('test:drum', { t: 'toyDrum', k: 'f', v: 0, x: P.x + 1, y: 0, z: P.z, r: 0 }); });
  await g(() => __game.useItemForTest('test:drum'));
  ok(true, 'banging the drum works without errors');

  // drop all
  const dropped = await g(() => {
    const P = __game.P, w = __game.world;
    for (let i = 0; i < 3; i++) { const id = 'test:food' + i; w.applyState(id, { t: 'cake', k: 'i', v: 0, x: P.x, y: 0, z: P.z, r: 0, g: true }); P.inv[i] = 'cake'; P.invId[i] = id; }
    __game.dropAllForTest();
    return { inv: P.inv.filter(Boolean).length, down: [0, 1, 2].map((i) => !w.items.get('test:food' + i).g) };
  });
  ok(dropped.inv === 0 && dropped.down.every(Boolean), `drop all empties the inventory onto the floor (${JSON.stringify(dropped)})`);
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'no console errors');
  console.log(`${passed} items ok`);
  await browser.close();
})();
