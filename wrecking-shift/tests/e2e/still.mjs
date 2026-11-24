// Regression: a player standing still must see a still picture ("the ground is glitched even when I am
// standing still": the eye flipped by 0.1 mm every tick and every sub-pixel ground edge flickered).
import { assert, openGame, shot } from './harness.mjs';

export async function runStillTests(url, test) {
  await test('still view: standing at the harbour spawn, consecutive frames are identical (medium tier)', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=harbor');
    const r = await page.evaluate(() => {
      const g = window.__game, game = g.game;
      game.renderer.setQuality('medium');
      game.toolsEnabled = false; // the tool's idle breathing is intended motion
      g.render(); g.step(240); g.render();
      const cv = game.renderer.three.domElement;
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      let prev = null; const counts = []; const eyes = new Set();
      for (let i = 0; i < 6; i++) {
        g.step(1); // the sim runs (player stands), then one real frame
        for (const m of game.modules) m.frameUpdate?.(game, 1 / 60);
        game.draw(1 / 60, false);
        ctx.drawImage(cv, 0, 0);
        const px = ctx.getImageData(0, 0, c2.width, c2.height).data;
        const c = game.renderer.camera.position; eyes.add(c.x + ',' + c.y + ',' + c.z);
        if (prev) { let n = 0; for (let k = 0; k < px.length; k += 4) if (Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]) > 6) n++; counts.push(n); }
        prev = px;
      }
      return { counts, eyes: eyes.size, grounded: game.player.grounded };
    });
    await shot(page, 'still-harbor');
    assert(r.grounded, 'standing');
    assert(r.eyes === 1, 'camera moved while standing: ' + r.eyes + ' positions');
    assert(Math.max(...r.counts) <= 8, 'pixels changed between still frames: ' + r.counts.join(' '));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
