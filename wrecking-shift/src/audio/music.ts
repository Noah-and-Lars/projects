/**
 * Generative music: two original cues built from simple rules (no copied melodies).
 *  - calm:  slow minor-mode pads + sparse arpeggio + soft bass (planning phase)
 *  - heist: driving bass pulse, noise percussion, stabs and a rising tension layer
 * `stepCue` is a pure function (deterministic hash randomness) so the sequencer is unit-testable.
 */
import { clamp01 } from './logic';
import { midiToHz, nz, tone, noiseSource, type Ctx } from './synth';

export type CueName = 'calm' | 'heist';
export type MusicVoice = 'pad' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat' | 'lead';
export interface MusicNote { voice: MusicVoice; midi: number; /** length in steps */ steps: number; vel: number }

export const STEPS_PER_BAR = 16;
export const CUE_BPM: Record<CueName, number> = { calm: 66, heist: 132 };
/** seconds per 16th step */
export const stepSeconds = (cue: CueName): number => 60 / CUE_BPM[cue] / 4;

/** stateless pseudo random in [0,1) from integers */
export function hashRand(a: number, b = 0, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// chords as MIDI note lists (root first)
const CALM_PROG: number[][] = [
  [50, 57, 62, 65, 69], // Dm9-ish
  [46, 53, 58, 62, 65], // Bb maj7-ish
  [43, 50, 55, 58, 62], // Gm
  [45, 52, 57, 61, 64], // A (major, dominant colour)
];
const HEIST_PROG: number[][] = [
  [45, 52, 57, 60, 64], // Am
  [41, 48, 53, 57, 60], // F
  [43, 50, 55, 59, 62], // G
  [40, 47, 52, 55, 59], // Em
];

/** notes that start on global step `step` (0-based since the cue started) */
export function stepCue(cue: CueName, step: number, tension = 0, seed = 7): MusicNote[] {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const out: MusicNote[] = [];
  if (cue === 'calm') {
    const chord = CALM_PROG[bar % 4];
    if (s === 0) {
      for (let i = 1; i < chord.length; i++) out.push({ voice: 'pad', midi: chord[i] + (i > 2 ? 12 : 0), steps: 16, vel: 0.1 });
      out.push({ voice: 'bass', midi: chord[0] - 12, steps: 10, vel: 0.5 });
    }
    if (s === 8 && hashRand(bar, 1, seed) < 0.5) out.push({ voice: 'bass', midi: chord[2] - 12, steps: 6, vel: 0.3 });
    // sparse arpeggio: silent every 4th bar, otherwise a few random chord tones on off-grid steps
    if (bar % 4 !== 3 && s % 2 === 0 && hashRand(step, 2, seed) < 0.3) {
      const tone = chord[1 + Math.floor(hashRand(step, 3, seed) * (chord.length - 1))];
      out.push({ voice: 'arp', midi: tone + 12 + (hashRand(step, 4, seed) < 0.3 ? 12 : 0), steps: 4, vel: 0.22 });
    }
  } else {
    const chord = HEIST_PROG[Math.floor(bar / 2) % 4];
    const t = clamp01(tension);
    // bass pulse: eighths, with octave jumps
    if (s % 2 === 0) {
      const oct = s === 6 || s === 14 ? 12 : 0;
      out.push({ voice: 'bass', midi: chord[0] - 12 + oct, steps: 2, vel: s % 4 === 0 ? 0.6 : 0.42 });
    }
    // percussion
    if (s % 4 === 0) out.push({ voice: 'kick', midi: 36, steps: 1, vel: 0.85 });
    if (s === 10 && t > 0.4) out.push({ voice: 'kick', midi: 36, steps: 1, vel: 0.6 });
    if (s === 4 || s === 12) out.push({ voice: 'snare', midi: 38, steps: 1, vel: 0.6 });
    if (s === 15 && t > 0.7) out.push({ voice: 'snare', midi: 38, steps: 1, vel: 0.35 });
    if (s % 2 === 0 || t > 0.6) out.push({ voice: 'hat', midi: 42, steps: 1, vel: s % 4 === 2 ? 0.45 : 0.25 });
    // stabs rise in with tension
    if (t > 0.25 && (s === 0 || s === 3 || s === 6 || s === 10)) {
      const idx = 1 + Math.floor(hashRand(bar, s, seed) * 3);
      out.push({ voice: 'lead', midi: chord[idx] + 12, steps: 2, vel: 0.12 + 0.1 * t });
    }
    if (s === 0 && bar % 2 === 0) for (let i = 1; i < 4; i++) out.push({ voice: 'pad', midi: chord[i] + 12, steps: 32, vel: 0.07 });
  }
  return out;
}

/** next cue after an event; pure state machine used by the director */
export function cueFor(heist: boolean): CueName { return heist ? 'heist' : 'calm'; }

// ----------------------------------------------------------------- WebAudio player

interface CueRuntime {
  name: CueName;
  gain: GainNode;
  filter: BiquadFilterNode;
  delay: DelayNode | null;
  step: number;
  nextTime: number;
  active: boolean;
  /** seconds since it became inactive */
  idle: number;
  running: boolean;
}

export class MusicSystem {
  private cues: Record<CueName, CueRuntime>;
  private duck = 1;
  private target: CueName | null = null;
  tension = 0;
  /** number of notes scheduled so far (tests) */
  scheduled = 0;
  private riser: { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  private last = 0;

  constructor(private ctx: Ctx, private dest: AudioNode) {
    const mk = (name: CueName): CueRuntime => {
      const gain = ctx.createGain(); gain.gain.value = 0;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = name === 'calm' ? 1800 : 2500; filter.Q.value = 0.7;
      filter.connect(gain).connect(dest);
      let delay: DelayNode | null = null;
      if (name === 'calm') {
        delay = ctx.createDelay(1.5); delay.delayTime.value = (60 / CUE_BPM.calm) * 0.75;
        const fb = ctx.createGain(); fb.gain.value = 0.38;
        const wet = ctx.createGain(); wet.gain.value = 0.5;
        delay.connect(fb).connect(delay); delay.connect(wet).connect(gain);
      }
      return { name, gain, filter, delay, step: 0, nextTime: 0, active: false, idle: 99, running: false };
    };
    this.cues = { calm: mk('calm'), heist: mk('heist') };
  }

  get currentCue(): CueName | null { return this.target; }

  setCue(cue: CueName | null): void {
    if (cue === this.target) return;
    this.target = cue;
    const t = this.ctx.currentTime;
    for (const name of ['calm', 'heist'] as CueName[]) {
      const c = this.cues[name];
      const on = name === cue;
      if (on && !c.active) { c.step = 0; c.nextTime = Math.max(t + 0.05, c.nextTime); c.idle = 0; }
      if (!on && c.active) c.idle = 0;
      c.active = on;
    }
    this.applyGains();
    if (cue === 'heist') this.startRiser(); else this.stopRiser();
  }

  setDuck(v: number): void { this.duck = v; this.applyGains(); }
  setTension(t: number): void { this.tension = clamp01(t); }

  private applyGains(): void {
    const t = this.ctx.currentTime;
    for (const name of ['calm', 'heist'] as CueName[]) {
      const c = this.cues[name];
      const lvl = (name === 'calm' ? 0.5 : 0.55) * (c.active ? this.duck : 0);
      c.gain.gain.cancelScheduledValues(t);
      c.gain.gain.setTargetAtTime(lvl, t, c.active ? 1.2 : 0.8);
    }
  }

  private startRiser(): void {
    if (this.riser) return;
    const src = noiseSource(this.ctx, 'pink', this.ctx.currentTime, 0);
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 1.5;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.cues.heist.filter);
    this.riser = { gain, filter, src };
  }
  private stopRiser(): void {
    const r = this.riser; if (!r) return;
    this.riser = null;
    const t = this.ctx.currentTime;
    r.gain.gain.setTargetAtTime(0, t, 0.3);
    try { r.src.stop(t + 2); } catch { /* ignore */ }
  }

  /** call every frame (real dt seconds) */
  update(dt: number): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.last = now;
    if (this.riser) {
      const k = this.tension;
      this.riser.filter.frequency.setTargetAtTime(400 + k * 5000, now, 0.3);
      this.riser.gain.gain.setTargetAtTime(k * k * 0.12 * this.duck, now, 0.3);
    }
    this.cues.heist.filter.frequency.setTargetAtTime(1200 + this.tension * 5000, now, 0.4);
    for (const name of ['calm', 'heist'] as CueName[]) {
      const c = this.cues[name];
      if (!c.active) { c.idle += dt; if (c.idle > 4) continue; }
      const sec = stepSeconds(name);
      if (c.nextTime < now - 0.5) c.nextTime = now + 0.02; // we were suspended / lagging
      let guard = 0;
      while (c.nextTime < now + 0.3 && guard++ < 16) {
        this.playStep(c, c.nextTime, sec);
        c.step++; c.nextTime += sec;
      }
    }
  }

  private playStep(c: CueRuntime, t: number, sec: number): void {
    const notes = stepCue(c.name, c.step, this.tension);
    const ctx = this.ctx;
    for (const n of notes) {
      this.scheduled++;
      const len = n.steps * sec;
      const hz = midiToHz(n.midi);
      switch (n.voice) {
        case 'pad':
          tone(ctx, c.filter, { type: 'sawtooth', f0: hz, t0: t, attack: len * 0.35, decay: len * 0.7, gain: n.vel * 0.45, detune: -6 });
          tone(ctx, c.filter, { type: 'triangle', f0: hz, t0: t, attack: len * 0.35, decay: len * 0.7, gain: n.vel * 0.6, detune: 5 });
          break;
        case 'bass':
          if (c.name === 'calm') tone(ctx, c.filter, { type: 'sine', f0: hz, t0: t, attack: 0.02, decay: len, gain: n.vel * 0.8 });
          else {
            tone(ctx, c.filter, { type: 'sawtooth', f0: hz, t0: t, attack: 0.004, decay: len * 0.9, gain: n.vel * 0.5 });
            tone(ctx, c.filter, { type: 'sine', f0: hz, t0: t, attack: 0.004, decay: len, gain: n.vel * 0.6 });
          }
          break;
        case 'arp': {
          const g = ctx.createGain(); g.gain.value = 1;
          g.connect(c.filter); if (c.delay) g.connect(c.delay);
          tone(ctx, g, { type: 'triangle', f0: hz, t0: t, attack: 0.006, decay: len * 1.4, gain: n.vel });
          tone(ctx, g, { type: 'sine', f0: hz * 2, t0: t, attack: 0.006, decay: len * 0.6, gain: n.vel * 0.25 });
          break;
        }
        case 'kick':
          tone(ctx, c.gain, { f0: 150, f1: 42, t0: t, attack: 0.002, decay: 0.2, gain: n.vel * 0.9 });
          nz(ctx, c.gain, { f0: 1500, t0: t, attack: 0.001, decay: 0.012, gain: n.vel * 0.3 });
          break;
        case 'snare':
          nz(ctx, c.gain, { filter: 'bandpass', f0: 1900, q: 0.8, t0: t, attack: 0.001, decay: 0.14, gain: n.vel * 0.5 });
          tone(ctx, c.gain, { f0: 200, f1: 150, t0: t, attack: 0.001, decay: 0.08, gain: n.vel * 0.35 });
          break;
        case 'hat':
          nz(ctx, c.gain, { filter: 'highpass', f0: 7500, t0: t, attack: 0.001, decay: 0.035, gain: n.vel * 0.3 });
          break;
        case 'lead':
          tone(ctx, c.filter, { type: 'square', f0: hz, t0: t, attack: 0.004, decay: len * 0.9, gain: n.vel * 0.5 });
          break;
      }
    }
  }

  stats(): { scheduled: number; cue: CueName | null; lastTime: number } {
    return { scheduled: this.scheduled, cue: this.target, lastTime: this.last };
  }
}
