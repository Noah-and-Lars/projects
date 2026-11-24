// Audio e2e: boots the game in headless Chromium, forces the AudioContext, drives sim events,
// renders every bank sound/loop through an OfflineAudioContext and checks levels.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assert, outDir } from './harness.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

export default async function audioE2E({ url, test }) {
  await test('audio: events -> voices, offline render of every sound', async () => {
    const browser = await playwright.chromium.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url + '?test=1&level=testyard');
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });

    // 1. no context yet: sim events must be harmless
    const pre = await page.evaluate(() => {
      const g = window.__game; const a = g.game.ext.audio;
      g.explode(1, 1.2, -8, 1.4); g.step(20);
      return { api: Object.keys(a).sort(), ready: a.engine.ready, started: a.engine.stats.started };
    });
    for (const k of ['engine', 'play', 'uiClick', 'uiHover', 'setVolume']) assert(pre.api.includes(k), 'api has ' + k);
    assert(!pre.ready && pre.started === 0, 'no context before a gesture: ' + JSON.stringify(pre));

    // 2. force the context; drive events
    const ev = await page.evaluate(() => {
      const g = window.__game; const a = g.game.ext.audio;
      const ok = a.ensure();
      const out = { ok, state: a.engine.ctx && a.engine.ctx.state };
      g.step(5); g.render();
      const s0 = a.engine.stats.started;
      g.setView(0.8, 0.05, -2.3, 0, -0.35); g.step(5);
      g.selectTool('sledge'); g.buttons(1); g.step(100); g.buttons(0);
      out.afterSledge = a.engine.stats.started - s0;
      const s1 = a.engine.stats.started;
      g.setView(6, 0.05, 8, 0.5, 0.1); g.explode(1, 1.2, -8, 2.4); g.step(40); g.render();
      out.afterExplosion = a.engine.stats.started - s1;
      g.game.sim.out.push({ type: 'custom', name: 'mission:alarm', data: {} });
      g.game.sim.out.push({ type: 'custom', name: 'tool:shot', data: { tool: 'shotgun' } });
      g.step(2); g.render();
      out.alarmLoop = a.engine.hasLoop('alarm');
      out.cue = a.engine.music && a.engine.music.currentCue;
      a.uiClick();
      out.log = a.engine.log.slice();
      out.stats = { ...a.engine.stats, voices: a.engine.voiceCount };
      out.ambient = a.engine.hasLoop('ambient');
      return out;
    });
    console.log('     audio events: ' + JSON.stringify({ ...ev, log: undefined, logLen: ev.log.length }));
    assert(ev.ok, 'context created');
    assert(ev.afterSledge > 0, 'sledge carve started voices: ' + ev.afterSledge);
    assert(ev.afterExplosion > 0, 'explosion started voices: ' + ev.afterExplosion);
    assert(ev.log.some((n) => n.startsWith('explosion.')), 'explosion sound logged');
    assert(ev.log.some((n) => n.startsWith('mat.')), 'material sound logged');
    assert(ev.log.includes('tool.shot.shotgun'), 'shotgun logged');
    assert(ev.alarmLoop && ev.cue === 'heist', 'alarm loop + heist cue');
    assert(ev.stats.voices <= 32, 'voice cap');

    // 3. render everything offline
    const results = await page.evaluate(async () => {
      const a = window.__game.game.ext.audio;
      const { SOUNDS, LOOPS, createMasterChain } = a.bank;
      const SR = 22050;
      const analyse = (buf, activeFrom, activeTo) => {
        let peak = 0, sum = 0, n = 0, bad = 0, last = 0, clip = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const d = buf.getChannelData(c);
          for (let i = 0; i < d.length; i++) {
            const v = d[i];
            if (!Number.isFinite(v)) { bad++; continue; }
            const av = Math.abs(v);
            if (av > peak) peak = av;
            if (av > 0.98) clip++;
            if (av > 0.002 && i > last) last = i;
            if (i >= activeFrom && i < activeTo) { sum += v * v; n++; }
          }
        }
        return { peak, rms: Math.sqrt(sum / Math.max(1, n)), bad, tail: last / SR, clip };
      };
      const rows = [];
      for (const name of Object.keys(SOUNDS)) {
        const ctx = new OfflineAudioContext(2, SR * 6, SR);
        const chain = createMasterChain(ctx);
        let dur;
        try { dur = SOUNDS[name](ctx, chain.input, { gain: 1, amount: 0.8 }); } catch (e) { rows.push({ name, error: String(e) }); continue; }
        const buf = await ctx.startRendering();
        const r = analyse(buf, 0, Math.min(buf.length, Math.max(1, Math.floor(dur * SR))));
        rows.push({ name, dur, ...r });
      }
      for (const name of Object.keys(LOOPS)) {
        const ctx = new OfflineAudioContext(2, SR * 2, SR);
        const chain = createMasterChain(ctx);
        const h = LOOPS[name](ctx, chain.input);
        h.update({ level: 1, freq: 70, cutoff: 900, rate: 11 }, 0);
        const buf = await ctx.startRendering();
        const r = analyse(buf, SR * 0.5, SR * 2);
        rows.push({ name: 'loop:' + name, dur: 2, ...r });
      }
      return rows;
    });
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'audio-levels.json'), JSON.stringify(results, null, 1));
    const bad = [];
    for (const r of results) {
      if (r.error) { bad.push(r.name + ' threw ' + r.error); continue; }
      if (r.bad) bad.push(r.name + ' has NaN/Inf');
      if (!(r.peak > 0.01)) bad.push(r.name + ' silent (peak ' + r.peak.toFixed(4) + ')');
      if (r.peak > 1.0001) bad.push(r.name + ' peak > 1: ' + r.peak);
      if (r.clip > 20) bad.push(r.name + ' clips (' + r.clip + ' samples)');
      if (!r.name.startsWith('loop:') && (r.tail < 0.004 || r.tail > 5.5)) bad.push(r.name + ' odd duration ' + r.tail.toFixed(2));
    }
    console.log('     rendered ' + results.length + ' sounds/loops; table in tests/e2e/out/audio-levels.json');
    assert(bad.length === 0, 'level problems:\n' + bad.join('\n'));
    assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
    await browser.close();
  });
}
