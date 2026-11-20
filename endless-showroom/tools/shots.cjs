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
  const shot = async (name, fn, wait = 1500, arg) => { await p.evaluate(fn, arg); await p.waitForTimeout(wait); await p.evaluate(() => document.getElementById('announce').classList.add('hidden')); await p.screenshot({ path: path.join(out, name) }); };
  await shot('look-1-day.png', () => { const P = __game.P; P.pitch = -0.05; });
  await shot('look-2-close.png', () => {
    const P = __game.P, w = __game.world; let best = null, bd = 1e9;
    for (const it of w.items.values()) { if (it.t !== 'sofa' && it.t !== 'bedDouble' && it.t !== 'wardrobe') continue; if (!w.active(it)) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } }
    if (best) { P.x = best.x + 2.2; P.z = best.z + 2.2; P.y = 0; P.yaw = Math.atan2(P.x - best.x, P.z - best.z); P.pitch = -0.35; }
  });
  await shot('look-3-night.png', () => { __game.setClock(400); __game.P.pitch = 0; }, 3000);
  await shot('look-4-lamps.png', () => {
    const P = __game.P, w = __game.world;
    const l = [...w.items.values()].filter((i) => (i.t === 'floorLamp' || i.t === 'tableLamp') && w.active(i)).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (l) { P.x = l.x + 3; P.z = l.z + 1; P.y = 0; P.yaw = Math.atan2(P.x - l.x, P.z - l.z); P.pitch = -0.15; }
  }, 2500);
  await shot('look-5-staff.png', () => {
    const s = __game.staff && [...__game.staff.staff.values()][0]; const P = __game.P;
    if (s) { s.x = P.x - Math.sin(P.yaw) * 3; s.z = P.z - Math.cos(P.yaw) * 3; s.y = P.y; }
  }, 1200);
  await shot('look-6-third.png', () => { __game.setClock(60, 16); __game.P.third = true; __game.P.pitch = -0.3; }, 2000);
  // A clear view: move to a spot with 4.5 m of open floor ahead.
  const clearView = () => p.evaluate(() => {
    const P = __game.P, w = __game.world;
    for (let tries = 0; tries < 40; tries++) {
      __game.spawnAt(P.x + (Math.random() - 0.5) * 20, P.z + (Math.random() - 0.5) * 20, 6);
      for (let a = 0; a < 6.28; a += 0.4) {
        let clear = true;
        for (let d = 1; d <= 4.5; d += 0.5) { const x = P.x - Math.sin(a) * d, z = P.z - Math.cos(a) * d; if (!w.fits({ x0: x - 1.2, x1: x + 1.2, z0: z - 0.6, z1: z + 0.6, y0: 0.05, y1: 2.6 })) { clear = false; break; } }
        if (clear) { P.yaw = a; P.y = 0; P.pitch = 0.05; return true; }
      }
    }
    return false;
  });
  // A grid pillar and its screen.
  await shot('look-7-pillar.png', () => { __game.P.third = false; __game.setClock(100, 2); const P = __game.P; P.x = 12; P.z = 16.5; P.y = 0; P.yaw = 0; P.pitch = 0.05; }, 2500);
  // A cafeteria hall and a warehouse street.
  for (const [name, sec] of [['look-8-cafeteria.png', 'food'], ['look-9-street.png', 'warehouse']]) {
    await shot(name, (sec) => {
      const w = __game.world; let found = null;
      for (let r = 0; r < 20 && !found; r++) for (let i = -r; i <= r && !found; i++) for (let j = -r; j <= r && !found; j++) if (w.sectionAt(i * 24 + 12, j * 24 + 12) === sec) found = [i * 24, j * 24];
      if (!found) return;
      const P = __game.P; P.x = found[0] + 12; P.z = found[1] + (sec === 'food' ? 12.6 : 3.8); P.y = 0; P.yaw = sec === 'food' ? 0 : -Math.PI / 2; P.pitch = -0.08;
    }, 4000, sec);
  }
  console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
  await b.close();
})();
