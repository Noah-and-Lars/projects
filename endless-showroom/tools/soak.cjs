// Soak test: node tools/soak.cjs [--src]
// Jumps the clock through every kind of transition (dawn, closing time, the
// lights cascade, restock days, a whole week, the long nights of an old store)
// and fails on any page error.
const { chromium } = require('playwright');
const SRC = process.argv.includes('--src');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 320, height: 180 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  p.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|GPU stall/.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://localhost:8790/${SRC ? 'src/' : ''}index.html`); await p.waitForTimeout(1500);
  await p.evaluate(() => __game.startSolo()); await p.waitForTimeout(2000);
  const plan = [];
  for (let d = 1; d <= 8; d++) plan.push([d, 355], [d, 361], [d, 655 + 4 * (d - 1)]);
  plan.push([60, 355], [60, 365], [60, 890], [61, 20]);
  for (const [d, t] of plan) {
    await p.evaluate(([d, t]) => { __game.setClock(t, d); __game.P.hp = 100; __game.P.food = 100; }, [d, t]);
    await p.waitForTimeout(700);
  }
  const end = await p.evaluate(() => ({ day: __game.clock.day, staff: __game.staffViews.size, mode: __game.mode }));
  console.log('end', end);
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no errors');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
