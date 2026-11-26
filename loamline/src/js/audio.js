// All sound is synthesised at start-up: no audio files. Noise beds for the
// tyres and wind, a freehub buzz for coasting, and short one-shots for
// landings, crashes and the UI. Plus a small generative music loop.

let ctx = null;
let master, sfxBus, musicBus;
let buffers = null;
let loops = null;
let muted = false, musicOn = true;

function pinkNoise(n) {
  const a = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return a;
}

// One-pole filters, enough for shaping noise.
function lowpass(a, sr, f) {
  const k = 1 - Math.exp(-2 * Math.PI * f / sr);
  let y = 0;
  for (let i = 0; i < a.length; i++) { y += (a[i] - y) * k; a[i] = y; }
}
function highpass(a, sr, f) {
  const k = 1 - Math.exp(-2 * Math.PI * f / sr);
  let y = 0;
  for (let i = 0; i < a.length; i++) { y += (a[i] - y) * k; a[i] = a[i] - y; }
}
function normalise(a, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m;
}
function burst(a, at, len, amp, decay) {
  for (let i = 0; i < len; i++) {
    const j = (at + i) % a.length;
    a[j] += (Math.random() * 2 - 1) * amp * Math.exp(-i / len * decay);
  }
}
function tone(a, at, len, freq, sr, amp, decay) {
  for (let i = 0; i < len; i++) {
    const j = (at + i) % a.length;
    a[j] += Math.sin(2 * Math.PI * freq * i / sr) * amp * Math.exp(-i / len * decay);
  }
}

function makeBuffers(sr) {
  const B = {};
  // Wind: pink noise, 3 s loop.
  B.wind = pinkNoise(sr * 3); normalise(B.wind, 0.8);
  // Gravel crunch: sparse filtered ticks over 2 s.
  {
    const a = new Float32Array(sr * 2);
    for (let k = 0; k < 220; k++) {
      const at = Math.floor(Math.random() * a.length);
      const big = Math.random() < 0.12;
      burst(a, at, Math.floor(sr * (big ? 0.012 : 0.003 + Math.random() * 0.006)), big ? 0.9 : 0.3 + Math.random() * 0.4, 4);
    }
    highpass(a, sr, 900); lowpass(a, sr, 5000); normalise(a, 0.8);
    B.gravel = a;
  }
  // Tread hum: knobs slapping the dirt, pitched by playback rate.
  {
    const a = new Float32Array(sr * 2);
    const knobs = 120;
    for (let k = 0; k < knobs; k++) {
      const at = Math.floor((k + (Math.random() - 0.5) * 0.4) / knobs * a.length);
      const amp = (0.3 + Math.random() * 0.7) ** 1.5;
      burst(a, at, Math.floor(sr * 0.006), amp, 5);
      tone(a, at, Math.floor(sr * 0.02), 90 + Math.random() * 110, sr, amp * 0.6, 4);
    }
    lowpass(a, sr, 1800); normalise(a, 0.8);
    B.tread = a;
  }
  // Freehub: a click every 1/40 s; playback rate sets the buzz speed.
  {
    const a = new Float32Array(sr);
    for (let k = 0; k < 40; k++) {
      const at = Math.floor(k / 40 * a.length);
      const v = 0.94 + Math.random() * 0.12;
      burst(a, at, Math.floor(sr * 0.0012), 0.8, 4);
      tone(a, at, Math.floor(sr * 0.012), 3100 * v, sr, 0.4, 14);
      tone(a, at, Math.floor(sr * 0.008), 4700 * v, sr, 0.2, 18);
    }
    highpass(a, sr, 1200); normalise(a, 0.7);
    B.hub = a;
  }
  // One-shots.
  const one = (len, fn) => { const a = new Float32Array(Math.floor(sr * len)); fn(a); normalise(a, 0.9); return a; };
  B.thud = one(0.35, (a) => { tone(a, 0, a.length, 62, sr, 1, 6); burst(a, 0, Math.floor(sr * 0.06), 0.6, 5); lowpass(a, sr, 900); });
  B.crash = one(0.9, (a) => {
    burst(a, 0, a.length, 0.8, 5);
    for (let k = 0; k < 5; k++) tone(a, Math.floor(sr * k * 0.12), Math.floor(sr * 0.25), 55 + k * 9, sr, 1 - k * 0.15, 6);
    lowpass(a, sr, 2400);
  });
  B.click = one(0.05, (a) => { tone(a, 0, a.length, 1400, sr, 1, 9); burst(a, 0, 60, 0.4, 4); });
  B.tick = one(0.03, (a) => { tone(a, 0, a.length, 2200, sr, 0.8, 10); });
  B.pop = one(0.12, (a) => { burst(a, 0, Math.floor(sr * 0.03), 0.8, 5); tone(a, 0, a.length, 140, sr, 0.8, 6); lowpass(a, sr, 1500); });
  B.ding = one(0.6, (a) => { tone(a, 0, a.length, 880, sr, 0.7, 5); tone(a, Math.floor(sr * 0.08), a.length - Math.floor(sr * 0.08), 1318.5, sr, 0.6, 5); });
  B.good = one(0.5, (a) => { tone(a, 0, a.length, 660, sr, 0.6, 5); tone(a, 0, a.length, 990, sr, 0.4, 6); });
  B.beep = one(0.18, (a) => { tone(a, 0, a.length, 740, sr, 0.9, 3); });
  B.go = one(0.5, (a) => { tone(a, 0, a.length, 1108, sr, 0.9, 3); });
  B.split = one(0.3, (a) => { tone(a, 0, a.length, 1046, sr, 0.6, 4); tone(a, Math.floor(sr * 0.07), a.length - Math.floor(sr * 0.07), 1568, sr, 0.5, 4); });
  B.finish = one(1.4, (a) => {
    [523, 659, 784, 1046].forEach((f, k) => tone(a, Math.floor(sr * k * 0.11), a.length - Math.floor(sr * k * 0.11), f, sr, 0.5, 3));
  });
  return B;
}

function toBuffer(arr) {
  const b = ctx.createBuffer(1, arr.length, ctx.sampleRate);
  b.copyToChannel(arr, 0);
  return b;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
  const raw = makeBuffers(ctx.sampleRate);
  buffers = {};
  for (const k in raw) buffers[k] = toBuffer(raw[k]);
  startLoops();
  music.start();
}

function loopNode(buf, filterType, freq) {
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const g = ctx.createGain(); g.gain.value = 0;
  let node = src;
  let filter = null;
  if (filterType) {
    filter = ctx.createBiquadFilter(); filter.type = filterType; filter.frequency.value = freq;
    src.connect(filter); node = filter;
  }
  node.connect(g); g.connect(sfxBus);
  src.start();
  return { src, g, filter };
}

function startLoops() {
  loops = {
    wind: loopNode(buffers.wind, 'lowpass', 600),
    gravel: loopNode(buffers.gravel, 'bandpass', 2400),
    tread: loopNode(buffers.tread, 'lowpass', 900),
    hub: loopNode(buffers.hub, 'highpass', 1500),
  };
}

const smooth = (param, v, t = 0.06) => param.setTargetAtTime(v, ctx.currentTime, t);

// Per-frame: speed (m/s), grounded, pedalling, surface ('trail'|'grass').
export function updateRide(st) {
  if (!ctx || !loops) return;
  const v = Math.abs(st.speed || 0);
  const k = Math.min(1, v / 16);
  smooth(loops.wind.g.gain, (st.active ? 0.05 + 0.5 * k * k : 0) * (st.air ? 1.4 : 1));
  smooth(loops.wind.filter.frequency, 300 + 1600 * k);
  const roll = st.active && st.grounded ? Math.min(1, v / 4) : 0;
  smooth(loops.gravel.g.gain, roll * (0.12 + 0.35 * k) * (st.rough ? 1.8 : 1));
  loops.gravel.src.playbackRate.value = 0.7 + k * 0.8;
  smooth(loops.tread.g.gain, roll * (0.15 + 0.45 * k));
  loops.tread.src.playbackRate.value = 0.3 + v / 9;
  const coast = st.active && !st.pedal && v > 1.2;
  smooth(loops.hub.g.gain, coast ? 0.12 + 0.12 * k : 0, 0.03);
  // Clicks per second ≈ wheel revs × engagement points.
  loops.hub.src.playbackRate.value = Math.max(0.2, (v / (2 * Math.PI * 0.37)) * 36 / 40);
}

export function sfx(name, vol = 1, rate = 1) {
  if (!ctx || !buffers || !buffers[name]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(sfxBus);
  src.start();
}

export function setMuted(m) {
  muted = m;
  if (master) smooth(master.gain, m ? 0 : 0.9, 0.05);
}
export function isMuted() { return muted; }
export function setMusic(on) {
  musicOn = on;
  if (musicBus) smooth(musicBus.gain, on ? 0.32 : 0, 0.3);
}

// ---------------------------------------------------- generative music --
// A laid-back loop: soft pads over a four-chord progression, a round bass,
// a kick on 1 and 3, brushed hats. Scheduled a bar ahead.
const music = {
  bpm: 94, bar: 0, nextT: 0, timer: 0,
  chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],
  start() {
    this.nextT = ctx.currentTime + 0.2;
    this.timer = setInterval(() => this.tick(), 200);
  },
  tick() {
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextT < ctx.currentTime + 1.2) { this.scheduleBar(this.nextT); this.nextT += 4 * 60 / this.bpm; this.bar++; }
  },
  note(t, midi, dur, type, vol, attack = 0.02) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.6);
  },
  noiseHit(t, vol, hp) {
    const src = ctx.createBufferSource();
    src.buffer = buffers.gravel;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(f); f.connect(g); g.connect(musicBus);
    src.start(t, Math.random()); src.stop(t + 0.1);
  },
  kick(t) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.4);
  },
  scheduleBar(t) {
    const beat = 60 / this.bpm;
    const ch = this.chords[this.bar % this.chords.length];
    for (const m of ch) this.note(t, m, beat * 4, 'triangle', 0.045, 0.4);
    this.note(t, ch[0] - 24, beat * 1.5, 'sine', 0.22);
    this.note(t + beat * 2, ch[0] - 24, beat, 'sine', 0.18);
    this.note(t + beat * 3.5, ch[2] - 24, beat * 0.5, 'sine', 0.14);
    const lead = [ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12];
    if (this.bar % 2 === 1) lead.forEach((m, k) => this.note(t + k * beat + beat * 0.5, m, beat * 0.4, 'sine', 0.035));
    this.kick(t); this.kick(t + beat * 2);
    for (let k = 0; k < 8; k++) this.noiseHit(t + k * beat / 2, k % 2 ? 0.05 : 0.09, 6000);
    this.noiseHit(t + beat, 0.16, 1800); this.noiseHit(t + beat * 3, 0.16, 1800);
  },
};
