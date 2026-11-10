// Headless test: serve the folder first (python3 -m http.server 8765), then
//   node tools/test.cjs <outdir> [--shots] [--complete] [--fps]
const { chromium, devices } = require('playwright');
const out = process.argv[2] || '.';
const flags = new Set(process.argv.slice(3));
const URL = 'http://localhost:8765/index.html';
const all = flags.size === 0;

async function open(b, ctxOpts) {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  // GL driver performance notes come from the headless software renderer
  // (screenshots read pixels back); they are not game errors.
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  await p.goto(URL);
  // Headless Chromium reports zero safe-area insets; emulate an iPhone notch.
  if (ctxOpts.isMobile) await p.addStyleTag({ content: ':root{--sal:47px;--sar:47px;--sab:21px}' });
  await p.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await p.evaluate(() => { const d = __game.data(); d.unlocked = 5; });
  return { ctx, p, errs };
}

// Drive the player with the AI so we can check every track can be finished.
async function autoPlayer(p, skill = 'hard') {
  await p.evaluate(async (skill) => {
    const { createAI } = await import('./js/ai.js');
    __game.game.race.player.ai = createAI(skill, 99);
  }, skill);
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const sizes = [
    ['desktop', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }],
    ['iphone', { ...devices['iPhone 14 landscape'], deviceScaleFactor: 1 }],
  ];
  const report = { errors: {} };

  if (all || flags.has('--shots')) for (const [name, opts] of sizes) {
    const { ctx, p, errs } = await open(b, opts);
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/${name}-menu.png` });
    await p.click('#btn-play');
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${name}-select.png` });
    // Is the 5th card fully reachable inside the scroll container?
    report[name + '-select'] = await p.evaluate(() => {
      const el = document.getElementById('tracks');
      const cards = [...el.querySelectorAll('.card')];
      const last = cards[cards.length - 1];
      last.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = last.getBoundingClientRect();
      return { cards: cards.length, lastRight: Math.round(r.right), lastBottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight };
    });
    await p.screenshot({ path: `${out}/${name}-select-scrolled.png` });
    for (let t = 0; t < 5; t++) {
      await p.evaluate((t) => __game.startRace(t), t);
      await autoPlayer(p);
      await p.evaluate(() => __game.simulate(9 + Math.random() * 0.5));
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${out}/${name}-track${t + 1}.png` });
    }
    report.errors[name] = errs;
    await ctx.close();
  }

  if (all || flags.has('--touch')) {
    const { ctx, p, errs } = await open(b, { ...devices['iPhone 14 landscape'], deviceScaleFactor: 1 });
    await p.evaluate(() => __game.startRace(0));
    await p.waitForTimeout(300);
    const vis = await p.evaluate(() => !document.getElementById('touch').classList.contains('hidden'));
    const box = await p.locator('.tbtn.gas').boundingBox();
    const lean = await p.locator('[data-act="back"]').boundingBox();
    // Hold gas + lean with two touch points via CDP.
    const cdp = await ctx.newCDPSession(p);
    const pt = (bx, id) => ({ x: bx.x + bx.width / 2, y: bx.y + bx.height / 2, id });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(box, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(box, 1), pt(lean, 2)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(box, 1), pt(lean, 2)] });
    await p.waitForTimeout(100);
    const st = await p.evaluate(() => __game.input.state());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(100);
    const st2 = await p.evaluate(() => __game.input.state());
    report.touch = { visible: vis, held: st, released: st2 };
    report.errors.touch = errs;
    await ctx.close();
  }

  if (all || flags.has('--complete')) {
    const { ctx, p, errs } = await open(b, { viewport: { width: 640, height: 360 } });
    report.complete = [];
    for (let t = 0; t < 5; t++) {
      for (const skill of ['hard', 'medium']) {
        await p.evaluate((t) => __game.startRace(t), t);
        await autoPlayer(p, skill);
        const r = await p.evaluate(() => {
          let s; for (let i = 0; i < 40; i++) { s = __game.simulate(5); if (s.state !== 'race') break; }
          const race = __game.game.race;
          return { state: __game.game.state, finished: race.player.finished, time: +race.player.finishTime.toFixed(2), pos: race.finishOrder.indexOf(0) + 1, aiFinished: race.bikes.filter(b => b.finished).length };
        });
        report.complete.push({ track: t + 1, skill, ...r });
        await p.evaluate(() => __game.game.state === 'results' && document.getElementById('btn-res-menu').click());
      }
    }
    report.errors.complete = errs;
    await ctx.close();
  }

  if (all || flags.has('--fps')) {
    report.fps = {};
    for (const [name, opts] of sizes) {
      const { ctx, p, errs } = await open(b, opts);
      for (const t of [0, 4]) {
        await p.evaluate((t) => __game.startRace(t), t);
        await p.evaluate(() => { __game.input.state = () => ({ throttle: 1, brake: 0, lean: 0 }); });
        await p.waitForTimeout(5000);
        const ms = await p.evaluate(() => new Promise(res => {
          const ts = []; let last = performance.now();
          const f = (now) => { ts.push(now - last); last = now; if (ts.length < 120) requestAnimationFrame(f); else res(ts); };
          requestAnimationFrame(f);
        }));
        ms.sort((a, b) => a - b);
        const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
        report.fps[`${name}-track${t + 1}`] = { avgMs: +avg.toFixed(1), p95Ms: +ms[Math.floor(ms.length * 0.95)].toFixed(1) };
      }
      report.errors['fps-' + name] = errs;
      await ctx.close();
    }
  }
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
