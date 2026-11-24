// Regression: a player standing still must see a still picture ("the ground is glitched even when I am
// standing still": the eye flipped by 0.1 mm every tick and every sub-pixel ground edge flickered).
import { assert, openGame, shot } from './harness.mjs';

async function measure(page, taa, frames) {
  return page.evaluate(({ taa, frames }) => {
    const g = window.__game, game = g.game;
    game.renderer.setQuality('medium');
    game.renderer.setTAA(taa);
    game.toolsEnabled = false; // the tool's idle breathing is intended motion
    g.render(); g.step(240); g.render();
    const cv = game.renderer.three.domElement;
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    let prev = null; const counts = []; const eyes = new Set();
    for (let i = 0; i < frames; i++) {
      g.step(1); // the sim runs (player stands), then one real frame
      for (const m of game.modules) m.frameUpdate?.(game, 1 / 60);
      game.draw(1 / 60, false);
      ctx.drawImage(cv, 0, 0);
      const px = ctx.getImageData(0, 0, c2.width, c2.height).data;
      const c = game.renderer.camera.position; eyes.add(c.x + ',' + c.y + ',' + c.z);
      if (prev) { let n = 0; for (let k = 0; k < px.length; k += 4) if (Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]) > 6) n++; counts.push(n); }
      prev = px;
    }
    return { counts, eyes: eyes.size, grounded: game.player.grounded, pixels: c2.width * c2.height };
  }, { taa, frames });
}

export async function runStillTests(url, test) {
  await test('still view: standing at the harbour spawn, the camera and the picture stay still (medium, TAA off / on)', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=harbor');
    const a = await measure(page, false, 6);
    assert(a.grounded, 'standing');
    assert(a.eyes === 1, 'camera moved while standing: ' + a.eyes + ' positions');
    assert(Math.max(...a.counts) <= 8, 'TAA off: pixels changed between still frames: ' + a.counts.join(' '));
    // TAA: sub-pixel jitter, but a still camera accumulates progressively; after warm-up only a few pixels move a little
    const b = await measure(page, true, 80);
    const tail = b.counts.slice(-10);
    assert(b.eyes === 1, 'camera moved (TAA run)');
    assert(Math.max(...tail) <= b.pixels * 0.0015, 'TAA on: pixels changed between converged still frames: ' + tail.join(' '));
    await shot(page, 'still-harbor');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
