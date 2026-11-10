// All sound is synthesised with the Web Audio API. The context is created on
// the first tap/click/key press, because iOS blocks audio until then.

export function createAudio() {
  let ctx = null, master = null, engine = null, noiseBuf = null;
  let muted = false;
  let engineOn = false;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      // White noise buffer for impacts.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // iOS: play a silent buffer inside the gesture.
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(master); s.start(0);
      buildEngine();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  function buildEngine() {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const sub = ctx.createOscillator(); sub.type = 'triangle';
    // A little wobble makes it sound like a single-cylinder thumper.
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 18;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.25;
    const am = ctx.createGain(); am.gain.value = 0.75;
    lfo.connect(lfoGain); lfoGain.connect(am.gain);
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const g3 = ctx.createGain(); g3.gain.value = 0.6;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 3;
    const out = ctx.createGain(); out.gain.value = 0;
    o1.connect(g1); o2.connect(g2); sub.connect(g3);
    g1.connect(am); g2.connect(am); g3.connect(am);
    am.connect(filter); filter.connect(out); out.connect(master);
    [o1, o2, sub, lfo].forEach(o => o.start());
    engine = { o1, o2, sub, lfo, filter, out };
  }

  function setEngine(rpm, throttle, on) {
    if (!engine) return;
    const t = ctx.currentTime;
    const f = 34 + rpm * 120 + throttle * 6;
    engine.o1.frequency.setTargetAtTime(f, t, 0.03);
    engine.o2.frequency.setTargetAtTime(f * 0.5 + 1.5, t, 0.03);
    engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    engine.lfo.frequency.setTargetAtTime(10 + rpm * 30, t, 0.05);
    engine.filter.frequency.setTargetAtTime(500 + rpm * 1800 + throttle * 700, t, 0.04);
    engine.out.gain.setTargetAtTime(on ? 0.12 + throttle * 0.1 : 0, t, on === engineOn ? 0.05 : 0.15);
    engineOn = on;
  }

  function noise(duration, freq, gain, q = 1, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + duration + 0.05);
  }

  function tone(freq, duration, gain, type = 'sine', delay = 0, slideTo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + duration + 0.05);
  }

  return {
    unlock,
    setEngine,
    land(intensity) {
      const k = Math.min(1, intensity);
      noise(0.25 + k * 0.2, 300 + k * 500, 0.25 + k * 0.45);
      tone(90, 0.2, 0.2 + k * 0.4, 'sine', 0, 40);
    },
    crash() {
      noise(0.7, 900, 0.8, 0.7);
      noise(0.4, 200, 0.9);
      tone(70, 0.4, 0.6, 'triangle', 0, 30);
      tone(1400, 0.15, 0.08, 'square', 0.05, 600);
    },
    beep(go) { tone(go ? 880 : 440, go ? 0.5 : 0.22, 0.35, 'square'); },
    finish() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 0.25, 'triangle', i * 0.11)); },
    click() { tone(660, 0.06, 0.12, 'square'); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
    },
    get muted() { return muted; },
    suspend() { setEngine(0, 0, false); },
  };
}
