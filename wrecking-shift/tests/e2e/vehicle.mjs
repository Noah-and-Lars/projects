// Vehicle e2e: enter the escape van with E, drive (W), chase + first-person screenshots, ram the house, exit.
import { assert, openGame, serve, shot } from './harness.mjs';

export async function vehicleTests(url, test) {
  await test('vehicle: enter, drive, cameras, ram, exit', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    const g = (fn, arg) => page.evaluate(fn, arg);
    // record vehicle events the way HUD / audio modules receive them
    await g(() => {
      window.__vehEvents = [];
      window.__game.game.modules.push({ onEvents(_g, evs) { for (const e of evs) if (e.type === 'custom' && e.name.startsWith('vehicle:')) window.__vehEvents.push(e.name); } });
      window.__game.step(60);
    });
    const list = await g(() => window.__game.game.ext.vehicles.list.map((v) => ({ name: v.name, pos: v.com, up: v.upright, speed: v.speed, g: v.grounded })));
    assert(list.length >= 2, 'two vehicles in the test yard: ' + JSON.stringify(list));
    for (const v of list) assert(v.up > 0.98 && Math.abs(v.speed) < 0.1 && v.g === 4, 'vehicle rests on its wheels: ' + JSON.stringify(v));
    // stand beside the van, look at it
    await g(() => {
      const G = window.__game;
      const van = G.game.ext.vehicles.list.find((v) => v.name === 'van');
      const c = van.com;
      G.setView(c.x + 2.2, 0.05, c.z, Math.PI / 2, -0.25); // yaw pi/2 looks toward -X
      G.step(5);
    });
    await shot(page, 'v0-outside');
    const hint = await g(() => window.__game.game.ext.vehicles.hint);
    assert(/van/.test(hint), 'prompt shows when looking at the van: ' + hint);
    await g(() => { window.__game.key('KeyE', true); window.__game.step(1); window.__game.key('KeyE', false); window.__game.step(30); });
    let s = await g(() => { const V = window.__game.game.ext.vehicles; return { cur: V.current && V.current.name, seated: window.__game.player.seated, tools: window.__game.game.toolsEnabled }; });
    assert(s.cur === 'van' && s.seated && !s.tools, 'entered the van: ' + JSON.stringify(s));
    await shot(page, 'v1-chase-parked');
    // drive toward the house (-Z): hold W
    const z0 = await g(() => window.__game.game.ext.vehicles.current.com.z);
    await g(() => { window.__game.key('KeyW', true); window.__game.step(80); });
    s = await g(() => { const v = window.__game.game.ext.vehicles.current; return { z: v.com.z, kmh: v.speedKmh, up: v.upright, ppos: window.__game.player.pos }; });
    assert(s.kmh > 15 && s.z < z0 - 3, 'van drives forward: ' + JSON.stringify(s) + ' z0 ' + z0);
    await shot(page, 'v2-chase-driving');
    await g(() => { window.__game.key('KeyV', true); window.__game.step(1); window.__game.key('KeyV', false); });
    await shot(page, 'v3-firstperson');
    await g(() => { window.__game.key('KeyV', true); window.__game.step(1); window.__game.key('KeyV', false); });
    // ram the back wall of the house
    const v0 = await g(() => window.__game.stats().voxels);
    for (let i = 0; i < 12; i++) {
      const st = await g(() => { window.__game.step(10); const v = window.__game.game.ext.vehicles.current; return { z: v.com.z, kmh: v.speedKmh }; });
      if (st.z < -6.5) break;
    }
    await shot(page, 'v4-ram');
    await g(() => { window.__game.key('KeyW', false); window.__game.step(40); });
    const v1 = await g(() => window.__game.stats().voxels);
    s = await g(() => { const v = window.__game.game.ext.vehicles.current; return { z: v.com.z, kmh: v.speedKmh, health: v.health }; });
    assert(v1 < v0 - 200, 'ramming broke the house wall: ' + (v0 - v1) + ' ' + JSON.stringify(s));
    await shot(page, 'v5-after-ram');
    // exit
    await g(() => { window.__game.key('KeyE', true); window.__game.step(1); window.__game.key('KeyE', false); window.__game.step(20); });
    s = await g(() => { const G = window.__game; return { cur: G.game.ext.vehicles.current, seated: G.player.seated, tools: G.game.toolsEnabled, cam: G.game.cameraOverride, pos: G.player.pos, grounded: G.player.grounded }; });
    assert(!s.cur && !s.seated && s.tools && !s.cam && s.grounded, 'exited: ' + JSON.stringify(s));
    // look back at the van from where we got out
    await g(() => {
      const G = window.__game, p = G.player, c = G.game.ext.vehicles.list.find((v) => v.name === 'van').com;
      p.yaw = Math.atan2(-(c.x - p.pos.x), -(c.z - p.pos.z)); p.pitch = -0.15;
    });
    await shot(page, 'v6-exited');
    const ev = await g(() => window.__vehEvents);
    for (const n of ['vehicle:enter', 'vehicle:crash', 'vehicle:exit']) assert(ev.includes(n), 'event ' + n + ' emitted: ' + ev.join(','));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}

// standalone: node tests/e2e/vehicle.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const { srv, url } = await serve();
  let failed = 0;
  await vehicleTests(url, async (name, fn) => {
    const t = Date.now();
    try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
    catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
  });
  srv.close();
  if (failed) process.exit(1);
  console.log('vehicle e2e ok');
}
