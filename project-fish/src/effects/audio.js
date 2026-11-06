// Gun sounds, made in code with the Web Audio API (no sound files).
//
// The 9mm shot is built sample by sample, the way a real one is shaped: a
// near-instant pressure spike, a short bright blast (a pistol pops, it doesn't
// boom like a rifle), a short low punch for body, the same sound bouncing off
// the ground a few milliseconds later, and the slide clacking back and
// slamming home. Outdoor echoes come from a generated reverb: distinct
// reflections off things far away, then a rolling tail that loses its highs.

let context = null;
let master = null;
let echo = null;
let noise = null;
let shots = [];
let quietShots = []; // through a suppressor
let smgShots = []; // the MP7A1's: a suppressed 4.6 mm (see makeSmgShot)
let rifleShots = []; // the AR-15's: a suppressed 5.56 mm (see makeRifleShot)

const SHOT_VARIANTS = 5;

// One-pole filters, for building sounds sample by sample.
function lowpass(data, hz, rate) {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / rate);
  let y = 0;
  for (let i = 0; i < data.length; i++) data[i] = y += a * (data[i] - y);
  return data;
}
function highpass(data, hz, rate) {
  const low = lowpass(Float32Array.from(data), hz, rate);
  for (let i = 0; i < data.length; i++) data[i] -= low[i];
  return data;
}

// A ringing metal part: a few damped tones.
function ring(out, rate, at, freqs, decay, volume) {
  const start = Math.floor(at * rate);
  for (let i = start; i < out.length; i++) {
    const t = (i - start) / rate;
    const env = Math.exp(-t / decay) * volume;
    if (env < 1e-4) break;
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t);
    out[i] += (v / freqs.length) * env;
  }
}

// A gunshot. Suppressed, the blast is much smaller and duller (a deep
// "thup"), and the slide's clatter, which a suppressor doesn't quieten,
// stands out.
function makeShot(rate, suppressed = false) {
  const quiet = suppressed ? 0.28 : 1;
  const length = Math.floor(rate * 0.4);
  const out = new Float32Array(length);
  const r = (a, b) => a + Math.random() * (b - a);

  // Muzzle blast: broadband noise with a very fast decay and a short tail.
  const blast = new Float32Array(length);
  const fast = r(0.0045, 0.0065);
  const tail = r(0.03, 0.045);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    blast[i] = (Math.random() * 2 - 1) * (Math.exp(-t / fast) + 0.3 * Math.exp(-t / tail));
  }
  highpass(lowpass(blast, suppressed ? r(1500, 1900) : r(5000, 6500), rate), 260, rate);

  // The pressure spike at the very start (an N-shaped wave, about 1.3 ms).
  const spike = Math.floor(rate * r(0.0011, 0.0015));
  for (let i = 0; i < spike; i++) out[i] += 1.4 * quiet * (1 - (2 * i) / spike);

  // Low punch: a damped tone sliding down.
  let phase = 0;
  const boom = r(105, 125);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    phase += (2 * Math.PI * (boom * Math.exp(-t * 9) + 52)) / rate;
    out[i] += Math.sin(phase) * Math.exp(-t / 0.042) * Math.min(1, t / 0.0015) * 0.75 * (suppressed ? 0.45 : 1);
  }
  for (let i = 0; i < length; i++) out[i] += blast[i] * 1.6 * quiet;

  // The slide: back (a sharp metallic click) and home (a heavier clack).
  ring(out, rate, r(0.019, 0.024), [2900, 4700, 6300].map((f) => f * r(0.95, 1.05)), 0.007, 0.13);
  ring(out, rate, r(0.052, 0.062), [1800, 3300, 5100].map((f) => f * r(0.95, 1.05)), 0.011, 0.17);

  // The same sound bouncing off the ground just after, duller.
  const delay = Math.floor(rate * r(0.004, 0.0055));
  const bounce = lowpass(Float32Array.from(out), 2500, rate);
  for (let i = length - 1; i >= delay; i--) out[i] += bounce[i - delay] * 0.42;

  // Loud and a bit gritty, like a real shot heard up close: soft clipping.
  const drive = 1.9;
  const norm = Math.tanh(drive);
  for (let i = 0; i < length; i++) out[i] = Math.tanh(out[i] * drive) / norm;
  return out;
}

// The MP7A1's shot: a small, fast 4.6x30 mm round through a suppressor.
// The suppressor takes most of the blast (a short, dull "tup" with a little
// low thump), but the bullet is faster than sound, so its crack stays: a
// sharp, bright snap at the very start. Then the bolt: back and home within
// a few hundredths of a second (it fires 16 rounds a second, so each shot's
// sound is short).
function makeSmgShot(rate) {
  const length = Math.floor(rate * 0.25);
  const out = new Float32Array(length);
  const r = (a, b) => a + Math.random() * (b - a);
  // The bullet's crack: a short N-wave, only its highs.
  const crack = new Float32Array(length);
  const n = Math.floor(rate * r(0.0005, 0.0007));
  for (let i = 0; i < n; i++) crack[i] = 1 - (2 * i) / n;
  highpass(crack, 1800, rate);
  // The muffled blast.
  const blast = new Float32Array(length);
  const fast = r(0.0035, 0.005);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    blast[i] = (Math.random() * 2 - 1) * (Math.exp(-t / fast) + 0.25 * Math.exp(-t / 0.018));
  }
  highpass(lowpass(blast, r(2000, 2600), rate), 300, rate);
  // A little low thump.
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    phase += (2 * Math.PI * (150 * Math.exp(-t * 14) + 60)) / rate;
    out[i] += Math.sin(phase) * Math.exp(-t / 0.022) * Math.min(1, t / 0.001) * 0.35;
  }
  for (let i = 0; i < length; i++) out[i] += blast[i] * 0.75 + crack[i] * 1.5;
  // The bolt: back (a light click) and home (a sharper clack).
  ring(out, rate, r(0.011, 0.014), [3600, 5300, 7200].map((f) => f * r(0.95, 1.05)), 0.005, 0.16);
  ring(out, rate, r(0.03, 0.036), [2300, 4100, 5900].map((f) => f * r(0.95, 1.05)), 0.008, 0.22);
  // Off the ground, duller.
  const delay = Math.floor(rate * r(0.004, 0.0055));
  const bounce = lowpass(Float32Array.from(out), 2500, rate);
  for (let i = length - 1; i >= delay; i--) out[i] += bounce[i - delay] * 0.35;
  const drive = 1.6;
  const norm = Math.tanh(drive);
  for (let i = 0; i < length; i++) out[i] = Math.tanh(out[i] * drive) / norm;
  return out;
}

// The AR-15's shot: a 5.56x45 mm rifle round through a suppressor. The
// suppressor takes the worst of the blast, but there's far more of it than
// the MP7A1's (a deeper, longer "thoomp" with a solid low punch), and the
// bullet, much faster than sound, cracks loudly at the very start. Then the
// bolt carrier: back, and home with the buffer spring's short metallic
// twang that an AR-15 makes, a little later and heavier than the MP7A1's
// bolt.
function makeRifleShot(rate) {
  const length = Math.floor(rate * 0.35);
  const out = new Float32Array(length);
  const r = (a, b) => a + Math.random() * (b - a);
  // The bullet's crack: a sharp N-wave, longer than the 4.6 mm's.
  const crack = new Float32Array(length);
  const n = Math.floor(rate * r(0.0008, 0.001));
  for (let i = 0; i < n; i++) crack[i] = 1 - (2 * i) / n;
  highpass(crack, 1400, rate);
  // The muffled blast.
  const blast = new Float32Array(length);
  const fast = r(0.005, 0.007);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    blast[i] = (Math.random() * 2 - 1) * (Math.exp(-t / fast) + 0.3 * Math.exp(-t / 0.03));
  }
  highpass(lowpass(blast, r(1600, 2100), rate), 200, rate);
  // The low punch.
  let phase = 0;
  const boom = r(95, 115);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    phase += (2 * Math.PI * (boom * Math.exp(-t * 10) + 48)) / rate;
    out[i] += Math.sin(phase) * Math.exp(-t / 0.035) * Math.min(1, t / 0.0012) * 0.6;
  }
  for (let i = 0; i < length; i++) out[i] += blast[i] * 1.1 + crack[i] * 1.8;
  // The bolt carrier: back (a click), home (a clack), and the buffer
  // spring's twang.
  ring(out, rate, r(0.016, 0.02), [3100, 4800, 6600].map((f) => f * r(0.95, 1.05)), 0.006, 0.14);
  ring(out, rate, r(0.045, 0.052), [1900, 3500, 5200].map((f) => f * r(0.95, 1.05)), 0.01, 0.2);
  ring(out, rate, r(0.03, 0.034), [r(820, 900), r(1650, 1750)], 0.03, 0.05);
  // Off the ground, duller.
  const delay = Math.floor(rate * r(0.004, 0.0055));
  const bounce = lowpass(Float32Array.from(out), 2500, rate);
  for (let i = length - 1; i >= delay; i--) out[i] += bounce[i - delay] * 0.4;
  const drive = 1.8;
  const norm = Math.tanh(drive);
  for (let i = 0; i < length; i++) out[i] = Math.tanh(out[i] * drive) / norm;
  return out;
}

// Outdoor echo: a few distinct reflections off things far away, then a
// rolling tail that loses its highs, a little different in each ear.
function makeEcho(rate) {
  const length = Math.floor(rate * 2);
  const buffer = context.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (const [at, level] of [[0.055, 0.5], [0.105, 0.38], [0.17, 0.32], [0.26, 0.24], [0.39, 0.17], [0.6, 0.1]]) {
      const start = Math.floor((at + (c ? 0.007 : 0) + Math.random() * 0.01) * rate);
      for (let i = 0; i < rate * 0.03 && start + i < length; i++) {
        data[start + i] += (Math.random() * 2 - 1) * level * Math.exp(-i / (rate * 0.008));
      }
    }
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      data[i] += (Math.random() * 2 - 1) * 0.09 * Math.exp(-t / 0.5) * Math.min(1, t / 0.04);
    }
    lowpass(data, 2200, rate);
  }
  return buffer;
}

// Recorded sounds (in assets/sounds/), loaded once sound is allowed. The
// second pistol's: its slide pulled back and snapping forward; its magazine
// released, empty or with rounds in it; and a magazine pushed home (two
// takes, picked at random).
const SAMPLE_FILES = {
  slide45Back: 'pf45-slide-back.wav',
  slide45Forward: 'pf45-slide-forward.wav',
  mag45OutEmpty: 'pf45-mag-out-empty.wav',
  mag45Out: 'pf45-mag-out.wav',
  mag45In1: 'pf45-mag-in-1.wav',
  mag45In2: 'pf45-mag-in-2.wav',
};
const samples = {};

function loadSamples() {
  for (const [name, file] of Object.entries(SAMPLE_FILES)) {
    fetch(new URL(`../../assets/sounds/${file}`, import.meta.url))
      .then((response) => response.arrayBuffer())
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        samples[name] = buffer;
      })
      .catch((error) => console.warn(`Couldn't load the sound ${file}.`, error));
  }
}

// Plays a recorded sound; false if it isn't loaded (yet).
function playSample(name, volume = 1, rate = 1) {
  if (!context || !samples[name]) return false;
  const source = context.createBufferSource();
  source.buffer = samples[name];
  source.playbackRate.value = vary(rate, 0.02);
  const level = context.createGain();
  level.gain.value = volume;
  source.connect(level).connect(master);
  source.start();
  return true;
}

// Browsers only allow sound after the player clicks; call this from the click.
export function startAudio() {
  if (!context) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    context = new Context();
    // A compressor keeps shots punchy without crackling.
    const squash = context.createDynamicsCompressor();
    squash.threshold.value = -12;
    squash.ratio.value = 4;
    squash.attack.value = 0.002;
    squash.release.value = 0.2;
    squash.connect(context.destination);
    master = context.createGain();
    master.gain.value = 0.6;
    master.connect(squash);

    // One second of white noise, reused by every sound.
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    echo = context.createConvolver();
    echo.buffer = makeEcho(context.sampleRate);
    const echoLevel = context.createGain();
    echoLevel.gain.value = 0.55;
    echo.connect(echoLevel).connect(master);

    // A few slightly different shots, picked at random, so no two sound the same.
    shots = [];
    for (let i = 0; i < SHOT_VARIANTS; i++) {
      const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.4), context.sampleRate);
      buffer.copyToChannel(makeShot(context.sampleRate), 0);
      shots.push(buffer);
      const quietBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.4), context.sampleRate);
      quietBuffer.copyToChannel(makeShot(context.sampleRate, true), 0);
      quietShots.push(quietBuffer);
      const smg = makeSmgShot(context.sampleRate);
      const smgBuffer = context.createBuffer(1, smg.length, context.sampleRate);
      smgBuffer.copyToChannel(smg, 0);
      smgShots.push(smgBuffer);
      const rifle = makeRifleShot(context.sampleRate);
      const rifleBuffer = context.createBuffer(1, rifle.length, context.sampleRate);
      rifleBuffer.copyToChannel(rifle, 0);
      rifleShots.push(rifleBuffer);
    }
    loadSamples();
  }
  if (context.state === 'suspended') context.resume();
}

// A burst of noise through a filter, with a sharp start and a falling volume.
function burst({ at = 0, type = 'lowpass', from, to = from, q = 0.7, volume, attack = 0.001, decay, out = master, reverb = 0 }) {
  if (!context) return;
  const t = context.currentTime + at;
  const source = context.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  source.connect(filter).connect(gain).connect(out);
  if (reverb) {
    const send = context.createGain();
    send.gain.value = reverb;
    gain.connect(send).connect(echo);
  }
  source.start(t, Math.random() * 0.5);
  source.stop(t + decay + 0.05);
}

// A short tone sliding in pitch (the thump, metallic pings).
function tone({ at = 0, from, to = from, volume, decay, type = 'sine' }) {
  if (!context) return;
  const t = context.currentTime + at;
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + decay);
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

const vary = (x, amount = 0.08) => x * (1 + (Math.random() * 2 - 1) * amount);

// Each gun's shot: the .45 is the same recording slowed down a little, so
// it's deeper, and a bit louder. The Beretta is the 9 mm's, a touch lower
// (a longer barrel and a heavier, all-steel gun) and as loud. The FN 502's
// .22 is the 9 mm's sped up, so it's sharper and shorter, and much quieter,
// with less of it echoing back. The Hi-Power's is the 9 mm's, between the
// PF-9's and the Beretta's (all steel, its barrel a little shorter than the
// Beretta's). The Xiri X4's is the 9 mm's, a touch higher (a polymer frame,
// like the PF-9's, and a full-size one). The MP7A1 has its own (`set`:
// makeSmgShot's, already suppressed), with only a little echo. So has the
// AR-15 (makeRifleShot's, suppressed too), louder, its crack echoing back
// more.
const GUNSHOT = {
  pistol: { rate: 1, volume: 0.9 }, pistol45: { rate: 0.82, volume: 1 }, beretta: { rate: 0.95, volume: 0.92 },
  fn502: { rate: 1.35, volume: 0.5, echo: 0.3 }, hipistol: { rate: 0.97, volume: 0.92 },
  x4: { rate: 1.02, volume: 0.9 }, mp7: { rate: 1, volume: 0.8, echo: 0.2, set: 'smg' },
  ar15: { rate: 1, volume: 0.95, echo: 0.35, set: 'rifle' },
};
const OWN_SHOTS = { smg: () => smgShots, rifle: () => rifleShots };
// The guns whose magazine and slide sounds are the .45 recordings: the
// M1911's, the Beretta's and the Hi-Power's (a steel magazine and slide
// too). The FN 502
// has the PF-9's magazine sounds (it's polymer-framed), and the .45's slide
// recordings played faster and quieter (a lighter slide): LIGHT_SLIDE.
// The Xiri X4 has the PF-9's magazine sounds (polymer too) and the .45's
// slide going home, a little faster. The MP7A1 has the PF-9's magazine
// sounds and, for its charging handle pulled back and let go, the .45's
// slide recordings played faster and quieter. The AR-15 has the .45's
// recorded magazine sounds (a metal magazine) and, for its bolt running
// home off the bolt catch, the .45's slide going forward, a little lower.
const RECORDED = new Set(['pistol45', 'beretta', 'hipistol', 'ar15']);
const LIGHT_SLIDE = { fn502: { rate: 1.25, volume: 0.65 }, x4: { rate: 1.08, volume: 0.85 }, mp7: { rate: 1.3, volume: 0.6 }, ar15: { rate: 0.92, volume: 1 } };

// suppressed: fired through a suppressor (quieter, and it barely echoes).
export function playGunshot(gun = 'pistol', suppressed = false) {
  if (!context || !shots.length) return;
  const sound = GUNSHOT[gun] || GUNSHOT.pistol;
  const source = context.createBufferSource();
  // (A gun with its own set of shots has its suppressor in them already.)
  const own = sound.set ? OWN_SHOTS[sound.set]() : null;
  const set = own || (suppressed ? quietShots : shots);
  source.buffer = set[Math.floor(Math.random() * set.length)];
  source.playbackRate.value = vary(sound.rate, 0.03);
  const level = context.createGain();
  level.gain.value = sound.volume * (suppressed && !own ? 0.75 : 1);
  source.connect(level).connect(master);
  const send = context.createGain();
  send.gain.value = own ? sound.echo ?? 0.2 : suppressed ? 0.12 : sound.echo ?? 0.5; // (how much echoes back)
  level.connect(send).connect(echo);
  source.start();
}

// The light or laser's switch.
export function playSwitchClick() {
  burst({ type: 'bandpass', from: 2600, q: 5, volume: 0.35, decay: 0.012 });
}

export function playDryFire() {
  burst({ type: 'bandpass', from: 3200, q: 6, volume: 0.80, decay: 0.02 });
}

// A spent case landing: a few bright metallic pings.
export function playCasing(volume = 1) {
  const base = vary(4200, 0.15);
  for (let i = 0; i < 3; i++) {
    tone({ at: i * vary(0.07, 0.4), from: base * (1 + i * 0.37), volume: 0.05 * volume / (i + 1), decay: 0.09 });
  }
}

// The magazine release pressed and the magazine coming out. empty: whether
// there are any rounds in it (the second pistol's sound differs).
export function playMagOut(gun = 'pistol', empty = false) {
  if (RECORDED.has(gun) && playSample(empty ? 'mag45OutEmpty' : 'mag45Out', 1)) return;
  burst({ type: 'bandpass', from: 2400, q: 5, volume: 0.96, decay: 0.03 }); // release button
  burst({ at: 0.05, type: 'bandpass', from: 900, to: 600, q: 2, volume: 0.80, decay: 0.12 }); // slides out
}

// Pulling a fresh magazine from its pouch: a soft scuff of fabric.
export function playMagGrab() {
  burst({ type: 'bandpass', from: 700, to: 450, q: 1.2, volume: 0.35, attack: 0.02, decay: 0.16 });
  burst({ at: 0.05, type: 'bandpass', from: 1500, q: 2, volume: 0.2, decay: 0.06 });
}

// The old magazine landing in the support hand: a soft, muffled slap.
export function playMagCatch() {
  burst({ type: 'lowpass', from: 900, to: 300, volume: 0.45, attack: 0.002, decay: 0.07 });
  burst({ at: 0.004, type: 'bandpass', from: 1700, q: 3, volume: 0.18, decay: 0.03 });
}

// A dropped magazine hitting the ground: a hollow polymer knock and the steel
// body rattling. volume: 0..1, how hard it landed.
export function playMagDrop(volume = 1) {
  burst({ type: 'bandpass', from: 650, to: 380, q: 2.5, volume: 0.7 * volume, attack: 0.001, decay: 0.06 });
  burst({ at: 0.003, type: 'bandpass', from: 2300, q: 5, volume: 0.45 * volume, decay: 0.04 });
  tone({ at: 0.004, from: vary(2900, 0.1), volume: 0.03 * volume, decay: 0.08, type: 'triangle' });
  burst({ at: vary(0.05, 0.3), type: 'bandpass', from: 1500, q: 4, volume: 0.2 * volume, decay: 0.03 });
}

export function playMagIn(gun = 'pistol') {
  if (RECORDED.has(gun) && playSample(Math.random() < 0.5 ? 'mag45In1' : 'mag45In2', 1)) return;
  burst({ type: 'bandpass', from: 1200, to: 800, q: 2, volume: 0.64, decay: 0.08 });
  burst({ at: 0.07, type: 'bandpass', from: 2200, q: 6, volume: 1.00, decay: 0.04 }); // clicks home
}

// The slide pulled back by hand (checking the chamber). Only the .45s have
// a sound for it, recorded (and the FN 502, the same, lighter).
export function playSlideBack(gun = 'pistol') {
  const light = LIGHT_SLIDE[gun];
  if (light) playSample('slide45Back', 0.85 * light.volume, light.rate);
  else if (RECORDED.has(gun)) playSample('slide45Back', 0.85);
}

// The slide snapping forward when it's let go (or the slide stop releases
// it). The .45s' is recorded.
export function playSlideRelease(gun = 'pistol') {
  const light = LIGHT_SLIDE[gun];
  if (light && playSample('slide45Forward', 0.95 * light.volume, light.rate)) return;
  if (RECORDED.has(gun) && playSample('slide45Forward', 0.95)) return;
  burst({ type: 'bandpass', from: 1800, q: 4, volume: 1.00, decay: 0.05 });
  burst({ at: 0.012, type: 'bandpass', from: 3000, q: 6, volume: 0.80, decay: 0.03 });
}
