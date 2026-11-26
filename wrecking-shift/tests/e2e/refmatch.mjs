// Look-matching renders (docs/research/14-reference-match.md): the same set of views in every time-of-day preset on a
// big map, plus an explosion sequence, for side-by-side comparison with the genre reference's screenshots.
// node tests/e2e/refmatch.mjs [prefix=rm] [quality=medium] [tods=day,sunset,overcast,night] [perf=0] [level=city]
// Images: tests/e2e/out/<prefix>-<level>-<tod>-<view>.png. WS_DIST=<dir> renders another build.
import { openGame, serve } from './harness.mjs';
import { snap } from './lookviews.mjs';

const [prefix = 'rm', quality = 'medium', tods = 'day,sunset,overcast,night', perf = '0', level = 'city', blast = '1'] = process.argv.slice(2);
const { srv, url } = await serve();
const { browser, page, errors } = await openGame(url, 'test=1&level=' + level);
const frame = (n = 1) => page.evaluate((n) => { const G = window.__game; for (let i = 0; i < n; i++) { for (const m of G.game.modules) m.frameUpdate?.(G.game, 1 / 60); G.step(1); } }, n);
await page.evaluate(([q, p]) => { const g = window.__game.game; if (p === '1') g.ext.perf.set(true); else g.renderer.setQuality(q); }, [quality, perf]);
const sp = await page.evaluate(() => { const l = window.__game.game.level; return { ...l.spawn, yaw: l.spawnYaw ?? 0 }; });
// views relative to the spawn: eye offset (x,y,z), yaw offset, pitch
const VIEWS = level === 'city'
  ? { street: [0, 1.7, 0, 0, 0.0], corner: [0, 1.7, 0, -0.9, 0.05], high: [6, 14, 8, -0.5, -0.32], back: [0, 1.7, -2, Math.PI * 0.75, 0.02] }
  : { street: [0, 1.7, 0, 0, 0.0], high: [4, 12, 6, -0.4, -0.3], side: [0, 1.7, 0, 1.4, 0.0] };
const cam = (v) => page.evaluate(([x, y, z, yaw, pitch]) => { window.__game.game.cameraOverride = { eye: { x, y, z }, yaw, pitch }; }, [sp.x + v[0], sp.y + v[1], sp.z + v[2], sp.yaw + v[3], v[4]]);
const tag = perf === '1' ? 'perf' : quality;
for (const tod of tods.split(',')) {
  await page.evaluate((t) => window.__game.game.renderer.setTimeOfDay(t), tod);
  for (const [name, v] of Object.entries(VIEWS)) {
    await cam(v); await frame(3);
    console.log(await snap(page, `${prefix}-${tag}-${level}-${tod}-${name}`));
  }
}
if (blast === '1') {
  // explosion sequence in front of the street view: flash, fireball, smoke column, lingering smoke
  await page.evaluate((t) => window.__game.game.renderer.setTimeOfDay(t), tods.split(',')[0]);
  await cam(VIEWS.street);
  const fwd = { x: -Math.sin(sp.yaw), z: -Math.cos(sp.yaw) };
  await page.evaluate(([x, y, z]) => window.__game.explode(x, y, z, 2.2), [sp.x + fwd.x * 14 + 4, sp.y + 1.2, sp.z + fwd.z * 14]);
  let done = 0;
  for (const [n, t] of [[2, '0.03s'], [12, '0.2s'], [60, '1s'], [240, '4s'], [660, '11s']]) {
    await frame(n - done); done = n;
    console.log(await snap(page, `${prefix}-${tag}-${level}-blast-${t}`));
  }
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n').slice(0, 4000));
await browser.close();
srv.close();
