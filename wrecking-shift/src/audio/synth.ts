/**
 * Low-level synthesis helpers shared by the sound bank and the music system.
 * Everything is built from noise buffers, oscillators, biquads, envelopes — no samples.
 */

export type Ctx = BaseAudioContext;
export type NoiseKind = 'white' | 'pink' | 'brown';

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const MIN = 0.0001;
const noiseCache = new WeakMap<object, Record<NoiseKind, AudioBuffer>>();
const shaperCache = new WeakMap<object, Record<string, Float32Array<ArrayBuffer>>>();

function makeNoise(ctx: Ctx, kind: NoiseKind): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  }
  // normalise
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < len; i++) d[i] *= k;
  return buf;
}

export function noiseBuffer(ctx: Ctx, kind: NoiseKind): AudioBuffer {
  let c = noiseCache.get(ctx);
  if (!c) {
    c = { white: makeNoise(ctx, 'white'), pink: makeNoise(ctx, 'pink'), brown: makeNoise(ctx, 'brown') };
    noiseCache.set(ctx, c);
  }
  return c[kind];
}

/** looping noise source starting at t0 (random buffer offset), stopped at t0+dur (dur<=0: never) */
export function noiseSource(ctx: Ctx, kind: NoiseKind, t0: number, dur: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, kind);
  s.loop = true;
  s.start(t0, Math.random() * 2);
  if (dur > 0) s.stop(t0 + dur);
  return s;
}

/** soft-clip curve (tanh), `drive` > 1 = more crunch */
export function shaperCurve(ctx: Ctx, drive: number): Float32Array<ArrayBuffer> {
  let c = shaperCache.get(ctx);
  if (!c) { c = {}; shaperCache.set(ctx, c); }
  const key = String(drive);
  if (!c[key]) {
    const n = 512, a = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; a[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    c[key] = a;
  }
  return c[key];
}

export function distortion(ctx: Ctx, drive: number): WaveShaperNode {
  const w = ctx.createWaveShaper();
  w.curve = shaperCurve(ctx, drive);
  return w;
}

/** percussive envelope: 0 -> peak (attack) -> exponential decay to ~0 */
export function env(g: AudioParam, t0: number, peak: number, attack: number, decay: number): number {
  const p = Math.max(peak, MIN * 2);
  g.cancelScheduledValues(t0);
  g.setValueAtTime(MIN, t0);
  g.linearRampToValueAtTime(p, t0 + Math.max(attack, 0.001));
  g.exponentialRampToValueAtTime(MIN, t0 + Math.max(attack, 0.001) + Math.max(decay, 0.005));
  return t0 + attack + decay;
}

/** random wobbling envelope for textures (slides, rustles, crumble) */
export function jitterEnv(g: AudioParam, t0: number, dur: number, peak: number, steps = 16, depth = 0.7): void {
  const n = Math.max(4, steps);
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const edge = Math.sin((Math.PI * i) / (n - 1));
    arr[i] = peak * edge * (1 - depth * Math.random());
  }
  g.setValueCurveAtTime(arr, t0, dur);
}

export interface ToneOpts {
  type?: OscillatorType; f0: number; f1?: number; t0: number; attack?: number; decay: number; gain: number; detune?: number;
}
/** oscillator with pitch glide and percussive envelope. returns end time */
export function tone(ctx: Ctx, dest: AudioNode, o: ToneOpts): number {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  const a = o.attack ?? 0.002;
  osc.frequency.setValueAtTime(Math.max(o.f0, 1), o.t0);
  if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), o.t0 + a + o.decay);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const end = env(g.gain, o.t0, o.gain, a, o.decay);
  osc.connect(g).connect(dest);
  osc.start(o.t0);
  osc.stop(end + 0.03);
  return end;
}

export interface NoiseOpts {
  kind?: NoiseKind; filter?: BiquadFilterType; f0: number; f1?: number; q?: number; t0: number; attack?: number; decay: number; gain: number;
}
/** filtered noise burst with filter sweep and percussive envelope. returns end time */
export function nz(ctx: Ctx, dest: AudioNode, o: NoiseOpts): number {
  const a = o.attack ?? 0.002;
  const src = noiseSource(ctx, o.kind ?? 'white', o.t0, a + o.decay + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'lowpass';
  f.Q.value = o.q ?? 0.7;
  f.frequency.setValueAtTime(Math.max(o.f0, 20), o.t0);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 20), o.t0 + a + o.decay);
  const g = ctx.createGain();
  const end = env(g.gain, o.t0, o.gain, a, o.decay);
  src.connect(f).connect(g).connect(dest);
  return end;
}

/** inharmonic partial stack (bells, metal, glass). returns end time */
export function partials(ctx: Ctx, dest: AudioNode, t0: number, base: number, ratios: number[], gains: number[], decays: number[], type: OscillatorType = 'sine'): number {
  let end = t0;
  for (let i = 0; i < ratios.length; i++) {
    const e = tone(ctx, dest, { type, f0: base * ratios[i] * rnd(0.995, 1.005), t0, attack: 0.001, decay: decays[i], gain: gains[i] });
    end = Math.max(end, e);
  }
  return end;
}

/** many short noise grains scattered over `span` seconds (crumble, rustle, shatter) */
export function grains(ctx: Ctx, dest: AudioNode, o: {
  n: number; t0: number; span: number; kind?: NoiseKind; filter?: BiquadFilterType; fMin: number; fMax: number; q?: number;
  dMin: number; dMax: number; gain: number; tonal?: boolean; front?: number;
}): number {
  let end = o.t0;
  for (let i = 0; i < o.n; i++) {
    const u = Math.pow(Math.random(), 1 + (o.front ?? 0.6));
    const t = o.t0 + u * o.span;
    const f = o.fMin * Math.pow(o.fMax / o.fMin, Math.random());
    const d = rnd(o.dMin, o.dMax);
    const g = o.gain * rnd(0.3, 1) * (1 - 0.5 * u);
    const e = o.tonal
      ? tone(ctx, dest, { f0: f, f1: f * rnd(0.8, 1.1), t0: t, attack: 0.001, decay: d, gain: g })
      : nz(ctx, dest, { kind: o.kind ?? 'white', filter: o.filter ?? 'bandpass', f0: f, q: o.q ?? 1.5, t0: t, attack: 0.001, decay: d, gain: g });
    end = Math.max(end, e);
  }
  return end;
}

/** shaped, filtered noise texture over a duration with random amplitude wobble */
export function texture(ctx: Ctx, dest: AudioNode, o: {
  kind?: NoiseKind; filter?: BiquadFilterType; f0: number; f1?: number; q?: number; t0: number; dur: number; gain: number; steps?: number; depth?: number;
}): number {
  const src = noiseSource(ctx, o.kind ?? 'pink', o.t0, o.dur + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, o.t0);
  if (o.f1) f.frequency.linearRampToValueAtTime(o.f1, o.t0 + o.dur);
  const g = ctx.createGain();
  jitterEnv(g.gain, o.t0, o.dur, o.gain, o.steps ?? 16, o.depth ?? 0.7);
  src.connect(f).connect(g).connect(dest);
  return o.t0 + o.dur;
}

/** procedural reverb impulse response (stereo, exponentially decaying filtered noise) */
export function makeImpulse(ctx: Ctx, seconds = 1.8, decay = 3.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * t); // darker as it decays
      d[i] = lp * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
    }
  }
  return buf;
}
