// Headless smoke test: node tools/test.cjs <screenshot-dir> [--src]
// Serve the endless-showroom folder on :8790 first (python3 -m http.server 8790).
// Loads the game, starts solo play, walks, picks up and places furniture,
// skips to night, checks the staff spawn and hunt, and fails on any console
// error. Screenshots go to <screenshot-dir>.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'shots';
const SRC = process.argv.includes('--src');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message|GPU stall/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:8790/${SRC ? 'src/' : ''}index.html`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '01-menu.png') });
  await page.evaluate(() => window.__game.startSolo());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '02-start.png') });
  const g = (fn) => page.evaluate(fn);

  await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  console.log('after walk', await g(() => ({ x: __game.P.x, z: __game.P.z, items: __game.world.items.size, chunks: __game.world.chunks.size })));

  // Stand in front of the nearest piece of furniture on the floor and pick it up.
  console.log('target', await g(() => {
    const P = __game.P, w = __game.world;
    let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.k !== 'f' || !w.active(it) || it.y > 0.01) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    if (!best) return 'none';
    const a = Math.atan2(P.x - best.x, P.z - best.z);
    P.x = best.x + Math.sin(a) * 1.8; P.z = best.z + Math.cos(a) * 1.8; P.y = 0;
    P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = -0.45;
    return best.t + ' ' + best.id;
  }));
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  console.log('carrying', await g(() => __game.P.carry && __game.P.carry.t));
  await page.screenshot({ path: path.join(out, '03-carry.png') });
  await g(() => { __game.P.yaw += Math.PI; __game.P.pitch = -0.6; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '04-ghost.png') });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  console.log('placed', await g(() => !__game.P.carry));

  await page.keyboard.press('KeyV'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '05-third.png') });
  await page.keyboard.press('KeyV');

  // Skip to closing time.
  await g(() => __game.setClock(358));
  await page.waitForTimeout(9000);
  console.log('night', await g(() => ({ staff: __game.staffViews.size, t: __game.clock.t, hp: __game.P.hp })));
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '06-night.png') });
  await g(() => { const P = __game.P; let b = null, bd = 1e9; for (const v of __game.staffViews.values()) { const p = v.model.root.position; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; b = p; } } if (b) { P.yaw = Math.atan2(P.x - b.x, P.z - b.z); P.pitch = 0; } });
  await page.waitForTimeout(6000);
  console.log('after hunting', await g(() => ({ staff: __game.staffViews.size, hp: __game.P.hp, alive: __game.P.alive })));
  await page.screenshot({ path: path.join(out, '07-staff.png') });

  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
  console.log('draw calls', await g(() => __game.renderer.info.render.calls), 'triangles', await g(() => __game.renderer.info.render.triangles));
  console.log('fps (software GL)', fps.toFixed(1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
