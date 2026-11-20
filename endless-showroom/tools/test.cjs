// Headless smoke test: node tools/test.cjs <screenshot-dir> [--src]
// Serve the endless-showroom folder on :8790 first (python3 -m http.server 8790).
// Loads the game, starts solo play, walks, picks up and places furniture,
// skips to night, checks the staff spawn and hunt, and fails on any console
// error. Screenshots go to <screenshot-dir>.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'shots';
const SRC = process.argv.includes('--src');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:8790/${SRC ? 'src/' : ''}index.html`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '01-menu.png') });
  await page.evaluate(() => window.__game.startSolo());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '02-start.png') });
  const g = (fn, a) => page.evaluate(fn, a);

  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  console.log('after walk', await g(() => ({ x: __game.P.x, z: __game.P.z, items: __game.world.items.size, chunks: __game.world.chunks.size })));

  // Stand in front of the nearest piece of furniture on the floor and pick it up.
  console.log('target', await g(() => {
    const P = __game.P, w = __game.world;
    let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.y > 0.01) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    if (!best) return 'none';
    const a = Math.atan2(P.x - best.x, P.z - best.z);
    P.x = best.x + Math.sin(a) * 1.8; P.z = best.z + Math.cos(a) * 1.8; P.y = 0;
    P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = -0.45;
    return best.t + ' ' + best.id;
  }));
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  console.log('carrying', await g(() => __game.P.carry && __game.P.carry.t));
  await page.screenshot({ path: path.join(out, '03-carry.png') });
  await g(() => { __game.P.yaw += Math.PI; __game.P.pitch = -0.6; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '04-ghost.png') });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  console.log('placed', await g(() => !__game.P.carry));

  await page.keyboard.press('KeyV'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '05-third.png') });
  await page.keyboard.press('KeyV');

  // Skip to closing time.
  await g(() => __game.setClock(358));
  await page.waitForTimeout(9000);
  console.log('night', await g(() => ({ staff: __game.staffViews.size, t: __game.clock.t, hp: __game.P.hp })));
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '06-night.png') });
  await g(() => { const P = __game.P; let b = null, bd = 1e9; for (const v of __game.staffViews.values()) { const p = v.model.root.position; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; b = p; } } if (b) { P.yaw = Math.atan2(P.x - b.x, P.z - b.z); P.pitch = 0; } });
  await page.waitForTimeout(6000);
  console.log('after hunting', await g(() => ({ staff: __game.staffViews.size, hp: __game.P.hp, alive: __game.P.alive })));
  await page.screenshot({ path: path.join(out, '07-staff.png') });

  // Eating: put a sandwich in slot 1 and click.
  await g(() => { __game.P.food = 40; __game.P.inv[0] = 'burger'; __game.P.sel = 0; });
  await page.keyboard.press('Digit1');
  await g(() => { window.__game.useForTest && window.__game.useForTest(); });
  const food = await g(() => __game.P.food);
  console.log((food >= 59 ? 'ok   ' : 'FAIL ') + 'eating a burger fills hunger (' + food.toFixed(0) + ')');

  // Furniture stays where you put it, even in mid-air, and can be tilted upright.
  const air = await g(() => {
    const P = __game.P, w = __game.world;
    __game.setClock(60);
    let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.t === 'rug') continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    const a = Math.atan2(P.x - best.x, P.z - best.z);
    P.x = best.x + Math.sin(a) * 1.6; P.z = best.z + Math.cos(a) * 1.6; P.y = 0; P.vy = 0;
    P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = Math.atan2(best.y + 0.2 - 1.6, 1.6);
    return best.id;
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  await g((id) => __game.grabForTest(id), air); // in case the aim missed
  const carried = await g(() => !!__game.P.carry);
  // turn it 45° on the upright axis, then on the side axis
  await page.keyboard.press('KeyR'); await page.keyboard.press('Digit1'); await page.keyboard.press('KeyR'); await page.waitForTimeout(400);
  const turned = await g(() => __game.P.carry && __game.P.carry.o);
  console.log((turned && Math.abs(turned[3]) < 0.99 ? 'ok   ' : 'FAIL ') + 'R turns a held piece on the chosen axis (' + JSON.stringify(turned) + ')');
  // aim into open air (nothing touching it), let go: it drops and isn't fixed
  let rel = null;
  for (let i = 0; i < 16; i++) {
    await g(() => { __game.P.yaw += Math.PI / 8; __game.P.pitch = 0.55; __game.P.carryDist = 2.2; });
    await page.waitForTimeout(1500);
    const pl = await g(() => __game.placement);
    if (pl && !pl.sticks && pl.y > 0.5) { rel = pl; break; }
  }
  await page.keyboard.press('KeyE');
  await page.waitForFunction((id) => !__game.world.items.get(id).c, air, { timeout: 30000 }).catch(() => {});
  const fell = await g((id) => { const it = __game.world.items.get(id); return { y: it.y, a: it.a, o: !!it.o, c: it.c }; }, air);
  console.log((carried && rel && fell.y < rel.y - 0.05 && !fell.a && fell.o && !fell.c ? 'ok   ' : 'FAIL ') + 'let go in mid-air, it drops (' + JSON.stringify({ from: rel && +rel.y.toFixed(2), ...fell }) + ')');
  // let go while it touches something: it stays exactly there, fixed
  await g((id) => __game.grabForTest(id), air);
  await g(() => { __game.P.pitch = -0.6; __game.P.carryDist = 2.2; });
  await page.waitForFunction(() => { const c = __game.P.carry, p = __game.placement; if (!c || !p) return false; const ok = window.__lastY !== undefined && Math.abs(window.__lastY - p.y) < 0.005; window.__lastY = p.y; return ok; }, null, { timeout: 30000, polling: 500 }).catch(() => {});
  const at = await g(() => __game.placement);
  await page.keyboard.press('KeyE');
  await page.waitForFunction((id) => !__game.world.items.get(id).c, air, { timeout: 30000 }).catch(() => {});
  const fixed = await g((id) => { const it = __game.world.items.get(id); return { y: it.y, a: it.a, c: it.c }; }, air);
  console.log((at && at.sticks && fixed.a && !fixed.c && Math.abs(fixed.y - at.y) < 0.2 ? 'ok   ' : 'FAIL ') + 'let go touching something, it stays put (' + JSON.stringify(fixed) + ')');
  await page.screenshot({ path: path.join(out, '07b-midair.png') });

  // Shoving knocks a member of staff down at night.
  const shoved = await g(() => {
    __game.setClock(400); const P = __game.P; P.y = 0;
    let s = [...__game.staff.staff.values()][0];
    if (!s) { __game.staff.spawnNear(P); s = [...__game.staff.staff.values()][0]; }
    s.x = P.x - Math.sin(P.yaw) * 1.8; s.z = P.z - Math.cos(P.yaw) * 1.8; s.y = P.y; s.mode = 'wander'; s.target = null; s.senseT = 5;
    return s.id;
  });
  await page.waitForTimeout(600);
  await g(() => __game.shoveForTest());
  await page.waitForTimeout(300);
  const stun = await g((id) => { const s = __game.staff.staff.get(id); return s ? +s.stunT.toFixed(2) : -1; }, shoved);
  console.log((stun > 0 ? 'ok   ' : 'FAIL ') + 'a shove knocks staff down (stun ' + stun + ' s)');

  // Wardrobes are hollow: there's room to stand inside one.
  const inside = await g(() => {
    const w = __game.world; const wd = [...w.items.values()].find((i) => i.t === 'wardrobe' && w.active(i) && !i.tl);
    if (!wd) return 'none';
    let ox = 0, oz = 0.03; for (let i = 0; i < wd.r; i++) { const t = ox; ox = oz; oz = -t; }
    const x = wd.x + ox, z = wd.z + oz;
    return w.fits({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0.1, y1: 1.9 }) && !w.fits({ x0: wd.x - 0.7, x1: wd.x + 0.7, z0: wd.z - 0.5, z1: wd.z + 0.5, y0: 0.1, y1: 1.9 });
  });
  console.log((inside === true ? 'ok   ' : 'FAIL ') + 'there is room to stand inside a wardrobe (' + inside + ')');

  // Throwing: the piece flies off and lands, no longer carried.
  await g(() => __game.setClock(60));
  const thrown = await g(() => {
    const P = __game.P, w = __game.world; __game.spawnAt(P.x, P.z, 4);
    let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.t !== 'box' && it.t !== 'chair' && it.t !== 'stool' && it.t !== 'plant') continue; if (!w.active(it)) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    if (!best) return null;
    const a = Math.atan2(P.x - best.x, P.z - best.z);
    P.x = best.x + Math.sin(a) * 1.4; P.z = best.z + Math.cos(a) * 1.4; P.y = 0;
    P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = Math.atan2(best.y + 0.2 - 1.6, 1.4);
    return [best.id, best.x, best.z];
  });
  await page.waitForTimeout(300); await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  await g((t) => t && __game.grabForTest(t[0]), thrown);
  await g(() => { __game.P.yaw += Math.PI; __game.P.pitch = 0.2; __game.P.en = 100; });
  { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 1, t0, { timeout: 60000 }); } // it swings round in front
  await page.keyboard.press('KeyF');
  { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 2.5, t0, { timeout: 120000 }); }
  const landed = await g((t) => { const it = t && __game.world.items.get(t[0]); return it ? { moved: +Math.hypot(it.x - t[1], it.z - t[2]).toFixed(2), c: it.c, carry: !!__game.P.carry } : null; }, thrown);
  console.log((landed && landed.moved > 2 && !landed.c && !landed.carry ? 'ok   ' : 'FAIL ') + 'a thrown piece lands away from you (' + JSON.stringify(landed) + ')');

  // Dropping food from the inventory puts it back in the world.
  const dropped = await g(() => {
    const w = __game.world, P = __game.P;
    const it = [...w.items.values()].find((i) => i.k === 'i' && w.active(i));
    if (!it) return null;
    w.edit(it, { g: true, d: __game.restockEpoch(__game.clock.day) });
    P.inv[0] = it.t; P.invId[0] = it.id; P.sel = 0;
    return it.id;
  });
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(500);
  const back = await g((id) => { const it = __game.world.items.get(id); return it ? { active: __game.world.active(it), d: +Math.hypot(it.x - __game.P.x, it.z - __game.P.z).toFixed(2), slot: __game.P.inv[0] } : null; }, dropped);
  console.log((back && back.active && back.d < 1.5 && !back.slot ? 'ok   ' : 'FAIL ') + 'dropped food lands at your feet (' + JSON.stringify(back) + ')');

  // Crouching makes you short enough for low gaps (on open floor, so there's room to stand again).
  await g(() => { const P = __game.P; __game.spawnAt(P.x, P.z, 8); });
  await page.keyboard.down('KeyC'); await page.waitForTimeout(600);
  const crouchH = await g(() => __game.P.height);
  await page.keyboard.up('KeyC'); await page.waitForTimeout(600);
  const standH = await g(() => __game.P.height);
  console.log((crouchH < 1.2 && standH > 1.7 ? 'ok   ' : 'FAIL ') + `crouching lowers you (${crouchH} then ${standH})`);

  // A beanbag breaks a fall that hurts on the bare floor.
  const fall = await g(() => {
    const P = __game.P, w = __game.world, out = {};
    const bag = [...w.items.values()].find((i) => i.t === 'beanbag' && w.active(i));
    out.floorAt = [P.x, P.z]; out.bag = bag ? bag.id : null;
    return out;
  });
  const dropFrom = async (x, z, y) => { await g(([x, z, y]) => { const P = __game.P; P.x = x; P.z = z; P.y = y; P.vy = 0; P.hp = 100; P.onGround = false; }, [x, z, y]); await page.waitForFunction(() => __game.P.onGround, null, { timeout: 60000 }); await page.waitForTimeout(300); return g(() => __game.P.hp); };
  const spot = await g(() => { const P = __game.P, w = __game.world; for (let i = 0; i < 60; i++) { const x = P.x + (Math.random() - 0.5) * 30, z = P.z + (Math.random() - 0.5) * 30; if (w.fits({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6, y0: 0, y1: 6.4 })) return [x, z]; } return null; });
  const floorHp = spot ? await dropFrom(spot[0], spot[1], 6.3) : null;
  let bagHp = null;
  if (fall.bag) { const b = await g((id) => { const it = __game.world.items.get(id); return [it.x, it.z]; }, fall.bag); bagHp = await dropFrom(b[0], b[1], 6.3); }
  console.log((floorHp !== null && floorHp < 100 && (bagHp === null || bagHp > floorHp) ? 'ok   ' : 'FAIL ') + `a beanbag softens a fall (floor hp ${floorHp}, beanbag hp ${bagHp})`);

  // Picking up takes a held E; a tap isn't enough.
  const tapGrab = await g(() => {
    const P = __game.P, w = __game.world; let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.y > 0.01 || it.t === 'rug') continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    const a = Math.atan2(P.x - best.x, P.z - best.z); P.x = best.x + Math.sin(a) * 1.5; P.z = best.z + Math.cos(a) * 1.5; P.y = 0;
    P.yaw = a; P.pitch = Math.atan2(best.y + 0.25 - 1.6, 1.5); return best.id;
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400);
  const afterTap = await g(() => !!__game.P.carry);
  await page.keyboard.down('KeyE');
  { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 2.2 || !!__game.P.carry, t0, { timeout: 90000 }); }
  await page.keyboard.up('KeyE');
  const afterHold = await g(() => !!__game.P.carry);
  console.log((!afterTap && afterHold ? 'ok   ' : 'FAIL ') + `a tap of E doesn't pick up, holding it does (${afterTap}, ${afterHold})`);
  if (afterHold) { await page.keyboard.press('KeyE'); await page.waitForTimeout(400); }

  // A grid pillar stands in the middle of the spawn chunk, and nights grow.
  const grid = await g(() => ({ p: __game.world.pillarAt(12, 12), n1: Math.round(__game.nightLen(1)), n10: Math.round(__game.nightLen(10)) }));
  console.log((grid.p && grid.p.type === 'standard' && grid.n1 === 300 && grid.n10 === 336 ? 'ok   ' : 'FAIL ') + `grid pillar ${grid.p && grid.p.label}; nights ${grid.n1} s then ${grid.n10} s by day 10`);

  // You can walk up a mezzanine's stairs.
  const stairs = await g(() => {
    const w = __game.world, P = __game.P, focus = [];
    for (let i = -8; i <= 8; i += 2) for (let j = -8; j <= 8; j += 2) focus.push({ x: i * 24, z: j * 24, render: false });
    w.update(focus);
    for (const ch of w.chunks.values()) {
      const first = ch.boxes.find((b) => Math.abs(b.y1 - 3 / 10.5) < 0.005), last = ch.boxes.find((b) => Math.abs(b.y1 - 3 * 10 / 10.5) < 0.005);
      if (!first || !last) continue;
      const fx = (first.x0 + first.x1) / 2, fz = (first.z0 + first.z1) / 2, lx = (last.x0 + last.x1) / 2, lz = (last.z0 + last.z1) / 2;
      const d = Math.hypot(lx - fx, lz - fz), ux = (lx - fx) / d, uz = (lz - fz) / d;
      w.update([{ x: fx, z: fz, render: true }]);
      P.x = fx - ux * 0.7; P.z = fz - uz * 0.7; P.y = 0; P.vy = 0;
      P.yaw = Math.atan2(-ux, -uz); P.pitch = 0;
      return [fx, fz];
    }
    return null;
  });
  if (stairs) {
    await page.keyboard.down('KeyW');
    { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 2.5 || __game.P.y > 2.9, t0, { timeout: 150000 }); }
    await page.keyboard.up('KeyW');
  }
  const upY = await g(() => +__game.P.y.toFixed(2));
  console.log((stairs && upY > 2.9 ? 'ok   ' : 'FAIL ') + `walked up a mezzanine staircase (y ${upY})`);

  // Staff climb a staircase of furniture: two crates stacked (2 m) are safe
  // alone, but put one crate beside them as a step and they come up.
  const climbSetup = await g(() => {
    const w = __game.world, P = __game.P;
    __game.setClock(400, 3);
    __game.spawnAt(P.x, P.z, 10);
    let spot = null;
    for (let k = 0; k < 80 && !spot; k++) {
      const x = P.x + (Math.random() - 0.5) * 40, z = P.z + (Math.random() - 0.5) * 40;
      if (w.fits({ x0: x - 3, x1: x + 3, z0: z - 3, z1: z + 3, y0: 0.02, y1: 3.5 })) spot = [x, z];
    }
    if (!spot) return null;
    // three crates made just for this test
    const put = (id, x, y, z) => w.applyState(id, { t: 'crate', k: 'f', v: 0, x, y, z, r: 0, tl: 0, hp: 120, g: 0, c: 0, d: 0 });
    const crates = [put('test:a', spot[0], 0, spot[1]), put('test:b', spot[0], 1, spot[1]), put('test:c', spot[0] + 60, 0, spot[1] + 60)];
    P.x = spot[0]; P.z = spot[1]; P.y = 2.0; P.vy = 0; P.hp = 100;
    const S = __game.staff; for (const s of S.staff.values()) S.staff.delete(s.id);
    S.spawnNear(P); const s = [...S.staff.values()][0];
    s.x = spot[0] + 1.6; s.z = spot[1]; s.y = 0; s.look = Object.assign({}, s.look, { speedScale: 1 });
    return { spot, step: crates[2].id };
  });
  { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 4, t0, { timeout: 200000 }); }
  const aloneHp = await g(() => __game.P.hp);
  await g((c) => { const w = __game.world, it = w.items.get(c.step); const st = w.stateOf(it); st.x = c.spot[0] + 1.0; st.z = c.spot[1]; st.y = 0; w.applyState(it.id, st); __game.P.hp = 100; }, climbSetup);
  { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 8 || __game.P.hp < 100, t0, { timeout: 300000 }); }
  const stepHp = await g(() => __game.P.hp);
  console.log((climbSetup && aloneHp === 100 ? 'ok   ' : 'FAIL ') + `two crates high is out of reach (hp ${aloneHp})`);
  console.log((climbSetup && stepHp < 100 ? 'ok   ' : 'FAIL ') + `with a step beside it, the staff climb up (hp ${stepHp})`);

  // Food restocks on Mondays and Fridays only.
  const rs = await g(() => [1, 2, 4, 5, 7, 8, 12].map((d) => __game.restockEpoch(d)).join(','));
  console.log((rs === '1,1,1,2,2,3,4' ? 'ok   ' : 'FAIL ') + 'restock days (' + rs + ')');

  // Standing on a wardrobe keeps you out of reach.
  const perch = await g(() => {
    __game.setClock(380);
    const P = __game.P, w = __game.world; P.hp = 100;
    let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.t !== 'wardrobe' || !w.active(it) || it.y > 0.01) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    if (!best) return null;
    // move it to open floor, so nothing next to it can act as a step
    __game.spawnAt(P.x, P.z, 10);
    let spot = null;
    for (let k = 0; k < 60 && !spot; k++) {
      const x = P.x + (Math.random() - 0.5) * 30, z = P.z + (Math.random() - 0.5) * 30;
      if (w.fits({ x0: x - 2.5, x1: x + 2.5, z0: z - 2.5, z1: z + 2.5, y0: 0.05, y1: 3 })) spot = [x, z];
    }
    if (!spot) return null;
    const st = w.stateOf(best); st.x = spot[0]; st.z = spot[1]; st.y = 0; st.tl = 0; w.applyState(best.id, st);
    P.x = best.x; P.z = best.z; P.y = 2.1; P.vy = 0;
    const s = [...__game.staff.staff.values()][0];
    if (s) { s.x = best.x + 1.0; s.z = best.z; s.y = 0; }
    return best.id;
  });
  { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 4, t0, { timeout: 150000 }); }
  const safe = await g(() => ({ hp: __game.P.hp, y: __game.P.y }));
  console.log((perch && safe.hp === 100 && safe.y > 2 ? 'ok   ' : 'FAIL ') + 'on top of a wardrobe the staff cannot reach (' + JSON.stringify(safe) + ')');
  await page.screenshot({ path: path.join(out, '08-perch.png') });
  // Control: the same staff member does reach you on the floor.
  await g(() => {
    const P = __game.P, w = __game.world; __game.spawnAt(P.x + 3, P.z, 6);
    const s = [...__game.staff.staff.values()][0]; if (!s) return;
    for (let a = 0; a < 6.28; a += 0.3) { // a clear spot 0.8 m away
      const x = P.x + Math.cos(a) * 0.8, z = P.z + Math.sin(a) * 0.8;
      if (w.fits({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0.05, y1: 2 })) { s.x = x; s.z = z; break; }
    }
    s.y = 0; s.stunT = 0; s.cd = 0;
  });
  // wait for 3 s of game time (the test machine draws slowly)
  { const t0 = await g(() => __game.clock.t); await page.waitForFunction((t0) => __game.clock.t > t0 + 3 || __game.P.hp < 100, t0, { timeout: 120000 }); }
  const hp2 = await g(() => __game.P.hp);
  console.log((hp2 < 100 ? 'ok   ' : 'FAIL ') + 'on the floor the staff do hit (' + hp2 + ')');

  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
  console.log('draw calls', await g(() => __game.renderer.info.render.calls), 'triangles', await g(() => __game.renderer.info.render.triangles));
  console.log('fps (software GL)', fps.toFixed(1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
