// Public store test (1.2): node tools/test-pub.cjs [--src]
// Serve the endless-showroom folder on :8790 first. Pages share the stand-in
// realtime server (mock-rt.js) and a stand-in for the Worker's saves
// (mock-ct.js), and play in public store 1. Checks:
// - public stores have one fixed layout (they never reset) and run the short days;
// - the host autosaves the store to the server every 15 s;
// - a joiner sees exactly the host's day and time and the builds;
// - when everyone leaves, the next person in gets the world, the day and the
//   time of day exactly as they were (the clock stands still while it's empty),
//   with nothing in their own browser;
// - a tab that closes without saving still leaves the last 15 s autosave;
// - a forged save can't change what things are or add things;
// - a server that can't be reached when the store opens is never saved over,
//   and its store is brought in when it answers;
// - food grows back in its spot 2 hours (of store time) after it's taken, but
//   not if what it stood on has gone; a carried-off stack of building
//   materials grows back in its spot, and the new piece is kept in the save.
const { chromium } = require('playwright');
const path = require('path');
const url = `http://localhost:8790/${process.argv.includes('--src') ? 'src/' : ''}index.html`;
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  await ctx.addInitScript({ path: path.join(__dirname, 'mock-rt.js') });
  await ctx.addInitScript({ path: path.join(__dirname, 'mock-ct.js') });
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
  // what the stand-in server holds (read through any page: it's the shared real storage)
  const saved = (p) => p.evaluate(() => window.__ctServer.get('pub1'));
  const putCount = (p) => p.evaluate(() => window.__ctCount('pub1'));
  const clockOf = (p) => p.evaluate(() => ({ day: __game.clock.day, t: +__game.clock.t.toFixed(1), rt: Math.floor(__game.clock.rt), k: __game.dayScale }));
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
  const clearMine = (p) => p.evaluate(() => { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('es-pub-')) localStorage.removeItem(k); } });

  const A = await open('Alpha'), B = await open('Bravo');
  await join(A);
  const pub = await A.evaluate(() => ({ room: __game.net.room, seed: __game.net.seed, want: __game.publicSeed('pub1', 20779), host: __game.net.isHost() }));
  check(pub.room === 'pub1' && pub.seed === pub.want && pub.host, `public store 1 has its one fixed layout, whatever the week (${JSON.stringify(pub)})`);
  check((await clockOf(A)).k === 0.5, 'public stores run the short days');
  const x1 = await build(A);
  await A.waitForTimeout(2000);
  check(x1 && await at(A, x1), 'Alpha builds something: ' + JSON.stringify(x1));
  // the store gets on to day 3, in the afternoon
  await A.evaluate(() => __game.setClock(100, 3));
  // autosave every 15 s (of game time), with no help
  const n0 = await putCount(A);
  await A.waitForFunction((n) => window.__ctCount('pub1') >= n + 2, n0, { timeout: 120000, polling: 250 }).catch(() => {});
  const n1 = await putCount(A), s1 = await saved(A);
  check(n1 >= n0 + 2 && s1 && s1.day === 3 && s1.mods.some((e) => e[0] === x1[0]), `the host autosaves the store to the server every 15 s (${n1 - n0} saves, day ${s1 && s1.day}, has the build: ${!!(s1 && s1.mods.some((e) => e[0] === x1[0]))})`);
  const gap = await A.evaluate(async () => { const g = () => window.__ctCount('pub1'); let a = g(); while (g() === a) await new Promise((r) => setTimeout(r, 50)); a = g(); const t0 = __game.clock.rt; while (g() === a) await new Promise((r) => setTimeout(r, 50)); return +(__game.clock.rt - t0).toFixed(1); });
  check(gap > 12 && gap < 17, `...15 s apart (${gap} s of store time between two saves)`);

  // Bravo joins: the same day and time of day as the host, and the build
  await join(B);
  const [ca, cb] = [await clockOf(A), await clockOf(B)];
  check(ca.day === 3 && cb.day === 3 && Math.abs(ca.t - cb.t) < 3 && cb.k === 0.5, `Bravo joins on the host's day and time, not day 1 (host ${JSON.stringify(ca)}, Bravo ${JSON.stringify(cb)})`);
  check(await at(B, x1), "Bravo sees Alpha's build");
  const x2 = await build(B);
  await B.waitForTimeout(2500);
  check(x2 && await at(A, x2) && await at(B, x2), "Bravo's build is in the host's store: " + JSON.stringify(x2));

  // Alpha leaves: Bravo hosts and saves; then Bravo leaves and the store is empty
  await leave(A);
  check(await B.evaluate(() => __game.net.isHost()), 'Bravo takes over hosting');
  await B.evaluate(() => __game.srvSaveForTest());
  await B.waitForTimeout(500);
  const before = await clockOf(B);
  await leave(B);
  const s2 = await saved(A);
  check(s2 && s2.mods.some((e) => e[0] === x2[0]) && s2.day === before.day && Math.abs(s2.t - before.t) < 1.5, `the last one out leaves the store saved (day ${s2 && s2.day} at ${s2 && s2.t} s, left at ${JSON.stringify(before)})`);

  // a newcomer with nothing in their own browser gets the store just as it was, after it stood empty
  await A.waitForTimeout(6000);
  const C = await open('Charlie');
  await join(C);
  const cc = await clockOf(C);
  check(await C.evaluate(() => __game.net.isHost()) && await at(C, x1) && await at(C, x2), 'Charlie, first into the empty store, gets every build back from the server');
  check(cc.day === before.day && Math.abs(cc.t - before.t) < 6 && cc.rt >= before.rt - 2, `...on the same day and time of day it was left (the clock stood still while it was empty): ${JSON.stringify(cc)} vs ${JSON.stringify(before)}`);

  // a tab that closes without saving: the last autosave is still there
  const x3 = await build(C);
  await C.waitForTimeout(1000);
  const n2 = await putCount(C);
  await C.waitForFunction((n) => window.__ctCount('pub1') > n, n2, { timeout: 60000, polling: 250 }).catch(() => {});
  const crashDay = await clockOf(C);
  await C.evaluate(() => { window.__ctDrop = true; localStorage.clear(); });
  await C.close({ runBeforeUnload: false });
  await A.waitForTimeout(8000);
  const D = await open('Delta');
  await join(D);
  const cd = await clockOf(D);
  check(x3 && await at(D, x3), "a tab closing without warning still leaves its build in the store (from the last 15 s autosave)");
  check(cd.day === crashDay.day && Math.abs(cd.t - crashDay.t) < 18, `...and the day and time (${JSON.stringify(cd)}, closed at ${JSON.stringify(crashDay)})`);

  // a forged save can move things but not turn them into something else or add things
  const forged = await D.evaluate(() => {
    const w = __game.world, P = __game.P;
    const real = [...w.items.values()].filter((i) => i.k === 'f' && w.active(i) && !i.c && !w.mods.has(i.id) && /^-?\d+,-?\d+:\d+$/.test(i.id) && __game.TYPES[i.t] && i.t !== 'safe').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    const [mv, swap] = real;
    const add = [[mv.id, Object.assign(w.stateOf(mv), { x: mv.x + 0.7, tm: Date.now() - 1000 })], [swap.id, Object.assign(w.stateOf(swap), { t: 'safe', tm: Date.now() - 1000 })],
      ['made:up', { t: 'medkit', k: 'i', v: 0, x: P.x, y: 0, z: P.z, r: 0 }], ['3,3:99999', { t: 'medkit', k: 'i', v: 0, x: P.x, y: 0, z: P.z, r: 0 }], [real[2].id + ':r1', Object.assign(w.stateOf(real[2]), { x: P.x })]];
    return { mv: [mv.id, mv.x + 0.7], swap: swap.id, other: real[2].id, add };
  });
  await leave(D);
  await A.evaluate(async (add) => { const s = await window.__ctServer.get('pub1'); s.mods.push(...add); await window.__ctServer.put('pub1', s); }, forged.add);
  const E = await open('Echo');
  await join(E);
  // (the pieces may be far from where Echo woke up: changed pieces are always in the store's list of changes)
  const fr = await E.evaluate((f) => { const w = __game.world, m = w.mods.get(f.mv[0]); return { moved: !!m && Math.abs(m.x - f.mv[1]) < 0.01, swapT: (w.mods.get(f.swap) || w.genSpec(f.swap)).t, madeUp: w.items.has('made:up') || w.items.has('3,3:99999') || w.mods.has('3,3:99999'), copy: w.items.has(f.other + ':r1') || w.mods.has(f.other + ':r1') }; }, forged);
  check(fr.moved && fr.swapT !== 'safe' && !fr.madeUp && !fr.copy, `a forged save can't change what things are or add things (${JSON.stringify(fr)})`);

  // food grows back in its spot 2 hours of store time after it's taken
  const food = await E.evaluate(async () => {
    const w = __game.world, P = __game.P;
    const all = [...w.items.values()].filter((i) => i.k === 'i' && w.active(i) && /^-?\d+,-?\d+:\d+$/.test(i.id)).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    // one on the floor or a shelf, and one standing on a piece of furniture
    const onFurn = (it) => { let f = null; w.forBoxes(it.x - 0.04, it.z - 0.04, it.x + 0.04, it.z + 0.04, (b) => { if (b.item && b.y1 <= it.y + 0.02 && b.y1 >= it.y - 0.04) f = b.item; }); let st = false; w.forBoxes(it.x - 0.04, it.z - 0.04, it.x + 0.04, it.z + 0.04, (b) => { if (!b.item && b.y0 <= it.y + 0.02 && b.y1 >= it.y - 0.04) st = true; }); return st || it.y < 0.05 ? null : f; };
    const plain = all.find((i) => !onFurn(i)), top = all.find((i) => onFurn(i) && !__game.TYPES[onFurn(i).t].heavy);
    const take = (it) => __game.hostTakeForTest(it.id);
    take(plain); if (top) take(top);
    await new Promise((r) => setTimeout(r, 300));
    const gone = w.isGone(plain) && (!top || w.isGone(top));
    // take the furniture away from under the other one
    if (top) { const f = onFurn(top) || null; const under = [...w.items.values()].find((i) => i.k === 'f' && Math.abs(i.x - top.x) < 2 && Math.abs(i.z - top.z) < 2 && i.y < top.y && !__game.TYPES[i.t].flat && !w.mods.has(i.id)); }
    return { plain: plain.id, top: top ? top.id : null, gone };
  });
  // move the piece under the second one well away (as the host)
  const moved = food.top && await E.evaluate((id) => { const w = __game.world, it = w.items.get(id); let f = null; w.forBoxes(it.x - 0.04, it.z - 0.04, it.x + 0.04, it.z + 0.04, (b) => { if (b.item && b.y1 <= it.y + 0.02 && b.y1 >= it.y - 0.04) f = b.item; }); if (!f) return false; return __game.hostMoveForTest(f.id, f.x + 12, f.z); }, food.top);
  await E.evaluate(() => { __game.clock.rt += 3600; __game.regrowForTest(); });
  const half = await E.evaluate((f) => __game.world.isGone(__game.world.items.get(f.plain)), food);
  await E.evaluate(() => { __game.clock.rt += 3700; __game.regrowForTest(); });
  const back = await E.evaluate((f) => ({ plain: !__game.world.isGone(__game.world.items.get(f.plain)), top: f.top ? !__game.world.isGone(__game.world.items.get(f.top)) : null }), food);
  check(food.gone && half && back.plain, `food grows back in its spot 2 hours after it's taken, not before (${JSON.stringify(food)} ${JSON.stringify(back)})`);
  check(!food.top || (moved && back.top === false), `...but not if what it stood on has been taken away (${JSON.stringify({ top: food.top, moved, back: back.top })})`);

  // building materials: a stack carried off grows back in its spot
  const mat = await E.evaluate(async () => {
    const w = __game.world, P = __game.P;
    let best = null, bd = 1e9;
    for (const ch of w.chunks.values()) { const g = ch.gen; for (let i = g.matBase; i < g.items.length; i++) { const id = ch.key + ':' + i, it = w.items.get(id); if (!it || it.y > 0.01 || w.mods.has(id)) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } } }
    if (!best) return null;
    const home = [best.x, best.z, best.t], n = [...w.chunks.values()].reduce((a, ch) => a + ch.gen.items.length - ch.gen.matBase, 0);
    __game.hostMoveForTest(best.id, best.x + 8, best.z);
    return { id: best.id, home, n };
  });
  check(mat && mat.n > 10, `there are stacks of building materials about (${mat && mat.n} pieces in the loaded chunks)`);
  await E.evaluate(() => { __game.clock.rt += 7300; __game.regrowForTest(); });
  const grown = await E.evaluate((m) => { const w = __game.world, it = w.items.get(m.id + ':r1'); return it ? { t: it.t, at: Math.hypot(it.x - m.home[0], it.z - m.home[1]) < 0.05, active: w.active(it) } : null; }, mat);
  check(grown && grown.t === mat.home[2] && grown.at && grown.active, `a carried-off ${mat && mat.home[2]} grows back in its spot 2 hours later (${JSON.stringify(grown)})`);
  await E.evaluate(() => __game.srvSaveForTest());
  await E.waitForTimeout(500);
  await leave(E);
  const F = await open('Foxtrot');
  await join(F);
  check(await F.evaluate((m) => !!__game.world.items.get(m.id + ':r1'), mat), '...and the new piece is kept in the saved store');
  await leave(F);

  // the server can't be reached when the store opens: it's never saved over, and comes in when it answers
  const keep = await saved(F);
  const G = await open('Golf');
  await G.evaluate(() => { window.__ctDown = true; });
  await join(G);
  await G.evaluate(() => __game.srvSaveForTest());
  const still = await saved(G).catch(() => null);
  const gDay = await clockOf(G);
  await G.evaluate(() => { window.__ctDown = false; });
  await G.waitForFunction(() => __game.srv.ok, null, { timeout: 60000, polling: 250 }).catch(() => {});
  await G.waitForTimeout(800);
  const after = await clockOf(G), gotBuild = await at(G, x1);
  check(gDay.day === 1, `(with no server and no copy of its own, Golf opens a store on day ${gDay.day})`);
  const s3 = await saved(G);
  check(after.day === keep.day && gotBuild && s3 && s3.mods.length >= keep.mods.length, `a store opened while the server couldn't be reached doesn't save over it, and takes on the saved store when it answers (day ${after.day}, saved ${keep.day}, build back: ${gotBuild})`);

  check(!errors.length, errors.length ? 'console errors: ' + errors.slice(0, 5).join(' | ') : 'no console errors');
  console.log(failed ? `${failed} failed` : 'public store ok');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
