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

  // "heat waves" with head bob on: after walking, the bob must end at exactly zero and the final camera transform
  // (after bob, punch, shake) must then be bit-identical every frame. Real-loop-like timing: 144 Hz frames, 60 Hz sim.
  await test('still view: head bob on, walk then stop: the final camera settles to bit-identical within 0.5 s', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=harbor');
    try {
    const r = await page.evaluate(() => {
      const g = window.__game, game = g.game, R = game.renderer;
      g.render(); g.step(120);
      const s = game.ext.settings; if (s && !s.headBob) s.set('headBob', true);
      const real = R.render.bind(R);
      R.render = () => {}; // camera path only (setCamera, bob, punch, shake), no GPU work
      let acc = 0, prev = null, lastChange = -1, maxBob = 0;
      const frame = (walk, i) => {
        const dt = 1 / 144; acc += dt;
        if (walk) game.input.keys.add('KeyW'); else game.input.keys.delete('KeyW');
        while (acc >= 1 / 60) { game.fixedStep(); acc -= 1 / 60; }
        for (const m of game.modules) m.frameUpdate?.(game, dt);
        game.draw(dt, false);
        R.camera.updateMatrixWorld();
        const key = R.camera.matrixWorld.elements.join(',');
        if (!walk && prev !== null && key !== prev) lastChange = i;
        prev = key;
        if (walk) maxBob = Math.max(maxBob, Math.abs(game.viewBob.y));
      };
      for (let i = 0; i < 300; i++) frame(true, i);
      const walked = game.player.stride;
      for (let i = 0; i < 600; i++) frame(false, i);
      R.render = real;
      return { walked, maxBob, lastChange, bob: { ...game.viewBob }, headBob: !!s?.headBob };
    });
    assert(r.headBob && r.walked > 2 && r.maxBob > 0.005, 'walked with a visible bob: ' + JSON.stringify(r));
    assert(r.bob.y === 0 && r.bob.roll === 0, 'bob ends at exactly zero: ' + JSON.stringify(r.bob));
    assert(r.lastChange < 72, 'camera still changing ' + r.lastChange + ' frames (144 Hz) after stopping');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    } finally { await browser.close(); }
  });
}
