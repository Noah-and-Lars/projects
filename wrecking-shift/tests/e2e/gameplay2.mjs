// Power upgrades in the workshop, the booster can, the loader bucket (raise / lower / quickload) and gamepad input.
// Screenshots: tests/e2e/out/g2-*.png
import { assert, openGame, serve, shot } from './harness.mjs';

export async function runGameplay2Tests(url, test) {
  await test('workshop: power upgrades are listed and can be bought; they reach the belt', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    const r = await page.evaluate(() => {
      localStorage.clear();
      const G = window.__game, p = G.game.ext.progress;
      p.data.cash = 2500;
      p.data.missions.housewarming = { best: 1000, completed: true, plays: 1 };
      G.ui.openMenu('shop');
      return { rows: document.querySelectorAll('.ws-power tr[data-power]').length };
    });
    assert(r.rows >= 6, 'power rows: ' + JSON.stringify(r));
    await page.click('[data-act=buypow][data-id="bomb.blast"]');
    await page.click('[data-act=buypow][data-id="sledge.head"]');
    await page.evaluate(() => document.querySelector('.ws-power')?.scrollIntoView());
    await shot(page, 'g2-00-shop-power');
    const s = await page.evaluate(() => {
      const G = window.__game, p = G.game.ext.progress;
      G.game.ext.mission.startSandbox('testyard');
      G.ui.closeMenus();
      G.step(2);
      return { bomb: p.powerLevel('bomb.blast'), sledge: p.powerLevel('sledge.head'), size: G.game.belt.byId('bomb').size, bite: G.game.belt.byId('sledge').bite, cash: p.cash };
    });
    assert(s.bomb === 1 && s.sledge === 1 && Math.abs(s.size - 1.85) < 1e-6 && Math.abs(s.bite - 0.68) < 1e-6, 'bought + applied in the sandbox: ' + JSON.stringify(s));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('booster can: stick on a car, it lights and drives the car; flame + smoke drawn', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    const r = await page.evaluate(() => {
      const G = window.__game, V = G.game.ext.vehicles;
      const car = window.__car = V.spawn('hatchback', 9, 0, 13, 0); // facing -Z
      G.step(60);
      car.startEngine(); car.seated = true;
      const c = car.com;
      // stand behind the tail, aim at it
      G.setView(c.x, 0.05, c.z + 4.2, 0, -0.32);
      G.selectTool('booster');
      G.step(2);
      G.buttons(1); G.step(1); G.buttons(0); G.step(1);
      const tool = G.game.belt.current;
      const placed = tool.live.length;
      G.step(62); // fuse 1 s, then burning
      const z0 = car.com.z;
      // follow the car from behind and to the side, drawing every tick so the flame and smoke build up
      for (let i = 0; i < 16; i++) { G.step(1); const cc = car.com; G.setView(cc.x + 3.4, 0.05, cc.z + 3.6, 0.75, -0.2); G.render(); }
      return { placed, lit: tool.live[0]?.lit, moved: z0 - car.com.z, tool: tool.id, x: c.x, z: c.z };
    });
    assert(r.placed === 1 && r.lit, 'placed and lit: ' + JSON.stringify(r));
    await shot(page, 'g2-01-booster-burn');
    const moved = await page.evaluate(() => { const G = window.__game, car = window.__car, z0 = car.com.z; G.step(30); return z0 - car.com.z; });
    assert(moved > 0.3, 'pushes the car forward: ' + JSON.stringify({ ...r, moved }));
    const after = await page.evaluate(() => { const G = window.__game; G.step(300); return G.game.belt.current.live.length; });
    assert(after === 0, 'burnt-out can removed');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('loader bucket: R raises, F lowers, quickload keeps the pose', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    const r = await page.evaluate(() => {
      const G = window.__game, V = G.game.ext.vehicles;
      const l = V.spawn('loader', 12, 0, 14, Math.PI / 2);
      G.step(90);
      const c = l.com;
      G.setView(c.x - 3, 0.05, c.z, -Math.PI / 2, -0.2);
      G.step(2);
      V.enter(l);
      V.camMode = 'chase';
      G.key('KeyR', true); G.step(100); G.key('KeyR', false); G.step(20);
      const up = l.arm.angle(l.body);
      return { up, hint: document.getElementById('vehicle-hud')?.textContent ?? '' };
    });
    assert(r.up > 0.6, 'raised: ' + JSON.stringify(r));
    await page.evaluate(() => window.__game.render());
    await shot(page, 'g2-02-loader-raised-chase');
    // side view on foot: the bucket held up with the engine off, then back in the seat
    await page.evaluate(() => {
      const G = window.__game, V = G.game.ext.vehicles, l = V.current;
      V.exit();
      const c = l.com, f = l.forward, r = l.right;
      G.setView(c.x + r.x * 7 + f.x * 1.5, 0.05, c.z + r.z * 7 + f.z * 1.5, Math.atan2(r.x, r.z), -0.05);
      G.step(10);
      G.render();
    });
    await shot(page, 'g2-02-loader-raised-side');
    const still = await page.evaluate(() => {
      const G = window.__game, V = G.game.ext.vehicles, l = V.list.find((v) => v.name === 'loader');
      const a = l.arm.angle(l.body);
      const c = l.com;
      G.setView(c.x - 3, 0.05, c.z, -Math.PI / 2, -0.2); G.step(2);
      V.enter(l); G.step(2);
      return a;
    });
    assert(still > 0.6, 'holds the bucket up with the engine off: ' + still);
    const q = await page.evaluate(() => {
      const G = window.__game, V = G.game.ext.vehicles;
      const saved = G.game.quicksave();
      const t0 = V.current.arm.target;
      G.key('KeyF', true); G.step(150); G.key('KeyF', false); G.step(20);
      const down = V.current.arm.angle(V.current.body);
      const loaded = G.game.quickload();
      G.step(30);
      const V2 = G.game.ext.vehicles; // a new sim + vehicle system after the load
      const v = V2.list.find((x) => x.name === 'loader');
      return { saved, loaded, down, t0, t1: v?.arm?.target, a1: v?.arm?.angle(v.body), seated: !!V2.current };
    });
    assert(q.saved && q.loaded && q.down < -0.05, 'lowered then reloaded: ' + JSON.stringify(q));
    assert(Math.abs(q.t1 - q.t0) < 1e-6 && q.a1 > 0.55 && q.seated, 'arm pose restored: ' + JSON.stringify(q));
    await page.evaluate(() => window.__game.render());
    await shot(page, 'g2-03-loader-quickload');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('gamepad: stick walks, trigger uses the tool, Start pauses, d-pad + A work the menu', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => {
      const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      window.__pad = pad;
      window.__setPad = (o) => {
        pad.axes = o.axes ?? [0, 0, 0, 0];
        pad.buttons.forEach((b, i) => { const v = o.b?.[i] ?? 0; b.value = v; b.pressed = v > 0.5; });
      };
      navigator.getGamepads = () => [pad];
      // one real frame = poll + input gather + fixed steps
      window.__frame = (n = 1) => { const G = window.__game.game; for (let i = 0; i < n; i++) { G.input.poll(1 / 60); G['gatherInput'](); G.fixedStep(); G.input.endFrame(); } };
    });
    const walk = await page.evaluate(() => {
      const G = window.__game;
      G.setView(0, 0.05, 6, 0, 0);
      G.step(5);
      const z0 = G.player.pos.z, yaw0 = G.player.yaw;
      window.__setPad({ axes: [0, -1, 0.8, 0] });
      window.__frame(60);
      return { dz: G.player.pos.z - z0, dyaw: G.player.yaw - yaw0 };
    });
    assert(walk.dz < -1.5 && walk.dyaw < -0.2, 'walks forward and turns right: ' + JSON.stringify(walk));
    const fire = await page.evaluate(() => {
      const G = window.__game;
      window.__setPad({});
      window.__frame(2);
      G.selectTool('pistol');
      const a0 = G.game.belt.current.ammo;
      window.__setPad({ b: { 7: 1 } }); window.__frame(2); window.__setPad({}); window.__frame(2);
      window.__setPad({ b: { 5: 1 } }); window.__frame(1); window.__setPad({}); window.__frame(1);
      return { shot: a0 - G.game.belt.byId('pistol').ammo, tool: G.game.belt.current.id };
    });
    assert(fire.shot === 1 && fire.tool !== 'pistol', 'RT fires once, RB cycles: ' + JSON.stringify(fire));
    const menu = await page.evaluate(() => {
      const G = window.__game;
      G.ui.state && G.ui.state();
      // start a sandbox so Start opens the pause menu (play session)
      G.game.ext.mission.startSandbox('testyard'); G.ui.closeMenus(); G.step(2);
      window.__setPad({ b: { 9: 1 } }); window.__frame(1); window.__setPad({}); window.__frame(1);
      const open = !!document.querySelector('#ui .ws-menu');
      window.__setPad({ b: { 13: 1 } }); window.__frame(1); window.__setPad({}); window.__frame(1);
      window.__setPad({ b: { 13: 1 } }); window.__frame(1); window.__setPad({}); window.__frame(1);
      const focused = document.activeElement?.textContent ?? '';
      return { open, focused, isBtn: document.activeElement?.tagName };
    });
    assert(menu.open && menu.isBtn === 'BUTTON', 'pause open + a focused button: ' + JSON.stringify(menu));
    await shot(page, 'g2-04-pad-pause-focus');
    const closed = await page.evaluate(() => {
      // focus "Resume" (first button) and press A
      const first = [...document.querySelectorAll('#ui .ws-menu button')].find((b) => /resume/i.test(b.textContent));
      first?.focus();
      window.__setPad({ b: { 0: 1 } }); window.__frame(1); window.__setPad({}); window.__frame(1);
      return !document.querySelector('#ui .ws-menu');
    });
    assert(closed, 'A on Resume closes the pause menu');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}

// standalone: node tests/e2e/gameplay2.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const { srv, url } = await serve();
  let failed = 0;
  await runGameplay2Tests(url, async (name, fn) => {
    const t = Date.now();
    try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
    catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.stack ?? e}`); }
  });
  srv.close();
  if (failed) { console.log(failed + ' failed'); process.exit(1); }
}
