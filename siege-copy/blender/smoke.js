// Play a practice match on each map for a while (bots on both teams) and report any page errors.
// node smoke.js [page] [seconds per map]
const { chromium } = require('playwright');
const [, , page = 'siege-copy/index.html', secs = 90] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/WebSocket/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.addInitScript(() => { try { localStorage.setItem('siege.profile', JSON.stringify({ name: 'Test' })); localStorage.setItem('siege.settings', JSON.stringify({ seenNotes: '1.0.1', quality: 'low' })); } catch (e) {} });
  await p.goto('http://127.0.0.1:8123/' + page);
  await p.waitForFunction(() => window.__sg && window.__sg.W && (!window.__sgAssets || window.__sgAssets.done), null, { timeout: 180000 });
  for (const key of ['hotel', 'port', 'manor']) {
    const r = await p.evaluate(async ([key, secs]) => {
      const S = window.__sg, $ = id => document.getElementById(id);
      $('sgPractice').click();
      S.G.set.map = key;
      $('sgStart').click();
      const phases = new Set(); let frames = 0;
      const R = S.renderer(), draw = R.render; let n = 0; R.render = function () { if (++n % 15 === 0) draw.apply(this, arguments); };
      for (let t = 0; t < secs * 30; t++) { S.step(1); frames++; phases.add(S.G.phase); }
      R.render = draw;
      const M = S.W, broken = M.panels.filter(p => p.k === 'wall' && p.hp !== undefined && p.hp < p.hp0).length;
      return { map: M.key, phases: [...phases].join(','), round: S.G.round, score: S.G.score.join('-'), frames, baked: !!(window.__sgAssets.light[M.key]), models: M.mdl.length };
    }, [key, +secs]);
    console.log(JSON.stringify(r));
    await p.evaluate(() => { try { document.getElementById('sgLeave') && document.getElementById('sgLeave').click(); } catch (e) {} });
  }
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 20).join('\n') : 'no page errors');
  await browser.close();
})();
