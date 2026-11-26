// Public store test: node tools/test-pub.cjs [--src]
// Serve the endless-showroom folder on :8790 first. Two pages share the
// stand-in realtime server (mock-rt.js) and play in public store 1. Checks:
// the store is this week's store (the same seed for everyone); something built
// is still there after everyone leaves and someone comes back; a change only
// one player has a copy of comes back when they join, merged into the host's
// store; the Sunday reset gives everyone a fresh store; an offered copy can't
// change what things are; and someone whose clock is a week ahead follows the
// host's store and week.
const { chromium } = require('playwright');
const path = require('path');
const url = `http://localhost:8790/${process.argv.includes('--src') ? 'src/' : ''}index.html`;
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  await ctx.addInitScript({ path: path.join(__dirname, 'mock-rt.js') });
  const errors = [];
  const open = async (name) => {
    const p = await ctx.newPage();
    // each player has their own browser storage (the pages share one browser here)
    await p.addInitScript((pre) => {
      const real = window.localStorage, mine = () => Object.keys(real).filter((k) => k.startsWith(pre));
      const store = {
        getItem: (k) => real.getItem(pre + k), setItem: (k, v) => real.setItem(pre + k, String(v)), removeItem: (k) => real.removeItem(pre + k),
        key: (i) => { const k = mine()[i]; return k ? k.slice(pre.length) : null; }, get length() { return mine().length; }, clear: () => mine().forEach((k) => real.removeItem(k)),
      };
      Object.defineProperty(window, 'localStorage', { value: store, configurable: true });
    }, name + ':');
    p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(m.text())) errors.push(name + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push(name + ': pageerror: ' + e.message));
    await p.goto(url);
    await p.evaluate((n) => localStorage.setItem('es-name', n), name);
    await p.reload();
    await p.waitForTimeout(1200);
    return p;
  };
  const join = async (p) => {
    await p.click('#b-online');
    await p.waitForFunction(() => window.__game.mode === 'play', null, { timeout: 90000 });
    await p.waitForTimeout(2500);
  };
  const leave = async (p) => { await p.evaluate(() => __game.leaveForTest()); await p.waitForTimeout(8000); };
  // move a piece on the floor near the player 1.5 m to the side (as the host, or through it)
  const build = (p) => p.evaluate(async () => {
    const w = __game.world, P = __game.P;
    let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.y > 0.01 || w.mods.has(it.id) || __game.TYPES[it.t].heavy) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    if (!best || !__game.grabForTest(best.id)) return null;
    const x = best.x + 1.5, z = best.z;
    await new Promise((r) => setTimeout(r, 1500));
    __game.placeForTest(x, 0, z);
    return [best.id, x, z];
  });
  const at = (p, b) => p.evaluate((b) => { const it = __game.world.items.get(b[0]); return !!it && Math.abs(it.x - b[1]) < 0.02 && Math.abs(it.z - b[2]) < 0.02; }, b);

  const A = await open('Alpha'), B = await open('Bravo');
  await join(A);
  const pub = await A.evaluate(() => ({ room: __game.net.room, pub: __game.net.isPublic, seed: __game.net.seed, week: __game.net.week, want: __game.publicSeed(__game.net.room, __game.storeWeek()) }));
  check(pub.pub && pub.room === 'pub1' && pub.seed === pub.want && pub.week === await A.evaluate(() => __game.storeWeek()), `public store 1 is this week's store (${JSON.stringify(pub)})`);
  const x1 = await build(A);
  await A.waitForTimeout(2000);
  check(x1 && await at(A, x1), 'Alpha builds something: ' + JSON.stringify(x1));
  await A.evaluate(() => __game.pubSaveForTest());
  await leave(A);

  // Bravo comes into the empty store (no copy of Alpha's build) and builds something else
  await join(B);
  check(await B.evaluate(() => __game.net.isHost() && __game.net.seed) === pub.seed, 'Bravo gets the same store this week');
  const x2 = await build(B);
  await B.waitForTimeout(2000);
  check(x2 && await at(B, x2), 'Bravo builds something: ' + JSON.stringify(x2));
  await B.evaluate(() => __game.pubSaveForTest());
  await leave(B);

  // Alpha comes back first: their build is back. Then Bravo joins and brings theirs.
  await join(A);
  check(await at(A, x1), "after the store emptied, Alpha's build is still there when Alpha comes back");
  await join(B);
  await A.waitForFunction((b) => { const it = __game.world.items.get(b[0]); return !!it && Math.abs(it.x - b[1]) < 0.02; }, x2, { timeout: 60000 }).catch(() => {});
  check(await at(A, x2) && await at(B, x2), "Bravo's build comes back when Bravo joins (merged into the host's store)");
  check(await at(B, x1), "Bravo sees Alpha's build too");

  // Sunday: the host opens a fresh store for everyone
  await B.evaluate(() => { __game.net.week -= 1; });
  await A.evaluate(() => __game.weekForTest());
  await B.waitForTimeout(4000);
  const gone = await Promise.all([A, B].map((p) => p.evaluate((ids) => ids.map((id) => __game.world.mods.has(id)), [x1[0], x2[0]])));
  check(gone.every((g) => g.every((v) => !v)), `the Sunday reset clears the builds on both screens (${JSON.stringify(gone)})`);
  // (the copy saved every 20 s may already hold the new store: that's fine, as long as last week's is gone)
  const bCopy = await B.evaluate((ids) => { const c = JSON.parse(localStorage.getItem('es-pub-pub1') || 'null'); return c ? { mods: c.mods.length, old: c.mods.filter((e) => ids.includes(e[0])).length } : null; }, [x1[0], x2[0]]);
  check(!bCopy || bCopy.old === 0, `the guest's saved copy of last week's store is thrown away (${JSON.stringify(bCopy)})`);
  check(await A.evaluate(() => !!localStorage.getItem('es-name')) && !(await A.evaluate(() => localStorage.getItem('es-name'))).includes('Bravo'), 'each player keeps their own storage');

  // A copy offered to the host can move things, but not turn one thing into
  // another, add things the store never had, or push the day far ahead.
  const forged = await A.evaluate(() => {
    const w = __game.world, P = __game.P, now = Date.now();
    const real = [...w.items.values()].filter((i) => i.k === 'f' && w.active(i) && !i.c && !w.mods.has(i.id) && /^-?\d+,-?\d+:\d+$/.test(i.id) && __game.TYPES[i.t] && i.t !== 'safe').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    const [mv, swap] = real;
    const st = (it, patch) => Object.assign(w.stateOf(it), { tm: now - 1000 }, patch);
    const day0 = __game.clock.day, x0 = mv.x;
    __game.offerForTest('someone', { i: 0, n: 1, d: 9999, t: 10, m: [
      [mv.id, st(mv, { x: mv.x + 0.7 })],
      [swap.id, st(swap, { t: 'safe' })],
      ['made:up', { t: 'medkit', k: 'i', v: 0, x: P.x, y: 0, z: P.z, r: 0, tm: now - 1000 }],
      ['gift:' + mv.id + ':1', { t: 'medkit', k: 'i', v: 0, x: P.x, y: 0, z: P.z, r: 0, tm: now - 1000 }],
    ] });
    return { moved: Math.abs(w.items.get(mv.id).x - (x0 + 0.7)) < 0.01 && w.mods.has(mv.id), swapT: w.items.get(swap.id).t, madeUp: w.items.has('made:up'), gift: w.items.has('gift:' + mv.id + ':1'), day0, day: __game.clock.day };
  });
  check(forged.moved && forged.swapT !== 'safe' && !forged.madeUp && !forged.gift && forged.day < 9999, `an offered copy can't change what things are, add things or jump the day (${JSON.stringify(forged)})`);

  // Someone whose clock is already in next week joins while the host is still
  // in this week's store: they take on the host's store and week, and move
  // with everyone when the host opens the new week.
  await leave(B);
  const ahead = () => { const real = Date.now; Date.now = () => real() + 7 * 864e5; };
  await B.evaluate(ahead);
  await join(B);
  const bw = await Promise.all([A, B].map((p) => p.evaluate(() => ({ seed: __game.world.seed, week: __game.net.week }))));
  check(bw[0].seed === bw[1].seed && bw[0].week === bw[1].week, `a newcomer whose clock is a week ahead takes on the host's store and week (${JSON.stringify(bw)})`);
  await A.evaluate(ahead);
  await A.evaluate(() => __game.weekCheckForTest());
  await B.waitForFunction((s) => __game.world.seed !== s, bw[1].seed, { timeout: 30000 }).catch(() => {});
  const nw = await Promise.all([A, B].map((p) => p.evaluate(() => ({ seed: __game.world.seed, week: __game.net.week, want: __game.publicSeed(__game.net.room, __game.storeWeek()) }))));
  check(nw[0].seed === nw[0].want && nw[1].seed === nw[0].seed && nw[1].week === nw[0].week, `...and moves into the new week's store with the host (${JSON.stringify(nw)})`);

  check(!errors.length, errors.length ? 'console errors: ' + errors.slice(0, 5).join(' | ') : 'no console errors');
  console.log(failed ? `${failed} failed` : 'public store ok');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
