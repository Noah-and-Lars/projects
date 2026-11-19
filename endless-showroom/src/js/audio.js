// All sound is synthesised with Web Audio: the store's hum, the PA chime,
// footsteps, staff and pick-up / place / eat sounds.
let ctx = null, master = null, humGain = null, nightGain = null, vol = 0.7, muted = false;

function noiseBuffer(sec = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  return b;
}
let brown = null, white = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : vol; master.connect(ctx.destination);
  brown = noiseBuffer(3);
  white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const w = white.getChannelData(0); for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
  // fluorescent hum + air handling
  humGain = ctx.createGain(); humGain.gain.value = 0.05; humGain.connect(master);
  const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; src.connect(lp); lp.connect(humGain); src.start();
  const o = ctx.createOscillator(); o.frequency.value = 120; const og = ctx.createGain(); og.gain.value = 0.08; o.connect(og); og.connect(humGain); o.start();
  // night drone
  nightGain = ctx.createGain(); nightGain.gain.value = 0; nightGain.connect(master);
  for (const f of [55, 82.4, 58.3]) { const d = ctx.createOscillator(); d.type = 'sawtooth'; d.frequency.value = f; const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 180; const g = ctx.createGain(); g.gain.value = 0.05; d.connect(f2); f2.connect(g); g.connect(nightGain); d.start(); }
}

export function setVolume(v) { vol = v; if (master) master.gain.value = muted ? 0 : vol; }
export function setMuted(m) { muted = m; if (master) master.gain.value = muted ? 0 : vol; }
export function isMuted() { return muted; }

export function setAmbience(night, lightsOn) {
  if (!ctx) return;
  const t = ctx.currentTime;
  humGain.gain.setTargetAtTime(lightsOn ? 0.05 : 0.01, t, 0.5);
  nightGain.gain.setTargetAtTime(night ? 0.6 : 0, t, 2);
}

function tone(freq, dur, type = 'sine', gain = 0.2, when = 0, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function burst(dur, freq, gain = 0.2, q = 1, type = 'bandpass', pan = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = white;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = g;
  if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  s.connect(f); f.connect(g); node.connect(master); s.start(t); s.stop(t + dur + 0.05);
}

export const sfx = {
  chime() { tone(784, 0.6, 'sine', 0.18); tone(659, 0.6, 'sine', 0.18, 0.35); tone(523, 0.9, 'sine', 0.18, 0.7); },
  morning() { tone(523, 0.5, 'sine', 0.18); tone(659, 0.5, 'sine', 0.18, 0.3); tone(784, 0.8, 'sine', 0.18, 0.6); },
  step(soft) { burst(0.07, soft ? 500 : 900, soft ? 0.05 : 0.09, 1.2); },
  land() { burst(0.15, 300, 0.22, 0.8); },
  pick() { tone(440, 0.08, 'triangle', 0.15); tone(660, 0.1, 'triangle', 0.12, 0.06); },
  place() { burst(0.18, 220, 0.3, 0.7); tone(110, 0.15, 'sine', 0.2); },
  eat() { for (let i = 0; i < 3; i++) setTimeout(() => burst(0.06, 1800, 0.12, 2), i * 110); },
  heal() { tone(523, 0.15, 'sine', 0.15); tone(784, 0.25, 'sine', 0.15, 0.1); },
  hurt() { burst(0.25, 400, 0.35, 0.6, 'lowpass'); tone(160, 0.3, 'square', 0.08, 0, 0.5); },
  bash() { burst(0.12, 180, 0.25, 0.9); },
  breakIt() { burst(0.4, 250, 0.35, 0.5); burst(0.3, 1200, 0.15, 1); },
  staffNear(pan) { // a low, uneasy murmur
    if (!ctx) return;
    burst(0.6, 140 + Math.random() * 60, 0.12, 4, 'bandpass', pan);
  },
  deny() { tone(200, 0.12, 'square', 0.08); },
  click() { tone(900, 0.04, 'square', 0.05); },
  death() { tone(220, 1.2, 'sawtooth', 0.15, 0, 0.25); burst(0.8, 200, 0.3, 0.5, 'lowpass'); },
  chat() { tone(1200, 0.05, 'sine', 0.06); },
};
