import { openGame, serve, shot } from '../tests/e2e/harness.mjs';
const { srv, url } = await serve();
const { browser, page, errors } = await openGame(url, 'test=1&level=harbor', { width: 960, height: 540 });
// cottage: wooden walls at x -19..-12, z -33..-27.4, ground 2.0
await page.evaluate(() => { const G = window.__game; G.setView(-16.55, 2.05, -25.9, 0, -0.1); G.step(10); G.selectTool('sledge'); });
await shot(page, 'hm-0-before');
await page.evaluate(() => { const G = window.__game; G.buttons(1); G.step(12); });
await shot(page, 'hm-1-windup-end');
await page.evaluate(() => { const G = window.__game; G.step(5); });
await shot(page, 'hm-2-impact');
await page.evaluate(() => { const G = window.__game; G.step(12); });
await shot(page, 'hm-3-after');
await page.evaluate(() => { const G = window.__game; G.step(48 * 3); G.buttons(0); G.step(40); });
await shot(page, 'hm-4-four-hits');
console.log(JSON.stringify(await page.evaluate(() => window.__game.stats())).slice(0, 200), errors.slice(0, 3));
await browser.close(); srv.close();
