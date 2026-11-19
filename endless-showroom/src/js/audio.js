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
  // Closing time: a heavy breaker clunk, the hum dying, and a falling warning tone.
  lightsOff(red) {
    if (!ctx) return;
    burst(0.35, 120, 0.7, 0.7, 'lowpass'); tone(70, 0.4, 'square', 0.12, 0, 0.5);
    for (let i = 1; i < 6; i++) setTimeout(() => burst(0.25, 110, 0.45 * (1 - i / 7), 0.7, 'lowpass'), i * 300); // bank after bank, further away
    tone(120, 1.4, 'sawtooth', 0.05, 0.05, 0.3);
    for (let i = 0; i < 4; i++) tone(880 - i * 120, 0.9, 'triangle', 0.14 * (1 - i * 0.2), 0.5 + i * 0.75, 0.97);
    if (red) { // a long, thin rising shriek
      const t = ctx.currentTime + 0.8;
      for (const [f, g] of [[400, 0.06], [403, 0.05], [800, 0.025]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 3.2, t + 3.5);
        const gg = ctx.createGain(); gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(g, t + 1.2); gg.gain.exponentialRampToValueAtTime(0.0001, t + 4);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
        o.connect(bp); bp.connect(gg); gg.connect(master); o.start(t); o.stop(t + 4.1);
      }
    }
  },
  // Morning: the breaker again and the tubes flickering on.
  lightsOn() {
    if (!ctx) return;
    burst(0.3, 140, 0.5, 0.7, 'lowpass');
    for (let i = 0; i < 6; i++) setTimeout(() => { burst(0.04, 3000, 0.08, 3); tone(120, 0.06, 'square', 0.05); }, 120 + i * 90 + Math.random() * 60);
    tone(523, 0.5, 'sine', 0.12, 0.9); tone(659, 0.5, 'sine', 0.12, 1.15); tone(784, 0.8, 'sine', 0.12, 1.4);
  },
  // A two-note finger whistle, panned towards whoever made it.
  whistle(pan = 0, vol = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f0, f1, at, dur] of [[1900, 2500, 0, 0.22], [2500, 1700, 0.3, 0.5]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(0.16 * vol, t + at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      let node = g; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
      o.connect(g); node.connect(master); o.start(t + at); o.stop(t + at + dur + 0.05);
    }
  },
  hailTick() { burst(0.03, 2500 + Math.random() * 3000, 0.04 + Math.random() * 0.05, 3, 'bandpass', Math.random() * 2 - 1); },
  staffStep(pan, vol) { burst(0.12, 110 + Math.random() * 30, 0.22 * vol, 1.1, 'lowpass', pan); },
  shove() { burst(0.12, 300, 0.35, 0.8); tone(90, 0.12, 'sine', 0.2); },
  drink() { for (let i = 0; i < 4; i++) setTimeout(() => tone(300 + Math.random() * 80, 0.07, 'sine', 0.08), i * 140); },
  tick(n) { tone(1500 + n * 120, 0.05, 'square', 0.04 + n * 0.02); burst(0.03, 4000, 0.05 + n * 0.02, 4); },
};

// ---------------------------------------------------------------- music
// Generated as it plays. Each weekday has its own gentle in-store tune (same
// style, different key and pattern); night is a low drone with the odd
// distant note; a Crimson Night pulses; a Fog Day is slow and sad.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let musicGain = null, musicVol = 0.5, musicMode = '', musicDay = 0, nextBeat = 0, beat = 0, musicTimer = 0, droneNodes = [];
const DAY_ROOTS = [60, 62, 63, 65, 67, 57, 58]; // Monday .. Sunday
const PROG = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
const PROG_B = [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]];
const FOG_PROG = [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]];

function note(freq, at, dur, type, gain, cutoff = 0) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let n = o;
  if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); n = f; }
  n.connect(g); g.connect(musicGain); o.start(at); o.stop(at + dur + 0.05);
}
function stopDrone() { for (const n of droneNodes) { try { n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.8); n.o.stop(ctx.currentTime + 4); } catch (_) {} } droneNodes = []; }
function startDrone(freqs, gain, type = 'sawtooth', cutoff = 220) {
  stopDrone();
  for (const f of freqs) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, ctx.currentTime); g.gain.setTargetAtTime(gain, ctx.currentTime, 2);
    o.connect(fl); fl.connect(g); g.connect(musicGain); o.start();
    droneNodes.push({ o, g });
  }
}

function schedule() {
  if (!ctx || !musicMode) return;
  const ahead = ctx.currentTime + 0.25;
  while (nextBeat < ahead) {
    const t = nextBeat;
    if (musicMode === 'day') {
      const spb = 60 / 84 / 2; // eighth notes at 84 bpm
      const root = DAY_ROOTS[(musicDay - 1) % 7], prog = (musicDay % 2) ? PROG : PROG_B;
      const bar = Math.floor(beat / 8) % 4, step = beat % 8, ch = prog[bar];
      const pat = [0, 1, 2, 1, 0, 2, 1, 2];
      note(mtof(root + 12 + ch[pat[(step + musicDay) % 8]]), t, 0.9, 'triangle', 0.05, 2200);
      if (step === 0) { note(mtof(root - 12 + ch[0]), t, 1.8, 'sine', 0.09); for (const c of ch) note(mtof(root + c), t, 2.6, 'sine', 0.025); }
      if (step === 4) note(mtof(root - 12 + ch[2]), t, 1.0, 'sine', 0.05);
      if (step === 6 && bar === 3 && Math.random() < 0.5) note(mtof(root + 24 + ch[1]), t, 1.2, 'sine', 0.025);
      nextBeat += spb;
    } else if (musicMode === 'fog') {
      const spb = 60 / 60 / 2, root = 57;
      const bar = Math.floor(beat / 8) % 4, step = beat % 8, ch = FOG_PROG[bar];
      note(mtof(root + 12 + ch[[0, 2, 1, 2, 0, 1, 2, 1][step]]), t, 1.6, 'sine', 0.045, 1200);
      if (step === 0) { note(mtof(root - 12 + ch[0]), t, 3.6, 'sine', 0.08); for (const c of ch) note(mtof(root + c), t, 3.8, 'triangle', 0.02, 800); }
      nextBeat += spb;
    } else if (musicMode === 'night') {
      // sparse, distant notes over the drone
      if (Math.random() < 0.35) { const sc = [0, 3, 5, 7, 10, 12, 13]; note(mtof(57 + sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0)), t, 3, 'sine', 0.035, 900); }
      if (Math.random() < 0.06) { note(mtof(69), t, 4, 'sine', 0.02); note(mtof(70), t, 4, 'sine', 0.02); } // a sour cluster
      nextBeat += 1.2 + Math.random() * 1.8;
    } else if (musicMode === 'crimson') {
      const spb = 60 / 132 / 4;
      const step = beat % 16;
      note(mtof(step % 8 === 7 ? 34 : 33), t, 0.16, 'sawtooth', 0.07, 420);
      if (step === 0 || step === 10) note(mtof(45), t, 0.3, 'square', 0.03, 700);
      if (step === 0 && Math.random() < 0.5) note(mtof(Math.random() < 0.5 ? 82 : 81), t, 1.6, 'sine', 0.025);
      nextBeat += spb;
    } else nextBeat += 0.5;
    beat++;
  }
}

export function setMusicVolume(v) { musicVol = v; if (musicGain) musicGain.gain.setTargetAtTime(musicVol * 0.6, ctx.currentTime, 0.3); }
// mode: 'day' | 'night' | 'crimson' | 'fog' | '' (silence); day = the day number (sets the weekday tune)
export function setMusic(mode, day) {
  if (!ctx) return;
  if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = musicVol * 0.6; musicGain.connect(master); musicTimer = setInterval(schedule, 90); }
  if (mode === musicMode && day === musicDay) return;
  const changed = mode !== musicMode;
  musicMode = mode; musicDay = day;
  if (changed) {
    beat = 0; nextBeat = ctx.currentTime + 1.5;
    if (mode === 'night') startDrone([mtof(33), mtof(40), mtof(45.1)], 0.05);
    else if (mode === 'crimson') startDrone([mtof(33), mtof(34)], 0.045, 'sawtooth', 300);
    else if (mode === 'fog') startDrone([mtof(45), mtof(52)], 0.02, 'triangle', 500);
    else stopDrone();
  }
}
