// Multiplayer test: node tools/test-mp.cjs <screenshot-dir> [--src]
// Serve the endless-showroom folder on :8790 first. Two pages share a
// stand-in realtime server (mock-rt.js). Checks: joining a private room by
// code, the same store on both screens, seeing each other, furniture moved on
// one screen moving on the other, the host's staff showing up on the guest,
// staff hits reaching the guest, a whistle and sitting reaching the other
// screen, and the guest taking over when the host leaves.
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

  // Chat shows in the log and as a bubble over the speaker's head.
  await B.evaluate(() => __game.net.send('c', { m: 'Meet at the cafeteria' }));
  await A.waitForTimeout(1500);
  check(await A.evaluate(() => { const r = [...__game.remotes.values()][0]; return !!(r && r.bubble) && document.getElementById('chat-log').textContent.includes('Meet at the cafeteria'); }), 'chat arrives with a bubble over the speaker');

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
  await A.evaluate((id) => __game.grabForTest(id), moved); // in case the aim missed
  check(await A.evaluate(() => !!__game.P.carry), 'Alpha picked up ' + moved);
  await A.waitForTimeout(600);
  check(await B.evaluate((id) => { const it = __game.world.items.get(id); return !!(it && it.c); }, moved), 'Bravo sees it carried');
  await A.keyboard.press('KeyR'); await A.keyboard.press('Digit3'); await A.keyboard.press('KeyR');
  await A.waitForTimeout(1500);
  check(await B.evaluate(() => { const r = [...__game.remotes.values()][0]; return !!(r && r.hold && r.heldMesh && r.heldMesh.visible && Math.abs(r.hold.o[3]) < 0.99); }), 'Bravo sees the turned piece floating where Alpha aims');
  for (let i = 0; i < 16; i++) {
    await A.evaluate(() => { __game.P.yaw += Math.PI / 8; __game.P.pitch = -0.7; });
    { const t0 = await A.evaluate(() => __game.clock.t); await A.waitForFunction((t) => __game.clock.t > t, t0 + 0.15, { timeout: 120000, polling: 100 }).catch(() => {}); } // a few frames to follow the aim
    if (await A.evaluate(() => __game.placement && __game.placement.sticks && !__game.P.carry.blocked)) break; // touching something: it stays put where it's let go
  }
  await A.keyboard.press('KeyE');
  await A.waitForTimeout(800);
  // (if it fell instead, the fall takes game time, which passes slowly here)
  await A.waitForFunction((id) => !__game.world.items.get(id).c && !__game.flying.length, moved, { timeout: 300000 }).catch(() => {});
  await A.waitForTimeout(800);
  const posA = await A.evaluate((id) => { const it = __game.world.items.get(id); return [it.x, it.y, it.z, it.c, JSON.stringify(it.o)]; }, moved);
  const posB = await B.evaluate((id) => { const it = __game.world.items.get(id); return it ? [it.x, it.y, it.z, it.c, JSON.stringify(it.o)] : null; }, moved);
  check(posB && posA[4] === posB[4] && posA[4] !== 'null', 'placed rotation matches on both screens (' + (posB && posB[4]) + ')');
  check(posB && Math.abs(posA[0] - posB[0]) < 0.01 && Math.abs(posA[2] - posB[2]) < 0.01 && !posB[3], `placed item matches on both screens (${posA.slice(0, 3).map((v) => v.toFixed(2))})`);

  // Bravo switches a lamp off: both screens agree.
  const lampId = await B.evaluate(() => { const w = __game.world, P = __game.P; const l = [...w.items.values()].filter((i) => i.t === 'floorLamp' || i.t === 'tableLamp').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0]; if (l) __game.useItemForTest(l.id); return l && l.id; });
  await B.waitForTimeout(1500);
  check(lampId && await A.evaluate((id) => { const it = __game.world.items.get(id); return !!(it && it.s); }, lampId) && await B.evaluate((id) => !!__game.world.items.get(id).s, lampId), 'a lamp switched off by the guest is off on both screens');

  // Bravo opens a gift box: it's gone on both screens and something is left in its place.
  const giftId = await A.evaluate(() => { const P = __game.P; __game.world.applyState('mp:gift', { t: 'giftBox', k: 'f', v: 0, x: P.x + 3, y: 0, z: P.z, r: 0 }); return 'mp:gift'; });
  await A.waitForTimeout(1200);
  await B.evaluate(() => { const it = __game.world.items.get('mp:gift'); if (!it) __game.world.applyState('mp:gift', { t: 'giftBox', k: 'f', v: 0, x: 0, y: 0, z: 0, r: 0 }); __game.useItemForTest('mp:gift'); });
  await B.waitForTimeout(1500);
  const giftA = await A.evaluate(() => ({ gone: __game.world.isGone(__game.world.items.get('mp:gift')), inside: ([...__game.world.items.values()].find((i) => i.id.startsWith('gift:mp:gift')) || {}).t }));
  const giftB = await B.evaluate(() => ({ gone: __game.world.isGone(__game.world.items.get('mp:gift')), inside: ([...__game.world.items.values()].find((i) => i.id.startsWith('gift:mp:gift')) || {}).t }));
  check(giftA.gone && giftB.gone && giftA.inside && giftA.inside === giftB.inside, `a gift box opened by the guest is gone on both screens and left a ${giftB.inside}`);
  // Bravo switches a head torch on: Alpha sees its light
  await B.evaluate(() => { const P = __game.P; P.inv[0] = 'torch'; P.sel = 0; P.torchOn = true; });
  await A.waitForTimeout(1500);
  check(await A.evaluate(() => { const r = [...__game.remotes.values()][0]; return !!(r && r.st && r.st.tc); }), "the guest's head torch shows on the host's screen");

  // Bravo whistles for help (holds H): Alpha gets a "needs help" marker with Bravo's name
  await B.evaluate(() => { __game.P.whistleT = 0; });
  await B.keyboard.down('KeyH');
  await B.waitForFunction(() => __game.P.whistleT > 0, null, { timeout: 120000, polling: 100 });
  await B.keyboard.up('KeyH');
  await A.waitForFunction(() => __game.beacons.length > 0, null, { timeout: 30000 }).catch(() => {});
  const bc = await A.evaluate(() => __game.beacons.map((b) => ({ name: b.name, long: b.long })));
  check(bc.length === 1 && bc[0].name === 'Bravo' && bc[0].long, `the guest's long whistle shows on the host's screen as a help marker (${JSON.stringify(bc)})`);
  // Bravo sits on a chair: Alpha sees them sitting
  const before = await B.evaluate(() => [__game.P.x, __game.P.y, __game.P.z]);
  // (on clear floor: a chair dropped inside or under something has no room to sit on)
  const seat = await B.evaluate(() => {
    const P = __game.P, w = __game.world; let at = null;
    for (let k = 0; k < 400 && !at; k++) { const x = P.x + (Math.random() - 0.5) * 40, z = P.z + (Math.random() - 0.5) * 40; if (w.fits({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, y0: 0.02, y1: 2.2 })) at = [x, z]; }
    if (!at) return false;
    w.applyState('mp:chair', { t: 'chair', k: 'f', v: 0, x: at[0], y: 0, z: at[1], r: 0 });
    P.onGround = true; P.vy = 0;
    return __game.sitForTest('mp:chair');
  });
  if (seat) await A.waitForFunction(() => { const r = [...__game.remotes.values()][0]; return !!(r && r.st && r.st.si); }, null, { timeout: 30000 }).catch(() => {});
  check(seat && await A.evaluate(() => { const r = [...__game.remotes.values()][0]; return !!(r && r.st && r.st.si); }), 'the guest sitting down shows as sitting on the host\'s screen');
  // back where Bravo was, and the test chair (only on Bravo's screen) taken away again
  await B.evaluate((b) => { const P = __game.P, w = __game.world; P.sit = null; [P.x, P.y, P.z] = b; const it = w.items.get('mp:chair'); w.applyState('mp:chair', Object.assign(w.stateOf(it), { g: true })); }, before);

  // Bravo (guest) picks something up: goes through the host.
  const gid = await B.evaluate(() => {
    const P = __game.P, w = __game.world; let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.y > 0.01) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    const a = Math.atan2(P.x - best.x, P.z - best.z); P.x = best.x + Math.sin(a) * 1.8; P.z = best.z + Math.cos(a) * 1.8; P.y = 0;
    P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = -0.45; return best.id;
  });
  await B.waitForTimeout(400);
  await B.keyboard.press('KeyE');
  await B.waitForTimeout(400);
  await B.evaluate((id) => __game.grabForTest(id), gid);
  await B.waitForTimeout(800);
  check(await A.evaluate((id) => { const it = __game.world.items.get(id); return it && it.c === Object.keys(Object.fromEntries(__game.remotes))[0]; }, gid), 'host records the guest carrying ' + gid);
  check(await B.evaluate(() => !!__game.P.carry), 'guest still carrying after host confirms');

  // Night: staff from the host appear on the guest.
  await A.evaluate(() => __game.setClock(372));
  await A.waitForTimeout(8000);
  const sA = await A.evaluate(() => __game.staffViews.size), sB = await B.evaluate(() => __game.staffViews.size);
  check(sA > 0 && sB > 0, `staff on host (${sA}) and guest (${sB})`);
  check(await B.evaluate(() => __game.clock.t > 365), 'guest clock follows host into night');
  // Put a member of staff right next to Bravo and wait for a hit.
  await B.evaluate(() => __game.spawnAt(__game.P.x, __game.P.z, 8)); // open floor
  await B.waitForTimeout(1500);
  const hp0 = await B.evaluate(() => __game.P.hp);
  const bp = await B.evaluate(() => ({ x: __game.P.x, y: __game.P.y, z: __game.P.z }));
  await A.evaluate((bp) => {
    const w = __game.world; let s = [...__game.staff.staff.values()][0];
    if (!s) return;
    for (let a = 0; a < 6.28; a += 0.3) { // a clear spot 0.8 m from the guest
      const x = bp.x + Math.cos(a) * 0.8, z = bp.z + Math.sin(a) * 0.8;
      if (w.fits({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: bp.y + 0.05, y1: bp.y + 2 })) { s.x = x; s.z = z; break; }
    }
    s.y = bp.y; s.stunT = 0; s.cd = 0;
  }, bp);
  { const t0 = await A.evaluate(() => __game.clock.t); await B.waitForFunction((hp0) => __game.P.hp < hp0, hp0, { timeout: 120000 }).catch(() => {}); }
  const hp1 = await B.evaluate(() => __game.P.hp);
  check(hp1 < hp0, `guest got hit by host's staff (${hp0} -> ${hp1})`);
  await B.screenshot({ path: path.join(out, 'mp-02-guest-night.png') });

  // Host leaves while carrying something: the new host lets go of it.
  const held = await A.evaluate(() => { const w = __game.world, P = __game.P; const it = [...w.items.values()].find((i) => i.k === 'f' && w.active(i)); return it && __game.grabForTest(it.id) ? it.id : null; });
  await A.waitForTimeout(800);
  // Host leaves: guest takes over.
  await A.close();
  await B.waitForFunction(() => __game.net.isHost(), null, { timeout: 120000 }).catch(() => {});
  check(await B.evaluate(() => __game.net.isHost()), 'guest became host after host left');
  check(await B.evaluate((id) => { const it = __game.world.items.get(id); return !!(it && __game.world.mods.has(id)); }, moved), 'guest kept the store changes');
  await B.waitForTimeout(1500);
  check(held && await B.evaluate((id) => { const it = __game.world.items.get(id); return !!it && !it.c; }, held), 'what the old host was carrying is let go');
  await B.waitForTimeout(3000);
  check(await B.evaluate(() => __game.staffViews.size > 0), 'new host runs the staff');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
