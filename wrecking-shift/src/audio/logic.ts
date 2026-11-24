/**
 * Pure (no WebAudio, no DOM) audio logic: classification, limiters, helpers.
 * Everything here runs and is unit-tested in Node.
 */
import { MATERIALS, matOf, type AudioGroup } from '../sim/materials';

export const GROUPS: AudioGroup[] = ['wood', 'masonry', 'metal', 'glass', 'dirt', 'plastic', 'foliage', 'ice'];
export type SizeClass = 0 | 1 | 2;
export type SoundEvent = 'hit' | 'break' | 'slide';
export const SOUND_EVENTS: SoundEvent[] = ['hit', 'break', 'slide'];

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** voxel count (removed voxels / body size) -> size class */
export function sizeClass(count: number): SizeClass {
  return count < 40 ? 0 : count < 400 ? 1 : 2;
}

/** impact force (sim reports >= 4000) -> size class */
export function forceSize(force: number): SizeClass {
  return force < 15000 ? 0 : force < 60000 ? 1 : 2;
}

/** 0..1 loudness of an impact force */
export function impactLoudness(force: number): number {
  return clamp01(Math.log10(Math.max(force, 1) / 1500) / 1.8);
}

/** explosion `size` -> size class (<1, 1-1.8, >1.8) */
export function explosionClass(size: number): SizeClass {
  return size < 1 ? 0 : size <= 1.8 ? 1 : 2;
}

export const audioGroupOfMat = (mat: number): AudioGroup => MATERIALS[mat]?.audio ?? 'dirt';
export const audioGroupOfPal = (pal: number): AudioGroup => audioGroupOfMat(matOf(pal));

export interface CarveSound { group: AudioGroup; size: SizeClass; count: number }

/**
 * byMat = removed voxel counts per material id. Returns up to `max` entries (dominant audio groups,
 * descending by voxel count). Size comes from the group's own removed count.
 */
export function classifyCarve(byMat: ArrayLike<number>, max = 2): CarveSound[] {
  const per = new Map<AudioGroup, number>();
  for (let m = 1; m < byMat.length; m++) {
    const n = byMat[m];
    if (n > 0) { const g = audioGroupOfMat(m); per.set(g, (per.get(g) ?? 0) + n); }
  }
  const out: CarveSound[] = [];
  for (const [group, count] of per) out.push({ group, size: sizeClass(count), count });
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, max);
}

/** audio group of a body's first solid voxel (cached per body) */
const groupCache = new WeakMap<object, AudioGroup>();
export function bodyAudioGroup(body: { grid: { data: Uint8Array } }): AudioGroup {
  let g = groupCache.get(body);
  if (g) return g;
  const d = body.grid.data;
  g = 'dirt';
  for (let i = 0; i < d.length; i++) if (d[i]) { g = audioGroupOfPal(d[i]); break; }
  groupCache.set(body, g);
  return g;
}

// ------------------------------------------------------------------ limiters

/** token bucket per key */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; t: number }>();
  constructor(private perSecond: number, private burst = perSecond) {}
  allow(key: string, now: number, perSecond = this.perSecond, burst = this.burst): boolean {
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: burst, t: now }; this.buckets.set(key, b); }
    b.tokens = Math.min(burst, b.tokens + (now - b.t) * perSecond);
    b.t = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

/** minimum interval per key (e.g. per body) */
export class KeyedCooldown {
  private last = new Map<number | string, number>();
  private lastPrune = 0;
  constructor(public minInterval: number) {}
  allow(key: number | string, now: number): boolean {
    if (now - this.lastPrune > 10) {
      this.lastPrune = now;
      for (const [k, t] of this.last) if (now - t > this.minInterval * 4) this.last.delete(k);
    }
    const t = this.last.get(key);
    if (t !== undefined && now - t < this.minInterval) return false;
    this.last.set(key, now);
    return true;
  }
  get size(): number { return this.last.size; }
}

/** polyphony limiter: when full, the quietest voice is dropped (or the newcomer if it is quieter) */
export class VoiceLimiter<T = unknown> {
  voices = new Map<number, { id: number; end: number; loud: number; data: T }>();
  private nextId = 1;
  constructor(public max = 32) {}
  /** remove finished voices; returns their data (caller disconnects them) */
  prune(now: number): T[] {
    const done: T[] = [];
    for (const [id, v] of this.voices) if (v.end <= now) { this.voices.delete(id); done.push(v.data); }
    return done;
  }
  /** Would a voice of this loudness be admitted? (does not modify state) */
  wouldAdmit(loud: number): boolean {
    if (this.voices.size < this.max) return true;
    for (const v of this.voices.values()) if (v.loud < loud) return true;
    return false;
  }
  /** Admit a voice (call prune first). Returns null if refused, else the evicted voice data (if any). */
  admit(now: number, loud: number, duration: number, data: T): { evicted: T | undefined } | null {
    let evicted: T | undefined;
    if (this.voices.size >= this.max) {
      let qid = -1, ql = Infinity;
      for (const [id, v] of this.voices) if (v.loud < ql) { ql = v.loud; qid = id; }
      if (ql >= loud) return null;
      evicted = this.voices.get(qid)!.data;
      this.voices.delete(qid);
    }
    const id = this.nextId++;
    this.voices.set(id, { id, end: now + duration, loud, data });
    return { evicted };
  }
  get size(): number { return this.voices.size; }
}

// ------------------------------------------------------------------ spatial

export function distance3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** inverse-distance gain (same model as PannerNode 'inverse', rolloff 1) */
export function distanceGain(dist: number, refDist: number, rolloff = 1): number {
  return refDist / (refDist + rolloff * Math.max(0, dist - refDist));
}

export const SPEED_OF_SOUND = 343;
/** propagation delay, capped so far explosions still feel connected */
export function soundDelay(dist: number, cap = 0.9): number {
  return Math.min(cap, dist / SPEED_OF_SOUND);
}
/** air absorption low-pass cutoff in Hz */
export function distanceCutoff(dist: number): number {
  return clamp(18000 / (1 + dist / 18), 500, 20000);
}

/**
 * indoor estimate from probe distances (null = no hit). `up` is straight up; `side` are horizontal rays.
 * Indoors = ceiling within `range` m and some side rays blocked. Returns 0..1 (0 = outdoors).
 */
export function indoorScore(up: number | null, side: (number | null)[], range = 6): number {
  if (up === null || up >= range) return 0;
  let blocked = 0;
  for (const s of side) if (s !== null && s < range) blocked++;
  const frac = blocked / Math.max(1, side.length);
  return frac < 0.3 ? 0.25 : clamp01(0.4 + frac * 0.6);
}

// ------------------------------------------------------------------ footsteps

export class FootstepTracker {
  private last = 0;
  private init = false;
  constructor(public stepLen = 0.75) {}
  /** feed the monotonically increasing stride; returns number of steps to play (0/1) */
  update(stride: number, grounded: boolean): number {
    if (!this.init || stride < this.last) { this.last = stride; this.init = true; return 0; }
    if (!grounded) { this.last = stride; return 0; }
    if (stride - this.last >= this.stepLen) { this.last = stride; return 1; }
    return 0;
  }
}

// ------------------------------------------------------------------ vehicles / fire

export interface EngineParams { freq: number; gain: number; cutoff: number }
/** vehicle engine loop mapping (pure) */
export function engineParams(speedKmh: number, throttle: number, engineOn: boolean, health = 1): EngineParams {
  if (!engineOn) return { freq: 0, gain: 0, cutoff: 200 };
  const s = clamp01(Math.abs(speedKmh) / 120);
  const th = clamp(Math.abs(throttle), 0, 1);
  const freq = 38 + s * 110 + th * 30;
  return { freq: freq * (health < 0.3 ? 0.9 : 1), gain: 0.35 + th * 0.4 + s * 0.2, cutoff: 350 + s * 900 + th * 900 };
}

/** fire loop loudness from burning count and nearest fire distance */
export function fireLoudness(count: number, nearestDist: number): number {
  if (count <= 0) return 0;
  const amount = clamp01(Math.log2(1 + count) / 7);
  return clamp01(amount * distanceGain(nearestDist, 4, 1.2) * 1.2);
}
