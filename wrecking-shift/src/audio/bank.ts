/**
 * Procedural sound bank. Every entry is a function (ctx, dest, params) that schedules a one-shot
 * synthesised from oscillators / noise / filters / envelopes and returns its duration in seconds.
 * Loops (engine, fire, alarm ...) are builders returning a LoopHandle.
 */
import type { AudioGroup } from '../sim/materials';
import { GROUPS, SOUND_EVENTS, type SoundEvent } from './logic';
import {
  distortion, env, grains, jitterEnv, nz, noiseSource, partials, pick, rnd, texture, tone, midiToHz, type Ctx,
} from './synth';

export interface SoundParams {
  /** linear gain applied by the caller (engine) - informational for the bank */
  gain?: number;
  /** pitch multiplier */
  pitch?: number;
  /** start delay in seconds (propagation delay) */
  delay?: number;
  /** generic 0..1 intensity (landing speed, skid amount ...) */
  amount?: number;
}
export type SoundFn = (ctx: Ctx, dest: AudioNode, p: SoundParams) => number;

const SIZE_PITCH = [1.3, 1, 0.72];
const SIZE_GAIN = [0.6, 0.85, 1];
const SIZE_LEN = [0.7, 1, 1.6];
const t00 = (ctx: Ctx, p: SoundParams) => ctx.currentTime + (p.delay ?? 0);

// ----------------------------------------------------------------- material sounds

function material(group: AudioGroup, ev: SoundEvent, s: 0 | 1 | 2): SoundFn {
  return (ctx, d, p) => {
    const t = t00(ctx, p);
    const pf = SIZE_PITCH[s] * (p.pitch ?? 1) * rnd(0.92, 1.08);
    const sg = SIZE_GAIN[s];
    const ds = SIZE_LEN[s];
    let end = t;
    const E = (v: number) => { if (v > end) end = v; };
    switch (group) {
      case 'wood':
        if (ev === 'hit') {
          E(tone(ctx, d, { f0: rnd(170, 240) * pf, f1: 120 * pf, t0: t, decay: 0.14 * ds, gain: 0.8 * sg }));
          E(tone(ctx, d, { type: 'triangle', f0: rnd(420, 560) * pf, t0: t, decay: 0.06, gain: 0.25 * sg }));
          E(nz(ctx, d, { filter: 'bandpass', f0: 900 * pf, q: 1.5, t0: t, decay: 0.05, gain: 0.5 * sg }));
        } else if (ev === 'break') {
          const clicks = 2 + s * 3;
          for (let i = 0; i < clicks; i++) E(nz(ctx, d, { filter: 'highpass', f0: rnd(1800, 3600), q: 0.8, t0: t + i * rnd(0.01, 0.06), decay: rnd(0.02, 0.06), gain: 0.6 * sg }));
          E(tone(ctx, d, { f0: 150 * pf, f1: 80 * pf, t0: t, decay: 0.25 * ds, gain: 0.7 * sg }));
          E(nz(ctx, d, { filter: 'bandpass', f0: 2400, f1: 1200, q: 1, kind: 'pink', t0: t + 0.02, decay: 0.3 * ds, gain: 0.3 * sg }));
        } else {
          E(texture(ctx, d, { f0: 500 * pf, f1: 900 * pf, q: 3, t0: t, dur: 0.35 + 0.3 * ds, gain: 1.0 * sg }));
        }
        break;
      case 'masonry':
        if (ev === 'hit') {
          E(tone(ctx, d, { f0: 120 * pf, f1: 55, t0: t, decay: 0.2 * ds, gain: 0.95 * sg }));
          E(nz(ctx, d, { kind: 'brown', f0: 500, t0: t, decay: 0.12, gain: 0.7 * sg }));
          E(nz(ctx, d, { f0: 2500, t0: t, decay: 0.03, gain: 0.3 * sg }));
        } else if (ev === 'break') {
          E(tone(ctx, d, { f0: 90 * pf, f1: 40, t0: t, decay: 0.4 * ds, gain: 0.9 * sg }));
          E(nz(ctx, d, { kind: 'brown', f0: 900, f1: 200, t0: t, decay: 0.4 * ds, gain: 0.8 * sg }));
          E(grains(ctx, d, { n: 6 + s * 7, t0: t + 0.03, span: 0.5 * ds, filter: 'bandpass', fMin: 800, fMax: 3200, dMin: 0.02, dMax: 0.08, gain: 0.5 * sg }));
        } else {
          E(texture(ctx, d, { kind: 'brown', filter: 'lowpass', f0: 800 * pf, q: 0.8, t0: t, dur: 0.4 + 0.3 * ds, gain: 0.8 * sg, steps: 24, depth: 0.9 }));
          E(grains(ctx, d, { n: 6 + s * 3, t0: t, span: 0.5 * ds, fMin: 1500, fMax: 4000, dMin: 0.01, dMax: 0.03, gain: 0.25 * sg }));
        }
        break;
      case 'metal': {
        const ratios = [1, 2.76, 5.4, 8.93, 11.34];
        if (ev === 'hit') {
          E(partials(ctx, d, t, rnd(380, 620) * pf, ratios, [0.5, 0.35, 0.22, 0.14, 0.08].map((g) => g * sg), [0.5, 0.3, 0.2, 0.12, 0.08].map((x) => x * ds)));
          E(nz(ctx, d, { filter: 'highpass', f0: 3000, t0: t, decay: 0.02, gain: 0.5 * sg }));
        } else if (ev === 'break') {
          E(partials(ctx, d, t, rnd(220, 340) * pf, ratios, [0.45, 0.4, 0.3, 0.2, 0.12].map((g) => g * sg), [1.2, 0.8, 0.5, 0.3, 0.2].map((x) => x * ds)));
          E(nz(ctx, d, { filter: 'bandpass', f0: 3000, q: 0.8, t0: t, decay: 0.25 * ds, gain: 0.4 * sg }));
          E(tone(ctx, d, { f0: 110 * pf, f1: 60, t0: t, decay: 0.2, gain: 0.6 * sg }));
        } else {
          E(texture(ctx, d, { filter: 'highpass', f0: 2500, q: 0.7, t0: t, dur: 0.4 + 0.3 * ds, gain: 0.55 * sg }));
          const o = ctx.createOscillator(); o.type = 'sawtooth';
          const f = rnd(1500, 2400) * pf;
          o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.12, t + 0.4 * ds);
          const g = ctx.createGain(); jitterEnv(g.gain, t, 0.4 * ds + 0.3, 0.12 * sg, 10);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6;
          o.connect(bp).connect(g).connect(d); o.start(t); o.stop(t + 0.4 * ds + 0.35);
          E(t + 0.4 * ds + 0.3);
        }
        break;
      }
      case 'glass':
        if (ev === 'hit') {
          E(partials(ctx, d, t, rnd(2400, 3600) * pf, [1, 1.62, 2.31, 3.1], [0.4, 0.3, 0.2, 0.12].map((g) => g * sg), [0.16, 0.11, 0.07, 0.04].map((x) => x * ds)));
          E(nz(ctx, d, { filter: 'highpass', f0: 5000, t0: t, decay: 0.015, gain: 0.35 * sg }));
        } else if (ev === 'break') {
          E(tone(ctx, d, { f0: 420 * pf, f1: 250, t0: t, decay: 0.05, gain: 0.45 * sg }));
          E(nz(ctx, d, { filter: 'highpass', f0: 4500, t0: t, decay: 0.3 * ds, gain: 0.45 * sg }));
          E(grains(ctx, d, { n: 12 + s * 8, t0: t, span: 0.3 * ds + 0.1, fMin: 2500, fMax: 9000, dMin: 0.02, dMax: 0.1, gain: 0.25, tonal: true, front: 0.9 }));
          E(grains(ctx, d, { n: 6 + s * 4, t0: t + 0.1, span: 0.4 * ds, filter: 'highpass', fMin: 4000, fMax: 7000, dMin: 0.01, dMax: 0.03, gain: 0.3, front: 0.4 }));
        } else {
          E(texture(ctx, d, { filter: 'highpass', f0: 5000, t0: t, dur: 0.3 + 0.2 * ds, gain: 0.22 * sg, depth: 0.9 }));
          E(grains(ctx, d, { n: 4 + s * 2, t0: t, span: 0.35 * ds, fMin: 3000, fMax: 6500, dMin: 0.01, dMax: 0.03, gain: 0.15, tonal: true }));
        }
        break;
      case 'dirt':
        if (ev === 'hit') {
          E(tone(ctx, d, { f0: 95 * pf, f1: 50, t0: t, decay: 0.13 * ds, gain: 0.8 * sg }));
          E(nz(ctx, d, { kind: 'brown', f0: 450, t0: t, decay: 0.12 * ds, gain: 0.8 * sg }));
        } else if (ev === 'break') {
          E(nz(ctx, d, { kind: 'brown', f0: 1000, f1: 280, t0: t, decay: 0.5 * ds, gain: 0.9 * sg }));
          E(grains(ctx, d, { n: 4 + s * 4, t0: t + 0.02, span: 0.4 * ds, filter: 'lowpass', fMin: 800, fMax: 2000, dMin: 0.03, dMax: 0.08, gain: 0.35 * sg }));
          E(tone(ctx, d, { f0: 70 * pf, f1: 40, t0: t, decay: 0.2 * ds, gain: 0.6 * sg }));
        } else {
          E(texture(ctx, d, { kind: 'brown', filter: 'lowpass', f0: 700 * pf, q: 0.7, t0: t, dur: 0.45 + 0.2 * ds, gain: 0.7 * sg }));
        }
        break;
      case 'plastic':
        if (ev === 'hit') {
          E(tone(ctx, d, { f0: 480 * pf, f1: 300 * pf, t0: t, decay: 0.07, gain: 0.55 * sg }));
          E(tone(ctx, d, { type: 'triangle', f0: 230 * pf, t0: t, decay: 0.13 * ds, gain: 0.35 * sg }));
          E(nz(ctx, d, { filter: 'bandpass', f0: 1500 * pf, q: 2, t0: t, decay: 0.05, gain: 0.5 * sg }));
        } else if (ev === 'break') {
          for (let i = 0; i < 3 + s * 3; i++) E(nz(ctx, d, { filter: 'bandpass', f0: rnd(1800, 2800), q: 2, t0: t + i * rnd(0.015, 0.05), decay: 0.03, gain: 0.55 * sg }));
          E(tone(ctx, d, { f0: 320 * pf, f1: 180 * pf, t0: t, decay: 0.2 * ds, gain: 0.6 * sg }));
        } else {
          E(texture(ctx, d, { kind: 'white', filter: 'bandpass', f0: 2500, q: 6, t0: t, dur: 0.3 + 0.2 * ds, gain: 0.3 * sg }));
          E(tone(ctx, d, { f0: rnd(1800, 2400), f1: rnd(1500, 2600), t0: t, attack: 0.05, decay: 0.2, gain: 0.04 }));
        }
        break;
      case 'foliage': {
        const len = ev === 'hit' ? 0.22 : ev === 'break' ? 0.4 * ds + 0.15 : 0.35 + 0.2 * ds;
        E(texture(ctx, d, { filter: 'bandpass', f0: 3800 * pf, f1: 5200 * pf, q: 0.7, t0: t, dur: len, gain: 0.45 * sg, steps: 14, depth: 0.85 }));
        E(grains(ctx, d, { n: 3 + s * 3, t0: t, span: len, fMin: 4000, fMax: 8000, dMin: 0.01, dMax: 0.03, gain: 0.2 * sg }));
        if (ev === 'break') E(nz(ctx, d, { kind: 'brown', f0: 500, t0: t, decay: 0.1, gain: 0.3 * sg }));
        break;
      }
      case 'ice':
        if (ev === 'hit') {
          E(partials(ctx, d, t, rnd(1700, 2300) * pf, [1, 2.4, 3.7], [0.4, 0.25, 0.12].map((g) => g * sg), [0.1, 0.06, 0.04]));
          E(nz(ctx, d, { f0: 1800, t0: t, decay: 0.04, gain: 0.4 * sg }));
        } else if (ev === 'break') {
          E(nz(ctx, d, { filter: 'bandpass', f0: 2600, q: 1.2, t0: t, decay: 0.1, gain: 0.7 * sg }));
          E(tone(ctx, d, { f0: 190 * pf, f1: 100, t0: t, decay: 0.3 * ds, gain: 0.6 * sg }));
          E(grains(ctx, d, { n: 8 + s * 6, t0: t, span: 0.35 * ds, fMin: 1200, fMax: 5000, dMin: 0.01, dMax: 0.06, gain: 0.25, tonal: true }));
        } else {
          E(texture(ctx, d, { filter: 'bandpass', f0: 3500, q: 4, t0: t, dur: 0.3 + 0.2 * ds, gain: 0.8 * sg }));
          E(tone(ctx, d, { f0: 900, f1: 700, t0: t, attack: 0.04, decay: 0.2, gain: 0.05 }));
        }
        break;
    }
    return end - t + (p.delay ?? 0) + 0.05;
  };
}

// ----------------------------------------------------------------- registry

export const SOUNDS: Record<string, SoundFn> = {};

export const matSoundName = (g: AudioGroup, ev: SoundEvent, size: number): string => `mat.${g}.${ev}.${size}`;
for (const g of GROUPS) for (const ev of SOUND_EVENTS) for (const s of [0, 1, 2] as const) SOUNDS[matSoundName(g, ev, s)] = material(g, ev, s);

const dur = (ctx: Ctx, p: SoundParams, end: number) => end - ctx.currentTime + 0.05;

// --- structural
SOUNDS['struct.creak'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const f = rnd(110, 190) * (p.pitch ?? 1);
  o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * rnd(0.7, 1.3), t + 0.7);
  const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 600; lp.Q.value = 4;
  const g = ctx.createGain(); jitterEnv(g.gain, t, 0.7, 0.18, 14, 0.8);
  o.connect(lp).connect(g).connect(d); o.start(t); o.stop(t + 0.72);
  const e = nz(ctx, d, { filter: 'highpass', f0: 2200, t0: t + 0.3, decay: 0.04, gain: 0.5 });
  nz(ctx, d, { filter: 'highpass', f0: 2600, t0: t + 0.55, decay: 0.05, gain: 0.6 });
  tone(ctx, d, { f0: 130, f1: 70, t0: t + 0.5, decay: 0.3, gain: 0.5 });
  return dur(ctx, p, Math.max(e, t + 0.9));
};
SOUNDS['struct.rumble'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  nz(ctx, d, { kind: 'brown', f0: 260, f1: 90, t0: t, attack: 0.15, decay: 1.2, gain: 1.0 });
  tone(ctx, d, { f0: 55, f1: 32, t0: t, attack: 0.1, decay: 1.0, gain: 0.7 });
  const e = grains(ctx, d, { n: 12, t0: t + 0.2, span: 1.1, filter: 'lowpass', fMin: 500, fMax: 1800, dMin: 0.04, dMax: 0.12, gain: 0.3 });
  return dur(ctx, p, Math.max(e, t + 1.45));
};

// --- explosions (3 sizes)
function explosion(s: 0 | 1 | 2): SoundFn {
  return (ctx, d, p) => {
    const t = t00(ctx, p);
    const k = [0.8, 1, 1.25][s];
    const len = [0.9, 1.6, 2.6][s];
    const ws = distortion(ctx, 2.2);
    const bus = ctx.createGain(); bus.gain.value = 0.85;
    ws.connect(bus).connect(d);
    tone(ctx, ws, { f0: 130 * (p.pitch ?? 1), f1: 32, t0: t, attack: 0.004, decay: 0.35 + len * 0.3, gain: 0.95 });
    tone(ctx, ws, { type: 'triangle', f0: 70, f1: 28, t0: t, attack: 0.006, decay: 0.3 + len * 0.25, gain: 0.6 });
    nz(ctx, ws, { kind: 'brown', f0: 3500 * k, f1: 180, q: 0.8, t0: t, attack: 0.003, decay: len * 0.55, gain: 1.0 });
    nz(ctx, ws, { kind: 'white', f0: 7000, f1: 900, q: 0.7, t0: t, attack: 0.001, decay: 0.18 + 0.1 * s, gain: 0.55 });
    nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 600, f1: 200, q: 0.6, t0: t + 0.1, attack: 0.1, decay: len * 0.9, gain: 0.35 });
    const e = grains(ctx, d, { n: 10 + s * 12, t0: t + 0.15, span: len * 0.9, filter: 'bandpass', fMin: 400, fMax: 3500, dMin: 0.03, dMax: 0.15, gain: 0.35, front: 0.3 });
    return dur(ctx, p, Math.max(e, t + len)) + 0.1;
  };
}
for (const s of [0, 1, 2] as const) SOUNDS[`explosion.${s}`] = explosion(s);

// --- tools
SOUNDS['tool.swing'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 300, f1: 1400, q: 1.1, t0: t, attack: 0.12, decay: 0.16, gain: 0.45 });
  return dur(ctx, p, e);
};
SOUNDS['tool.swing.hit'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 300, f1: 1400, q: 1.1, t0: t, attack: 0.1, decay: 0.12, gain: 0.35 });
  const e = tone(ctx, d, { f0: 120, f1: 55, t0: t + 0.12, decay: 0.15, gain: 0.7 });
  return dur(ctx, p, e);
};
SOUNDS['tool.clang'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = partials(ctx, d, t, rnd(300, 420) * (p.pitch ?? 1), [1, 2.76, 5.4, 8.93], [0.5, 0.4, 0.25, 0.15], [0.9, 0.6, 0.35, 0.2]);
  nz(ctx, d, { filter: 'highpass', f0: 3500, t0: t, decay: 0.03, gain: 0.5 });
  return dur(ctx, p, e);
};
function gun(name: string, o: { thump: number; crack: number; len: number; gain: number; tail: number }) {
  SOUNDS[name] = (ctx, d, p) => {
    const t = t00(ctx, p);
    const ws = distortion(ctx, 2.5);
    const bus = ctx.createGain(); bus.gain.value = o.gain;
    ws.connect(bus).connect(d);
    tone(ctx, ws, { f0: o.thump * 2, f1: o.thump * 0.5, t0: t, attack: 0.002, decay: o.len * 0.6, gain: 0.9 });
    nz(ctx, ws, { f0: o.crack, f1: o.crack * 0.2, q: 0.7, t0: t, attack: 0.001, decay: o.len, gain: 1 });
    nz(ctx, d, { filter: 'highpass', f0: 3500, t0: t, attack: 0.001, decay: 0.03, gain: 0.5 });
    const e = nz(ctx, d, { kind: 'pink', filter: 'lowpass', f0: 1800, f1: 300, t0: t + 0.03, attack: 0.02, decay: o.tail, gain: 0.25 });
    return dur(ctx, p, e);
  };
}
gun('tool.shot.pistol', { thump: 90, crack: 6000, len: 0.1, gain: 0.8, tail: 0.25 });
gun('tool.shot.shotgun', { thump: 60, crack: 5000, len: 0.22, gain: 1.0, tail: 0.5 });
gun('tool.shot.rifle', { thump: 75, crack: 8000, len: 0.13, gain: 0.9, tail: 0.45 });
SOUNDS['tool.shot.rocket'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { f0: 140, f1: 60, t0: t, decay: 0.3, gain: 0.6 });
  nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 400, f1: 2400, q: 0.9, t0: t, attack: 0.25, decay: 0.7, gain: 0.7 });
  const e = nz(ctx, d, { kind: 'brown', f0: 900, f1: 150, t0: t, attack: 0.02, decay: 1.1, gain: 0.8 });
  return dur(ctx, p, e);
};
SOUNDS['tool.empty'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  nz(ctx, d, { filter: 'bandpass', f0: 2800, q: 3, t0: t, decay: 0.02, gain: 0.9 });
  const e = tone(ctx, d, { type: 'square', f0: 900, f1: 500, t0: t + 0.01, decay: 0.03, gain: 0.3 });
  return dur(ctx, p, e);
};
SOUNDS['tool.throw'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 500, f1: 1600, q: 1.2, t0: t, attack: 0.07, decay: 0.1, gain: 0.7 });
  return dur(ctx, p, e);
};
SOUNDS['tool.place'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { f0: 150, f1: 80, t0: t, decay: 0.1, gain: 0.7 });
  const e = nz(ctx, d, { filter: 'bandpass', f0: 1200, q: 1.5, t0: t, decay: 0.05, gain: 0.45 });
  return dur(ctx, p, Math.max(e, t + 0.15));
};
SOUNDS['tool.beep'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = tone(ctx, d, { type: 'square', f0: 1760 * (p.pitch ?? 1), t0: t, attack: 0.002, decay: 0.08, gain: 0.4 });
  return dur(ctx, p, e);
};
SOUNDS['tool.spray'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { filter: 'highpass', f0: 4200, q: 0.7, t0: t, attack: 0.01, decay: 0.12, gain: 0.3 });
  nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 6500, q: 1, t0: t, attack: 0.01, decay: 0.12, gain: 0.15 });
  return dur(ctx, p, e);
};
SOUNDS['tool.foam'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'lowpass', f0: 2200, f1: 900, q: 0.8, t0: t, attack: 0.02, decay: 0.2, gain: 0.35 });
  return dur(ctx, p, e);
};
SOUNDS['tool.select'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  nz(ctx, d, { filter: 'bandpass', f0: 2200, q: 2, t0: t, decay: 0.015, gain: 0.35 });
  const e = tone(ctx, d, { type: 'triangle', f0: 600, f1: 900, t0: t, decay: 0.07, gain: 0.2 });
  return dur(ctx, p, e);
};
SOUNDS['tool.torch.on'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 500, f1: 2500, q: 0.8, t0: t, attack: 0.04, decay: 0.2, gain: 0.45 });
  tone(ctx, d, { f0: 200, f1: 100, t0: t, decay: 0.12, gain: 0.4 });
  return dur(ctx, p, e);
};
SOUNDS['tool.torch.off'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 2500, f1: 400, q: 0.8, t0: t, attack: 0.01, decay: 0.2, gain: 0.8 });
  return dur(ctx, p, e);
};

// --- player
const STEP_SPEC: Record<AudioGroup, { f: number; lp: number; kind: 'brown' | 'pink' | 'white'; g: number }> = {
  wood: { f: 160, lp: 1200, kind: 'pink', g: 0.8 }, masonry: { f: 110, lp: 2200, kind: 'pink', g: 0.8 },
  metal: { f: 260, lp: 3500, kind: 'white', g: 0.6 }, glass: { f: 300, lp: 5000, kind: 'white', g: 0.5 },
  dirt: { f: 80, lp: 700, kind: 'brown', g: 0.9 }, plastic: { f: 200, lp: 1800, kind: 'pink', g: 0.6 },
  foliage: { f: 90, lp: 4500, kind: 'white', g: 0.35 }, ice: { f: 150, lp: 3000, kind: 'pink', g: 0.6 },
};
for (const g of GROUPS) {
  const sp = STEP_SPEC[g];
  SOUNDS[`step.${g}`] = (ctx, d, p) => {
    const t = t00(ctx, p);
    const pf = (p.pitch ?? 1) * rnd(0.9, 1.1);
    tone(ctx, d, { f0: sp.f * 1.5 * pf, f1: sp.f * 0.7 * pf, t0: t, decay: 0.07, gain: 0.7 * sp.g });
    const e = nz(ctx, d, { kind: sp.kind, f0: sp.lp * pf, f1: sp.lp * 0.3, q: 0.8, t0: t, attack: 0.004, decay: 0.09, gain: 0.6 * sp.g });
    return dur(ctx, p, e);
  };
}
SOUNDS['player.jump'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 400, f1: 900, q: 1, t0: t, attack: 0.04, decay: 0.12, gain: 0.55 });
  return dur(ctx, p, e);
};
SOUNDS['player.land'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const a = Math.min(1, Math.max(0.2, p.amount ?? 0.5));
  tone(ctx, d, { f0: 120, f1: 45, t0: t, decay: 0.15 + 0.15 * a, gain: 0.9 * a });
  const e = nz(ctx, d, { kind: 'brown', f0: 900, f1: 200, t0: t, decay: 0.15 + 0.1 * a, gain: 0.7 * a });
  return dur(ctx, p, e);
};
SOUNDS['player.hurt'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { f0: 110, f1: 50, t0: t, decay: 0.2, gain: 0.8 });
  nz(ctx, d, { kind: 'pink', filter: 'lowpass', f0: 1500, f1: 300, t0: t, decay: 0.2, gain: 0.5 });
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.25);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  const g = ctx.createGain(); const e = env(g.gain, t, 0.25, 0.01, 0.25);
  o.connect(f).connect(g).connect(d); o.start(t); o.stop(e + 0.03);
  return dur(ctx, p, e);
};
SOUNDS['player.dead'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { f0: 140, f1: 35, t0: t, decay: 1.4, gain: 0.8 });
  tone(ctx, d, { type: 'sawtooth', f0: 220, f1: 55, t0: t, decay: 1.2, gain: 0.15 });
  const e = nz(ctx, d, { kind: 'brown', f0: 800, f1: 100, t0: t, decay: 1.2, gain: 0.6 });
  return dur(ctx, p, e);
};

// --- fire
SOUNDS['fire.ignite'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 300, f1: 1800, q: 0.7, t0: t, attack: 0.08, decay: 0.3, gain: 0.5 });
  return dur(ctx, p, e);
};
SOUNDS['fire.pop'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { filter: 'bandpass', f0: rnd(1200, 4200), q: 2, t0: t, attack: 0.001, decay: rnd(0.01, 0.04), gain: rnd(0.5, 1.0) });
  return dur(ctx, p, e);
};

// --- vehicles
SOUNDS['vehicle.door'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { f0: 140, f1: 70, t0: t, decay: 0.12, gain: 0.8 });
  nz(ctx, d, { filter: 'bandpass', f0: 1500, q: 1.2, t0: t, decay: 0.05, gain: 0.5 });
  const e = tone(ctx, d, { type: 'triangle', f0: 90, f1: 60, t0: t + 0.12, decay: 0.1, gain: 0.5 });
  nz(ctx, d, { filter: 'highpass', f0: 3000, t0: t + 0.01, decay: 0.02, gain: 0.3 });
  return dur(ctx, p, e);
};
SOUNDS['vehicle.ignition'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(18, t); o.frequency.linearRampToValueAtTime(30, t + 0.7); o.frequency.exponentialRampToValueAtTime(52, t + 1.0);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(900, t + 1.0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.1); g.gain.linearRampToValueAtTime(0.4, t + 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 14;
  const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg).connect(g.gain);
  o.connect(lp).connect(g).connect(d); o.start(t); lfo.start(t); o.stop(t + 1.25); lfo.stop(t + 1.25);
  nz(ctx, d, { kind: 'brown', f0: 400, t0: t, attack: 0.1, decay: 1.0, gain: 0.4 });
  return dur(ctx, p, t + 1.25);
};
SOUNDS['vehicle.shutoff'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = tone(ctx, d, { type: 'sawtooth', f0: 55, f1: 20, t0: t, decay: 0.5, gain: 0.35 });
  nz(ctx, d, { kind: 'brown', f0: 500, f1: 100, t0: t, decay: 0.4, gain: 0.4 });
  tone(ctx, d, { f0: 100, f1: 60, t0: t + 0.45, decay: 0.1, gain: 0.4 });
  return dur(ctx, p, e + 0.1);
};
SOUNDS['vehicle.crash'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { f0: 100, f1: 40, t0: t, decay: 0.35, gain: 0.9 });
  nz(ctx, d, { kind: 'brown', f0: 2500, f1: 200, t0: t, decay: 0.5, gain: 0.9 });
  partials(ctx, d, t, rnd(180, 260), [1, 2.76, 5.4, 8.93], [0.4, 0.35, 0.25, 0.15], [0.9, 0.6, 0.4, 0.25]);
  const e = grains(ctx, d, { n: 12, t0: t + 0.05, span: 0.6, filter: 'bandpass', fMin: 1500, fMax: 6000, dMin: 0.01, dMax: 0.05, gain: 0.3 });
  return dur(ctx, p, Math.max(e, t + 1.0));
};
SOUNDS['vehicle.skid'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const a = Math.min(1, Math.max(0.2, p.amount ?? 0.6));
  const e = texture(ctx, d, { kind: 'white', filter: 'bandpass', f0: 1300 * rnd(0.9, 1.15), f1: 1100, q: 5, t0: t, dur: 0.35, gain: 0.8 * a, steps: 8, depth: 0.4 });
  return dur(ctx, p, e);
};

// --- mission / UI
const note = (ctx: Ctx, d: AudioNode, t: number, midi: number, dec: number, gain: number, type: OscillatorType = 'triangle') =>
  tone(ctx, d, { type, f0: midiToHz(midi), t0: t, attack: 0.004, decay: dec, gain });
SOUNDS['mission.tick'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = tone(ctx, d, { type: 'sine', f0: 1100, t0: t, attack: 0.001, decay: 0.03, gain: 0.3 });
  return dur(ctx, p, e);
};
SOUNDS['mission.urgent'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = tone(ctx, d, { type: 'square', f0: 1320 * (p.pitch ?? 1), t0: t, attack: 0.002, decay: 0.12, gain: 0.45 });
  return dur(ctx, p, e);
};
SOUNDS['mission.target'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  note(ctx, d, t, 74, 0.25, 0.3);
  const e = note(ctx, d, t + 0.12, 81, 0.4, 0.3);
  return dur(ctx, p, e);
};
SOUNDS['mission.pickup'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { type: 'square', f0: midiToHz(83), t0: t, attack: 0.002, decay: 0.07, gain: 0.14 });
  const e = tone(ctx, d, { type: 'square', f0: midiToHz(88), t0: t + 0.06, attack: 0.002, decay: 0.2, gain: 0.14 });
  partials(ctx, d, t + 0.06, 3000, [1, 1.5], [0.12, 0.08], [0.25, 0.2]);
  return dur(ctx, p, e);
};
SOUNDS['mission.objective'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  note(ctx, d, t, 69, 0.2, 0.3); note(ctx, d, t + 0.1, 72, 0.2, 0.3);
  const e = note(ctx, d, t + 0.2, 76, 0.45, 0.32);
  return dur(ctx, p, e);
};
SOUNDS['mission.escapeOpen'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  [64, 67, 71, 76].forEach((m, i) => note(ctx, d, t + i * 0.1, m, 0.3, 0.26, 'sawtooth'));
  const e = tone(ctx, d, { type: 'sawtooth', f0: midiToHz(52), t0: t + 0.4, attack: 0.03, decay: 0.7, gain: 0.25 });
  return dur(ctx, p, e);
};
SOUNDS['mission.success'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  [60, 64, 67, 72, 76].forEach((m, i) => note(ctx, d, t + i * 0.11, m, 0.5, 0.27));
  [48, 55].forEach((m) => tone(ctx, d, { f0: midiToHz(m), t0: t + 0.4, attack: 0.02, decay: 1.2, gain: 0.3 }));
  const e = partials(ctx, d, t + 0.55, midiToHz(84), [1, 2, 3], [0.14, 0.08, 0.05], [1.2, 0.8, 0.5]);
  return dur(ctx, p, e);
};
SOUNDS['mission.fail'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  [67, 63, 60, 55].forEach((m, i) => note(ctx, d, t + i * 0.2, m, 0.55, 0.28, 'sawtooth'));
  const e = tone(ctx, d, { f0: 70, f1: 38, t0: t + 0.5, decay: 1.2, gain: 0.5 });
  return dur(ctx, p, e);
};
SOUNDS['ui.click'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  nz(ctx, d, { filter: 'bandpass', f0: 3000, q: 2, t0: t, decay: 0.012, gain: 0.5 });
  const e = tone(ctx, d, { type: 'triangle', f0: 880, f1: 660, t0: t, decay: 0.05, gain: 0.45 });
  return dur(ctx, p, e);
};
SOUNDS['ui.hover'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = tone(ctx, d, { type: 'sine', f0: 1500, t0: t, attack: 0.003, decay: 0.03, gain: 0.2 });
  return dur(ctx, p, e);
};

// --- ambient details (kept subtle)
SOUNDS['amb.bird'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const base = rnd(2600, 4200);
  const n = 2 + ((Math.random() * 3) | 0);
  let e = t;
  for (let i = 0; i < n; i++) e = tone(ctx, d, { f0: base * rnd(0.9, 1.1), f1: base * rnd(1.2, 1.6), t0: t + i * 0.11, attack: 0.01, decay: 0.07, gain: 0.05 });
  return dur(ctx, p, e);
};
SOUNDS['amb.gust'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  const e = nz(ctx, d, { kind: 'pink', filter: 'bandpass', f0: 300, f1: 900, q: 0.6, t0: t, attack: 1.2, decay: 1.8, gain: 0.18 });
  return dur(ctx, p, e);
};
SOUNDS['amb.distant'] = (ctx, d, p) => {
  const t = t00(ctx, p);
  tone(ctx, d, { f0: 70, f1: 40, t0: t, attack: 0.02, decay: 0.5, gain: 0.12 });
  const e = nz(ctx, d, { kind: 'brown', f0: 300, f1: 100, t0: t, attack: 0.03, decay: 0.8, gain: 0.12 });
  return dur(ctx, p, e);
};

export const SOUND_NAMES = Object.keys(SOUNDS);

// ----------------------------------------------------------------- loops

export interface LoopParams { level?: number; freq?: number; cutoff?: number; rate?: number }
export interface LoopHandle {
  out: GainNode;
  update(p: LoopParams, now: number): void;
  stop(): void;
}
export type LoopBuilder = (ctx: Ctx, dest: AudioNode) => LoopHandle;

function loopShell(ctx: Ctx, dest: AudioNode, sources: AudioScheduledSourceNode[], extra?: () => void): { out: GainNode; stop: () => void } {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);
  return {
    out,
    stop() {
      try {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, 0.05);
        for (const s of sources) s.stop(t + 0.4);
        extra?.();
        setTimeout(() => { try { out.disconnect(); } catch { /* ignore */ } }, 600);
      } catch { /* ignore */ }
    },
  };
}
const lfo = (ctx: Ctx, freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine'): OscillatorNode => {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = depth; o.connect(g).connect(target); o.start();
  return o;
};
const setLevel = (h: GainNode, ctx: Ctx, v: number) => h.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, 0.08);

export const LOOPS: Record<string, LoopBuilder> = {
  /** outdoor wind bed */
  ambient(ctx, dest) {
    const n1 = noiseSource(ctx, 'brown', ctx.currentTime, 0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.5;
    const n2 = noiseSource(ctx, 'pink', ctx.currentTime, 0);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const gustG = ctx.createGain(); gustG.gain.value = 0.55;
    const l1 = lfo(ctx, 0.07, 160, lp.frequency);
    const l2 = lfo(ctx, 0.11, 0.2, g2.gain);
    const l3 = lfo(ctx, 0.05, 0.25, gustG.gain);
    const sh = loopShell(ctx, dest, [n1, n2, l1, l2, l3]);
    n1.connect(lp).connect(gustG).connect(sh.out);
    n2.connect(bp).connect(g2).connect(sh.out);
    return { out: sh.out, stop: sh.stop, update: (p) => setLevel(sh.out, ctx, (p.level ?? 0.5) * 0.3) };
  },
  fire(ctx, dest) {
    const n = noiseSource(ctx, 'brown', ctx.currentTime, 0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    const n2 = noiseSource(ctx, 'pink', ctx.currentTime, 0);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.9;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    const l1 = lfo(ctx, 7.3, 0.1, g2.gain, 'triangle');
    const l2 = lfo(ctx, 1.9, 120, lp.frequency);
    const sh = loopShell(ctx, dest, [n, n2, l1, l2]);
    n.connect(lp).connect(sh.out);
    n2.connect(bp).connect(g2).connect(sh.out);
    return { out: sh.out, stop: sh.stop, update: (p) => setLevel(sh.out, ctx, (p.level ?? 0.5) * 0.35) };
  },
  torch(ctx, dest) {
    const n = noiseSource(ctx, 'pink', ctx.currentTime, 0);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.5;
    const n2 = noiseSource(ctx, 'brown', ctx.currentTime, 0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    const l1 = lfo(ctx, 9, 400, bp.frequency, 'triangle');
    const sh = loopShell(ctx, dest, [n, n2, l1]);
    n.connect(bp).connect(sh.out);
    n2.connect(lp).connect(g2).connect(sh.out);
    return { out: sh.out, stop: sh.stop, update: (p) => setLevel(sh.out, ctx, (p.level ?? 0.5) * 0.3) };
  },
  engine(ctx, dest) {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'sawtooth'; o3.detune.value = 9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2;
    const mix = ctx.createGain(); mix.gain.value = 0.35;
    const g2 = ctx.createGain(); g2.gain.value = 0.4; const g3 = ctx.createGain(); g3.gain.value = 0.6;
    const rumble = noiseSource(ctx, 'brown', ctx.currentTime, 0);
    const rg = ctx.createGain(); rg.gain.value = 0.5;
    const wob = lfo(ctx, 5.5, 0.12, mix.gain);
    const wob2 = lfo(ctx, 3.1, 1.2, o1.frequency);
    const sh = loopShell(ctx, dest, [o1, o2, o3, rumble, wob, wob2]);
    o1.connect(mix); o2.connect(g2).connect(mix); o3.connect(g3).connect(mix);
    rumble.connect(rg).connect(mix);
    mix.connect(lp).connect(sh.out);
    o1.frequency.value = 40; o2.frequency.value = 20; o3.frequency.value = 40;
    o1.start(); o2.start(); o3.start();
    return {
      out: sh.out, stop: sh.stop,
      update(p, now) {
        const f = Math.max(10, p.freq ?? 40);
        const t = ctx.currentTime;
        o1.frequency.setTargetAtTime(f, t, 0.08); o2.frequency.setTargetAtTime(f * 0.5, t, 0.08); o3.frequency.setTargetAtTime(f * 1.003, t, 0.08);
        lp.frequency.setTargetAtTime(p.cutoff ?? 600, t, 0.1);
        void now;
        setLevel(sh.out, ctx, (p.level ?? 0.5) * 0.45);
      },
    };
  },
  /** two-tone wailing alarm siren */
  alarm(ctx, dest) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 780;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 1560;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.7;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const sirenLfo = lfo(ctx, 0.9, 260, o.frequency, 'triangle');
    const sirenLfo2 = lfo(ctx, 0.9, 520, o2.frequency, 'triangle');
    const trem = ctx.createGain(); trem.gain.value = 0.75;
    const tl = lfo(ctx, 0.9 * 4, 0.2, trem.gain, 'square');
    const sh = loopShell(ctx, dest, [o, o2, sirenLfo, sirenLfo2, tl]);
    o.connect(bp); o2.connect(g2).connect(bp);
    bp.connect(trem).connect(sh.out);
    o.start(); o2.start();
    return { out: sh.out, stop: sh.stop, update: (p) => setLevel(sh.out, ctx, (p.level ?? 0.5) * 0.14) };
  },
  /** helicopter rotor chop */
  heli(ctx, dest) {
    const n = noiseSource(ctx, 'brown', ctx.currentTime, 0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    const cl = lfo(ctx, 11, 0.5, chop.gain);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46;
    const olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 220;
    const og = ctx.createGain(); og.gain.value = 0.4;
    const ocl = lfo(ctx, 11, 0.3, og.gain);
    const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 1450;
    const wg = ctx.createGain(); wg.gain.value = 0.015;
    const sh = loopShell(ctx, dest, [n, o, whine, cl, ocl]);
    n.connect(lp).connect(chop).connect(sh.out);
    o.connect(olp).connect(og).connect(sh.out);
    whine.connect(wg).connect(sh.out);
    o.start(); whine.start();
    return {
      out: sh.out, stop: sh.stop,
      update(p) {
        const r = p.rate ?? 11;
        cl.frequency.setTargetAtTime(r, ctx.currentTime, 0.2); ocl.frequency.setTargetAtTime(r, ctx.currentTime, 0.2);
        setLevel(sh.out, ctx, (p.level ?? 0.5) * 0.4);
      },
    };
  },
};
export const LOOP_NAMES = Object.keys(LOOPS);

// ----------------------------------------------------------------- master chain

export interface MasterChain {
  input: GainNode;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  limiter: WaveShaperNode;
}
/** master gain -> compressor -> soft limiter (tanh, |x| <= 1) -> destination */
export function createMasterChain(ctx: Ctx): MasterChain {
  const input = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14; compressor.knee.value = 12; compressor.ratio.value = 6;
  compressor.attack.value = 0.003; compressor.release.value = 0.2;
  const limiter = distortion(ctx, 1.1);
  input.connect(master).connect(compressor).connect(limiter).connect(ctx.destination);
  return { input, master, compressor, limiter };
}

export { pick };
