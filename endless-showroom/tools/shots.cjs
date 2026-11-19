// Screenshots of the look: node tools/shots.cjs <dir> [--src]
// Day aisle, a close look at furniture, night with emergency lights, night with
// the torch, and a member of staff up close. Serve the folder on :8790 first.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'shots';
const SRC = process.argv.includes('--src');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:8790/${SRC ? 'src/' : ''}index.html`);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(out, 'look-0-menu.png') });
  await p.evaluate(() => __game.startSolo());
  await p.waitForTimeout(2000);
  await p.evaluate(() => { document.getElementById('announce').classList.add('hidden'); });
  const shot = async (name, fn, wait = 1500) => { await p.evaluate(fn); await p.waitForTimeout(wait); await p.evaluate(() => document.getElementById('announce').classList.add('hidden')); await p.screenshot({ path: path.join(out, name) }); };
  await shot('look-1-day.png', () => { const P = __game.P; P.pitch = -0.05; });
  await shot('look-2-close.png', () => {
    const P = __game.P, w = __game.world; let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.t !== 'sofa' && it.t !== 'bedDouble' && it.t !== 'wardrobe') continue; if (!w.active(it)) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    if (best) { P.x = best.x + 2.2; P.z = best.z + 2.2; P.y = 0; P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = -0.35; }
  });
  await shot('look-3-night.png', () => { __game.setClock(400); __game.P.pitch = 0; }, 3000);
  await shot('look-4-torch.png', () => { __game.P.torch = true; __game.P.pitch = -0.15; }, 1500);
  await shot('look-5-staff.png', () => {
    const s = __game.staff && [...__game.staff.staff.values()][0]; const P = __game.P;
    if (s) { s.x = P.x - Math.sin(P.yaw) * 3; s.z = P.z - Math.cos(P.yaw) * 3; s.y = P.y; }
  }, 1200);
  await shot('look-6-third.png', () => { __game.setClock(60); __game.P.torch = false; __game.P.third = true; __game.P.pitch = -0.3; }, 2000);
  console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
  await b.close();
})();
