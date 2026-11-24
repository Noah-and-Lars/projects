// Probe: frame-to-frame stability of a still view. For each map x tier: stand at spawn, render N frames
// (with and without sim steps in between) and count pixels that change between consecutive frames.
// node tests/e2e/stillprobe.mjs [maps] [tiers] [frames]
import { serve, openGame, outDir } from './harness.mjs';
import fs from 'node:fs';
const maps = (process.argv[2] ?? 'harbor,ridge,works').split(',');
const tiers = (process.argv[3] ?? 'medium,high,low').split(',');
const N = Number(process.argv[4] ?? 8);
const { srv, url } = await serve();
fs.mkdirSync(outDir, { recursive: true });
for (const map of maps) {
  const { browser, page, errors } = await openGame(url, `test=1&level=${map}`);
  await page.evaluate(() => { const g = window.__game; g.render(); g.step(240); g.render(); });
  for (const tier of tiers) {
    const r = await page.evaluate(async ({ tier, N }) => {
      const g = window.__game, game = g.game;
      game.renderer.setQuality(tier); game.toolsEnabled = false; // the tool's idle breathing is intended motion
      g.render(); g.render();
      const cv = game.renderer.three.domElement;
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      const grab = () => { ctx.drawImage(cv, 0, 0); return ctx.getImageData(0, 0, c2.width, c2.height).data; };
      const out = {};
      for (const mode of ['render', 'step']) {
        let prev = null; const counts = []; const cams = []; let mask = new Uint8Array(c2.width * c2.height);
        for (let i = 0; i < N; i++) {
          if (mode === 'step') g.step(1);
          for (const m of game.modules) m.frameUpdate?.(game, 1 / 60);
          game.draw(1 / 60, false);
          const px = grab();
          const cp = game.renderer.camera.position; cams.push([cp.x, cp.y, cp.z, game.renderer.camera.rotation.x, game.renderer.camera.rotation.y].map((v) => +v.toFixed(5)).join(','));
          if (prev) {
            let n = 0;
            for (let k = 0; k < px.length; k += 4) {
              const d = Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]);
              if (d > 6) { n++; mask[k >> 2] = 255; }
            }
            counts.push(n);
          }
          prev = px;
        }
        // diff mask image
        const id = ctx.createImageData(c2.width, c2.height);
        for (let k = 0; k < mask.length; k++) { id.data[k * 4] = mask[k]; id.data[k * 4 + 3] = 255; }
        const c3 = document.createElement('canvas'); c3.width = c2.width; c3.height = c2.height; c3.getContext('2d').putImageData(id, 0, 0);
        out[mode] = { counts, cams: [...new Set(cams)].slice(0, 4), mask: c3.toDataURL('image/png') };
      }
      return out;
    }, { tier, N });
    for (const mode of ['render', 'step']) {
      console.log(map, tier, mode, 'changed px per frame:', r[mode].counts.join(' '), '| cameras:', r[mode].cams.join(' / '));
      fs.writeFileSync(`${outDir}/still-${map}-${tier}-${mode}-mask.png`, Buffer.from(r[mode].mask.split(',')[1], 'base64'));
    }
    await page.screenshot({ path: `${outDir}/still-${map}-${tier}.png`, timeout: 180000 });
  }
  if (errors.length) console.log('errors', errors.slice(0, 5));
  await browser.close();
}
srv.close();
