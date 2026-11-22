// Sound effects synthesised with the Web Audio API, on volume buses
// (BUILD_BRIEF section 6). Each cue can also show a caption.
export function createAudio(settings, onCaption) {
  let ctx = null, master = null, noise = null;
  const buses = {};
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      for (const b of ['music', 'ambience', 'machines', 'water', 'ui']) { buses[b] = ctx.createGain(); buses[b].connect(master); }
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      apply();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, unlock, { capture: true, passive: true }));
  function apply() { if (!ctx) return; master.gain.value = settings.volume.master; for (const b in buses) buses[b].gain.value = settings.volume[b] ?? 1; }
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function noiseHit(bus, { freq = 400, q = 1, peak = 0.5, a = 0.005, d = 0.18, type = 'lowpass', rate = 1 } = {}) {
    const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; s.playbackRate.value = rate; f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(g); g.connect(buses[bus]); env(g, t, a, peak, d); s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.05);
  }
  function tone(bus, { f0 = 440, f1 = f0, type = 'sine', peak = 0.3, a = 0.005, d = 0.2, at = 0 } = {}) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
    o.connect(g); g.connect(buses[bus]); env(g, t, a, peak, d); o.start(t); o.stop(t + a + d + 0.05);
  }
  const CUES = {
    dig: (band = 1) => { noiseHit('ui', { freq: 900 - band * 150, peak: 0.6, d: 0.16 }); tone('ui', { f0: 140 - band * 15, f1: 60, peak: 0.35, d: 0.12 }); },
    clink: () => { tone('ui', { f0: 2400, f1: 2100, type: 'triangle', peak: 0.25, d: 0.25 }); tone('ui', { f0: 3300, f1: 3100, type: 'sine', peak: 0.15, d: 0.18 }); },
    swish: () => { noiseHit('water', { freq: 1400, q: 0.7, type: 'bandpass', peak: 0.5, a: 0.08, d: 0.45 }); },
    splash: () => { noiseHit('water', { freq: 2200, q: 0.5, type: 'bandpass', peak: 0.35, a: 0.01, d: 0.3 }); },
    pickup: () => tone('ui', { f0: 520, f1: 780, type: 'sine', peak: 0.12, d: 0.08 }),
    drop: () => noiseHit('ui', { freq: 500, peak: 0.25, d: 0.08 }),
    pour: () => noiseHit('ui', { freq: 700, q: 0.8, type: 'bandpass', peak: 0.35, a: 0.05, d: 0.35, rate: 0.7 }),
    find: () => { tone('ui', { f0: 880, peak: 0.12, d: 0.12 }); tone('ui', { f0: 1320, peak: 0.1, d: 0.2, at: 0.08 }); },
    rare: () => { [880, 1108, 1320, 1760].forEach((f, i) => tone('ui', { f0: f, peak: 0.12, d: 0.3, at: i * 0.07 })); },
    coins: () => { for (let i = 0; i < 6; i++) tone('ui', { f0: 2000 + Math.random() * 1500, type: 'triangle', peak: 0.08, d: 0.12, at: i * 0.05 + Math.random() * 0.03 }); },
    error: () => tone('ui', { f0: 220, f1: 180, type: 'square', peak: 0.06, d: 0.15 }),
    siren: () => { tone('machines', { f0: 600, f1: 900, type: 'sawtooth', peak: 0.08, a: 0.3, d: 0.4 }); tone('machines', { f0: 900, f1: 600, type: 'sawtooth', peak: 0.08, a: 0.3, d: 0.4, at: 0.6 }); },
    startup: () => { tone('machines', { f0: 60, f1: 140, type: 'sawtooth', peak: 0.12, a: 0.25, d: 0.5 }); noiseHit('machines', { freq: 600, peak: 0.2, a: 0.2, d: 0.5 }); },
    sputter: () => { for (let i = 0; i < 4; i++) noiseHit('machines', { freq: 300, peak: 0.35, d: 0.07, rate: 0.6 + i * 0.1 }); },
    contract: () => { [523, 659, 784, 1046].forEach((f, i) => tone('ui', { f0: f, type: 'triangle', peak: 0.12, d: 0.35, at: i * 0.09 })); },
    tick: (s = 0.5) => { tone('ui', { f0: 900 + s * 900, type: 'sine', peak: 0.04 + s * 0.04, d: 0.05 }); },
    boom: () => { noiseHit('machines', { freq: 220, peak: 0.9, a: 0.005, d: 0.9, rate: 0.5 }); tone('machines', { f0: 90, f1: 30, peak: 0.5, d: 0.7 }); },
  };
  // ---- Loops: river ambience and spatial machine voices (BUILD_BRIEF 6) ----
  // Machines of one type within 6 m share a voice; at most MAX_VOICES play,
  // nearest first. Each voice is a small synth chain into a PannerNode.
  const MAX_VOICES = 8;
  const voices = new Map(); // key -> voice
  let amb = null;
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random()); return s; }
  function makeAmbience() {
    const river = noiseSrc(), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
    rf.type = 'bandpass'; rf.frequency.value = 520; rf.Q.value = 0.4; rg.gain.value = 0;
    river.connect(rf); rf.connect(rg); rg.connect(buses.water);
    const hiss = noiseSrc(), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
    hf.type = 'highpass'; hf.frequency.value = 2400; hg.gain.value = 0;
    hiss.connect(hf); hf.connect(hg); hg.connect(buses.water);
    const wind = noiseSrc(), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
    wf.type = 'lowpass'; wf.frequency.value = 300; wg.gain.value = 0.04;
    wind.connect(wf); wf.connect(wg); wg.connect(buses.ambience);
    return { rg, hg, wg, wf };
  }
  // Per machine type: what its loop sounds like.
  const VOICE = {
    drill: { osc: 'sawtooth', f: 62, noise: 900, nq: 1.2, n: 0.25, o: 0.05, lfo: 9, depth: 0.3 },
    sluice: { noise: 1500, nq: 0.6, n: 0.35, lfo: 0.4, depth: 0.15 },
    stamp: { osc: 'square', f: 48, noise: 400, nq: 1, n: 0.5, o: 0.03, lfo: 1.6, depth: 0.95 },
    belt: { noise: 2600, nq: 2, n: 0.1, lfo: 14, depth: 0.5 },
    wheel: { noise: 700, nq: 0.8, n: 0.3, lfo: 0.7, depth: 0.5 },
    heat: { osc: 'sine', f: 40, noise: 220, nq: 0.7, n: 0.3, o: 0.08, lfo: 0.3, depth: 0.25 },
    pump: { osc: 'triangle', f: 90, noise: 600, nq: 1, n: 0.12, o: 0.05, lfo: 3, depth: 0.4 },
    engine: { osc: 'sawtooth', f: 45, noise: 300, nq: 1, n: 0.15, o: 0.09, lfo: 18, depth: 0.25 },
  };
  function makeVoice(type) {
    const V = VOICE[type] || VOICE.pump;
    const pan = ctx.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.maxDistance = 60; pan.rolloffFactor = 1.3;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(pan); pan.connect(type === 'engine' ? buses.machines : buses.machines);
    const mod = ctx.createGain(); mod.gain.value = 1; mod.connect(out);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = V.lfo; lg.gain.value = V.depth * 0.5; lfo.connect(lg); lg.connect(mod.gain); lfo.start();
    const n = noiseSrc(), nf = ctx.createBiquadFilter(), ng = ctx.createGain(); nf.type = 'bandpass'; nf.frequency.value = V.noise; nf.Q.value = V.nq; ng.gain.value = V.n; n.connect(nf); nf.connect(ng); ng.connect(mod);
    let osc = null, og = null;
    if (V.osc) { osc = ctx.createOscillator(); osc.type = V.osc; osc.frequency.value = V.f; og = ctx.createGain(); og.gain.value = V.o; osc.connect(og); og.connect(mod); osc.start(); }
    // Grinding rasp for worn machines.
    const g2 = noiseSrc(), gf = ctx.createBiquadFilter(), gg = ctx.createGain(); gf.type = 'bandpass'; gf.frequency.value = 3200; gf.Q.value = 6; gg.gain.value = 0; g2.connect(gf); gf.connect(gg); gg.connect(mod);
    return { type, pan, out, osc, V, gg, lfo, stop() { const t = ctx.currentTime; out.gain.setTargetAtTime(0, t, 0.2); setTimeout(() => { try { lfo.stop(); n.stop(); g2.stop(); osc?.stop(); pan.disconnect(); } catch (_) {} }, 1200); } };
  }
  // listener: { pos, fwd, up }; river: distance (m) to water; sources: [{ type, pos, level, wear, rate }].
  function update(listener, river, sources) {
    if (!ctx) return;
    const t = ctx.currentTime, L = ctx.listener;
    if (L.positionX) { L.positionX.setTargetAtTime(listener.pos[0], t, 0.05); L.positionY.setTargetAtTime(listener.pos[1], t, 0.05); L.positionZ.setTargetAtTime(listener.pos[2], t, 0.05); L.forwardX.value = listener.fwd[0]; L.forwardY.value = listener.fwd[1]; L.forwardZ.value = listener.fwd[2]; L.upX.value = listener.up[0]; L.upY.value = listener.up[1]; L.upZ.value = listener.up[2]; }
    else { L.setPosition(...listener.pos); L.setOrientation(...listener.fwd, ...listener.up); }
    if (!amb) amb = makeAmbience();
    const rv = Math.max(0, 1 - river / 45);
    amb.rg.gain.setTargetAtTime(0.32 * rv * rv, t, 0.3); amb.hg.gain.setTargetAtTime(0.05 * rv * rv * rv, t, 0.3);
    // Cluster sources of a type within 6 m into one voice.
    const clusters = [];
    for (const s of sources) {
      let c = clusters.find(k => k.type === s.type && Math.hypot(k.pos[0] - s.pos[0], k.pos[2] - s.pos[2]) < 6);
      if (!c) { c = { type: s.type, pos: s.pos.slice(), n: 0, level: 0, wear: 0, rate: 0 }; clusters.push(c); }
      c.n++; c.level = Math.min(1.4, c.level + s.level * (c.n > 1 ? 0.35 : 1)); c.wear = Math.max(c.wear, s.wear || 0); c.rate = Math.max(c.rate, s.rate || 1);
    }
    for (const c of clusters) c.d = Math.hypot(c.pos[0] - listener.pos[0], c.pos[1] - listener.pos[1], c.pos[2] - listener.pos[2]);
    clusters.sort((a, b) => a.d - b.d);
    const keep = new Set();
    for (const c of clusters.slice(0, MAX_VOICES)) {
      if (c.d > 60) continue;
      const key = `${c.type}:${Math.round(c.pos[0] / 6)}:${Math.round(c.pos[2] / 6)}`;
      let v = voices.get(key);
      if (!v) { v = makeVoice(c.type); voices.set(key, v); }
      keep.add(key);
      v.pan.positionX ? (v.pan.positionX.value = c.pos[0], v.pan.positionY.value = c.pos[1], v.pan.positionZ.value = c.pos[2]) : v.pan.setPosition(...c.pos);
      v.out.gain.setTargetAtTime(0.5 * c.level, t, 0.25);
      v.gg.gain.setTargetAtTime(c.wear > 0.6 ? (c.wear - 0.6) * 0.5 : 0, t, 0.3);
      if (v.osc) v.osc.frequency.setTargetAtTime(v.V.f * (0.6 + 0.6 * c.rate), t, 0.1);
      v.lfo.frequency.setTargetAtTime(v.V.lfo * (0.5 + 0.5 * c.rate), t, 0.2);
    }
    for (const [k, v] of voices) if (!keep.has(k)) { v.stop(); voices.delete(k); }
  }

  const CAPTIONS = { startup: 'a machine starts up', sputter: 'engine sputters', contract: 'contract complete', dig: 'thunk', clink: 'clink — too hard', swish: 'pan swish', splash: 'splash', pour: 'dirt pours', find: 'something glints', rare: 'a rare find!', coins: 'coins', error: 'nope', siren: 'siren wails', boom: 'explosion' };
  return {
    play(cue, ...args) { if (settings.captions && CAPTIONS[cue]) onCaption?.(CAPTIONS[cue]); if (!ctx || !CUES[cue]) return; try { CUES[cue](...args); } catch (_) {} },
    apply, unlock, update, get voices() { return voices.size; },
  };
}
