// UX e2e: target highlight + look-at text, key rebinding on the Controls page (real key events), the fail
// screen's "Back to my save" + first-heist quicksave hint, assists and comfort sliders.
// Screenshots: tests/e2e/out/ux-*.png. Called from run.mjs (runUxTests).
import { assert, openGame, shot } from './harness.mjs';

const ui = (page) => page.evaluate(() => window.__game.ui.state());
const centerOf = (page, tag) => page.evaluate((tag) => {
  for (const b of window.__game.sim.bodies.values()) if (b.tags.has(tag)) return { ...b.center(), id: b.id };
  return null;
}, tag);
async function lookFrom(page, feet, target) {
  await page.evaluate(([f, t]) => {
    const g = window.__game;
    g.setView(f.x, f.y, f.z, 0, 0);
    const e = g.player.eye;
    const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, [feet, target]);
}
/** run the per-frame module updates n times (1/60 s each) without drawing */
const frames = (page, n) => page.evaluate((n) => { const g = window.__game.game; for (let i = 0; i < n; i++) for (const m of g.modules) m.frameUpdate?.(g, 1 / 60); }, n);
const ux = (page, id) => page.evaluate((id) => { const u = window.__game.game.ext.ux; return { count: u.highlightCount, s: id != null ? u.strengthOf(id) : 0, look: u.lookText }; }, id);

export async function runUxTests(url, test) {
  await test('ux: mission items glow within 8 m (stronger when aimed), look-at text names props and tags targets', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.startMission('housewarming'); window.__game.step(20); });
    const idol = await centerOf(page, 'target:idol');
    assert(idol, 'idol exists');
    // far away: nothing
    await lookFrom(page, { x: idol.x + 14, y: 0.05, z: idol.z + 14 }, idol);
    await page.evaluate(() => window.__game.step(2));
    await frames(page, 30);
    let u = await ux(page, idol.id);
    assert(u.s === 0, 'no outline beyond 8 m: ' + JSON.stringify(u));
    // ~5 m away, looking past it
    await lookFrom(page, { x: idol.x + 3, y: 0.05, z: idol.z + 4 }, { x: idol.x + 3, y: idol.y, z: idol.z - 10 });
    await page.evaluate(() => window.__game.step(2));
    await frames(page, 40);
    u = await ux(page, idol.id);
    assert(u.count >= 1 && u.s > 0.2 && u.s < 1.2, 'faint outline nearby: ' + JSON.stringify(u));
    const near = u.s;
    // aim at it from 1.4 m: full outline + description after 0.3 s
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => window.__game.step(2));
    await frames(page, 10);
    u = await ux(page, idol.id);
    assert(!u.look, 'no description before 0.3 s: ' + u.look);
    await frames(page, 40);
    u = await ux(page, idol.id);
    assert(u.s > near + 0.3 && Math.abs(u.s - 1.6) < 1e-6, 'aimed outline at full strength: ' + JSON.stringify(u));
    assert(u.look && /Gold Idol/.test(u.look) && /Required target/.test(u.look), 'look text: ' + u.look);
    assert(/Required target/.test(await page.textContent('.ws-look')), 'look line on screen');
    await shot(page, 'ux-01-target-aimed');
    // still camera with the highlight up: two renders give the same picture state (no animation)
    const a = await ux(page, idol.id); await frames(page, 20); const b = await ux(page, idol.id);
    assert(a.s === b.s, 'outline does not pulse: ' + a.s + ' vs ' + b.s);
    // a plain prop: name + joke, no tag
    const crate = await page.evaluate(() => { for (const b of window.__game.sim.bodies.values()) if (b.name === 'crate') return { ...b.center(), id: b.id }; return null; });
    assert(crate, 'crate in the yard');
    await lookFrom(page, { x: crate.x, y: 0.05, z: crate.z + 1.6 }, crate);
    await page.evaluate(() => window.__game.step(2));
    await frames(page, 30);
    u = await ux(page);
    assert(u.look && /^Wooden crate · /.test(u.look) && !/Required/.test(u.look), 'crate look text: ' + u.look);
    await shot(page, 'ux-02-look-crate');
    // the outline of the idol from a step back (not aimed): screenshot for the faint state
    await lookFrom(page, { x: idol.x + 2.5, y: 0.05, z: idol.z + 3 }, { x: idol.x + 0.6, y: idol.y, z: idol.z });
    await page.evaluate(() => window.__game.step(2));
    await frames(page, 40);
    await shot(page, 'ux-03-target-near');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('ux: rebind keys on the Controls page with real key presses; prompts show the bound key; reset', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.openMenu('controls'); });
    await page.click('[data-act=rebind][data-id=forward]');
    assert(/press a key/.test(await page.textContent('[data-act=rebind][data-id=forward]')), 'waiting for a key');
    await shot(page, 'ux-10-rebind-wait');
    await page.keyboard.press('ArrowUp');
    let k = await page.evaluate(() => window.__game.game.ext.settings.keys);
    assert(k.forward === 'ArrowUp', 'forward bound to ArrowUp: ' + JSON.stringify(k));
    assert((await ui(page)).menu === 'controls', 'still on the Controls page');
    // swap: interact -> G, then jump -> G swaps (jump gets G, interact gets Space)
    await page.click('[data-act=rebind][data-id=interact]');
    await page.keyboard.press('KeyG');
    await page.click('[data-act=rebind][data-id=jump]');
    await page.keyboard.press('KeyG');
    k = await page.evaluate(() => window.__game.game.ext.settings.keys);
    assert(k.jump === 'KeyG' && k.interact === 'Space', 'swapped: ' + JSON.stringify(k));
    // Esc cancels a wait without closing the page
    await page.click('[data-act=rebind][data-id=map]');
    await page.keyboard.press('Escape');
    assert((await ui(page)).menu === 'controls' && !(await page.evaluate(() => window.__game.game.ext.settings.keys.map)), 'Esc cancels');
    await shot(page, 'ux-11-rebound');
    // play with the new keys (real key events through Input)
    await page.evaluate(() => { window.__game.ui.closeMenus(); window.__game.setView(0, 0.05, 6, 0, 0); window.__game.step(30); });
    const z0 = await page.evaluate(() => window.__game.player.pos.z);
    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.__game.step(40));
    await page.keyboard.up('KeyW');
    const z1 = await page.evaluate(() => window.__game.player.pos.z);
    assert(Math.abs(z1 - z0) < 0.05, 'old W key does nothing: ' + (z1 - z0));
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.__game.step(40));
    await page.keyboard.up('ArrowUp');
    const z2 = await page.evaluate(() => window.__game.player.pos.z);
    assert(z2 < z1 - 1.5, 'ArrowUp walks forward: ' + (z1 - z2));
    // the mission prompt names the bound interact key
    await page.evaluate(() => { window.__game.ui.startMission('housewarming'); window.__game.step(20); });
    const idol = await centerOf(page, 'target:idol');
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => window.__game.step(2));
    const pr = (await ui(page)).prompt;
    assert(pr && pr.startsWith('Space — take'), 'prompt shows the bound key: ' + pr);
    await page.evaluate(() => window.__game.render());
    await shot(page, 'ux-12-prompt-bound-key');
    // pressing the new interact key (Space) takes the idol (test mode has no rAF loop: copy the key edge like Game.gatherInput)
    await page.evaluate(() => window.__game.game.input.pressed.clear());
    await page.keyboard.down('Space');
    await page.evaluate(() => { const g = window.__game.game; for (const k of g.input.pressed) g.pendingKeys.add(k); window.__game.step(2); });
    await page.keyboard.up('Space');
    assert((await ui(page)).phase === 'alarm', 'Space took the idol (alarm)');
    // reset to defaults
    await page.evaluate(() => window.__game.ui.openMenu('controls'));
    await page.click('[data-act=reset-keys]');
    k = await page.evaluate(() => window.__game.game.ext.settings.keys);
    assert(Object.keys(k).length === 0 && /^E$/.test((await page.textContent('[data-act=rebind][data-id=interact]')).trim()), 'defaults back: ' + JSON.stringify(k));
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
    assert(Object.keys(await page.evaluate(() => window.__game.game.ext.settings.keys)).length === 0, 'reset persisted');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('ux: first-heist quicksave hint; fail screen offers "Back to my save" and it restores planning; assisted tag', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1');
    await page.evaluate(() => { localStorage.clear(); window.__game.game.ext.settings.set('assistAmmo', 2); window.__game.ui.startMission('housewarming'); window.__game.step(170); });
    const toast = await page.evaluate(() => [...document.querySelectorAll('.ws-toast')].map((e) => e.textContent).join(' | '));
    assert(/F5/.test(toast) && /saves your plan/.test(toast), 'hint toast: ' + toast);
    await page.evaluate(() => window.__game.render());
    await shot(page, 'ux-20-hint');
    const hints = await page.evaluate(() => JSON.parse(localStorage.getItem('wrecking-shift-save-v1')).hints);
    assert(hints && hints.includes('quicksave'), 'hint remembered');
    // save while planning, trip the alarm, run out of time
    await page.evaluate(() => window.__game.game.ext.quicksave.save());
    const idol = await centerOf(page, 'target:idol');
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => { const g = window.__game; g.step(2); g.key('KeyE', true); g.step(1); g.key('KeyE', false); g.step(60 * 62); });
    let s = await ui(page);
    assert(s.phase === 'failed' && s.menu === 'fail', 'failed: ' + JSON.stringify({ p: s.phase, m: s.menu }));
    assert(await page.isVisible('[data-act=qload]'), 'Back to my save button');
    assert(/Back to my save/.test(await page.textContent('[data-act=qload]')), 'button text');
    assert(await page.isVisible('.ws-end .ws-assisted'), 'assisted tag on the fail screen');
    const res = await page.evaluate(() => window.__game.game.ext.mission.lastResult);
    assert(res.assists && res.assists.includes('ammo ×2'), 'result carries the assists: ' + JSON.stringify(res.assists));
    await shot(page, 'ux-21-fail-quickload');
    await page.click('[data-act=qload]');
    await page.evaluate(() => window.__game.step(5));
    s = await ui(page);
    assert(s.phase === 'planning' && s.menu === null && !s.objectives[0].done, 'back in planning: ' + JSON.stringify({ p: s.phase, m: s.menu }));
    assert(await page.evaluate(() => window.__game.game.controlsEnabled), 'controls back');
    // a second heist never shows the hint again
    await page.evaluate(() => { window.__game.ui.startMission('housewarming'); window.__game.step(170); });
    const again = await page.evaluate(() => [...document.querySelectorAll('.ws-toast')].filter((e) => /saves your plan/.test(e.textContent)).length);
    assert(again <= 1, 'hint not repeated (old toast may still be fading): ' + again);
    // without a save the fail screen keeps Retry as the main button
    await page.evaluate(() => { const g = window.__game; g.game.ext.mission.current.fail('Test fail'); g.step(60); });
    s = await ui(page);
    assert(s.menu === 'fail', 'fail screen again');
    assert(await page.isVisible('[data-act=qload]') === (await page.evaluate(() => window.__game.game.ext.quicksave.has())), 'qload button follows the save slot');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('ux: Settings assists + comfort sliders apply (alarm +30 / no limit, brightness, head bob amount)', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => { localStorage.clear(); window.__game.ui.openMenu('settings'); });
    await page.click('[data-act=seg][data-key=assistAlarm][data-val="+30"]');
    await page.click('[data-act=seg][data-key=assistToughness][data-val="0.5"]');
    await page.click('#ws-assistJobs');
    let st = await page.evaluate(() => window.__game.game.ext.settings.toJSON());
    assert(st.assistAlarm === '+30' && st.assistToughness === 0.5 && st.assistJobs === true, 'assists set: ' + JSON.stringify(st));
    await page.fill('#ws-brightness', '1.4');
    await page.dispatchEvent('#ws-brightness', 'input');
    await page.fill('#ws-headBobAmount', '0.5');
    await page.dispatchEvent('#ws-headBobAmount', 'input');
    const r = await page.evaluate(() => ({ b: window.__game.game.renderer.brightness, h: window.__game.game.ext.settings.headBobAmount }));
    assert(Math.abs(r.b - 1.4) < 1e-9 && r.h === 0.5, 'comfort sliders: ' + JSON.stringify(r));
    await shot(page, 'ux-30-settings-top');
    await page.evaluate(() => document.querySelector('.ws-win .ws-body').scrollTop = 9999);
    await shot(page, 'ux-31-settings-assists');
    // the job board is open for every job
    await page.evaluate(() => window.__game.ui.openMenu('missions'));
    assert(await page.evaluate(() => document.querySelectorAll('.ws-card.locked').length) === 0, 'no locked jobs');
    // the alarm runs 30 s longer, damage is halved
    await page.evaluate(() => { window.__game.ui.startMission('housewarming'); window.__game.step(20); });
    const idol = await centerOf(page, 'target:idol');
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => { const g = window.__game; g.step(2); g.key('KeyE', true); g.step(1); g.key('KeyE', false); g.step(60); });
    let s = await ui(page);
    assert(s.phase === 'alarm' && s.timeLeft > 87 && s.timeLeft < 90, 'alarm +30 s: ' + s.timeLeft);
    const hp = await page.evaluate(() => { const p = window.__game.player; const h0 = p.health; p.damage(0.2); return h0 - p.health; });
    assert(Math.abs(hp - 0.1) < 1e-6, 'damage halved: ' + hp);
    // "no limit": the clock never runs out
    await page.evaluate(() => { const g = window.__game; g.game.ext.settings.set('assistAlarm', 'off'); g.ui.startMission('housewarming'); g.step(20); });
    await lookFrom(page, { x: idol.x, y: 0.3, z: idol.z + 1.4 }, idol);
    await page.evaluate(() => { const g = window.__game; g.step(2); g.key('KeyE', true); g.step(1); g.key('KeyE', false); g.step(60 * 80); });
    s = await ui(page);
    assert(s.phase === 'alarm', 'still in the alarm after 80 s: ' + s.phase);
    assert(/no limit/.test(await page.textContent('.ws-alarm')), 'HUD says no limit');
    await page.evaluate(() => window.__game.render());
    await shot(page, 'ux-32-no-limit');
    // head bob at 50 %: a smaller bob while walking, exactly zero once stopped
    const bob = await page.evaluate(() => {
      const G = window.__game, g = G.game;
      g.ext.mission.quit('harbor'); G.ui.closeMenus(); G.step(20);
      const sp = g.level.spawn, yaw = g.level.spawnYaw;
      const home = () => { G.setView(sp.x, sp.y, sp.z, yaw, 0); G.step(30); };
      home();
      const run = (amt) => {
        g.ext.settings.set('headBobAmount', amt);
        let max = 0;
        G.key('KeyW', true);
        for (let i = 0; i < 90; i++) { G.step(1); for (const m of g.modules) m.frameUpdate?.(g, 1 / 60); max = Math.max(max, Math.abs(g.viewBob.y)); }
        G.key('KeyW', false);
        for (let i = 0; i < 60; i++) { G.step(1); for (const m of g.modules) m.frameUpdate?.(g, 1 / 60); }
        const end = { ...g.viewBob };
        home();
        return { max, end };
      };
      return { full: run(1), half: run(0.5) };
    });
    assert(bob.full.max > 0.005 && Math.abs(bob.half.max / bob.full.max - 0.5) < 0.15, 'bob scales with the slider: ' + JSON.stringify(bob));
    assert(bob.half.end.y === 0 && bob.half.end.roll === 0 && bob.full.end.y === 0, 'bob ends at exactly zero: ' + JSON.stringify(bob));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
