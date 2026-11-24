/**
 * AudioEngine: lazy AudioContext, bus routing, 3D positioning, voice + rate limiting, reverb send, loops.
 * Never throws and never logs when WebAudio is unavailable or suspended (headless tests).
 */
import { LOOPS, SOUNDS, createMasterChain, type LoopHandle, type LoopParams, type MasterChain, type SoundParams } from './bank';
import {
  RateLimiter, VoiceLimiter, clamp01, distance3, distanceCutoff, distanceGain, soundDelay,
} from './logic';
import { MusicSystem } from './music';
import { makeImpulse } from './synth';

export type Bus = 'master' | 'sfx' | 'music' | 'ambient';
export interface V3 { x: number; y: number; z: number }

export interface PlayOpts {
  /** world position; omitted = non-positional (UI, player-centric) */
  pos?: V3;
  gain?: number;
  pitch?: number;
  amount?: number;
  /** distance (m) at which the sound is at nominal level */
  refDist?: number;
  /** rate-limit bucket (default: first dotted segment of the name) */
  category?: string;
  /** added to loudness when ranking voices (e.g. gunshots outrank ambience) */
  priority?: number;
  /** model speed of sound (delay) + air absorption (explosions) */
  propagate?: boolean;
  bus?: Exclude<Bus, 'master'>;
  /** extra start delay in seconds */
  delay?: number;
}

export interface LoopOpts extends LoopParams {
  pos?: V3;
  refDist?: number;
  /** auto-stop when not touched for this many seconds */
  ttl?: number;
  bus?: Exclude<Bus, 'master'>;
}

interface VoiceNodes { nodes: AudioNode[]; input: GainNode }
interface LoopRec { handle: LoopHandle; pan: PannerNode | null; expire: number; bus: AudioNode; lastUpd: number }

const CATEGORY_LIMITS: Record<string, { perSec: number; burst: number }> = {
  mat: { perSec: 24, burst: 10 },
  explosion: { perSec: 5, burst: 3 },
  step: { perSec: 6, burst: 3 },
  fire: { perSec: 20, burst: 8 },
  struct: { perSec: 6, burst: 3 },
  carve: { perSec: 14, burst: 6 },
  ui: { perSec: 30, burst: 10 },
  amb: { perSec: 2, burst: 2 },
  crumb: { perSec: 8, burst: 4 },
  skid: { perSec: 3, burst: 1 },
};
const DEFAULT_LIMIT = { perSec: 20, burst: 8 };
const BASE_LOUD = 0.5;
const nowSec = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class AudioEngine {
  ctx: AudioContext | null = null;
  chain: MasterChain | null = null;
  music: MusicSystem | null = null;
  failed = false;
  readonly volumes: Record<Bus, number> = { master: 0.8, sfx: 1, music: 0.7, ambient: 0.8 };
  readonly stats = { started: 0, dropped: 0, rateLimited: 0, evicted: 0, inaudible: 0 };
  readonly listener = { pos: { x: 0, y: 0, z: 0 } as V3, fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };
  readonly limiter = new VoiceLimiter<VoiceNodes>(32);
  private rate = new RateLimiter(DEFAULT_LIMIT.perSec, DEFAULT_LIMIT.burst);
  private buses: Partial<Record<Bus, GainNode>> = {};
  private reverbIn: GainNode | null = null;
  private reverbWet: GainNode | null = null;
  private indoor = 0;
  private loops = new Map<string, LoopRec>();
  private gestureCleanup: (() => void) | null = null;
  /** names of every sound started (tests / debugging; capped) */
  readonly log: string[] = [];

  constructor(private factory?: () => AudioContext) {}

  get ready(): boolean { return !!this.ctx; }
  get running(): boolean { return !!this.ctx && this.ctx.state === 'running'; }
  get voiceCount(): number { return this.limiter.size; }
  get loopCount(): number { return this.loops.size; }

  /** create the context if needed (call from a user gesture, or from a test hook). Never throws. */
  ensure(): boolean {
    if (this.ctx) return true;
    if (this.failed) return false;
    try {
      const AC: typeof AudioContext | undefined = this.factory ? undefined : (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
      const ctx = this.factory ? this.factory() : AC ? new AC({ latencyHint: 'interactive' }) : null;
      if (!ctx) { this.failed = true; return false; }
      this.ctx = ctx;
      this.chain = createMasterChain(ctx);
      for (const b of ['sfx', 'music', 'ambient'] as const) {
        const g = ctx.createGain();
        g.connect(this.chain.input);
        this.buses[b] = g;
      }
      // reverb send
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, 1.8, 3.2);
      this.reverbIn = ctx.createGain();
      this.reverbWet = ctx.createGain();
      this.reverbIn.connect(conv).connect(this.reverbWet).connect(this.chain.input);
      for (const b of ['master', 'sfx', 'music', 'ambient'] as const) this.applyVolume(b);
      this.setIndoor(this.indoor);
      this.music = new MusicSystem(ctx, this.buses.music!);
      return true;
    } catch {
      this.failed = true;
      this.ctx = null;
      return false;
    }
  }

  /** silence everything while the tab is hidden (loops would otherwise keep sounding) */
  suspend(): void {
    try { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {}); } catch { /* ignore */ }
  }
  resume(): void {
    try { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {}); } catch { /* ignore */ }
  }

  /** create/resume the context on the first user gesture */
  installGestureHooks(target: Window | Document | HTMLElement): void {
    if (this.gestureCleanup) return;
    const evs = ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'];
    const handler = () => {
      if (this.ensure()) {
        this.resume();
        if (this.running) this.gestureCleanup?.();
      }
    };
    for (const e of evs) target.addEventListener(e, handler, { passive: true } as AddEventListenerOptions);
    this.gestureCleanup = () => { for (const e of evs) target.removeEventListener(e, handler); this.gestureCleanup = null; };
  }

  // ------------------------------------------------------------- volumes

  setVolume(bus: Bus, v: number): void {
    this.volumes[bus] = clamp01(v);
    this.applyVolume(bus);
  }
  getVolume(bus: Bus): number { return this.volumes[bus]; }
  private applyVolume(bus: Bus): void {
    const ctx = this.ctx; if (!ctx) return;
    const node = bus === 'master' ? this.chain?.master : this.buses[bus];
    if (!node) return;
    const base = bus === 'master' ? 0.8 : 1;
    node.gain.setTargetAtTime(this.volumes[bus] * base, ctx.currentTime, 0.03);
  }

  // ------------------------------------------------------------- listener / room

  setListener(pos: V3, fwd: V3, up: V3 = { x: 0, y: 1, z: 0 }): void {
    const l = this.listener;
    l.pos.x = pos.x; l.pos.y = pos.y; l.pos.z = pos.z;
    l.fwd.x = fwd.x; l.fwd.y = fwd.y; l.fwd.z = fwd.z;
    l.up.x = up.x; l.up.y = up.y; l.up.z = up.z;
    const ctx = this.ctx; if (!ctx) return;
    try {
      const L = ctx.listener;
      if (L.positionX) {
        L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
        L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
        L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
      } else {
        (L as any).setPosition(pos.x, pos.y, pos.z);
        (L as any).setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    } catch { /* ignore */ }
  }

  /** 0 = outdoors .. 1 = small room: raises the reverb send, ducks the wind bed */
  setIndoor(v: number): void {
    this.indoor = clamp01(v);
    const ctx = this.ctx; if (!ctx || !this.reverbWet) return;
    this.reverbWet.gain.setTargetAtTime(0.12 + this.indoor * 0.75, ctx.currentTime, 0.3);
  }
  get indoorAmount(): number { return this.indoor; }

  distanceTo(pos: V3): number { return distance3(pos, this.listener.pos); }

  // ------------------------------------------------------------- one-shots

  /** play a bank sound. Returns true if a voice was started. */
  play(name: string, o: PlayOpts = {}): boolean {
    const ctx = this.ctx;
    const fn = SOUNDS[name];
    if (!ctx || !fn) { this.stats.dropped++; return false; }
    const now = nowSec();
    const cat = o.category ?? name.split('.')[0];
    const lim = CATEGORY_LIMITS[cat] ?? DEFAULT_LIMIT;
    if (!this.rate.allow(cat, now, lim.perSec, lim.burst)) { this.stats.rateLimited++; return false; }

    const gain = o.gain ?? 1;
    const dist = o.pos ? this.distanceTo(o.pos) : 0;
    const ref = o.refDist ?? 6;
    const loud = BASE_LOUD * gain * (o.pos ? distanceGain(dist, ref) : 1) + (o.priority ?? 0) * 0.1;
    if (loud < 0.004) { this.stats.inaudible++; return false; }
    for (const v of this.limiter.prune(now)) this.dispose(v);
    if (!this.limiter.wouldAdmit(loud)) { this.stats.dropped++; return false; }

    try {
      const bus = this.buses[o.bus ?? 'sfx']!;
      const input = ctx.createGain();
      input.gain.value = gain;
      const nodes: AudioNode[] = [input];
      let tail: AudioNode = input;
      let delay = o.delay ?? 0;
      if (o.pos) {
        if (o.propagate) {
          delay += soundDelay(dist);
          if (dist > 12) {
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = distanceCutoff(dist); lp.Q.value = 0.5;
            tail.connect(lp); tail = lp; nodes.push(lp);
          }
        }
        const pan = ctx.createPanner();
        pan.panningModel = 'equalpower';
        pan.distanceModel = 'inverse';
        pan.refDistance = ref;
        pan.rolloffFactor = 1;
        pan.maxDistance = 400;
        this.setPannerPos(pan, o.pos);
        tail.connect(pan); tail = pan; nodes.push(pan);
      }
      tail.connect(bus);
      if (this.reverbIn) {
        const send = ctx.createGain(); send.gain.value = o.bus === 'ambient' ? 0.1 : 0.3;
        tail.connect(send).connect(this.reverbIn); nodes.push(send);
      }
      const p: SoundParams = { gain, pitch: o.pitch, amount: o.amount, delay };
      const dur = fn(ctx, input, p);
      const voice: VoiceNodes = { nodes, input };
      const res = this.limiter.admit(now, loud, Math.max(0.1, dur), voice);
      if (!res) { this.dispose(voice); this.stats.dropped++; return false; }
      if (res.evicted) { this.stats.evicted++; this.kill(res.evicted); }
      this.stats.started++;
      if (this.log.length < 400) this.log.push(name);
      return true;
    } catch {
      this.stats.dropped++;
      return false;
    }
  }

  private setPannerPos(pan: PannerNode, p: V3): void {
    if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; }
    else (pan as any).setPosition(p.x, p.y, p.z);
  }

  private dispose(v: VoiceNodes): void {
    for (const n of v.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
  }
  private kill(v: VoiceNodes): void {
    try {
      const t = this.ctx!.currentTime;
      v.input.gain.cancelScheduledValues(t);
      v.input.gain.setTargetAtTime(0, t, 0.01);
    } catch { /* ignore */ }
    setTimeout(() => this.dispose(v), 80);
  }

  // ------------------------------------------------------------- loops

  /** create-or-update a looping sound and refresh its time-to-live. Returns false if unavailable. */
  touchLoop(key: string, name: string, o: LoopOpts = {}): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    let rec = this.loops.get(key);
    if (!rec) {
      const builder = LOOPS[name]; if (!builder) return false;
      try {
        const bus = this.buses[o.bus ?? 'sfx']!;
        let dest: AudioNode = bus;
        let pan: PannerNode | null = null;
        if (o.pos) {
          pan = ctx.createPanner();
          pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
          pan.refDistance = o.refDist ?? 8; pan.rolloffFactor = 1; pan.maxDistance = 400;
          pan.connect(bus);
          if (this.reverbIn) { const s = ctx.createGain(); s.gain.value = 0.25; pan.connect(s).connect(this.reverbIn); }
          dest = pan;
        } else if (this.reverbIn) {
          const s = ctx.createGain(); s.gain.value = 0.15; const inner = ctx.createGain(); inner.connect(bus); inner.connect(s).connect(this.reverbIn);
          dest = inner;
        }
        rec = { handle: builder(ctx, dest), pan, expire: Infinity, bus, lastUpd: 0 };
        this.loops.set(key, rec);
      } catch { return false; }
    }
    if (o.pos && rec.pan) this.setPannerPos(rec.pan, o.pos);
    rec.expire = o.ttl ? nowSec() + o.ttl : Infinity;
    const t = nowSec();
    if (t - rec.lastUpd > 0.05) {
      rec.lastUpd = t;
      try { rec.handle.update(o, ctx.currentTime); } catch { /* ignore */ }
    }
    return true;
  }

  hasLoop(key: string): boolean { return this.loops.has(key); }

  stopLoop(key: string): void {
    const rec = this.loops.get(key); if (!rec) return;
    this.loops.delete(key);
    rec.handle.stop();
    setTimeout(() => { try { rec.pan?.disconnect(); } catch { /* ignore */ } }, 700);
  }

  stopAllLoops(): void { for (const k of [...this.loops.keys()]) this.stopLoop(k); }

  /** per-frame housekeeping: expire loops, prune finished voices, drive music */
  update(dt: number): void {
    if (!this.ctx) return;
    const now = nowSec();
    for (const [k, r] of this.loops) if (r.expire < now) this.stopLoop(k);
    for (const v of this.limiter.prune(now)) this.dispose(v);
    this.music?.update(dt);
  }
}
