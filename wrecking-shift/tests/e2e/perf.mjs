// Performance mode (Settings -> Graphics -> "Performance mode (low-end laptops)"): the switch applies the low-end
// profile live, persists across a reload, the game plays in it (destruction, debris, fire), the slow-frame banner
// suggests it, and screenshots of the mode on the yard + harbour (tests/e2e/out/perf-*.png).
import { assert, openGame, shot } from './harness.mjs';

const stats = (page) => page.evaluate(() => {
  const G = window.__game, g = G.game, s = g.renderer.stats();
  return { perf: s.performanceMode, q: s.effectiveQuality, pr: s.pixelRatio, far: s.drawDistance, shadow: s.shadowMapSize, scale: s.resolutionScale,
    debris: g.sim.maxDebris, fires: g.fire.maxFires, sub: g.maxSubsteps, chips: g.renderer.chips.limit, budget: g.renderer.bodies.budgetMs, setting: g.ext.settings.perfMode };
});

export async function runPerfTests(url, test) {
  await test('performance mode: setting applies live, persists, game plays in it, screenshots', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.openMenu('settings'); });
    await page.waitForSelector('#ws-perfMode');
    await shot(page, 'perf-00-settings-off');
    let s = await stats(page);
    assert(!s.perf && s.debris === 260 && s.sub === 3, 'off by default: ' + JSON.stringify(s));
    await page.click('#ws-perfMode');
    s = await stats(page);
    assert(s.perf && s.setting && s.q === 'low' && s.pr === 1 && s.shadow === 1536 && s.scale <= 0.9 && s.debris === 110 && s.fires === 450 && s.sub === 2 && s.chips === 900 && s.budget === 4,
      'applied live: ' + JSON.stringify(s));
    assert(/Performance mode is on/.test(await page.textContent('.ws-menu, #ui')), 'menu note updated');
    await shot(page, 'perf-01-settings-on');
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
    s = await stats(page);
    assert(s.perf && s.q === 'low' && s.debris === 110, 'remembered after reload: ' + JSON.stringify(s));
    // play: blow up the yard house, set a fire, let debris fall
    const r = await page.evaluate(() => {
      const G = window.__game; G.ui.closeMenus();
      G.setView(6, 0.05, 8, 0.5, 0.1); G.step(5);
      const before = G.sim.bodies.size;
      G.explode(1, 1.2, -8, 1.8); G.explode(-1, 1.5, -6, 1.6); G.step(90);
      G.game.fire.igniteNear({ x: 3, y: 1, z: -6 }, 2, 8); G.step(60);
      return { before, after: G.sim.bodies.size, fires: G.game.fire.count(), dead: G.player.dead };
    });
    assert(r.after > r.before && r.fires > 0, 'destruction + fire work: ' + JSON.stringify(r));
    await shot(page, 'perf-02-yard-play');
    // the far plane follows the mode and the fog sits in front of it
    const f = await page.evaluate(() => { const G = window.__game; for (const m of G.game.modules) m.frameUpdate?.(G.game, 1 / 60); return { far: G.game.renderer.camera.far, fog: G.game.renderer.scene.fog.far }; });
    assert(f.far === 240 && f.fog < f.far, 'draw distance + fog: ' + JSON.stringify(f));
    // the big harbour map in performance mode (water uses the simple shader)
    await page.evaluate(() => { window.__game.game.ext.mission.startSandbox('harbor'); window.__game.ui.closeMenus(); window.__game.step(5); });
    await page.evaluate(() => { const G = window.__game; for (const m of G.game.modules) m.frameUpdate?.(G.game, 1 / 60); G.step(2); });
    await shot(page, 'perf-03-harbor');
    s = await stats(page);
    assert(s.perf && s.debris === 110, 'caps kept on a new level: ' + JSON.stringify(s));
    // Sharp image option: full resolution, no TAA (no upscaling blur), listed under performance mode in Settings
    await page.evaluate(() => window.__game.ui.openMenu('settings'));
    await page.click('#ws-perfSharp');
    const sh = await page.evaluate(() => { const st = window.__game.game.renderer.stats(); return { sharp: st.performanceSharp, scale: st.resolutionScale, perf: st.performanceMode, taa: window.__game.game.renderer.post.options.taa, setting: window.__game.game.ext.settings.perfSharp }; });
    assert(sh.sharp && sh.scale === 1 && sh.perf && !sh.taa && sh.setting, 'sharp image: ' + JSON.stringify(sh));
    await shot(page, 'perf-03b-settings-sharp');
    await page.evaluate(() => { window.__game.ui.closeMenus(); });
    await shot(page, 'perf-03c-harbor-sharp');
    await page.evaluate(() => window.__game.game.ext.settings.set('perfSharp', false));
    // switching off restores the normal profile
    await page.evaluate(() => window.__game.game.ext.perf.set(false));
    s = await stats(page);
    assert(!s.perf && s.q === 'medium' && s.debris === 260 && s.sub === 3 && s.far === 600 && s.scale === 1, 'off again: ' + JSON.stringify(s));
    await shot(page, 'perf-04-harbor-normal');
    // slow-frame suggestion banner (performance mode off)
    const h = await page.evaluate(() => { const p = window.__game.game.ext.perf; p.simulateSlow(15, 20); return p.hintVisible; });
    assert(h, 'banner shown after sustained low fps');
    assert(/Performance mode/.test(await page.textContent('.ws-perfhint')), 'banner text');
    await shot(page, 'perf-05-hint');
    await page.click('.ws-perfhint [data-p=on]');
    s = await stats(page);
    assert(s.perf && s.setting, 'banner button turns it on: ' + JSON.stringify(s));
    await page.evaluate(() => window.__game.game.ext.perf.set(false));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
