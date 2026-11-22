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
  };
  const CAPTIONS = { dig: 'thunk', clink: 'clink — too hard', swish: 'pan swish', splash: 'splash', pour: 'dirt pours', find: 'something glints', rare: 'a rare find!', coins: 'coins', error: 'nope' };
  return {
    play(cue, ...args) { if (settings.captions && CAPTIONS[cue]) onCaption?.(CAPTIONS[cue]); if (!ctx || !CUES[cue]) return; try { CUES[cue](...args); } catch (_) {} },
    apply, unlock,
  };
}
