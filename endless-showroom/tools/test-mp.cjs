// Multiplayer test: node tools/test-mp.cjs <screenshot-dir> [--src]
// Serve the endless-showroom folder on :8790 first. Two pages share a
// stand-in realtime server (mock-rt.js). Checks: joining a private room by
// code, the same store on both screens, seeing each other, furniture moved on
// one screen moving on the other, the host's staff showing up on the guest,
// staff hits reaching the guest, and the guest taking over when the host leaves.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'shots';
const SRC = process.argv.includes('--src');
fs.mkdirSync(out, { recursive: true });
const url = `http://localhost:8790/${SRC ? 'src/' : ''}index.html`;
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  await ctx.addInitScript({ path: path.join(__dirname, 'mock-rt.js') });
  const errors = [];
  const open = async (name) => {
    const p = await ctx.newPage();
    p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(m.text())) errors.push(name + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push(name + ': pageerror: ' + e.message));
    await p.goto(url);
    await p.evaluate((n) => localStorage.setItem('es-name', n), name);
    await p.reload();
    await p.waitForTimeout(1200);
    return p;
  };
  const A = await open('Alpha'), B = await open('Bravo');
  await A.click('#b-create');
  await A.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 90000 });
  const code = await A.evaluate(() => __game.net.room);
  check(/^[A-Z0-9]{4}$/.test(code), 'room created: ' + code);
  // A change made before Bravo arrives must reach Bravo when they join.
  const early = await A.evaluate(() => {
    const w = __game.world; const it = [...w.items.values()].find((i) => i.k === 'f' && w.active(i) && i.y < 0.01);
    const st = w.stateOf(it); st.x += 0.5; w.applyState(it.id, st); return [it.id, st.x];
  });
  await B.fill('#code-in', code);
  await B.click('#b-join');
  await B.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 90000 });
  await B.waitForTimeout(2500);
  const seeds = await Promise.all([A, B].map((p) => p.evaluate(() => __game.world.seed)));
  check(seeds[0] === seeds[1], 'same store seed on both screens');
  check(await B.evaluate((e) => { const it = __game.world.items.get(e[0]); return !!it && Math.abs(it.x - e[1]) < 0.01; }, early), 'late joiner got the changes made before they joined');
  check(await A.evaluate(() => __game.net.isHost()) && !(await B.evaluate(() => __game.net.isHost())), 'Alpha hosts, Bravo is a guest');
  check(await A.evaluate(() => __game.remotes.size) === 1 && await B.evaluate(() => __game.remotes.size) === 1, 'each sees the other');

  // Put Bravo next to Alpha, facing Alpha, and screenshot.
  await B.evaluate(() => { __game.P.x = 0; __game.P.z = 0; });
  const ap = await A.evaluate(() => ({ x: __game.P.x, z: __game.P.z }));
  await B.evaluate((ap) => { const P = __game.P; P.x = ap.x + 3; P.z = ap.z; P.y = 0; P.yaw = Math.atan2(P.x - ap.x, P.z - ap.z); P.pitch = -0.1; }, ap);
  await B.waitForTimeout(1500);
  await B.screenshot({ path: path.join(out, 'mp-01-bravo-sees-alpha.png') });

  // Alpha (host) picks up the nearest floor item and puts it down 1.5 m away.
  const moved = await A.evaluate(() => {
    const P = __game.P, w = __game.world; let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.y > 0.01) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    return best && best.id;
  });
  await A.evaluate((id) => {
    const P = __game.P, it = __game.world.items.get(id);
    const a = Math.atan2(P.x - it.x, P.z - it.z); P.x = it.x + Math.sin(a) * 1.8; P.z = it.z + Math.cos(a) * 1.8; P.y = 0;
    P.yaw = Math.atan2(P.x - it.x, P.z - it.z); P.pitch = -0.45;
  }, moved);
  await A.waitForTimeout(400);
  await A.keyboard.press('KeyE');
  await A.waitForTimeout(400);
  check(await A.evaluate(() => !!__game.P.carry), 'Alpha picked up ' + moved);
  await A.waitForTimeout(600);
  check(await B.evaluate((id) => { const it = __game.world.items.get(id); return !!(it && it.c); }, moved), 'Bravo sees it carried');
  await A.evaluate(() => { __game.P.yaw += Math.PI; __game.P.pitch = -0.7; });
  await A.waitForTimeout(400);
  await A.keyboard.press('KeyE');
  await A.waitForTimeout(800);
  const posA = await A.evaluate((id) => { const it = __game.world.items.get(id); return [it.x, it.y, it.z, it.c]; }, moved);
  const posB = await B.evaluate((id) => { const it = __game.world.items.get(id); return it ? [it.x, it.y, it.z, it.c] : null; }, moved);
  check(posB && Math.abs(posA[0] - posB[0]) < 0.01 && Math.abs(posA[2] - posB[2]) < 0.01 && !posB[3], `placed item matches on both screens (${posA.slice(0, 3).map((v) => v.toFixed(2))})`);

  // Bravo (guest) picks something up: goes through the host.
  const gid = await B.evaluate(() => {
    const P = __game.P, w = __game.world; let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.y > 0.01) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    const a = Math.atan2(P.x - best.x, P.z - best.z); P.x = best.x + Math.sin(a) * 1.8; P.z = best.z + Math.cos(a) * 1.8; P.y = 0;
    P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = -0.45; return best.id;
  });
  await B.waitForTimeout(400);
  await B.keyboard.press('KeyE');
  await B.waitForTimeout(800);
  check(await A.evaluate((id) => { const it = __game.world.items.get(id); return it && it.c === Object.keys(Object.fromEntries(__game.remotes))[0]; }, gid), 'host records the guest carrying ' + gid);
  check(await B.evaluate(() => !!__game.P.carry), 'guest still carrying after host confirms');

  // Night: staff from the host appear on the guest.
  await A.evaluate(() => __game.setClock(361));
  await A.waitForTimeout(8000);
  const sA = await A.evaluate(() => __game.staffViews.size), sB = await B.evaluate(() => __game.staffViews.size);
  check(sA > 0 && sB > 0, `staff on host (${sA}) and guest (${sB})`);
  check(await B.evaluate(() => __game.clock.t > 360), 'guest clock follows host into night');
  // Put a member of staff right next to Bravo and wait for a hit.
  const hp0 = await B.evaluate(() => __game.P.hp);
  const bp = await B.evaluate(() => ({ x: __game.P.x, y: __game.P.y, z: __game.P.z }));
  await A.evaluate((bp) => { const s = [...__game.staff.staff.values()][0]; if (s) { s.x = bp.x + 0.6; s.z = bp.z; s.y = bp.y; } }, bp);
  await A.waitForTimeout(3000);
  const hp1 = await B.evaluate(() => __game.P.hp);
  check(hp1 < hp0, `guest got hit by host's staff (${hp0} -> ${hp1})`);
  await B.screenshot({ path: path.join(out, 'mp-02-guest-night.png') });

  // Host leaves: guest takes over.
  await A.close();
  await B.waitForFunction(() => __game.net.isHost(), null, { timeout: 30000 }).catch(() => {});
  check(await B.evaluate(() => __game.net.isHost()), 'guest became host after host left');
  check(await B.evaluate((id) => { const it = __game.world.items.get(id); return !!(it && __game.world.mods.has(id)); }, moved), 'guest kept the store changes');
  await B.waitForTimeout(3000);
  check(await B.evaluate(() => __game.staffViews.size > 0), 'new host runs the staff');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
