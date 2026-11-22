// Headless smoke test. Serve the rillstone folder first
// (python3 -m http.server 8765), then:
//   node tools/test.cjs <outdir> [--src] [--shots] [--move] [--dig] [--town]
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
  await p.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
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

  if (all || flags.has('--dig')) {
    // M2: dig 50 holes, then pan 20 loads in the river.
    const r = await p.evaluate(async () => {
      const R = __rill, g = R.places.CLAIMS[0], H = R.hands;
      R.noRender(true); R.fly(false);
      const act = async (x, y, z) => { R.aimAt(x, y, z); await R.refreshAim(); H.cooldown = 0; return H.use(); };
      await R.teleport(g.cx, g.top + 1.2, g.cz, 0, 0); await R.tick(20);
      if (R.items.get(H.hand).type !== 'shovel') H.swap();
      let holes = 0;
      for (let i = 0; i < 50; i++) {
        const x = g.x0 + 3 + (i % 10) * 1.9, z = g.z0 + 3 + Math.floor(i / 10) * 4.2;
        await R.teleport(x - 1.6, g.top + 1.2, z - 0.2); await R.tick(2);
        const l = await act(x, g.top - 0.05, z);
        if (l && l.band) holes++;
        if (R.items.get(H.hand).data.loads.length) await act(x - 0.6, g.top, z - 1.6); // dump the load beside the hole (away from the pan area)
      }
      await R.claims.settle();
      // Pan: scoop 2 loads in the claim, wash both in the river, tip out on the bank.
      H.swap();
      const pan = R.items.get(H.hand);
      const zr = g.cz, rx = R.riverX(zr), bankX = g.x1 + 1.2, standX = rx - 8.2;
      let washed = 0, finds = [];
      for (let c = 0; c < 10; c++) {
        const x = g.x0 + 3 + c * 1.8, z = g.z1 - 1.4;
        await R.teleport(x + 0.9, g.top + 1.2, z - 1.8); await R.tick(2);
        await act(x, g.top - 0.05, z); await act(x + 0.6, g.top - 0.05, z);
        await R.teleport(standX, R.height(standX, zr) + 1.2, zr); await R.tick(10);
        for (let k = 0; k < 2; k++) { const it = await act(rx - 6, R.waterY(zr) - 0.2, zr); if (it && it.material) { washed++; finds.push(it.material); } }
        await R.teleport(standX - 2.5, R.height(standX - 2.5, zr) + 1.2, zr); await R.tick(4);
        await act(standX - 4.2, R.height(standX - 4.2, zr + 1.2), zr + 1.2); // tip out on dry ground
      }
      await R.tick(120);
      const nug = [...R.items.ents.values()].filter(e => e.type === 'nugget' && e.loc === 'loose').length;
      const clods = [...R.items.ents.values()].filter(e => e.type === 'clod').length;
      R.noRender(false);
      return { holes, washed, finds, nug, clods, pan: pan.data };
    });
    check(r.holes >= 50, `dug ${r.holes} holes with the shovel`);
    check(r.clods >= 50, `${r.clods} dirt clods dumped as props`);
    check(r.washed === 20, `panned ${r.washed} loads in the river (finds: ${[...new Set(r.finds)].join(', ')})`);
    check(r.nug >= 20, `${r.nug} finds lying loose on the bank`);
    // Pile merging: 80 copper nuggets dropped in one spot become one Pile.
    const pile = await p.evaluate(async () => {
      const R = __rill, g = R.places.CLAIMS[0]; R.noRender(true);
      const x = g.x0 - 6, z = g.z1 + 6, y = R.height(x, z);
      for (let i = 0; i < 80; i++) R.items.spawn('nugget', [x + (i % 5) * 0.12 - 0.24, y + 0.3 + Math.floor(i / 25) * 0.15, z + (Math.floor(i / 5) % 5) * 0.12 - 0.24], { item: { material: 'copper', stage: 'ore', kg: 0.3 } });
      for (let i = 0; i < 40; i++) { await R.tick(15); R.items.update(); if (R.physics.stats.awake === 0) break; }
      const before = R.items.counts();
      const made = R.items.mergePiles();
      await R.tick(2);
      R.noRender(false);
      return { made, before, after: R.items.counts(), awake: R.physics.stats.awake, stepMs: R.physics.stats.stepMs };
    });
    check(pile.after.piles >= 1, `80 resting copper nuggets merged into ${pile.after.piles} pile(s) (${pile.before.total} -> ${pile.after.total} entities)`);
    // Benchmark 1: continuous digging in Willow Bend (deeper claim).
    const bench = await p.evaluate(async () => {
      const R = __rill, w = R.places.CLAIMS[1], H = R.hands; R.noRender(true);
      R.claims.stats.meshMs.length = 0; R.claims.stats.colliderMs.length = 0;
      if (R.items.get(H.hand).type !== 'shovel') H.swap();
      const vol = R.claims.volumes.get('willow');
      const brush = (v, c, r, m, b) => R.brush('willow', c, r, m, b);
      const t0 = performance.now(); let frames = 0, maxQ = 0;
      // 240 digs spiralling down, ~4 per frame as if digging hard; the game rebuilds <= 2 colliders a frame.
      for (let i = 0; i < 240; i++) {
        const a = i * 0.7, r = 2 + (i % 40) * 0.12, depth = Math.floor(i / 40) * 0.5;
        const c = [w.cx + Math.cos(a) * r, w.top - 0.3 - depth, w.cz + Math.sin(a) * r];
        brush(vol, c, 0.45, 'dig', 4);
        if (i % 4 === 3) { R.claims.update(c); frames++; maxQ = Math.max(maxQ, R.claims.busy); await R.frames(1); }
      }
      await R.claims.settle();
      const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
      const p95 = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.95)] : 0; };
      // Voxel collider comparison on one full chunk of the same claim.
      const pts = []; for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) if (vol.dens[vol.idx(x, Math.min(vol.ny - 1, y), z)] > 0) pts.push(x, y, z);
      const vox = await R.physics.call({ op: 'benchVoxels', points: new Int32Array(pts), edits: 500 });
      R.noRender(false);
      return { remeshes: R.claims.stats.remeshes, meshMed: med(R.claims.stats.meshMs), meshP95: p95(R.claims.stats.meshMs), colMed: med(R.claims.stats.colliderMs), colP95: p95(R.claims.stats.colliderMs), colliders: R.claims.stats.colliders, maxQueue: maxQ, wall: performance.now() - t0, vox };
    });
    console.log('     benchmark 1: ' + JSON.stringify(bench));
    check(bench.colP95 < 8, `trimesh collider rebuild p95 ${bench.colP95.toFixed(2)} ms per chunk`);
    // Screenshots: the benchmark's spiral pit in Willow Bend cuts through the
    // bands; a deeper shaft shows all three.
    await p.evaluate(async () => {
      const R = __rill, w = R.places.CLAIMS[1], vol = R.claims.volumes.get('willow');
      const brush = (v, c, r, m, b) => R.brush('willow', c, r, m, b);
      for (let d = 0; d < 20; d += 0.8) for (let k = 0; k < 6; k++) brush(vol, [w.x0 + 7 + (k % 3) * 1.6, w.top - 0.5 - d, w.z0 + 7 + Math.floor(k / 3) * 1.6], 1.4, 'dig', 4);
      await R.claims.settle();
    });
    const W = await p.evaluate(() => __rill.places.CLAIMS[1]);
    await shot(p, 'm2-bands', { x: W.x0 + 8.6, y: W.top + 2.5, z: W.z0 + 11.8, yaw: 0, pitch: -1.2, t: 0.5 });
    await shot(p, 'm2-willow', { x: W.cx + 9, y: W.top + 7, z: W.cz + 12, yaw: 0.6, pitch: -0.55, t: 0.45 });
    const G = await p.evaluate(() => __rill.places.CLAIMS[0]);
    // Holding a nugget over the bank: drop ring and tooltip.
    await p.evaluate(async () => {
      const R = __rill, g = R.places.CLAIMS[0], H = R.hands; R.fly(false);
      const n = [...R.items.ents.values()].filter(e => e.type === 'nugget' && e.loc === 'loose').sort((a, b) => b.item.kg - a.item.kg)[0];
      await R.teleport(n.pos[0] - 1.3, n.pos[1] + 1.0, n.pos[2] + 0.6); await R.tick(10);
      R.aimAt(n.pos[0], n.pos[1], n.pos[2]); await R.refreshAim();
      R.noRender(false);
    });
    await p.waitForTimeout(800);
    await p.screenshot({ timeout: 180000, path: `${out}/m2-tooltip.png` });
    await p.evaluate(async () => {
      const R = __rill, H = R.hands, g = R.places.CLAIMS[0];
      H.pickup(); R.noRender(true);
      const c = R.view.camera.position;
      R.aimAt(c.x + 1.4, R.height(c.x + 1.4, c.z - 1.2), c.z - 1.2); await R.refreshAim(); R.noRender(false);
    });
    await p.waitForTimeout(900);
    await p.screenshot({ timeout: 180000, path: `${out}/m2-dropring.png` });
    // Panning: pan with two loads, aimed at the river.
    await p.evaluate(async () => {
      const R = __rill, H = R.hands, g = R.places.CLAIMS[0]; R.noRender(true);
      H.drop(); if (R.items.get(H.hand)?.type !== 'pan') H.swap();
      const pan = R.items.get(H.hand); pan.data.loads.push({ band: 1, depth: 1 }, { band: 1, depth: 1 }); R.items.refresh(pan.id);
      const zr = g.cz, rx = R.riverX(zr), sx = rx - 8.2;
      await R.teleport(sx, R.height(sx, zr) + 1.2, zr); await R.tick(5);
      R.aimAt(rx - 6, R.waterY(zr), zr + 0.3); await R.refreshAim(); R.noRender(false);
    });
    await p.waitForTimeout(900);
    await p.screenshot({ timeout: 180000, path: `${out}/m2-pan.png` });
  }

  if (all || flags.has('--town')) {
    // M3: earn § 1,000 by panning and selling at the Assay Office, buy the
    // starter automation kit, save, reload, and check it all persists.
    const earn = await p.evaluate(async () => {
      const R = __rill, H = R.hands, E = R.economy, g = R.places.CLAIMS[0], T = R.town; R.noRender(true); R.fly(false);
      const act = async (x, y, z) => { R.aimAt(x, y, z); await R.refreshAim(); H.cooldown = 0; return H.use(); };
      if (R.items.get(H.hand)?.type !== 'pan') H.swap();
      const pan = R.items.get(H.hand);
      const zr = g.cz, rx = R.riverX(zr), sx = rx - 8.2;
      const assay = T.counters.find(c => c.venue === 'assay');
      let loads = 0, sales = 0, guard = 0;
      while (E.state.scrip < 1000 && guard++ < 400) {
        // Two loads from 4-5 m down in the claim, washed in the river.
        pan.data.loads.push({ band: 1, depth: 4 + Math.random(), claim: 'gravel' }, { band: 1, depth: 4 + Math.random(), claim: 'gravel' });
        await R.teleport(sx, R.height(sx, zr) + 1.2, zr); await R.tick(2);
        for (let k = 0; k < 2; k++) { await act(rx - 6, R.waterY(zr) - 0.2, zr); loads++; }
        // Carry the finds to the counter.
        const finds = pan.data.contents.splice(0);
        finds.forEach((id, i) => R.items.place(id, [assay.x - 1.2 + (i % 6) * 0.4, assay.top + 0.15 + Math.floor(i / 6) * 0.15, assay.z]));
        R.items.refresh(pan.id);
        if (loads % 10 === 0) { await R.tick(30); R.items.update(); const r = T.ringBell(assay.bell); sales += r.total || 0; }
      }
      await R.tick(30); R.items.update(); const r = T.ringBell(assay.bell); sales += r.total || 0;
      R.noRender(false);
      return { scrip: E.state.scrip, loads, sales, perLoad: sales / loads };
    });
    check(earn.scrip >= 1000, `earned § ${earn.scrip} from ${earn.loads} panned loads (§ ${earn.perLoad.toFixed(1)} per load)`);
    const kit = await p.evaluate(async () => {
      const R = __rill; R.noRender(true);
      const before = R.economy.state.scrip;
      const ids = ['sluice1', 'drill1', 'intake1', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'];
      let ok = 0; for (const id of ids) if (R.town.buy('millwright', id)) ok++;
      await R.tick(90); R.items.update();
      const crates = [...R.items.ents.values()].filter(e => e.type === 'crate').length;
      R.noRender(false);
      return { ok, spent: before - R.economy.state.scrip, crates };
    });
    check(kit.ok === 11 && kit.crates === 11, `bought the starter kit: ${kit.crates} crates for § ${kit.spent}`);
    // Market saturation in the live game.
    const mkt = await p.evaluate(() => { const E = __rill.economy; const m = E.state.market[0]; const a = E.stallMult(0); m.sold += 500; const b = E.stallMult(0); m.sold -= 500; return { a, b, want: m.want }; });
    check(mkt.b < mkt.a || mkt.a === 1, `stall 1 price drops after sales (${(mkt.a * 100).toFixed(0)}% -> ${(mkt.b * 100).toFixed(0)}%)`);
    // Cargo: a nugget rides in the truck bed while driving, then comes back out.
    const cargo = await p.evaluate(async () => {
      const R = __rill, V = R.vehicles; R.noRender(true);
      const v = [...V.list.values()][0];
      const n = R.items.spawn('nugget', [0, 0, 0], { item: { material: 'gold', stage: 'ore', kg: 1.2 }, loc: 'held' });
      const bedWorld = new R.THREE.Vector3(0, v.def.bed.y + 0.05, -1).applyMatrix4(v.group.matrixWorld).toArray();
      const r = V.addCargo(v.id, n, bedWorld);
      V.enter(v.id); R.input.simulate('forward', true);
      for (let i = 0; i < 150; i++) { V.update(1 / 60, R.input, true); await R.tick(1); }
      R.input.simulate('forward', false); R.input.endFrame();
      for (let i = 0; i < 90; i++) { V.update(1 / 60, R.input, true); await R.tick(1); }
      await R.exitVehicle();
      const moved = Math.hypot(v.group.position.x - bedWorld[0], v.group.position.z - bedWorld[2]);
      const still = v.cargo.includes(n.id);
      const mesh = v.cargoGroup.children.length;
      const out = V.cargoNear(v.id, new R.THREE.Vector3(0, v.def.bed.y, -1).applyMatrix4(v.group.matrixWorld).toArray(), 0.6);
      R.noRender(false);
      return { r, moved, still, mesh, found: out && out.id === n.id };
    });
    check(cargo.r === 'ok' && cargo.still && cargo.mesh >= 1 && cargo.found && cargo.moved > 5, `nugget rode ${cargo.moved.toFixed(0)} m in the truck bed and can be taken back out`);
    // Benchmark 3: drive over freshly dug ground in Willow Bend.
    const b3 = await p.evaluate(async () => {
      const R = __rill, V = R.vehicles, w = R.places.CLAIMS[1]; R.noRender(true);
      for (let k = 0; k < 5; k++) for (let z = w.z0 + 2; z < w.z1 - 2; z += 0.8) R.brush('willow', [w.x0 + 7 + k * 4, w.top + 0.2, z], 0.5, 'dig', 4);
      let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 40; i++) R.brush('willow', [w.x0 + 6 + rnd() * 20, w.top - 0.5, w.z0 + 3 + rnd() * 26], 0.8, 'fill', 4); // gentle mounds, same every run
      await R.claims.settle();
      const v = [...V.list.values()][0];
      // Keep clear of the benchmark-1 pit in the middle of the claim.
      await V.teleport(v.id, [w.x0 + 2.5, w.top + 1.5, w.z1 - 4], Math.PI / 2);
      for (let i = 0; i < 60; i++) await R.tick(1);
      V.enter(v.id); R.input.simulate('forward', true);
      const trace = []; let maxRoll = 0, maxPitchRate = 0, maxUp = 0, minUpDot = 1, launches = 0, stepMs = 0, n = 0, crossed = false;
      for (let i = 0; i < 900; i++) {
        V.update(1 / 60, R.input, true); await R.tick(1);
        const s = R.physics.vehicles.get(v.id);
        if (s.p[0] > w.x0 + 4 && s.p[0] < w.x1 - 2) {
          maxRoll = Math.max(maxRoll, Math.abs(s.av[2]), Math.abs(s.av[0]));
          maxUp = Math.max(maxUp, s.lv[1]);
          if (s.lv[1] > 3) launches++;
          minUpDot = Math.min(minUpDot, 1 - 2 * (s.q[0] ** 2 + s.q[2] ** 2));
          stepMs += R.physics.stats.stepMs; n++;
        }
        if (i % 60 === 0) trace.push([+s.p[0].toFixed(1), +s.p[1].toFixed(1), +s.speed.toFixed(1), s.grounded]);
        if (s.p[0] > w.x1 + 2) { crossed = true; break; }
      }
      R.input.simulate('forward', false); R.input.endFrame();
      await R.exitVehicle();
      R.noRender(false);
      return { trace: trace.join(' '), x1: w.x1, crossed, maxAngVel: +maxRoll.toFixed(2), maxVy: +maxUp.toFixed(2), launches, minUp: +minUpDot.toFixed(2), stepMs: +(stepMs / Math.max(1, n)).toFixed(2) };
    });
    console.log('     benchmark 3: ' + JSON.stringify(b3));
    check(b3.crossed && b3.launches === 0 && b3.minUp > 0.7, `truck crossed 5 fresh ruts and mounds without launching or rolling (min up ${b3.minUp}, max vy ${b3.maxVy} m/s)`);
    // Unflip.
    const flip = await p.evaluate(async () => {
      const R = __rill, V = R.vehicles, v = [...V.list.values()][0]; R.noRender(true);
      const s = R.physics.vehicles.get(v.id);
      await R.physics.call({ op: 'teleportVehicle', id: v.id, pos: [s.p[0], s.p[1] + 1, s.p[2]], quat: [0.7071, 0, 0, 0.7071] });
      for (let i = 0; i < 120; i++) await R.tick(1);
      await V.unflip(v.id);
      for (let i = 0; i < 120; i++) await R.tick(1);
      const t = R.physics.vehicles.get(v.id); R.noRender(false);
      return 1 - 2 * (t.q[0] ** 2 + t.q[2] ** 2);
    });
    check(flip > 0.95, `unflip puts the truck back on its wheels (up ${flip.toFixed(2)})`);
    // Save, reload the page, load the slot: everything persists.
    const before = await p.evaluate(async () => { const R = __rill; await R.saveTo(1); return { scrip: R.economy.state.scrip, items: R.items.ents.size, crates: [...R.items.ents.values()].filter(e => e.type === 'crate').length, chunks: [...R.claims.volumes.values()].reduce((a, v) => a + v.modified.size, 0), contracts: R.economy.state.contracts.map(c => c.id).join(','), truck: [...R.vehicles.list.values()][0].group.position.toArray().map(v => Math.round(v)) }; });
    await p.evaluate(() => __rill.loadSlot(1));
    await p.waitForFunction(() => window.__rill && window.__rill.ready && window.__rill.state.mode === 'play', null, { timeout: 120000 });
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => { const R = __rill; return { scrip: R.economy.state.scrip, items: R.items.ents.size, crates: [...R.items.ents.values()].filter(e => e.type === 'crate').length, chunks: [...R.claims.volumes.values()].reduce((a, v) => a + v.modified.size, 0), contracts: R.economy.state.contracts.map(c => c.id).join(','), truck: [...R.vehicles.list.values()][0].group.position.toArray().map(v => Math.round(v)) }; });
    check(JSON.stringify(before) === JSON.stringify(after), `reload keeps everything: § ${after.scrip}, ${after.items} items, ${after.crates} crates, ${after.chunks} dug chunks, contracts ${after.contracts}, truck at ${after.truck}`);
    // A/B: the slot keeps a complete older half too; export round-trips.
    const ab = await p.evaluate(async () => { const R = __rill; await R.saveTo(1, true); const l = await R.saves.list(); const blob = R.saves.exportBlob(R.snapshot()); const snap = await R.saves.importFile(new File([blob], 'x.rillsave')); return { ab: l[0].ab, size: blob.size, scrip: snap.economy.scrip }; });
    check(ab.size > 100 && ab.scrip === after.scrip, `export/import round-trips a ${(ab.size / 1024).toFixed(0)} KB .rillsave (slot 1 now on half ${ab.ab})`);
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
