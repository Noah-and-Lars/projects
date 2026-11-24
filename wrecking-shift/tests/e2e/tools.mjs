// E2E: every player tool against the test yard, with screenshots (tests/e2e/out/t-*.png).
// Run standalone (`node tests/e2e/tools.mjs`, needs dist/) or from run.mjs via runToolTests().
import { assert, openGame, serve, shot } from './harness.mjs';
import { fileURLToPath } from 'node:url';

/** helpers injected into the page */
function installHelpers() {
  const G = window.__game;
  window.__t = {
    aim(x, y, z) {
      const e = G.player.eye;
      const dx = x - e.x, dy = y - e.y, dz = z - e.z;
      G.player.yaw = Math.atan2(-dx, -dz);
      G.player.pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
    },
    at(x, z, aimAt) { G.setView(x, 0.05, z, 0, 0); G.step(8); if (aimAt) window.__t.aim(...aimAt); },
    click(n = 1, gap = 2) { for (let i = 0; i < n; i++) { G.buttons(1); G.step(1); G.buttons(0); G.step(gap); } },
    hold(ticks) { G.buttons(1); G.step(ticks); G.buttons(0); G.step(1); },
    tool(id) { return G.game.belt.byId(id); },
    voxels(name) { let n = 0; for (const b of G.sim.bodies.values()) if (!name || b.name === name) n += b.grid.count; return n; },
    count(name) { let n = 0; for (const b of G.sim.bodies.values()) if (b.name === name) n++; return n; },
    painted() { let n = 0; for (const b of G.sim.bodies.values()) for (const v of b.grid.data) if (v && (v & 7) === 5) n++; return n; },
    explosions: 0,
  };
  G.sim.onExplosion.push(() => window.__t.explosions++);
  G.player.godMode = true;
}

export async function runToolTests(url, test) {
  const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
  await page.evaluate(installHelpers);
  const ev = (fn, arg) => page.evaluate(fn, arg);

  await test('tools: every tool selectable with a view model', async () => {
    const ids = await ev(() => window.__game.game.belt.tools.map((t) => t.id));
    assert(ids.length >= 12, 'tool count ' + ids.length);
    for (const id of ids) {
      const ok = await ev((id) => { window.__game.selectTool(id); window.__game.step(1); window.__game.render();
        window.__game.setView(0, 0.05, 6, 0, 0); window.__game.step(30); window.__game.render();
        const m = window.__game.game.ext.tools.vm; return window.__game.game.belt.current.id === id && m.root.visible && m.root.children.some((c) => c.visible); }, id);
      assert(ok, 'view model for ' + id);
      await shot(page, 't-vm-' + id);
    }
  });

  await test('tools: sledge swing (view model mid-swing)', async () => {
    await ev(() => { window.__t.at(0.4, -2.6, [0.4, 0.5, -4]); window.__game.selectTool('sledge'); });
    const v0 = await ev(() => window.__t.voxels('crate'));
    await ev(() => { window.__game.buttons(1); window.__game.step(30); window.__game.buttons(0); window.__game.step(32); window.__game.buttons(1); window.__game.step(6); window.__game.buttons(0); });
    await shot(page, 't-sledge');
    const v1 = await ev(() => window.__t.voxels('crate'));
    assert(v1 < v0, 'sledge broke crate voxels ' + (v0 - v1));
  });

  await test('tools: spray paints the house wall', async () => {
    await ev(() => { window.__t.at(-0.5, -5.8, [-0.5, 1.4, -8]); window.__game.selectTool('spray'); });
    await ev(() => { window.__game.buttons(1); for (let i = 0; i < 40; i++) { window.__game.player.yaw += 0.012; window.__game.step(1); } window.__game.buttons(0); });
    const p = await ev(() => window.__t.painted());
    assert(p > 40, 'painted voxels ' + p);
    await ev(() => { window.__game.buttons(1); window.__game.step(3); });
    await shot(page, 't-spray');
    await ev(() => window.__game.buttons(0));
  });

  await test('tools: extinguisher foam', async () => {
    await ev(() => { window.__t.at(-0.5, -5.8, [-0.5, 0.8, -8]); window.__game.selectTool('extinguisher'); window.__game.buttons(1); window.__game.step(12); });
    for (let i = 0; i < 3; i++) await ev(() => { window.__game.step(3); window.__game.render(); });
    await shot(page, 't-extinguisher');
    await ev(() => { window.__game.buttons(0); window.__game.step(2); });
  });

  await test('tools: blowtorch cuts the shed sheet metal', async () => {
    await ev(() => { window.__t.at(7.25, 0.6, [8.1, 1.3, 0.6]); window.__game.selectTool('blowtorch'); });
    const v0 = await ev(() => window.__t.voxels('shed'));
    await ev(() => { window.__game.buttons(1); for (let i = 0; i < 150; i++) { window.__game.player.pitch -= 0.0025; window.__game.step(1); } });
    await ev(() => { window.__game.render(); });
    await shot(page, 't-blowtorch');
    await ev(() => { window.__game.buttons(0); window.__game.step(2); });
    const v1 = await ev(() => window.__t.voxels('shed'));
    const fuel = await ev(() => window.__t.tool('blowtorch').ammoLabel);
    assert(v1 < v0 - 5, 'torch melted ' + (v0 - v1));
    assert(fuel.endsWith('s') && parseFloat(fuel) < 20, 'fuel ' + fuel);
  });

  await test('tools: pistol + shotgun break brick', async () => {
    await ev(() => { window.__t.at(-2.2, -5.0, [-2.2, 0.8, -8]); window.__game.selectTool('pistol'); });
    const v0 = await ev(() => window.__t.voxels('house'));
    await ev(() => window.__t.click(3, 16));
    await ev(() => window.__game.step(1));
    await shot(page, 't-pistol');
    const v1 = await ev(() => window.__t.voxels('house'));
    assert(v1 < v0, 'pistol holes ' + (v0 - v1));
    assert((await ev(() => window.__t.tool('pistol').ammo)) === 15, 'pistol ammo');
    await ev(() => { window.__t.aim(2.5, 1.0, -8); window.__game.selectTool('shotgun'); window.__game.step(10); window.__t.click(1, 1); });
    await shot(page, 't-shotgun');
    await ev(() => window.__game.step(30));
    const v2 = await ev(() => window.__t.voxels('house'));
    assert(v2 < v1 - 20, 'shotgun holes ' + (v1 - v2));
    assert((await ev(() => window.__t.tool('shotgun').ammo)) === 11, 'shotgun ammo');
  });

  await test('tools: plank from the ground to the house wall', async () => {
    await ev(() => { window.__t.at(1.6, -4.6, [1.6, 0, -5.9]); window.__game.selectTool('plank'); window.__t.click(1, 2); window.__t.aim(1.6, 1.5, -8); window.__game.step(2); });
    const pv = await ev(() => window.__t.tool('plank').preview);
    assert(pv && pv.valid, 'plank preview valid ' + JSON.stringify(pv));
    await shot(page, 't-plank-preview');
    await ev(() => { window.__t.click(1, 30); });
    const n = await ev(() => window.__t.count('plank'));
    const links = await ev(() => window.__t.tool('plank').links.length);
    assert(n === 1 && links === 2, `plank bodies ${n} links ${links}`);
    await ev(() => { window.__t.at(4.0, -3.0, [1.6, 0.8, -6.8]); });
    await shot(page, 't-plank');
  });

  await test('tools: cable from the house to a crate', async () => {
    await ev(() => { window.__t.at(-1.2, -5.2, [-1.6, 1.8, -8]); window.__game.selectTool('cable'); window.__t.click(1, 2); window.__t.aim(0.4, 0.5, -3.6); window.__game.step(2); });
    await shot(page, 't-cable-preview');
    await ev(() => window.__t.click(1, 2));
    const ropes = await ev(() => window.__t.tool('cable').ropes.length);
    assert(ropes === 1, 'ropes ' + ropes);
    await ev(() => { window.__t.at(3.5, -2.0, [-0.6, 1.0, -6]); window.__game.step(30); });
    await shot(page, 't-cable');
  });

  await test('tools: grab lifts a crate', async () => {
    // loose chunks from the earlier hammer test would be grabbed instead of the crate: clear them
    await ev(() => { const s = window.__game.sim; for (const b of [...s.bodies.values()]) if (b.user.chip) s.removeBody(b); });
    await ev(() => { window.__t.at(0.9, -2.0, [1.2, 0.3, -3.6]); window.__game.selectTool('pistol'); });
    const y0 = await ev(() => { const b = [...window.__game.sim.bodies.values()].find((b) => b.name === 'crate' && b.grid.count > 300 && b.rb.worldCom().y < 0.6); window.__t.grabbed = b; return b.rb.worldCom().y; });
    await ev(() => { window.__t.aim(...Object.values(window.__t.grabbed.center())); window.__game.buttons(4); window.__game.step(3); window.__game.player.pitch = 0.0; window.__game.step(40); });
    const st = await ev(() => ({ holding: window.__game.game.belt.grab.holding, y: window.__t.grabbed.rb.worldCom().y }));
    await shot(page, 't-grab');
    assert(st.holding && st.y > y0 + 0.4, 'grab ' + JSON.stringify(st) + ' y0 ' + y0);
    const ammo0 = await ev(() => window.__t.tool('pistol').ammo);
    await ev(() => { window.__game.buttons(5); window.__game.step(2); window.__game.buttons(0); window.__game.step(30); });
    const after = await ev(() => ({ holding: window.__game.game.belt.grab.holding, ammo: window.__t.tool('pistol').ammo }));
    assert(!after.holding && after.ammo === ammo0, 'throw without shooting ' + JSON.stringify(after));
  });

  await test('tools: pipe bomb thrown, fuse, explosion', async () => {
    await ev(() => { window.__t.at(-6, 6, null); window.__game.player.yaw = Math.PI * 0.75; window.__game.player.pitch = 0.25; window.__game.selectTool('pipebomb'); });
    const e0 = await ev(() => window.__t.explosions);
    await ev(() => { window.__t.click(1, 10); });
    await shot(page, 't-pipebomb-flight');
    await ev(() => window.__game.step(150));
    const e1 = await ev(() => window.__t.explosions);
    assert(e1 === e0 + 1, 'pipe bomb exploded ' + (e1 - e0));
    assert((await ev(() => window.__t.tool('pipebomb').ammo)) === 5, 'pipebomb ammo');
  });

  await test('tools: bomb on the house wall', async () => {
    await ev(() => { window.__t.at(2.6, -6.3, [2.6, 0.9, -8]); window.__game.selectTool('bomb'); window.__t.click(1, 2); window.__t.at(4.5, -3.5, [2.6, 0.9, -8]); });
    const placed = await ev(() => window.__t.tool('bomb').live.length);
    assert(placed === 1, 'bomb placed');
    await shot(page, 't-bomb-placed');
    const v0 = await ev(() => window.__t.voxels('house'));
    const e0 = await ev(() => window.__t.explosions);
    await ev(() => window.__game.step(200));
    const v1 = await ev(() => window.__t.voxels('house'));
    assert((await ev(() => window.__t.explosions)) === e0 + 1, 'bomb exploded');
    assert(v1 < v0 - 200, 'bomb hole ' + (v0 - v1));
    await shot(page, 't-bomb-after');
  });

  await test('tools: rocket at the house', async () => {
    await ev(() => { window.__t.at(-1.5, 3.0, [-2.5, 1.6, -8]); window.__game.selectTool('rocket'); window.__t.click(1, 6); });
    const n = await ev(() => window.__t.tool('rocket').projectiles.length);
    assert(n === 1, 'rocket in flight');
    await shot(page, 't-rocket-flight');
    const v0 = await ev(() => window.__t.voxels('house'));
    await ev(() => window.__game.step(40));
    const v1 = await ev(() => window.__t.voxels('house'));
    assert(v1 < v0 - 200, 'rocket hole ' + (v0 - v1));
    await ev(() => window.__game.step(20));
    await shot(page, 't-rocket-after');
  });

  await test('tools: nitro on the shed, shot from a distance', async () => {
    await ev(() => { window.__t.at(11.5, 3.6, [11.5, 1.0, 2.7]); window.__game.selectTool('nitro'); window.__t.click(1, 10); });
    const live = await ev(() => window.__t.tool('nitro').placed.length);
    assert(live === 1, 'nitro placed');
    await ev(() => { const b = window.__t.tool('nitro').placed[0].body; window.__game.setView(11.0, 0.05, 9.0, 0, 0); window.__game.step(5); window.__t.aim(...Object.values(b.center())); window.__game.render(); });
    await shot(page, 't-nitro-placed');
    const e0 = await ev(() => window.__t.explosions);
    await ev(() => { window.__game.selectTool('pistol'); window.__game.step(10); window.__t.click(1, 30); });
    assert((await ev(() => window.__t.explosions)) > e0, 'nitro went off');
    await shot(page, 't-nitro-after');
  });

  await test('tools: no console errors', async () => assert(errors.length === 0, 'console errors: ' + errors.join('\n')));
  await browser.close();
}

// standalone
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { srv, url } = await serve();
  let failed = 0;
  const test = async (name, fn) => {
    const t = Date.now();
    try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
    catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
  };
  await runToolTests(url, test);
  srv.close();
  if (failed) { console.log(failed + ' tool e2e test(s) failed'); process.exit(1); }
  console.log('tool e2e ok');
}
