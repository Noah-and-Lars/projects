// Headless smoke test. Serve the rillstone folder first
// (python3 -m http.server 8765), then:
//   node tools/test.cjs <outdir> [--src] [--shots] [--move] [--dig] [--town] [--machines] [--belts]
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
  const mainPage = p;
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
        if (pan.data.loads.length < 2) R._panLog = (R._panLog || '') + `c${c}:scoop${pan.data.loads.length} `;
        await R.teleport(standX, R.height(standX, zr) + 1.2, zr); await R.tick(10);
        // The player can slide a little on the bank between clicks: retry a
        // missed wash (aim lands on the bank) up to twice per load.
        for (let k = 0; k < 6 && pan.data.loads.length; k++) {
          const it = await act(rx - 6, R.waterY(zr) - 0.2, zr);
          if (it && it.material) { washed++; finds.push(it.material); continue; }
          const inf = H.aimInfo(); R._panLog = (R._panLog || '') + `c${c}:washmiss(${inf.kind},${inf.dist?.toFixed(2)},p${R.player.cur.toArray().map(v => v.toFixed(1))}) `;
          await R.teleport(standX, R.height(standX, zr) + 1.2, zr); await R.tick(10);
        }
        // Tip out on dry ground on the bank (clicking the claim would scoop more gravel).
        await R.teleport(standX - 0.5, R.height(standX - 0.5, zr) + 1.2, zr); await R.tick(4);
        await act(standX - 1.8, R.height(standX - 1.8, zr + 1.2), zr + 1.2);
      }
      await R.tick(120);
      const nug = [...R.items.ents.values()].filter(e => e.type === 'nugget' && e.loc === 'loose').length;
      const clods = [...R.items.ents.values()].filter(e => e.type === 'clod').length;
      R.noRender(false);
      return { holes, washed, finds, nug, clods, pan: pan.data, log: R._panLog || '' };
    });
    check(r.holes >= 50, `dug ${r.holes} holes with the shovel`);
    check(r.clods >= 50, `${r.clods} dirt clods dumped as props`);
    if (r.log) console.log('     pan log: ' + r.log);
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
    // Hold G: R turns the item 45° a press; releasing G drops it.
    const ctl = await p.evaluate(async () => {
      const R = __rill, H = R.hands, I = R.input; R.noRender(true); await R.refreshAim();
      const id = H.hand, step = async (a, v) => { I.simulate(a, v); await R.frames(2); };
      const c = R.view.camera.position;
      for (const [dx, dz] of [[1.4, -1.2], [-1.4, -1.6], [0, -2.2], [1.8, 0.4], [-1.8, 0.6]]) {
        R.aimAt(c.x + dx, R.height(c.x + dx, c.z + dz), c.z + dz); await R.refreshAim(); await R.frames(4);
        if (H.ringPos && H.ringOk) break;
      }
      await step('drop', true); const held = H.hand === id;
      await step('rotY', true); await step('rotY', false); await step('rotY', true); await step('rotY', false);
      const rot = H.dropRot.join(','), ring = [!!H.ringPos, H.ringOk, H.precise, R.items.get(id)?.type]; await step('drop', false);
      const e = R.items.get(id), loc = e.loc; H.dropRot = [0, 0, 0];
      // B over the dropped nugget opens its look-up entry.
      R.aimAt(e.pos[0], e.pos[1], e.pos[2]); await R.refreshAim(); await R.frames(3);
      await step('guide', true); await step('guide', false);
      const panel = R.panels.current; R.panels.close();
      H.pickup(); R.noRender(false);
      return { held, rot, loc, panel, back: H.hand === id, ring };
    });
    check(ctl.held && ctl.rot === '0,2,0' && ctl.loc === 'loose' && ctl.panel === 'lookup' && ctl.back, `hold G + R/T/Y turns the drop (${ctl.rot}), release drops it; B opens the hovered item's look-up entry (${ctl.panel})`);
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
      while (E.state.scrip < 1060 && guard++ < 400) {
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
      const ids = ['sluice1', 'drill1', 'intake1', 'junction', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper', 'pipe_copper'];
      let ok = 0; for (const id of ids) if (R.town.buy('millwright', id)) ok++;
      await R.tick(90); R.items.update();
      const crates = [...R.items.ents.values()].filter(e => e.type === 'crate').length, coils = [...R.items.ents.values()].filter(e => e.type === 'coil').length;
      R.noRender(false);
      return { ok, spent: before - R.economy.state.scrip, crates, coils };
    });
    check(kit.ok === 12 && kit.crates === 4 && kit.coils === 8, `bought the starter kit: ${kit.crates} machine crates and ${kit.coils} pipe coils for § ${kit.spent}`);
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
      for (let i = 0; i < 240; i++) await R.tick(1);
      const t = R.physics.vehicles.get(v.id); R.noRender(false);
      return 1 - 2 * (t.q[0] ** 2 + t.q[2] ** 2);
    });
    check(flip > 0.95, `unflip puts the truck back on its wheels (up ${flip.toFixed(2)})`);
    // Save, reload the page, load the slot: everything persists.
    const before = await p.evaluate(async () => { const R = __rill; await R.saveTo(1); return { scrip: R.economy.state.scrip, items: R.items.ents.size, crates: [...R.items.ents.values()].filter(e => e.type === 'crate').length, chunks: [...R.claims.volumes.values()].reduce((a, v) => a + v.modified.size, 0), contracts: R.economy.state.contracts.map(c => c.id).join(','), truck: [...R.vehicles.list.values()][0].group.position.toArray() }; });
    await p.evaluate(() => __rill.loadSlot(1));
    await p.waitForFunction(() => window.__rill && window.__rill.ready && window.__rill.state.mode === 'play', null, { timeout: 120000 });
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => { const R = __rill; return { scrip: R.economy.state.scrip, items: R.items.ents.size, crates: [...R.items.ents.values()].filter(e => e.type === 'crate').length, chunks: [...R.claims.volumes.values()].reduce((a, v) => a + v.modified.size, 0), contracts: R.economy.state.contracts.map(c => c.id).join(','), truck: [...R.vehicles.list.values()][0].group.position.toArray() }; });
    // The truck settles on its suspension after a reload: compare it within 0.6 m.
    const tdist = Math.hypot(...before.truck.map((v, i) => v - after.truck[i]));
    if (tdist > 0.6) console.log('     truck moved ' + tdist.toFixed(2) + ' m');
    before.truck = after.truck = null;
    check(JSON.stringify(before) === JSON.stringify(after) && tdist < 0.6, `reload keeps everything: § ${after.scrip}, ${after.items} items, ${after.crates} crates, ${after.chunks} dug chunks, contracts ${after.contracts}, truck within ${tdist.toFixed(2)} m`);
    // A/B: the slot keeps a complete older half too; export round-trips.
    const ab = await p.evaluate(async () => { const R = __rill; await R.saveTo(1, true); const l = await R.saves.list(); const blob = R.saves.exportBlob(R.snapshot()); const snap = await R.saves.importFile(new File([blob], 'x.rillsave')); return { ab: l[0].ab, size: blob.size, scrip: snap.economy.scrip }; });
    check(ab.size > 100 && ab.scrip === after.scrip, `export/import round-trips a ${(ab.size / 1024).toFixed(0)} KB .rillsave (slot 1 now on half ${ab.ab})`);
    // A save made while hosting: what a guest held comes back loose, not lost.
    // The free starter hauler sells for nothing.
    const orphan = await p.evaluate(async () => {
      const R = __rill, n = R.items.spawn('nugget', [0, 0, 0], { item: { material: 'gold', kg: 0.3, stage: 'ore' }, loc: 'held' });
      const snap = R.snapshot(); await R.restore(snap); await R.tick(5);
      const v = [...R.vehicles.list.values()].find(v => v.type === 'hauler');
      return { loc: R.items.get(n.id)?.loc, refund: v ? R.vehicles.refund(v) : null, free: v?.free };
    });
    check(orphan.loc === 'loose' && orphan.refund === 0, `a guest's held item comes back loose after a host save (${orphan.loc}); the starter hauler sells for § ${orphan.refund}`);
  }

  if (all || flags.has('--machines')) {
    // M4: an intake -> junction -> drill + sluice line on the Gravel Bar runs
    // unattended for 10 minutes; halving the intake slows it by the formula.
    const setup = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, g = R.places.CLAIMS[0]; R.noRender(true);
      for (const id of [...Mc.list.keys()]) Mc.remove(id);
      // Intake on the bank with its mouth in the river (facing east, rot 3).
      const z = g.cz - 4, rx = R.riverX(z);
      let ix = null;
      for (let x = rx - 12; x < rx; x += 0.25) { if (!Mc.requirement('intake1', [x, R.height(x, z), z], 3)) { ix = x; break; } }
      const intake = Mc.place('intake1', [ix, R.height(ix, z), z], 3, {}, { locked: true });
      const junc = Mc.place('junction', [g.x1 - 1.5, g.top, z], 0, {}, { locked: true });
      const S = [g.x1 - 4, g.top, g.cz + 3];
      const sluice = Mc.place('sluice1', S, 0, {}, { locked: true });
      const drill = Mc.place('drill1', [S[0] - 0.95, g.top, S[2] - 1.2], 0, {}, { locked: true });
      Mc.layRun('copper', { m: intake.id, s: 0 }, { m: junc.id, s: 1 });
      Mc.layRun('copper', { m: junc.id, s: 3 }, { m: drill.id, s: 0 });
      Mc.layRun('copper', { m: junc.id, s: 2 }, { m: sluice.id, s: 0 });
      await R.tick(5); R.noRender(false);
      return { intake: intake.id, drill: drill.id, sluice: sluice.id, link: Mc.linkOf(drill.id) === sluice.id, valid: !Mc.requirement('intake1', intake.pos, 3) };
    });
    check(setup.valid && setup.link, 'line built: intake in the river, drill spout feeds the sluice hopper');
    const runFor = (secs, throttle, noWear) => p.evaluate(async ([secs, throttle, ids, noWear]) => {
      const R = __rill, Mc = R.machines; R.noRender(true);
      const intake = Mc.get(ids.intake), drill = Mc.get(ids.drill), sluice = Mc.get(ids.sluice);
      intake.state.throttle = throttle; drill.wear = 0; sluice.wear = 0;
      const w0 = sluice.washed || 0, d0 = drill.made || 0;
      const statuses = new Set();
      for (let t = 0; t < secs; t += 1) {
        for (let k = 0; k < 20; k++) Mc.tick(0.05);
        if (noWear) { drill.wear = 0; sluice.wear = 0; }
        if (t % 5 === 0) { await R.physics.step(30); R.items.update(); R.items.mergePiles(); }
        statuses.add(drill.status); statuses.add(sluice.status);
      }
      R.noRender(false);
      return { washed: (sluice.washed || 0) - w0, drilled: (drill.made || 0) - d0, statuses: [...statuses], drillSat: drill.flow.satisfaction, speed: drill.speed, wear: [drill.wear, sluice.wear], awake: R.physics.stats.awake, items: R.items.counts() };
    }, [secs, throttle, setup, !!noWear]);
    const full = await runFor(600, 1);
    console.log('     10 min full flow: ' + JSON.stringify(full));
    check(full.washed >= 105 && !full.statuses.includes('output blocked') && !full.statuses.includes('broken'), `ran 10 minutes unattended: ${full.drilled} loads drilled, ${full.washed} washed`);
    check(Math.abs(full.wear[0] - 0.2) < 0.02, `silt 6 wore the drill ${(full.wear[0] * 100).toFixed(0)}% in 10 minutes (2% a minute)`);
    // Throughput with and without half the intake, wear held at zero so only flow differs.
    const ref = await runFor(300, 1, true);
    const half = await runFor(300, 0.5, true);
    const fullRate = ref.washed / 300, halfRate = half.washed / 300;
    const want = (0.2 + 0.8 * (20 / 35)) / 1;
    console.log('     5 min half intake: ' + JSON.stringify(half));
    check(Math.abs(halfRate / fullRate - want) < 0.04, `half the intake: throughput ${(halfRate / fullRate).toFixed(3)}× (formula 0.2 + 0.8 × 20/35 = ${want.toFixed(3)}×)`);
    // Kiln, workbench, grinder: ore -> ingot -> ring with a cut gem.
    const craft = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, H = R.hands, T = R.places.TOWN; R.noRender(true);
      const kiln = Mc.place('kiln', [T.x + 4, T.y, T.z + 12], 2), bench = Mc.place('workbench', [T.x + 8, T.y, T.z + 12], 0), grinder = Mc.place('grinder', [T.x + 11, T.y, T.z + 12], 0);
      const give = (item) => { const e = R.items.spawn('nugget', [0, 0, 0], { item, loc: 'held' }); H.hand = e.id; return e; };
      give({ material: 'quartz', stage: 'ore', kg: 2 }); Mc.useOn(kiln.id, R.items.get(H.hand), H);
      give({ material: 'silver', stage: 'ore', kg: 4 }); Mc.useOn(kiln.id, R.items.get(H.hand), H);
      const mixed = give({ material: 'gold', stage: 'ore', kg: 1 }); Mc.useOn(kiln.id, mixed, H); const kept = !!R.items.get(mixed.id); R.items.remove(mixed.id); H.hand = null;
      for (let i = 0; i < 200; i++) Mc.tick(0.05);
      const ingot = Mc.pour(kiln.id);
      await R.physics.step(30); R.items.update();
      const ent = [...R.items.ents.values()].find(e => e.item && e.item.stage === 'ingot');
      // Cut a garnet on the wheel (3 clicks), keep it in the swap slot.
      const gem = give({ material: 'garnet', stage: 'uncut', kg: 1 }); for (let i = 0; i < 3; i++) Mc.useOn(grinder.id, gem, H);
      H.slot = gem.id; H.hand = null;
      R.items.take(ent.id, 'held'); H.hand = ent.id;
      Mc.useOn(bench.id, ent, H);
      const btn = [...document.querySelectorAll('#scr-panel .entry')].find(el => el.textContent.startsWith('Ring')).querySelector('button'); btn.click();
      const ring = R.items.get(H.hand);
      R.noRender(false);
      return { kept, ingot, cut: gem.item.stage, ring: ring && ring.item, value: ring && R.economy.quote(ring.item, 'assay') };
    });
    check(craft.kept && craft.ingot && Math.abs(craft.ingot.kg - 4) < 0.01, `kiln melted 4 kg silver into an ingot and refused gold without deleting it`);
    check(craft.cut === 'cut' && craft.ring && craft.ring.craft === 'ring' && craft.ring.gem, `workbench: hot silver ingot + cut garnet -> ${craft.ring && craft.ring.material} ring worth § ${craft.value && craft.value.toFixed(0)}`);
    // Pipes and machines survive a save round-trip.
    const saved = await p.evaluate(() => { const R = __rill; const s = R.snapshot(); return { n: s.machines.length, runs: s.machines.filter(m => m.run).length }; });
    check(saved.n >= 7 && saved.runs === 3, `snapshot keeps ${saved.n} machines and ${saved.runs} pipe runs`);
    // Picking up a belt drops its riders and leaves no lane entries behind
    // (they used to come back, tied to the items, when it was re-placed).
    const belt = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, g = R.places.CLAIMS[0];
      const b = Mc.place('belt', [g.x1 - 4, g.top, g.z1 - 3], 0, {});
      const n = R.items.spawn('nugget', [g.x1 - 4, g.top + 0.4, g.z1 - 3], { item: { material: 'iron', kg: 0.4, stage: 'ore' }, loc: 'held' });
      n.loc = 'belt'; b.state.lanes[0].push({ eid: n.id, s: 0.5 });
      const keep = b.state; Mc.remove(b.id);
      return { loc: R.items.get(n.id).loc, left: keep.lanes.reduce((a, q) => a + q.length, 0) };
    });
    check(belt.loc === 'loose' && belt.left === 0, `a removed belt drops its riders (${belt.loc}) and keeps no lane entries (${belt.left})`);
  }

  if (all || flags.has('--belts')) {
    // M5: dig -> wash -> sort -> smelt -> bin, all automatic, gated by a
    // fill sensor, a scale plate and a smelter pour, for 15 minutes.
    const line = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, g = R.places.CLAIMS[0]; R.noRender(true);
      for (const id of [...Mc.list.keys()]) Mc.remove(id);
      const z0 = g.z0 + 3, sx = g.x1 - 7.5, sz = z0 + 2, top = g.top;
      // Water: two intakes into a junction, a second junction to share it out.
      const zi = g.z0 + 1, rx = R.riverX(zi);
      const intakes = [];
      for (const dz of [0, 2.5]) { let ix = null; for (let x = rx - 12; x < rx; x += 0.25) if (!Mc.requirement('intake1', [x, R.height(x, zi + dz), zi + dz], 3)) { ix = x; break; } intakes.push(Mc.place('intake1', [ix, R.height(ix, zi + dz), zi + dz], 3, {}, { locked: true })); }
      const j1 = Mc.place('junction', [g.x1 - 1.5, top, zi + 1], 0, {}, { locked: true });
      const j2 = Mc.place('junction', [g.x1 - 3.5, top, zi + 1], 0, {}, { locked: true });
      const S = [sx, top, sz];
      const sluice = Mc.place('sluice1', S, 0, {}, { locked: true });
      const drill = Mc.place('drill1', [sx - 0.95, top, sz - 1.2], 0, {}, { locked: true });
      // Belt: drive, sorter (iron straight on, rest to the right), belt, smelter.
      const by = sz + 1.65;
      const drive = Mc.place('belt_drive', [sx, top, by + 0.5], 0, {}, { locked: true });
      const sorter = Mc.place('belt_sorter', [sx, top, by + 1.5], 0, { filter: { material: 'iron', stage: 'ore' } }, { locked: true });
      const b3 = Mc.place('belt', [sx, top, by + 2.5], 0, {}, { locked: true });
      const smelter = Mc.place('smelter', [sx, top, by + 3 + 0.9], 0, { fuel: 20 }, { locked: true });
      // Rejects: two belts east, into an ore bin.
      const b5 = Mc.place('belt', [sx + 1, top, by + 1.5], 1, {}, { locked: true });
      const b6 = Mc.place('belt', [sx + 2, top, by + 1.5], 1, {}, { locked: true });
      const bin = Mc.place('orebin', [sx + 3.0, top, by + 1.5], 0, {}, { locked: true });
      // Ingots drop onto a scale plate in front of the smelter.
      const sm = smelter.pos, scale = Mc.place('scale', [sx, top, sm[2] + 1.35], 0, {}, { locked: true });
      // Logic beside the smelter.
      const lx = sx - 1.6, lz = sm[2];
      const fill = Mc.place('fillsensor', [lx, top, lz - 0.6], 0), c1 = Mc.place('compare', [lx - 0.8, top, lz - 0.6], 0, { op: '>', value: 10 });
      const c2 = Mc.place('compare', [lx - 0.8, top, lz + 0.6], 0, { op: '<', value: 500 }), and = Mc.place('and', [lx - 1.6, top, lz], 0);
      const pulse = Mc.place('pulse', [lx - 2.4, top, lz], 0), pour = Mc.place('pourer', [lx + 0.2, top, lz + 0.8], 0);
      const cable = (a, b, port = 0) => Mc.layRun('cable', { m: a.id, s: R.machines._int.MACHINES[a.def].sockets.findIndex(s => s.kind === 'sig-out') }, { m: b.id, s: R.machines._int.MACHINES[b.def].sockets.findIndex(s => s.kind === 'sig-in' && s.port === port) });
      cable(fill, c1); cable(c1, and, 0); cable(scale, c2); cable(c2, and, 1); cable(and, pulse); cable(pulse, pour);
      // Pipes.
      Mc.layRun('copper', { m: intakes[0].id, s: 0 }, { m: j1.id, s: 1 }); Mc.layRun('copper', { m: intakes[1].id, s: 0 }, { m: j1.id, s: 0 });
      Mc.layRun('steel', { m: j1.id, s: 3 }, { m: j2.id, s: 1 });
      Mc.layRun('copper', { m: j1.id, s: 2 }, { m: drill.id, s: 0 });
      Mc.layRun('copper', { m: j2.id, s: 0 }, { m: sluice.id, s: 0 });
      Mc.layRun('copper', { m: j2.id, s: 2 }, { m: drive.id, s: 2 });
      Mc.layRun('copper', { m: j2.id, s: 3 }, { m: smelter.id, s: 2 });
      await R.tick(3);
      const L = (a, i = 1) => { const l = Mc.linkOfSocket(a.id, i); return l ? Mc.get(l.m).def : null; };
      R.noRender(false);
      return { ids: { drill: drill.id, sluice: sluice.id, smelter: smelter.id, bin: bin.id, scale: scale.id, belts: [drive.id, sorter.id, b3.id, b5.id, b6.id], and: and.id }, links: [L(sluice, 2), L(drive), L(sorter), L(sorter, 2), L(b3), L(b5), L(b6)] };
    });
    check(JSON.stringify(line.links) === JSON.stringify(['belt_drive', 'belt_sorter', 'belt', 'belt', 'smelter', 'belt', 'orebin']), `line links: sluice -> ${line.links.join(' -> ')}`);
    const run = await p.evaluate(async (ids) => {
      const R = __rill, Mc = R.machines; R.noRender(true);
      const get = (id) => Mc.get(id);
      let maxJam = 0, pours = 0, lastMolten = 0, sat = {};
      for (let t = 0; t < 900; t++) {
        for (let k = 0; k < 20; k++) { Mc.tick(0.05); const s = get(ids.smelter).state; if (s.molten < lastMolten - 0.01) pours++; lastMolten = s.molten; }
        for (const b of ids.belts) maxJam = Math.max(maxJam, get(b)._jam || 0);
        get(ids.drill).wear = 0; get(ids.sluice).wear = 0;
        if (t % 5 === 0) { await R.physics.step(30); R.items.update(); }
      }
      await R.physics.step(60); R.items.update();
      const binItems = get(ids.bin).state.contents;
      const ingots = [...R.items.ents.values()].filter(e => e.item && e.item.stage === 'ingot').map(e => e.item.kg);
      for (const id of [ids.drill, ids.sluice, ids.smelter, ids.belts[0]]) sat[get(id).def] = +(get(id).flow?.satisfaction ?? 0).toFixed(2);
      R.noRender(false);
      return { washed: get(ids.sluice).washed, maxJam: +maxJam.toFixed(1), pours, ingots, binN: binItems.length, binKinds: [...new Set(binItems.map(i => i.material))].join(','), scale: get(ids.scale).sig, sat, speed: get(ids.belts[0]).beltSpeed, smelter: get(ids.smelter).state };
    }, line.ids);
    console.log('     15 min line: ' + JSON.stringify({ ...run, ingots: run.ingots.length }));
    check(run.washed >= 150 && run.maxJam < 3 && run.pours >= 2 && run.ingots.length >= 2 && run.binN >= 40 && run.scale > 0, `15 minutes, no jams (longest hold ${run.maxJam} s): ${run.washed} loads washed, ${run.pours} automatic pours, ${run.ingots.length} iron ingots on the scale plate (${run.scale} kg), ${run.binN} items binned`);
    check(!run.binKinds.includes('iron'), 'the sorter kept all iron out of the bin');
    // Logic truth tables (held values, 10 Hz).
    const logic = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, T = R.places.TOWN; R.noRender(true);
      const D = Mc._int.MACHINES, at = (i, j) => [T.x + 30 + i * 0.8, T.y, T.z + 30 + j * 0.8];
      const out = (m) => D[m.def].sockets.findIndex(s => s.kind === 'sig-out'), inp = (m, port) => D[m.def].sockets.findIndex(s => s.kind === 'sig-in' && s.port === port);
      const wire = (a, b, port = 0) => Mc.layRun('cable', { m: a.id, s: out(a) }, { m: b.id, s: inp(b, port) });
      const A = Mc.place('dial', at(0, 0), 0, { value: 1 }), B = Mc.place('dial', at(0, 2), 0, { value: 0 });
      const gates = {};
      for (const [k, j] of [['and', 0], ['or', 1], ['not', 2], ['add', 3], ['sub', 4], ['compare', 5], ['latch', 6]]) { gates[k] = Mc.place(k, at(2, j), 0, k === 'compare' ? { op: '>' } : {}); wire(A, gates[k], 0); if (k !== 'not') wire(B, gates[k], 1); }
      const tick = (s) => { for (let i = 0; i < s * 20; i++) Mc.tick(0.05); };
      const read = () => Object.fromEntries(Object.entries(gates).map(([k, m]) => [k, m.sig]));
      tick(0.5); const r1 = read();
      B.state.value = 1; tick(0.5); const r2 = read();
      A.state.value = 3; B.state.value = 0; tick(0.5); const r3 = read();
      // Pulse and delay.
      const L = Mc.place('lever', at(4, 0), 0), P = Mc.place('pulse', at(5, 0), 0), Dl = Mc.place('delay', at(5, 1), 0, { delay: 1 });
      wire(L, P); wire(L, Dl);
      tick(0.3); L.state.on = true; tick(0.2); const pulseNow = P.sig, delayNow = Dl.sig; tick(0.3); const pulseLater = P.sig; tick(1.2); const delayLater = Dl.sig;
      const dbg = { pulseNow, pulseLater, delayNow, delayLater };
      R.noRender(false);
      return { r1, r2, r3, pulseNow, pulseLater, delayNow, delayLater };
    });
    const tt = logic.r1.and === 0 && logic.r1.or === 1 && logic.r1.not === 0 && logic.r1.add === 1 && logic.r1.sub === 1 && logic.r1.compare === 1 && logic.r2.and === 1 && logic.r2.latch === 0 && logic.r3.add === 3 && logic.r3.compare === 1 && logic.r1.latch === 1;
    check(tt, `logic gates: A=1,B=0 ${JSON.stringify(logic.r1)}; A=1,B=1 ${JSON.stringify(logic.r2)}`);
    check(logic.pulseNow === 1 && logic.pulseLater === 0 && logic.delayNow === 0 && logic.delayLater === 1, `pulse fires once on a rising edge; delay repeats its input 1 s later ${JSON.stringify([logic.pulseNow, logic.pulseLater, logic.delayNow, logic.delayLater])}`);
    // Jams are explicit and never delete: a belt feeding a full bin backs up.
    const jam = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, T = R.places.TOWN; R.noRender(true);
      const x = T.x + 30, z = T.z + 40, y = T.y;
      const drive = Mc.place('belt_drive', [x, y, z], 0), b2 = Mc.place('belt', [x, y, z + 1], 0), bin = Mc.place('cratebox', [x, y, z + 2.05], 0);
      // A drive with no water doesn't run: give it some through a quick intake-free hack (a header tank).
      const tank = Mc.place('headtank', [x - 2.5, y, z], 0, { level: 2000 }); Mc.layRun('copper', { m: tank.id, s: 0 }, { m: drive.id, s: 2 });
      bin.state.contents = Array.from({ length: 38 }, () => ({ material: 'copper', stage: 'ore', kg: 0.5 }));
      const fed = [];
      for (let i = 0; i < 8; i++) { const ok = Mc.accept(drive, { item: { material: 'gold', stage: 'ore', kg: 1 } }, 0); if (ok) fed.push(i); for (let k = 0; k < 10; k++) Mc.tick(0.05); }
      for (let k = 0; k < 200; k++) Mc.tick(0.05);
      const onBelts = [drive, b2].reduce((a, m) => a + m.state.lanes.reduce((x, q) => x + q.length, 0), 0);
      const gold = bin.state.contents.filter(i => i.material === 'gold').length;
      R.noRender(false);
      return { fed: fed.length, inBin: gold, onBelts, total: gold + onBelts, status: b2.status, jam: b2._jam };
    });
    check(jam.inBin === 2 && jam.total === jam.fed && jam.jam > 2, `full crate: ${jam.inBin} got in, ${jam.onBelts} wait on the belt (${jam.status}), none lost`);
    // Shaft power, stamp mill, gem cutter, splitter.
    const misc = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, g = R.places.CLAIMS[0]; R.noRender(true);
      const z = g.z1 + 6, rx = R.riverX(z);
      let wx = null; for (let x = rx - 10; x < rx; x += 0.25) if (!Mc.requirement('waterwheel', [x, R.height(x, z), z], 1)) { wx = x; break; }
      const wheel = Mc.place('waterwheel', [wx, R.height(wx, z), z], 1);
      const mill = Mc.place('stampmill', [wx - 5, R.height(wx - 5, z), z], 0);
      const ok = Mc.accept(mill, { load: { band: 2, depth: 8 }, oreClod: true }, 0);
      const before = [...R.items.ents.values()].filter(e => e.type === 'clod').length;
      for (let k = 0; k < 200; k++) Mc.tick(0.05);
      const after = [...R.items.ents.values()].filter(e => e.type === 'clod').length;
      // Gem cutter hook between a drive and an open end.
      const T = R.places.TOWN, x = T.x + 34, y = T.y, zz = T.z + 40;
      const tank = Mc.place('headtank', [x - 2.5, y, zz], 0, { level: 2000 });
      const drive = Mc.place('belt_drive', [x, y, zz], 0), cut = Mc.place('belt_gemcutter', [x, y, zz + 1], 0), split = Mc.place('belt_splitter', [x, y, zz + 2], 0);
      Mc.layRun('copper', { m: tank.id, s: 0 }, { m: drive.id, s: 2 });
      for (let i = 0; i < 4; i++) { Mc.accept(drive, { item: { material: 'garnet', stage: 'uncut', kg: 1 } }, 0); for (let k = 0; k < 8; k++) Mc.tick(0.05); }
      for (let k = 0; k < 120; k++) Mc.tick(0.05);
      await R.physics.step(30); R.items.update();
      const gems = [...R.items.ents.values()].filter(e => e.item && e.item.material === 'garnet' && e.loc === 'loose');
      const sx = split.pos[0];
      R.noRender(false);
      return { wheelUnits: wheel.shaftUnits, millSpeed: mill.speed, ok, made: after - before, cut: gems.filter(e => e.item.stage === 'cut').length, straight: gems.filter(e => Math.abs(e.pos[0] - sx) < 0.3).length, right: gems.filter(e => e.pos[0] > sx + 0.3).length };
    });
    check(misc.ok && misc.wheelUnits === 3 && misc.millSpeed > 0 && misc.made === 3, `water wheel drives the stamp mill: 1 ore clod -> ${misc.made} gravel loads`);
    check(misc.cut === 4 && misc.straight === 2 && misc.right === 2, `gem cutter hook cut ${misc.cut}/4 garnets; the splitter sent ${misc.straight} straight and ${misc.right} right`);
  }


  if (all || flags.has('--progress')) {
    // M6: claims, veins and the relic, the Ember Seam door, the lamp, the
    // Machine Shop, the gem cutter, the Pumphouse, the Excavator and rails.
    const pr = await p.evaluate(async () => {
      const R = __rill, E = R.economy.state, I = R.items, out = {};
      R.noRender(true);
      // Every claim is a voxel volume.
      out.claims = [...R.claims.volumes.keys()].join(',');
      // The relic: dig near its spot in the Old Cut.
      E.owned.push('oldcut', 'slate', 'glimmer', 'willow');
      const rs = R.relicSpot(), vol = R.claims.volumes.get('oldcut');
      R.hands.onDig(vol, rs, 0.4);
      out.relic = [...I.ents.values()].some(e => e.type === 'relic') && !!E.flags.relicFound;
      // Ember Seam door opens for the deed holder.
      E.standing = 30; E.scrip = 1e6;
      out.door0 = R.adit.doorOpen;
      out.buy = R.economy.buyClaim('ember');
      R.progress.update(1, [0, 0, 0]);
      out.door1 = R.adit.doorOpen;
      // Prospector's lamp: wear it, stand on the Glimmer vein.
      const lamp = I.spawn('lamp', [0, 50, 0], { loc: 'held' });
      R.hands.onWear(lamp);
      const gv = R.veins.glimmer;
      for (let i = 0; i < 20; i++) R.progress.update(0.1, [gv.x, gv.y + gv.r + 1, gv.z]);
      out.lampOn = +R.progress.signal.toFixed(2);
      for (let i = 0; i < 30; i++) R.progress.update(0.1, [gv.x + 60, gv.y + 30, gv.z + 60]);
      out.lampFar = +R.progress.signal.toFixed(2);
      // A load dug inside a vein carries it; a third of washes give its metal.
      const rng = R.lootRng; let hits = 0;
      for (let i = 0; i < 600; i++) if (R.rollLoot(rng, { band: 2, depth: 11, vein: { material: 'glimmerite' } }).material === 'glimmerite') hits++;
      out.veinShare = +(hits / 600).toFixed(3);
      // Machine Shop: blueprint, then ingots on the counter build a Drill Mk II.
      const W = R.workshop, c = W.counters.workshop;
      W.buyBlueprint(W.blueprints.find(b => b.id === 'drill2'));
      // Spread along the counter's own axis (counters face different ways).
      let slot = 0;
      const onTop = (at, h = 0.15) => { const u = ((slot++ % 7) - 3) * 0.4, y = at.top + h + Math.floor(slot / 7) * 0.12; return [at.x + Math.cos(at.yaw) * u, y, at.z - Math.sin(at.yaw) * u]; };
      const put = (mat, kg, at) => I.spawn('nugget', onTop(at), { item: { material: mat, stage: 'ingot', kg } });
      for (let i = 0; i < 4; i++) put('iron', 40, c);
      put('glimmerite', 12, c);
      await R.physics.step(30); I.update();
      const before = [...I.ents.values()].filter(e => e.type === 'crate').length;
      out.build = W.build(W.blueprints.find(b => b.id === 'drill2'));
      await R.physics.step(10); I.update();
      out.crates = [...I.ents.values()].filter(e => e.type === 'crate' && e.data.def === 'drill2').length - 0;
      out.leftover = W.ingotStock();
      void before;
      // The Mk II drill reaches band 2 in Willow Bend.
      const wv = R.places.CLAIMS.find(k => k.id === 'willow');
      // Standing 2 m down a pit: the 4.5 m tip is 6.5 m down, in the gravel bed.
      const d2 = R.machines.place('drill2', [wv.cx, wv.top - 2, wv.cz], 0);
      const tank = R.machines.place('headtank', [wv.cx - 3, wv.top - 2, wv.cz], 0, { level: 2000 });
      R.machines.layRun('copper', { m: tank.id, s: 0 }, { m: d2.id, s: 0 });
      for (let k = 0; k < 120; k++) R.machines.tick(0.05);
      out.drill2 = { band: d2.band, status: d2.status, made: d2.made || 0 };
      // Upper Falls gem cutter: cuts what's on the counter for a fee.
      const cc = W.counters.cutter;
      I.spawn('nugget', [cc.x, cc.top + 0.15, cc.z], { item: { material: 'garnet', stage: 'uncut', kg: 1.2 } });
      await R.physics.step(30); I.update();
      const preCut = new Set(I.ents.keys());
      const s0 = E.scrip; W.ringCutter(); await R.physics.step(10); I.update();
      out.cut = [...I.ents.entries()].filter(([id, e]) => !preCut.has(id) && e.item?.material === 'garnet' && e.item.stage === 'cut').length;
      out.cutFee = s0 - E.scrip;
      // Pumphouse: deliver each stage (the relic goes in stage 2).
      const pc = W.counters.pump, relic = [...I.ents.values()].find(e => e.type === 'relic');
      const stages = [];
      const NEEDS = R.pumpStages;
      for (let st = 0; st < NEEDS.length; st++) {
        slot = 0;
        for (const n of NEEDS[st].needs) {
          if (n.kind === 'ingot') for (let kg = n.kg; kg > 0; kg -= 50) put(n.material, Math.min(50, kg), pc);
          else if (n.kind === 'relic') I.place(relic.id, onTop(pc, 0.3));
          else for (let i = 0; i < n.n; i++) I.spawn('nugget', onTop(pc, 0.2), { item: n.kind === 'cut' ? { material: 'peridot', stage: 'cut', kg: 0.5 } : { material: 'silver', stage: 'crafted', craft: n.craft, kg: 2 } });
        }
        await R.physics.step(40); I.update();
        W.ringPump(); stages.push(E.flags.pump.stage);
        await R.physics.step(5); I.update();
      }
      out.pump = stages.join(',');
      out.finale = !!E.flags.finale && R.panels.current === 'finale';
      R.panels.close();
      out.goldwheel = [...I.ents.values()].some(e => e.type === 'crate' && e.data.def === 'goldwheel');
      // Excavator: dig three cells in a row in Willow Bend, then dump.
      const ex = await R.vehicles.spawn('excavator', [wv.cx - 6, wv.top + 1.5, wv.cz], Math.PI / 2);
      for (let i = 0; i < 60; i++) await R.tick(1);
      const cells = [];
      for (let k = 0; k < 3; k++) { ex.arm.t = 0; const t = R.heavy.excavatorTarget(ex); cells.push(`${t.x},${t.z}`); R.heavy.dig(ex); }
      out.hopper = ex.hopper.length; out.cells = cells.join(' ');
      const clods0 = [...I.ents.values()].filter(e => e.type === 'clod').length;
      R.heavy.dump(ex);
      out.dumped = [...I.ents.values()].filter(e => e.type === 'clod').length - clods0;
      // Rails and a tram: lay 20 m, set a tram on, load it, send it.
      const T = R.places.TOWN, a = [T.x - 36, 0, T.z + 47], b = [T.x - 16, 0, T.z + 47];
      a[1] = R.height(a[0], a[2]); b[1] = R.height(b[0], b[2]);
      const kit = I.spawn('railkit', [0, 50, 0], { loc: 'held', data: { n: 10 } });
      out.rails = R.heavy.layRails(kit, a, b);
      out.railLen = +(R.heavy.lines[0]?.len ?? 0).toFixed(1);
      if (out.rails !== 'ok') { R.noRender(false); return out; }
      const tk = I.spawn('tramkit', [0, 50, 0], { loc: 'held' }); R.hands.hand = tk.id;
      R.hands.useHook(tk, { p: [a[0] + 1, a[1], a[2]], dist: 3 });
      for (let i = 0; i < 20 && ![...R.vehicles.list.values()].some(v => v.tram); i++) await R.tick(1);
      const tram = [...R.vehicles.list.values()].find(v => v.tram);
      const nug = I.spawn('nugget', [0, 50, 0], { item: { material: 'gold', stage: 'ore', kg: 3 }, loc: 'held' });
      out.load = R.vehicles.addCargo(tram.id, nug, tram.group.localToWorld(new R.THREE.Vector3(0, 0.6, 0)).toArray());
      R.vehicles.enter(tram.id);
      for (let i = 0; i < 400; i++) R.heavy.update(0.05);
      out.tram = { s: +tram.tram.s.toFixed(1), moving: tram.tram.moving, x: +tram.group.position.x.toFixed(1), cargo: tram.cargo.length };
      out.bx = +b[0].toFixed(1);
      // A claim post calls your vehicle to it.
      const post = [...R.town.props.values()].find(q => q.kind === 'post' && q.claim === 'willow');
      R.town.interact(post.id); for (let i = 0; i < 30; i++) await R.tick(1);
      const hv = [...R.vehicles.list.values()].find(v => v.type === 'hauler');
      out.called = +Math.hypot(hv.group.position.x - post.at.x, hv.group.position.z - post.at.z).toFixed(1);
      // A pan of finds tips straight into the truck bed.
      {
        const H = R.hands, pan = I.spawn('pan', [0, 50, 0], { loc: 'held', data: { loads: [], contents: [] } });
        for (let i = 0; i < 3; i++) { const n = I.spawn('nugget', [0, 50, 0], { item: { material: 'copper', stage: 'ore', kg: 0.5 }, loc: 'contained' }); n.container = pan.id; pan.data.contents.push(n.id); }
        const old = H.hand; H.hand = pan.id;
        for (let i = 0; i < 30; i++) await R.tick(1);
        await R.frames(8); hv.group.updateMatrixWorld(true);
        const bed = new R.THREE.Vector3(0, hv.def.bed.y, -1).applyMatrix4(hv.group.matrixWorld);
        await R.teleport(bed.x + 2.2, bed.y + 0.6, bed.z); await R.tick(5);
        R.aimAt(bed.x, bed.y, bed.z); await R.refreshAim(); H.cooldown = 0;
        const c0 = hv.cargo.length; H.use();
        const ai = H.aimInfo(); out.panToBed = { added: hv.cargo.length - c0, left: pan.data.contents.length, kind: ai.kind, bed: !!ai.bed, dist: ai.dist, toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent).slice(-2) };
        H.hand = old;
      }
      // The guide: with its checks on, finished steps pay out.
      const g0s = R.guide.steps.length, s0g = E.scrip;
      E.flags.guide = { step: 0 }; R.hands.digs = 1; R.hands.washed = 1;
      R.guide.auth = true; for (let i = 0; i < 8; i++) R.guide.update(0.6, true); R.guide.auth = false;
      out.guide = { step: E.flags.guide.step, of: g0s, paid: E.scrip - s0g };
      // Audio: two drills 2 m apart share one voice; at most 8 voices play.
      R.audio.unlock();
      const L = { pos: [0, 0, 0], fwd: [0, 0, -1], up: [0, 1, 0] };
      R.audio.update(L, 5, [{ type: 'drill', pos: [3, 0, 0], level: 1 }, { type: 'drill', pos: [5, 0, 0], level: 1 }, { type: 'sluice', pos: [0, 0, 4], level: 1 }]);
      out.voices2 = R.audio.voices;
      R.audio.update(L, 5, Array.from({ length: 12 }, (_, i) => ({ type: 'drill', pos: [i * 8, 0, 0], level: 1 })));
      out.voicesMax = R.audio.voices;
      R.audio.update(L, 5, []);
      R.noRender(false);
      return out;
    });
    console.log('     progress: ' + JSON.stringify(pr));
    check(pr.claims === 'gravel,willow,oldcut,slate,glimmer,ember', `all six claims are voxel volumes (${pr.claims})`);
    check(pr.relic, 'digging by the relic in the Old Cut turns up the brass governor');
    check(!pr.door0 && pr.buy === 'ok' && pr.door1, 'the Ember Seam door opens once you own its deed');
    check(pr.lampOn > 0.85 && pr.lampFar < 0.05, `Prospector's Lamp signal ${pr.lampOn} on the Glimmer vein, ${pr.lampFar} far away`);
    check(Math.abs(pr.veinShare - (1 / 3 + 2 / 3 * 0.024)) < 0.06, `vein rolls give glimmerite ${(pr.veinShare * 100).toFixed(1)}% of the time (want ≈ 35%)`);
    check(pr.build === 'ok' && pr.crates === 1 && Math.abs((pr.leftover.iron || 0) - 10) < 0.01 && Math.abs((pr.leftover.glimmerite || 0) - 2) < 0.01, `Machine Shop built a Drill Mk II and gave back ${pr.leftover.iron} kg iron + ${pr.leftover.glimmerite} kg glimmerite`);
    check(pr.drill2.band === 2 && pr.drill2.made > 0, `Drill Mk II reaches band ${pr.drill2.band} (${pr.drill2.status}, ${pr.drill2.made} loads)`);
    check(pr.cut === 1 && pr.cutFee > 0, `Upper Falls gem cutter cut the garnet for § ${pr.cutFee}`);
    check(pr.pump === '1,2,3,4,5' && pr.finale && pr.goldwheel, `Pumphouse stages ${pr.pump}, end screen shown, gold-plated wheel delivered`);
    check(pr.hopper === 3 && pr.dumped === 3 && pr.cells.split(' ').every(c => c.split(',').every(v => Math.abs(v % 1) === 0.5)), `excavator dug 3 loads from world-grid cell ${pr.cells.split(' ')[0]} into its hopper and dumped them`);
    check(pr.panToBed.added === 3 && pr.panToBed.left === 0, `a pan of 3 finds tips into the truck bed (${pr.panToBed.added} added)`);
    check(pr.called < 6, `a claim post calls the hauler to it (${pr.called} m away)`);
    check(pr.guide.step >= 2 && pr.guide.paid >= 15, `the guide's first steps complete and pay (step ${pr.guide.step} of ${pr.guide.of}, § ${pr.guide.paid})`);
    check(pr.voices2 === 2 && pr.voicesMax === 8, `machine audio: 2 drills + a sluice play ${pr.voices2} voices; 12 drills are capped at ${pr.voicesMax}`);
    check(pr.rails === 'ok' && pr.railLen > 19 && pr.load === 'ok' && !pr.tram.moving && pr.tram.cargo === 1 && Math.abs((pr.tram?.x ?? 1e9) - pr.bx) < 1, `20 m of rails (${pr.rails}); the tram carried 1 nugget to the far end (x ${pr.tram?.x} vs ${pr.bx})`);
  }


  if (all || flags.has('--pacing')) {
    // M6 pacing (BUILD_BRIEF 3.6): fast-forward a drill + sluice of every tier
    // in its own claim and band with the real machine code, value the finds at
    // the Assay Office, and model hand washing with the same loot code.
    const pace = await p.evaluate(async () => {
      const R = __rill, Mc = R.machines, I = R.items, E = R.economy.state, C = (id) => R.places.CLAIMS.find(c => c.id === id);
      R.noRender(true);
      E.owned = ['gravel', 'willow', 'oldcut', 'slate', 'glimmer', 'ember'];
      const val = (it) => (it.material === 'quartz' ? 0 : R.itemValue(it));
      const tiers = [
        { t: 1, drill: 'drill1', sluice: 'sluice1', at: () => { const c = C('gravel'); return [c.cx, c.top, c.cz]; } },
        { t: 2, drill: 'drill2', sluice: 'sluice2', at: () => { const c = C('willow'); return [c.cx, c.top, c.cz]; } },
        { t: 3, drill: 'drill3', sluice: 'sluice3', at: () => { const c = C('slate'); return [c.x1 - 7, c.top - 10, c.cz]; } },
        { t: 4, drill: 'drill4', sluice: 'sluice4', at: () => { const c = C('ember'); return [c.x0 + 30, c.floor, c.cz]; } },
      ];
      const out = [];
      for (const T of tiers) {
        const S = T.at();
        const sl = Mc.place(T.sluice, S, 0, {}, { locked: true });
        const dr = Mc.place(T.drill, [S[0] - 0.95, S[1], S[2] - 1.2], 0, {}, { locked: true });
        const t1 = Mc.place('headtank', [S[0] - 4, S[1], S[2] - 1.2], 0, { level: 2000 }, { locked: true });
        const t2 = Mc.place('headtank', [S[0] + 3, S[1], S[2] - 1], 0, { level: 2000 }, { locked: true });
        Mc.layRun('glimmer', { m: t1.id, s: 0 }, { m: dr.id, s: 0 });
        Mc.layRun('glimmer', { m: t2.id, s: 0 }, { m: sl.id, s: 0 });
        const seen = new Set(I.ents.keys());
        const SECS = 120;
        for (let k = 0; k < SECS * 20; k++) { t1.state.level = t2.state.level = 2000; Mc.tick(0.05); if (k % 40 === 0) R.items.clock += 0; }
        let v = 0, n = 0;
        for (const [id, e] of I.ents) if (!seen.has(id) && e.item) { v += val(e.item); n++; }
        for (const k of sl.state.outq || []) v += val(k);
        // Rare finds make a 2-minute sample noisy, so price the measured wash
        // rate by the expected value of a load at the drill's band and depth
        // (20,000 rolls), plus the bonus-roll chance.
        let ev = 0; for (let i = 0; i < 20000; i++) ev += val(R.rollLoot(R.lootRng, { band: dr.band, depth: dr.depth }));
        ev /= 20000;
        const sat = dr.flow?.satisfaction ?? 0, perMin = (sl.washed || 0) / (SECS / 60) * ev * (1 + 0.1 * sat);
        out.push({ tier: T.t, band: dr.band, depth: +dr.depth.toFixed(1), status: dr.status + '/' + sl.status, washed: sl.washed || 0, finds: n, sampled: +(v / (SECS / 60)).toFixed(0), perLoad: +ev.toFixed(1), perMin: +perMin.toFixed(0), sat: +sat.toFixed(2) });
        for (const m of [sl, dr, t1, t2]) Mc.remove(m.id);
        for (const [id] of [...I.ents]) if (!seen.has(id)) I.remove(id);
      }
      // Hand washing, modelled: pan 2 loads at a time from a pit by the river.
      // Scoop 2 x 0.4 s, walk 10 m to the water and back at 4.2 m/s, dip, wash
      // 2 x 0.6 s, tip out 0.5 s; pick up each find (0.8 s); every 5 minutes a
      // 90 s round trip to sell. The pit deepens 0.017 m per load (3 x 3 m).
      // Measured over the first 20 minutes, the span the brief describes.
      // Expected value of a panned load at each depth (4,000 rolls per 0.25 m).
      const rng = R.lootRng, evCache = new Map(), findP = 0.94;
      const evAt = (d) => { const k = Math.round(d * 4); if (!evCache.has(k)) { let v = 0; for (let i = 0; i < 4000; i++) v += val(R.rollLoot(rng, { band: 1, depth: k / 4, pan: true })); evCache.set(k, v / 4000); } return evCache.get(k); };
      let tSec = 0, earned = 0, depth = 0.3, loads = 0, firstK = null;
      while (tSec * 1.3 < 20 * 60) {
        tSec += 0.8 + 2 * 10 / 4.2 + 0.3 + 1.2 + 0.5;
        for (let i = 0; i < 2; i++) { earned += evAt(depth); tSec += 0.8 * findP; loads++; depth = Math.min(5.5, depth + 0.017); }
        if (firstK == null && earned >= 1000) firstK = tSec;
      }
      tSec *= 1 + 90 / 300;
      R.noRender(false);
      return { tiers: out, hand: { perMin: +(earned / (tSec / 60)).toFixed(1), loadsPerMin: +(loads / (tSec / 60)).toFixed(1), firstKMin: +((firstK * 1.3) / 60).toFixed(1) } };
    });
    console.log('     pacing: ' + JSON.stringify(pace));
    const [t1, t2, t3, t4] = pace.tiers;
    check(pace.tiers.every((t, i) => t.band === i + 1 && t.washed > 20), `every tier runs in its band: ${pace.tiers.map(t => `Mk ${t.tier} band ${t.band} (${t.washed} washed)`).join(', ')}`);
    check(pace.hand.perMin >= 42 && pace.hand.perMin <= 78, `hand washing earns § ${pace.hand.perMin}/min (target 40–80, midpoint 60 ±30%); the first § 1,000 takes ${pace.hand.firstKMin} min (target 15–20)`);
    check(t1.perMin >= 105 && t1.perMin <= 195, `one Mk I drill + sluice earns § ${t1.perMin}/min (target 120–180, midpoint 150 ±30%)`);
    check(t2.perMin > t1.perMin && t3.perMin > t2.perMin && t4.perMin > t3.perMin, `each tier earns more: Mk II § ${t2.perMin}/min, Mk III § ${t3.perMin}/min, Mk IV § ${t4.perMin}/min`);
    const base = 20 * t1.perMin + 10 * t2.perMin;
    check(base / pace.hand.perMin >= 70 && base / pace.hand.perMin <= 130, `a late base of 20 Mk I + 10 Mk II drills earns § ${(base * 60).toLocaleString('en-GB')}/h, ${(base / pace.hand.perMin).toFixed(0)}× hand washing (target: two orders of magnitude, 100× ±30%)`);
  }


  if (all || flags.has('--coop')) {
    // M7: two browser contexts over a local relay that speaks the arcade
    // realtime protocol (tools/relay.mjs). Both dig in the same claim, the
    // guest carries an ingot to the truck, the host drives it, the guest sells
    // at the Assay Office, and the two worlds must agree.
    // The main page's busy world would starve the two co-op pages of CPU.
    if (!mainPage.isClosed()) await mainPage.close();
    const { startRelay } = await import('./relay.mjs');
    const relay = startRelay(8790);
    const init = () => { localStorage.setItem('arcade-acct', JSON.stringify({ name: 'Tester' + Math.floor(Math.random() * 90 + 10), token: 'test' })); window.ARCADE_RT_URL = 'ws://localhost:8790/ws'; window.RILL_RT_LIB = 'http://localhost:8765/tools/fixtures/rt.js'; };
    const openCtx = async () => { const c = await b.newContext({ viewport: { width: 960, height: 540 } }); await c.addInitScript(init); const pg = await c.newPage(); const e2 = []; pg.on('pageerror', e => e2.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/GL Driver|GPU stall/.test(m.text())) e2.push(m.text()); }); await pg.goto(URL); await pg.waitForFunction(() => window.__rill && window.__rill.ready, null, { timeout: 120000 }); await pg.evaluate(() => { __rill.play(); __rill.noRender(true); }); return { c, pg, e2 }; };
    if (!all) {} // the main page stays open; the co-op pages are separate contexts
    const H = await openCtx(), G = await openCtx();
    // Benchmark 5: a well-used world (dug claims, 400 loose finds, machines).
    const world = await H.pg.evaluate(async () => {
      const R = __rill, I = R.items, C = R.places.CLAIMS;
      for (const id of ['gravel', 'willow']) { const c = C.find(k => k.id === id); for (let i = 0; i < 120; i++) R.brush(id, [c.x0 + 2 + Math.random() * (c.w - 4), c.top - Math.random() * 2, c.z0 + 2 + Math.random() * (c.d - 4)], 0.6, 'dig', 2); }
      await R.claims.settle();
      const g = C[0];
      for (let i = 0; i < 400; i++) I.spawn('nugget', [g.x0 - 6 - Math.random() * 6, g.top + 1 + Math.random() * 2, g.z0 + Math.random() * 20], { item: { material: ['copper', 'iron', 'silver'][i % 3], stage: 'ore', kg: 0.3 + Math.random() } });
      const T = R.places.TOWN;
      for (let i = 0; i < 15; i++) R.machines.place(['sluice1', 'drill1', 'headtank', 'orebin', 'belt'][i % 5], [T.x + 30 + (i % 5) * 4, T.y, T.z + 40 + Math.floor(i / 5) * 5], 0);
      for (let i = 0; i < 120; i++) await R.tick(1);
      return { items: I.ents.size, chunks: [...R.claims.volumes.values()].reduce((a, v) => a + v.modified.size, 0), machines: R.machines.list.size };
    });
    const code = await H.pg.evaluate(() => __rill.coop.host());
    const t0 = Date.now();
    const jr = await G.pg.evaluate((c) => __rill.coop.join(c), code);
    await G.pg.waitForFunction(() => __rill.coop.ready, null, { timeout: 60000 });
    const joinMs = Date.now() - t0;
    const pk = await H.pg.evaluate(() => __rill.coop.stats);
    // Both dig in the Gravel Bar.
    const g0 = await H.pg.evaluate(() => { const c = __rill.places.CLAIMS[0]; return { x0: c.x0, z0: c.z0, cx: c.cx, cz: c.cz, top: c.top }; });
    await H.pg.evaluate(async (g) => { const R = __rill; await R.teleport(g.cx - 3, g.top + 1.2, g.cz); await R.tick(5); if (R.items.get(R.hands.hand)?.type !== 'shovel') R.hands.swap(); for (let i = 0; i < 4; i++) { R.aimAt(g.cx - 1 + i * 0.7, g.top - 0.05, g.cz); await R.refreshAim(); R.hands.cooldown = 0; R.hands.use(); const e = R.items.get(R.hands.hand); if (e.data.loads?.length) { R.aimAt(g.cx - 4, g.top, g.cz + 2); await R.refreshAim(); R.hands.use(); } } }, g0);
    await G.pg.evaluate(async (g) => { const R = __rill; await R.teleport(g.cx + 3, g.top + 1.2, g.cz + 2); await R.tick(5); for (let k = 0; k < 6 && R.items.get(R.hands.hand)?.type !== 'shovel'; k++) { R.hands.remote({ k: 'swap' }); await new Promise(r => setTimeout(r, 300)); } for (let i = 0; i < 4; i++) { R.aimAt(g.cx + 1 + i * 0.7, g.top - 0.05, g.cz + 2); R.hands.remote({ k: 'use' }); await new Promise(r => setTimeout(r, 250)); R.aimAt(g.cx + 4, g.top, g.cz + 4); R.hands.remote({ k: 'use' }); await new Promise(r => setTimeout(r, 250)); } }, g0);
    await H.pg.waitForTimeout(2500);
    const hashOf = () => { const v = __rill.claims.volumes.get('gravel'); let h = 0; for (let i = 0; i < v.dens.length; i++) h = (h * 31 + v.dens[i]) | 0; return { h, seq: v.editSeq }; };
    const hh = await H.pg.evaluate(hashOf), gh = await G.pg.evaluate(hashOf);
    // The guest carries an iron ingot to the truck and drops it in the bed.
    const truck = await H.pg.evaluate(() => { const v = [...__rill.vehicles.list.values()][0]; return { id: v.id, p: v.group.position.toArray() }; });
    await H.pg.evaluate((t) => { __rill.items.spawn('nugget', [t.p[0] + 3, __rill.height(t.p[0] + 3, t.p[2] + 3) + 0.4, t.p[2] + 3], { item: { material: 'iron', stage: 'ingot', kg: 5 } }); }, truck);
    await G.pg.waitForTimeout(1500);
    const carry = await G.pg.evaluate(async (t) => {
      const R = __rill, I = R.items, said = [];
      const t0 = R.hud.toast; R.hud.toast = (m, k) => { said.push(m); t0(m, k); };
      const ing = [...I.ents.values()].find(e => e.item?.material === 'iron' && e.item.stage === 'ingot');
      if (!ing) return { err: 'no ingot on the guest' };
      // Walk over, put the shovel down (the pan stays in the swap slot) and pick the ingot up.
      await R.teleport(ing.pos[0] - 1.5, ing.pos[1] + 1.2, ing.pos[2]); await R.tick(10);
      R.hands.remote({ k: 'drop', ring: [ing.pos[0] - 1.5, R.height(ing.pos[0] - 1.5, ing.pos[2] + 1.5), ing.pos[2] + 1.5], yaw: 0 });
      for (let i = 0; i < 20 && R.hands.hand != null; i++) await new Promise(r => setTimeout(r, 150));
      R.aimAt(...ing.pos); await R.refreshAim(); R.hands.remote({ k: 'pick' });
      for (let i = 0; i < 20 && R.hands.hand !== ing.id; i++) await new Promise(r => setTimeout(r, 150));
      if (R.hands.hand !== ing.id) return { err: 'pick up failed', hand: R.hands.hand };
      // Walk to the truck's side and drop it onto the bed.
      const v = R.vehicles.list.get(t.id); v.group.updateMatrixWorld(true); const bed = new R.THREE.Vector3(0, v.def.bed.y, -1).applyMatrix4(v.group.matrixWorld);
      await R.teleport(bed.x + 2.2, bed.y + 0.6, bed.z); await R.tick(10);
      R.aimAt(bed.x, bed.y, bed.z); await R.refreshAim(); R.hands.remote({ k: 'drop' });
      for (let i = 0; i < 20 && !v.cargo.includes(ing.id); i++) await new Promise(r => setTimeout(r, 150));
      return { ing: ing.id, inBed: v.cargo.includes(ing.id), said, hand: R.hands.hand };
    }, truck);
    // The host drives the truck about 25 m.
    await H.pg.evaluate(async () => { const R = __rill; const v = [...R.vehicles.list.values()][0]; const p = v.group.position; await R.teleport(p.x - 2, p.y + 1, p.z); R.vehicles.enter(v.id); R.input.simulate('forward', true); for (let i = 0; i < 150; i++) { await R.tick(1); R.vehicles.update(1 / 60, R.input, true); R.input.endFrame(); } R.input.simulate('forward', false); for (let i = 0; i < 240; i++) { await R.tick(1); R.vehicles.update(1 / 60, R.input, true); } await R.exitVehicle(); for (let i = 0; i < 60; i++) await R.tick(1); });
    await H.pg.waitForTimeout(1500);
    const vpose = () => { const v = [...__rill.vehicles.list.values()][0]; const st = __rill.physics.vehicles.get(v.id); return { p: (st?.p || v.group.position.toArray()), cargo: v.cargo.slice() }; };
    const hv = await H.pg.evaluate(vpose), gv = await G.pg.evaluate(vpose);
    // The guest takes the ingot out of the bed and sells it at the Assay Office.
    const sell = await G.pg.evaluate(async (ing) => {
      const R = __rill, v = [...R.vehicles.list.values()][0];
      R.bed.remote({ op: 'bedTake', vid: v.id, ent: ing });
      for (let i = 0; i < 20 && R.hands.hand !== ing; i++) await new Promise(r => setTimeout(r, 150));
      const c = R.town.counters.find(k => k.venue === 'assay');
      await R.teleport(c.x + Math.sin(c.yaw) * 1.6, c.top + 1.0, c.z + Math.cos(c.yaw) * 1.6); await R.tick(10);
      R.aimAt(c.x, c.top + 0.05, c.z); await R.refreshAim();
      // Drop at the counter (aim at it so the ring lands on top).
      R.hands.remote({ k: 'drop', ring: [c.x, c.top + 0.02, c.z], yaw: 0 });
      await new Promise(r => setTimeout(r, 1200));
      const bellId = c.bell, bp = R.town.props.get(bellId).pos;
      R.aimAt(...bp); await R.refreshAim(); R.hands.remote({ k: 'pick' });
      await new Promise(r => setTimeout(r, 1500));
      return { took: true };
    }, carry.ing);
    await H.pg.waitForTimeout(1500);
    // The guest places a machine from a crate the host put in their hands.
    const gidP = await G.pg.evaluate(() => __rill.net.id);
    await H.pg.evaluate((id) => { const R = __rill, g = R.coop.guests.get(id); const c = R.items.spawn('crate', [0, 50, 0], { loc: 'held', data: { def: 'junction', family: 'water' } }); if (g.hands.hand) { g.hands.slot = g.hands.hand; } g.hands.hand = c.id; }, gidP);
    await G.pg.waitForTimeout(1200);
    const placed = await G.pg.evaluate(async (g) => {
      const R = __rill, e = R.items.get(R.hands.hand); if (!e || e.type !== 'crate') return { err: 'no crate on the guest', hand: e?.type };
      const pos = [g.x0 - 8, R.height(g.x0 - 8, g.z0 + 2), g.z0 + 2];
      R.hands.remote({ k: 'place', def: 'junction', pos, rot: 0, ent: e.id });
      for (let i = 0; i < 20 && ![...R.machines.list.values()].some(m => m.def === 'junction'); i++) await new Promise(r => setTimeout(r, 150));
      return { guest: [...R.machines.list.values()].filter(m => m.def === 'junction').length };
    }, g0);
    const hostJ = await H.pg.evaluate(() => [...__rill.machines.list.values()].filter(m => m.def === 'junction').length);
    // A shop purchase from the guest's own panel goes through the host.
    await G.pg.evaluate(() => __rill.town.buy('store', 'bucket'));
    await H.pg.waitForTimeout(1500);
    const bought = await G.pg.evaluate(() => { const pad = __rill.town.pads.store; return [...__rill.items.ents.values()].filter(e => e.type === 'bucket' && Math.hypot(e.pos[0] - pad[0], e.pos[2] - pad[2]) < 3).length; });
    // Steady state: relay traffic over 5 s with both players idle in the world.
    const r0 = { ...relay.stats }; await H.pg.waitForTimeout(5000); const r1 = { ...relay.stats };
    const steady = { msgsPerSec: (r1.msgs - r0.msgs) / 5, kbPerSec: +((r1.bytes - r0.bytes) / 5 / 1024).toFixed(1) };
    const econ = () => ({ scrip: __rill.economy.state.scrip, earned: __rill.economy.state.totalEarned });
    const he = await H.pg.evaluate(econ), ge = await G.pg.evaluate(econ);
    // Loose things agree to within 0.1 m. Moving bodies stream only within
    // 60 m of a guest, so walk the guest back to the Gravel Bar first.
    await G.pg.evaluate(async (g) => { await __rill.teleport(g.x0 - 6, g.top + 1.5, g.z0 + 8); await __rill.tick(10); }, g0);
    await G.pg.waitForTimeout(2000);
    const poses = () => { const o = {}; for (const e of __rill.items.ents.values()) if (e.loc === 'loose') o[e.id] = e.pos; return o; };
    const hp = await H.pg.evaluate(poses), gp = await G.pg.evaluate(poses);
    // The host followed the guest's teleport back to the Gravel Bar.
    const gid = await G.pg.evaluate(() => __rill.net.id), gpos = await G.pg.evaluate(() => __rill.player.cur.toArray());
    const seen = await H.pg.evaluate((id) => __rill.coop.guests.get(id)?.pose.p, gid);
    const tpErr = seen ? Math.hypot(seen[0] - gpos[0], seen[2] - gpos[2]) : 1e9;
    // (bodies stream within 60 m of a guest, BUILD_BRIEF 7: compare those)
    const me = await G.pg.evaluate(() => __rill.player.cur.toArray());
    for (const id of Object.keys(hp)) if (Math.hypot(hp[id][0] - me[0], hp[id][2] - me[2]) > 55) delete hp[id];
    let worst = 0, missing = 0, n = 0;
    let worstId = null;
    for (const id in hp) { if (!gp[id]) { missing++; continue; } n++; const d = Math.hypot(hp[id][0] - gp[id][0], hp[id][1] - gp[id][1], hp[id][2] - gp[id][2]); if (d > worst) { worst = d; worstId = id; } }
    if (worst > 0.1) console.log('     worst: ' + JSON.stringify({ id: worstId, h: hp[worstId], g: gp[worstId], ent: await H.pg.evaluate((id) => { const e = __rill.items.get(+id); return { type: e.type, item: e.item, pose: __rill.physics.poses.get(+id) }; }, worstId), far: Object.keys(hp).filter(id => gp[id] && Math.hypot(hp[id][0] - gp[id][0], hp[id][2] - gp[id][2]) > 0.1).length }));
    const avatars = await G.pg.evaluate(() => __rill.coop.avatars.size);
    const rs = { ...relay.stats };
    console.log('     benchmark 5: ' + JSON.stringify({ world, pkgKB: +(pk.pkgBytes / 1024).toFixed(1), chunks: pk.pkgChunks, buildMs: +pk.pkgMs.toFixed(0), joinMs, steady, biggestMsg: relay.stats.biggest }));
    console.log('     coop: ' + JSON.stringify({ code, jr, joinMs, pk, dig: [hh, gh], carry, hv, gv, sell, he, ge, worst: +worst.toFixed(4), missing, n, avatars, relay: rs }));
    check(typeof code === 'string' && code.length === 5 && jr === 'ok', `hosted room ${code}; the guest joined in ${(joinMs / 1000).toFixed(1)} s with a ${(pk.pkgBytes / 1024).toFixed(0)} KB world package in ${pk.pkgChunks} chunks`);
    check(hh.h === gh.h && hh.seq > 0, `both dug in the Gravel Bar and the claim voxels match (hash ${hh.h})`);
    check(carry.inBed && hv.cargo.includes(carry.ing) && gv.cargo.includes(carry.ing), 'the guest carried an ingot to the truck bed; both see it there');
    check(Math.hypot(hv.p[0] - gv.p[0], hv.p[1] - gv.p[1], hv.p[2] - gv.p[2]) < 0.1, `the host drove the truck; positions agree within ${Math.hypot(hv.p[0] - gv.p[0], hv.p[1] - gv.p[1], hv.p[2] - gv.p[2]).toFixed(3)} m`);
    check(he.scrip === ge.scrip && he.earned > 0, `the guest sold the ingot and bought a bucket: Scrip § ${he.scrip} on both`);
    check(placed.guest === 1 && hostJ === 1, `the guest placed a machine from a crate; host and guest both have it (${JSON.stringify(placed)}, host ${hostJ})`);
    check(bought === 1, 'the bucket the guest bought appears on the store pad for the guest');
    check(missing === 0 && worst < 0.1 && n > 300, `${n} loose things within 55 m of the guest agree within ${worst.toFixed(3)} m (${missing} missing)`);
    check(avatars === 1, 'the guest sees the host\'s avatar');
    check(tpErr < 1, `the host follows a guest who teleported (${tpErr.toFixed(2)} m off)`);
    check(H.e2.length === 0 && G.e2.length === 0, 'no console errors in either context' + (H.e2.length + G.e2.length ? ': ' + [...H.e2, ...G.e2].slice(0, 4).join(' | ') : ''));
    // Screenshots: the co-op panel on the host, and each player seeing the other.
    await H.pg.evaluate(async (g) => { const R = __rill; R.noRender(false); R.setTime(0.45); await R.teleport(g.x0 - 2, g.top + 1.5, g.z0 + 4, Math.PI * 0.75, -0.05); }, g0);
    await G.pg.evaluate(async (g) => { const R = __rill; R.noRender(false); await R.teleport(g.x0 - 5, g.top + 1.5, g.z0 + 9, -Math.PI * 0.25, -0.05); await R.tick(4); }, g0);
    await H.pg.waitForTimeout(1500);
    await G.pg.screenshot({ path: `${out}/m7-guest-sees-host.png` });
    await H.pg.screenshot({ path: `${out}/m7-host-sees-guest.png` });
    await H.pg.evaluate(() => { __rill.menu.showPause(false); __rill.panels.close(); document.querySelector('#scr-pause')?.classList.add('hidden'); });
    await H.pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === 'Co-op'); if (b) b.click(); });
    await H.pg.waitForTimeout(400);
    await H.pg.screenshot({ path: `${out}/m7-coop-panel.png` });
    // The host leaves: the guest is told and the session ends.
    await H.c.close();
    let told = false;
    try { await G.pg.waitForFunction(() => __rill.panels.current === 'hostleft', null, { timeout: 15000 }); told = true; } catch (_) {}
    check(told, 'when the host leaves, the guest gets a "host left" message');
    await G.c.close(); await relay.close();
  }

  if (all || flags.has('--shots')) {
    // Fresh page: earlier sections leave a lot of machines and items about.
    if (!mainPage.isClosed()) await mainPage.close();
    const fresh = await open(b, +(process.env.SCALE || 1));
    const p = fresh.p;
    await p.evaluate(() => __rill.play());
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
    // M6: claims, Upper Falls, the Pumphouse, vehicles, the scanner, panels.
    const look = (x, y, z, ax, ay, az) => ({ x, y, z, yaw: Math.atan2(-(ax - x), -(az - z)), pitch: Math.atan2(ay - y, Math.hypot(ax - x, az - z)) });
    const Q = await p.evaluate(() => { const C = {}; for (const c of __rill.places.CLAIMS) C[c.id] = c; return { C, H: __rill.places.HAMLET, P: __rill.places.PUMPHOUSE }; });
    const oc = Q.C.oldcut, sl = Q.C.slate, em = Q.C.ember, H6 = Q.H, PH = Q.P;
    await shot(p, 'm6-oldcut', { ...look(oc.x0 - 14, oc.top + 16, oc.z0 - 8, oc.cx - 4, oc.top - 3, oc.cz + 2), t: 0.42 });
    await shot(p, 'm6-slate', { ...look(sl.x1 + 18, sl.top + 4, sl.z0 - 14, sl.cx, sl.top - 8, sl.cz), t: 0.45 });
    await shot(p, 'm6-upper-falls', { ...look(H6.x + 30, H6.y + 16, H6.z + 34, H6.x, H6.y + 1, H6.z), t: 0.55 });
    await shot(p, 'm6-pumphouse-ruin', { ...look(PH.x + 17, PH.y + 5, PH.z + 14, PH.x, PH.y + 1.5, PH.z), t: 0.55 });
    await p.evaluate(async () => {
      const R = __rill; R.economy.state.owned.push('ember'); R.economy.state.flags.pump = { stage: 5, got: {} }; R.workshop.applyStage();
      const T = R.places.TOWN, Hh = R.height;
      const s = { buggy: [T.x - 31, T.z + 40], survey: [T.x - 25, T.z + 40], hauler2: [T.x - 18, T.z + 40], excavator: [T.x - 10, T.z + 40] };
      for (const [t, [x, z]] of Object.entries(s)) await R.vehicles.spawn(t, [x, Hh(x, z) + 1.2, z], 0.5);
      for (let i = 0; i < 60; i++) await R.tick(1);
    });
    await shot(p, 'm6-pumphouse-restored', { ...look(PH.x + 16, PH.y + 4, PH.z - 15, PH.x - 2, PH.y + 3, PH.z), t: 0.3 });
    await shot(p, 'm6-pumphouse-wheel', { ...look(PH.x - 14, PH.y + 3, PH.z - 12, PH.x - 4, PH.y + 3, PH.z), t: 0.45 });
    await shot(p, 'm6-vehicles', { ...look(T.x - 24, T.y + 3.5, T.z + 51, T.x - 19, T.y + 0.5, T.z + 40), t: 0.5 });
    await shot(p, 'm6-ember-door', { x: A.x + 30, y: A.y + 1.6, z: A.z, yaw: -Math.PI / 2, pitch: -0.05, t: 0.5 });
    await shot(p, 'm6-ember-seam', { x: em.x0 + 2, y: em.floor + 1.6, z: em.cz, yaw: -Math.PI / 2, pitch: -0.1, t: 0.5 });
    // Driving the Survey Buggy shows the vein scanner.
    await p.evaluate(async () => { const R = __rill; R.fly(false); const v = [...R.vehicles.list.values()].find(k => k.type === 'survey'); const g = R.places.CLAIMS.find(c => c.id === 'willow'); await R.vehicles.teleport(v.id, [g.x0 - 6, R.height(g.x0 - 6, g.cz) + 1.2, g.cz], Math.PI / 2); for (let i = 0; i < 30; i++) await R.tick(1); const pp = v.group.position; await R.teleport(pp.x, pp.y + 1.5, pp.z); R.vehicles.enter(v.id); for (let i = 0; i < 30; i++) await R.tick(1); });
    await p.waitForTimeout(800); await p.screenshot({ path: `${out}/m6-survey-scanner.png` });
    await p.evaluate(async () => { await __rill.exitVehicle(); });
    // The Machine Shop panel and the end screen.
    await p.evaluate(() => { const R = __rill; R.economy.state.standing = 14; R.economy.state.scrip = 25000; R.workshop.openWorkshop(); });
    await p.waitForTimeout(300); await p.screenshot({ path: `${out}/m6-machine-shop.png` });
    await p.evaluate(() => { __rill.panels.close(); __rill.workshop.finale(true); });
    await p.waitForTimeout(300); await p.screenshot({ path: `${out}/m6-end-screen.png` });
    await p.evaluate(() => __rill.panels.close());
    // Settings panel.
    await p.evaluate(() => { __rill.menu.showPause(true); __rill.menu.openSettings(); });
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/settings.png` });
    await p.click('text=Keys', { timeout: 120000 }); await p.waitForTimeout(100);
    // Rebind "pick up" to KeyU through the UI and check it took.
    await p.click('button.key[data-act="pickup"][data-i="0"]', { timeout: 120000 });
    await p.keyboard.press('KeyU');
    const bound = await p.evaluate(() => __rill.settings.binds.pickup[0]);
    check(bound === 'KeyU', `rebinding pick up -> ${bound}`);
    await p.screenshot({ path: `${out}/settings-keys.png` });
    await p.click('text=Reset to defaults', { timeout: 120000 });
    await p.evaluate(() => { __rill.menu.closeSettings(); __rill.menu.showPause(false); });
    errs.push(...fresh.errs);
  }
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close();
  if (fails.length) { console.log(`${fails.length} check(s) failed`); process.exit(1); }
})();
