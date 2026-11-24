// Dev helper: node tests/e2e/lookdev.mjs <quality> <tod> <view,view,...> [blast] [prefix]
import { openGame, serve } from './harness.mjs';
import { VIEWS, look, setCam, snap } from './lookviews.mjs';

const [quality = 'medium', tod = 'sunset', views = 'overview', blast = '', prefix = 'dev'] = process.argv.slice(2);
const { srv, url } = await serve();
const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('console:', m.text().slice(0, 2000)); });
await look(page, quality, tod);
if (blast) await page.evaluate(() => { window.__game.explode(1, 1.2, -8, 1.4); window.__game.step(90); });
for (const v of views.split(',')) {
  if (!VIEWS[v]) { console.log('unknown view', v); continue; }
  await setCam(page, v);
  const t = Date.now();
  const f = await snap(page, `${prefix}-${quality}-${tod}-${v}${blast ? '-blast' : ''}`);
  console.log(f, Date.now() - t, 'ms');
}
console.log(JSON.stringify(await page.evaluate(() => window.__game.game.renderer.stats())));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n').slice(0, 6000));
await browser.close();
srv.close();
