// Diagnostics page: Settings -> Diagnostics toggles apply live and persist; F4 toggles the camera readout.
import { assert, openGame, shot } from './harness.mjs';

export async function runDiagTests(url, test) {
  await test('diagnostics: Settings -> Diagnostics switches apply live, persist, F4 camera readout', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => { window.__game.ui.openMenu('settings'); });
    await page.click('[data-act=open][data-id=diag]');
    await page.waitForSelector('#ws-d-taa');
    await page.click('#ws-d-taa');          // TAA off
    await page.click('#ws-d-camdebug');     // readout on
    await page.click('[data-act=dseg][data-key=near][data-val="0.05"]');
    await page.evaluate(() => { const g = window.__game; g.render(); for (const m of g.game.modules) m.frameUpdate?.(g.game, 1 / 60); });
    const a = await page.evaluate(() => ({ taa: window.__game.game.renderer.taa, near: window.__game.game.renderer.camera.near, box: document.body.textContent.includes('camera move'), stored: localStorage.getItem('wrecking-shift-diag') }));
    assert(a.taa === false && a.near === 0.05 && a.box, 'applied live: ' + JSON.stringify(a));
    await shot(page, 'diag-menu');
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
    const b = await page.evaluate(() => ({ taa: window.__game.game.renderer.taa, near: window.__game.game.renderer.camera.near }));
    assert(b.taa === false && b.near === 0.05, 'remembered after reload: ' + JSON.stringify(b));
    await page.keyboard.press('F4');
    const c = await page.evaluate(() => window.__game.game.ext.diag.get().camdebug);
    assert(c === false, 'F4 toggles the readout off');
    await page.evaluate(() => window.__game.game.ext.diag.reset());
    const d = await page.evaluate(() => ({ taa: window.__game.game.renderer.taa, near: window.__game.game.renderer.camera.near }));
    assert(d.taa === true && d.near === 0.1, 'defaults: ' + JSON.stringify(d));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
