// Look / lighting e2e checks (testyard). Run standalone (`node tests/e2e/look.mjs`) or through run.mjs.
// LOOK_FULL=1 also renders every tier x time-of-day x viewpoint (slow on SwiftShader).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, openGame, outDir, serve } from './harness.mjs';
import { VIEWS, look, setCam, snap } from './lookviews.mjs';

const stats = (page) => page.evaluate(() => window.__game.game.renderer.stats());

/** mean luminance (0..255) of a screen rectangle of the last presented frame, read back from a 2D copy of the canvas */
async function meanLuma(page, x0, y0, x1, y1) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    window.__game.render();
    const src = document.getElementById('view');
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4);
  }, [x0, y0, x1, y1]);
}

/** GLSL vxTrace vs CPU reference on random rays in the live game volume. Returns mismatch count. */
async function traceMismatches(page, n, seed, skipUpload = false) {
  return page.evaluate(([n, seed]) => {
    const R = window.__game.game.renderer, occ = R.volumes.world.occ;
    let s = seed >>> 0;
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rays = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      const o = i * 7;
      // origins inside and around the volume, biased to the populated bottom part
      rays[o] = (rnd() * 1.2 - 0.1) * occ.nx; rays[o + 1] = (rnd() * 1.2 - 0.1) * Math.min(occ.ny, 90); rays[o + 2] = (rnd() * 1.2 - 0.1) * occ.nz;
      let dx = rnd() * 2 - 1, dy = rnd() * 2 - 1, dz = rnd() * 2 - 1;
      if (i % 9 === 0) dx = 0; if (i % 11 === 0) dy = 0; if (i % 13 === 0) dz = 0;
      const l = Math.hypot(dx, dy, dz) || 1;
      if (l === 1 && dx === 0 && dy === 0 && dz === 0) dx = 1;
      rays[o + 3] = dx / l; rays[o + 4] = dy / l; rays[o + 5] = dz / l;
      rays[o + 6] = i % 3 === 0 ? 1000 : rnd() * 60;
    }
    const gpu = R.debugTrace(rays);
    let bad = 0, hits = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 7;
      // the shader works in float32: feed the CPU reference the same rounded inputs
      const cpu = occ.trace(rays[o], rays[o + 1], rays[o + 2], rays[o + 3], rays[o + 4], rays[o + 5], rays[o + 6]) ? 1 : 0;
      if (cpu) hits++;
      if (cpu !== gpu[i]) bad++;
    }
    return { bad, hits, n };
  }, [n, seed]);
}

export async function runLookTests(url, test) {
  const full = !!process.env.LOOK_FULL;

  await test('look: GLSL trace == CPU reference in the game volume (before / after destruction)', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    const st = await stats(page);
    assert(st.effectiveQuality === 'medium' && st.volume, 'medium tier with volumes: ' + JSON.stringify(st));
    const a = await traceMismatches(page, 30000, 1);
    console.log('     trace check', JSON.stringify(a));
    assert(a.hits > 3000 && a.hits < a.n - 3000, 'ray set is meaningful');
    // float32 GPU DDA vs float64 CPU DDA can disagree on exact corner grazes only
    assert(a.bad <= a.n * 0.002, 'GLSL/CPU mismatches before edit: ' + a.bad);
    // negative control: edit the CPU mirror without uploading -> many mismatches
    const neg = await page.evaluate(() => {
      const R = window.__game.game.renderer, occ = R.volumes.world.occ;
      const keep = occ.bits.slice(), keepD = occ.mips[0].data.slice();
      occ.bits.fill(0, 0, occ.bits.length >> 3);
      return { keep: Array.from(keep.subarray(0, 0)), n: keepD.length, restore: (window.__keep = [keep, keepD]) && 1 };
    });
    void neg;
    const b = await traceMismatches(page, 30000, 1);
    await page.evaluate(() => { const occ = window.__game.game.renderer.volumes.world.occ; occ.bits.set(window.__keep[0]); occ.mips[0].data.set(window.__keep[1]); });
    assert(b.bad > 50, 'negative control must mismatch: ' + b.bad);
    // real destruction through the sim -> incremental sub-box uploads
    await page.evaluate(() => { window.__game.explode(1, 1.2, -8, 1.5); window.__game.step(30); window.__game.explode(9, 1, -1.5, 1.2); window.__game.step(30); window.__game.render(); });
    const st2 = await stats(page);
    assert(st2.volume.uploads > 0, 'volume sub-boxes uploaded: ' + JSON.stringify(st2.volume));
    console.log('     incremental update', JSON.stringify({ ms: st2.volume.lastUpdateMs, voxels: st2.volume.lastUpdateVoxels, uploads: st2.volume.uploads }));
    const c = await traceMismatches(page, 30000, 2);
    assert(c.bad <= c.n * 0.002, 'GLSL/CPU mismatches after destruction: ' + c.bad);
    // incremental CPU mirror == full rebuild
    const same = await page.evaluate(() => {
      const occ = window.__game.game.renderer.volumes.world.occ;
      const bits = occ.bits.slice(), mips = occ.mips.map((m) => m.data.slice());
      occ.rebuildAll();
      let ok = bits.every((v, i) => v === occ.bits[i]);
      mips.forEach((m, l) => { ok = ok && m.every((v, i) => v === occ.mips[l].data[i]); });
      return ok;
    });
    assert(same, 'incremental volume == full rebuild');
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('look: interiors are dark, a blast hole lets the sun in on the next frame', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await look(page, 'medium', 'day');
    // outside vs inside brightness of the traced lighting itself (eye adaptation off; checked separately below)
    await page.evaluate(() => { window.__game.game.renderer.post.autoExposure = false; });
    await setCam(page, 'street');
    await snap(page, 'look-medium-day-street');
    const outside = await meanLuma(page, 40, 240, 600, 350);
    await setCam(page, 'interior');
    await snap(page, 'look-medium-day-interior');
    const inside = await meanLuma(page, 200, 250, 440, 350);
    console.log('     mean luma outside ground', outside.toFixed(1), 'inside floor', inside.toFixed(1));
    assert(inside < outside * 0.75, `interior darker than outside (${inside} vs ${outside})`);
    // with eye adaptation the interior opens up, but stays darker than the sunny street (as in the reference)
    await page.evaluate(() => { window.__game.game.renderer.post.autoExposure = true; });
    await setCam(page, 'street'); await snap(page, 'look-medium-day-street-ae');
    const outsideAE = await meanLuma(page, 40, 240, 600, 350);
    await setCam(page, 'interior'); await snap(page, 'look-medium-day-interior-ae');
    const insideAE = await meanLuma(page, 200, 250, 440, 350);
    console.log('     with eye adaptation: outside', outsideAE.toFixed(1), 'inside', insideAE.toFixed(1));
    assert(insideAE > inside * 1.15 && insideAE < outsideAE * 0.95, `adapted interior brighter than unadapted, still darker than outside (${inside} -> ${insideAE} vs ${outsideAE})`);
    await page.evaluate(() => { window.__game.game.renderer.post.autoExposure = false; });
        // golden-hour sun is low: a hole in the sun-facing wall throws a long shaft across the room
    await look(page, 'medium', 'sunset');
    await setCam(page, 'interior');
    await snap(page, 'look-blast-floor-before');
    const cells = async () => { const out = []; for (let y = 240; y < 360; y += 40) for (let x = 120; x < 560; x += 40) out.push(await meanLuma(page, x, y, x + 40, y + 40)); return out; };
    const before = await cells();
    await page.evaluate(() => { window.__game.explode(1, 1.4, -8, 1.5); window.__game.step(2); });
    await snap(page, 'look-blast-floor-after');
    const after = await cells();
    // some 40 px cell of the (previously shadowed) floor must now be sunlit
    let gain = 0;
    after.forEach((v, i) => { gain = Math.max(gain, v - before[i]); });
    console.log('     largest luma gain of a floor/wall cell after the blast:', gain.toFixed(1));
    assert(gain > 10, `sunlight enters through the new hole (gain ${gain})`);
    await page.evaluate(() => { window.__game.step(90); window.__game.game.renderer.post.autoExposure = true; });
    await look(page, 'medium', 'day');
    for (const v of ['blast', 'debris', 'interior']) { await setCam(page, v); await snap(page, 'look-medium-day-' + v + '-blast'); }
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('look: quality tiers, time-of-day presets, resolution scale', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    await page.evaluate(() => { window.__game.explode(1, 1.2, -8, 1.4); window.__game.step(90); });
    const tiers = ['low', 'medium', 'high'], tods = ['day', 'sunset', 'overcast', 'night'];
    const views = full ? Object.keys(VIEWS) : ['overview', 'interior'];
    for (const q of tiers) {
      for (const t of full ? tods : q === 'medium' ? tods : ['sunset']) {
        await look(page, q, t);
        for (const v of views) {
          await setCam(page, v);
          await snap(page, `look-${q}-${t}-${v}`);
          const l = await meanLuma(page, 0, 0, 640, 360);
          assert(l > 4 && l < 235, `${q}/${t}/${v} is neither black nor blown out: ${l}`);
        }
      }
      const s = await stats(page);
      assert(s.effectiveQuality === q, 'tier active: ' + q + ' ' + JSON.stringify(s));
      assert(!!s.volume === (q !== 'low'), 'volumes only above low');
      assert(s.pendingChunks === 0, 'everything meshed');
    }
    await look(page, 'medium', 'sunset');
    await page.evaluate(() => window.__game.game.renderer.setResolutionScale(0.5));
    await setCam(page, 'street');
    await snap(page, 'look-medium-sunset-street-res50');
    const s = await stats(page);
    assert(s.renderSize[0] === 320 && s.renderSize[1] === 180, 'half resolution scene target: ' + s.renderSize);
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });

  await test('look: automatic fallback when 3D textures cannot be allocated', async () => {
    const { browser, page, errors } = await openGame(url, 'test=1&level=testyard');
    const s = await page.evaluate(() => {
      WebGL2RenderingContext.prototype.texStorage3D = function () { throw new Error('simulated: no 3D textures'); };
      window.__game.load('testyard');
      window.__game.render();
      return window.__game.game.renderer.stats();
    });
    assert(s.quality === 'medium' && s.effectiveQuality === 'low' && !s.volume, 'fell back to low: ' + JSON.stringify(s));
    await setCam(page, 'overview');
    await snap(page, 'look-fallback-overview');
    const l = await meanLuma(page, 0, 0, 640, 360);
    assert(l > 20, 'fallback still renders: ' + l);
    const other = errors.filter((e) => !e.includes('simulated'));
    assert(other.length === 0, 'console errors: ' + other.join('\n'));
    await browser.close();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { srv, url } = await serve();
  let failed = 0;
  const test = async (name, fn) => {
    const t = Date.now();
    try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e}`); }
  };
  await runLookTests(url, test);
  srv.close();
  fs.mkdirSync(outDir, { recursive: true });
  console.log(failed ? failed + ' look test(s) failed' : 'look ok, screenshots in ' + path.relative(process.cwd(), outDir));
  if (failed) process.exit(1);
}
