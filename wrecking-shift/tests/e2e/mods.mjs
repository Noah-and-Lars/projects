// Mods: the Mods menu lists every mod (title screen + pause), switches persist across a reload, the sandbox
// spawn menu (B) places mod props and vehicles in front of the player, a mod tool is on the belt in sandbox, a mod
// map loads from the Sandbox list and a mod game mode starts, runs and shows its result. Screenshots: out/mods-*.png
import { assert, openGame, shot } from './harness.mjs';

const frame = (page) => page.evaluate(() => { const G = window.__game; for (const m of G.game.modules) m.frameUpdate?.(G.game, 1 / 60); });

export async function runModsTests(url, test) {
  await test('mods: menu lists all mods, toggles persist, spawn menu, mod tool, mod map, mod game mode', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => { localStorage.removeItem('wrecking-shift-mods'); window.__game.ui.openMenu('main'); });
    await page.click('[data-act=open][data-id=mods]');
    const info = await page.evaluate(() => ({ rows: document.querySelectorAll('.ws-mod').length, total: window.__game.game.ext.mods.all.length }));
    assert(info.total >= Number(process.env.MODS_MIN ?? 100) && info.rows === info.total, 'every mod listed: ' + JSON.stringify(info));
    await shot(page, 'mods-01-menu');
    // category tab + search
    await page.click('[data-act=modcat][data-id=vehicles]');
    const veh = await page.evaluate(() => [...document.querySelectorAll('.ws-mod .cat')].every((e) => /vehicles/i.test(e.textContent)));
    assert(veh, 'vehicle tab shows vehicles only');
    await shot(page, 'mods-02-vehicles');
    await page.click('[data-act=modcat][data-id=all]');
    // switch one off, reload, still off; switch back on
    const first = await page.evaluate(() => window.__game.game.ext.mods.all.find((m) => m.category === 'props').id);
    await page.click(`input[data-mod="${first}"]`);
    assert(!(await page.evaluate((id) => window.__game.game.ext.mods.state.isEnabled(id), first)), 'switched off');
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
    assert(!(await page.evaluate((id) => window.__game.game.ext.mods.state.isEnabled(id), first)), 'remembered after reload');
    await page.evaluate((id) => window.__game.game.ext.mods.state.set(id, true), first);

    // sandbox on the yard: B opens the spawn menu with mod props + vehicles
    await page.evaluate(() => { window.__game.ui.startSandbox('testyard'); window.__game.step(5); });
    await page.keyboard.press('KeyB');
    assert((await page.evaluate(() => window.__game.ui.state().menu)) === 'spawn', 'B opens the spawn menu');
    const sp = await page.evaluate(() => { const e = window.__game.game.ext.mods.spawnables(); return { n: e.length, modProps: e.filter((x) => x.mod && x.kind === 'prop').length, modVeh: e.filter((x) => x.mod && x.kind === 'vehicle').length }; });
    assert(sp.modProps > 0 && sp.modVeh > 0, 'spawnables from mods: ' + JSON.stringify(sp));
    await shot(page, 'mods-03-spawn-menu');
    const ids = await page.evaluate(() => { const e = window.__game.game.ext.mods.spawnables(); return { prop: e.find((x) => x.mod && x.kind === 'prop').id, veh: e.find((x) => x.mod && x.kind === 'vehicle').id }; });
    const before = await page.evaluate(() => window.__game.sim.bodies.size);
    await page.click(`[data-act=spawn][data-id="${ids.prop}"]`);
    assert((await page.evaluate(() => window.__game.ui.state().menu)) == null, 'menu closes after spawning');
    await page.evaluate(() => window.__game.step(30));
    await page.evaluate((id) => window.__game.game.ext.mods.spawn(id), ids.veh);
    await page.evaluate(() => { window.__game.step(60); });
    const after = await page.evaluate(() => ({ n: window.__game.sim.bodies.size, veh: window.__game.game.ext.vehicles?.list?.length ?? null }));
    assert(after.n >= before + 2, 'prop + vehicle spawned: ' + JSON.stringify({ before, after }));
    await frame(page);
    await shot(page, 'mods-04-spawned');
    // mod tools on the sandbox belt (added on level load)
    const t = await page.evaluate(() => { const g = window.__game.game; const modIds = new Set(g.ext.mods.all.flatMap((m) => (m.tools ?? []).map((t) => t.id))); return g.belt.tools.filter((t) => modIds.has(t.id) && t.unlocked).map((t) => t.id); });
    assert(t.length > 0, 'mod tools on the belt');
    await page.evaluate((id) => { const G = window.__game; const i = G.game.belt.tools.findIndex((t) => t.id === id); G.game.belt.select(G.game.toolCtx, i); G.setView(0, 0.05, 4, 0, -0.05); G.buttons(1); G.step(30); G.buttons(0); G.step(30); }, t[0]);
    await frame(page);
    await shot(page, 'mods-05-mod-tool');

    // a mod map from the Sandbox list
    await page.evaluate(() => window.__game.ui.openMenu('sandbox'));
    const mapId = await page.evaluate(() => window.__game.game.ext.mods.enabledMaps()[0]);
    assert(mapId && await page.isVisible(`[data-act=sbx][data-id="${mapId}"]`), 'mod map in the sandbox list');
    await page.click(`[data-act=sbx][data-id="${mapId}"]`);
    await page.evaluate(() => window.__game.step(10));
    assert((await page.evaluate(() => window.__game.game.levelId)) === mapId, 'mod map loaded');
    await frame(page);
    await shot(page, 'mods-06-mod-map');

    // a mod game mode: rules screen, start, HUD panel, result
    await page.evaluate(() => window.__game.ui.openMenu('mods'));
    const modeId = await page.evaluate(() => window.__game.game.ext.mods.all.flatMap((m) => m.modes ?? [])[0].id);
    await page.click(`[data-act=modeinfo][data-id="${modeId}"]`);
    await shot(page, 'mods-07-mode-rules');
    await page.click(`[data-act=modestart][data-id="${modeId}"]`);
    await page.evaluate(() => window.__game.step(120));
    const m = await page.evaluate(() => window.__game.game.ext.mods.mode);
    assert(m && m.def.id === modeId && !m.status.ended, 'mode running: ' + JSON.stringify(m && m.status));
    await frame(page);
    assert(await page.isVisible('.ws-modepanel'), 'mode HUD panel');
    await shot(page, 'mods-08-mode-hud');
    // run out the clock (or until it ends) -> result screen
    await page.evaluate(() => { const G = window.__game; for (let i = 0; i < 400 && !G.game.ext.mods.mode?.status.ended; i++) G.step(30); G.step(70); });
    const r = await page.evaluate(() => ({ menu: window.__game.ui.state().menu, res: window.__game.game.ext.mods.lastResult?.status ?? null }));
    assert(r.res && r.res.ended && r.menu === 'moderesult', 'result screen: ' + JSON.stringify(r));
    await shot(page, 'mods-09-mode-result');
    // a rule tweak and a look apply live
    const g = await page.evaluate(() => {
      const G = window.__game, mods = G.game.ext.mods;
      const grav = mods.all.find((m) => m.id === 'feather-gravity');
      if (!grav) return null;
      mods.state.set('feather-gravity', true);
      const on = G.sim.world.gravity.y;
      mods.state.set('feather-gravity', false);
      return { on, off: G.sim.world.gravity.y };
    });
    assert(!g || (g.on > -5 && g.off < -9), 'rule tweak applies + reverts live: ' + JSON.stringify(g));
    // pause menu has Mods
    await page.evaluate(() => window.__game.ui.openMenu('pause'));
    assert(await page.isVisible('[data-act=open][data-id=mods]'), 'pause menu has Mods');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
