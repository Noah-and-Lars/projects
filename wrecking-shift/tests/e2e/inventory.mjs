// Tool bar / inventory: number keys pick groups (again = next in group), Q swaps back, the expanded group view
// opens on a switch and fades back to the compact bar, mod tools sit in group 6. Screenshots: out/inv-*.png
import { assert, openGame, shot } from './harness.mjs';

const frame = (page) => page.evaluate(() => { const G = window.__game; for (const m of G.game.modules) m.frameUpdate?.(G.game, 1 / 60); });
const tap = async (page, code) => { await page.evaluate((c) => { const G = window.__game; G.key(c, true); G.step(1); G.key(c, false); G.step(1); }, code); await frame(page); };

export async function runInventoryTests(url, test) {
  await test('inventory: group keys, swap back, expanded view fades to the compact bar, mod tools in Extras', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => { window.__game.ui.startSandbox('testyard'); window.__game.step(5); window.__game.setView(0, 0.05, 4, 0, -0.05); });
    const cur = () => page.evaluate(() => window.__game.game.belt.current.id);
    await tap(page, 'Digit3');
    assert((await cur()) === 'pistol', 'Digit3 -> first gun');
    await tap(page, 'Digit3');
    assert((await cur()) === 'shotgun', 'Digit3 again -> next gun');
    const v = await page.evaluate(() => ({ open: document.querySelector('.ws-tgroups')?.classList.contains('open'), cols: document.querySelectorAll('.ws-tgroups .col').length, cur: document.querySelector('.ws-tcur .nm')?.textContent }));
    assert(v.open && v.cols >= 5 && /shotgun/i.test(v.cur), 'expanded view: ' + JSON.stringify(v));
    await shot(page, 'inv-01-expanded');
    await tap(page, 'Digit4');
    await tap(page, 'KeyQ');
    assert((await cur()) === 'shotgun', 'Q swaps back');
    // mod tools in group 6
    const extras = await page.evaluate(() => { const b = window.__game.game.belt; return b.inGroup(6).map((i) => b.tools[i].id); });
    assert(extras.length > 0, 'mod tools in Extras (6)');
    await tap(page, 'Digit6');
    assert(extras.includes(await cur()), 'Digit6 selects a mod tool');
    await shot(page, 'inv-02-extras');
    // fade back to the compact bar
    await page.waitForTimeout(1800);
    await frame(page);
    const closed = await page.evaluate(() => !document.querySelector('.ws-tgroups').classList.contains('open') && !!document.querySelector('.ws-tcur'));
    assert(closed, 'expanded view closes, compact bar stays');
    await page.waitForTimeout(300);
    await shot(page, 'inv-03-compact');
    // ammo display in a mission-like belt: finite ammo, low + empty states
    await page.evaluate(() => { const g = window.__game.game; g.infiniteAmmo = false; const b = g.belt.byId('bomb'); b.ammo = 0; g.belt.select(g.toolCtx, g.belt.tools.indexOf(b)); window.__game.step(2); });
    await frame(page);
    assert(await page.evaluate(() => document.querySelector('.ws-tcur').classList.contains('empty')), 'empty ammo state');
    await shot(page, 'inv-04-empty');
    // setting: always expanded
    await page.evaluate(() => window.__game.game.ext.settings.set('toolbarExpanded', true));
    await page.waitForTimeout(1800);
    await frame(page);
    assert(await page.evaluate(() => document.querySelector('.ws-tgroups').classList.contains('open')), 'always expanded setting');
    await page.evaluate(() => window.__game.game.ext.settings.set('toolbarExpanded', false));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
