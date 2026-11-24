import { describe, expect, it } from 'vitest';
import { LOOPS, LOOP_NAMES, SOUNDS, SOUND_NAMES, createMasterChain, matSoundName } from '../../src/audio/bank';
import { AudioDirector, type EngineLike } from '../../src/audio/director';
import { AudioEngine } from '../../src/audio/engine';
import {
  FootstepTracker, GROUPS, KeyedCooldown, RateLimiter, VoiceLimiter, bodyAudioGroup, classifyCarve, distanceGain,
  engineParams, explosionClass, fireLoudness, forceSize, impactLoudness, indoorScore, sizeClass, soundDelay,
} from '../../src/audio/logic';
import { CUE_BPM, MusicSystem, STEPS_PER_BAR, stepCue, stepSeconds } from '../../src/audio/music';
import { MAT, pal } from '../../src/sim/materials';

/** minimal fake WebAudio: every node accepts anything, AudioParams are inert */
function fakeParam() {
  const p: any = { value: 0 };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'setValueCurveAtTime']) p[m] = () => p;
  return p;
}
function fakeNode(extra: Record<string, any> = {}) {
  const t: any = { connect: (n: any) => n, disconnect() {}, start() {}, stop() {}, ...extra };
  return new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'string') o[k] = fakeParam(); return o[k]; } });
}
export class FakeCtx {
  currentTime = 0; sampleRate = 8000; state = 'running'; created = 0;
  destination = fakeNode();
  listener = fakeNode();
  private mk(extra: Record<string, any> = {}) { this.created++; return fakeNode(extra); }
  createBuffer(ch: number, len: number) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { getChannelData: (i: number) => d[i], length: len }; }
  createBufferSource() { return this.mk({ loop: false }); }
  createGain() { return this.mk(); }
  createOscillator() { return this.mk({ type: 'sine' }); }
  createBiquadFilter() { return this.mk({ type: 'lowpass' }); }
  createWaveShaper() { return this.mk({ curve: null }); }
  createDynamicsCompressor() { return this.mk(); }
  createDelay() { return this.mk(); }
  createConvolver() { return this.mk({ buffer: null }); }
  createPanner() { return this.mk(); }
  resume() { return Promise.resolve(); }
}
const asCtx = (c: FakeCtx) => c as unknown as BaseAudioContext;

describe('audio classification', () => {
  it('sizeClass / forceSize / explosionClass thresholds', () => {
    expect([sizeClass(1), sizeClass(39), sizeClass(40), sizeClass(399), sizeClass(400), sizeClass(1e5)]).toEqual([0, 0, 1, 1, 2, 2]);
    expect([forceSize(4000), forceSize(20000), forceSize(1e6)]).toEqual([0, 1, 2]);
    expect([explosionClass(0.5), explosionClass(1), explosionClass(1.8), explosionClass(2.5)]).toEqual([0, 1, 1, 2]);
    expect(impactLoudness(4000)).toBeGreaterThan(0);
    expect(impactLoudness(1e7)).toBe(1);
  });
  it('classifyCarve picks the dominant audio groups', () => {
    const byMat = new Uint32Array(32);
    byMat[MAT.brick] = 300; byMat[MAT.concrete] = 200; // masonry 500
    byMat[MAT.wood] = 50; byMat[MAT.glass] = 10;
    const r = classifyCarve(byMat, 2);
    expect(r.map((x) => x.group)).toEqual(['masonry', 'wood']);
    expect(r[0].size).toBe(2); expect(r[1].size).toBe(1);
    expect(classifyCarve(new Uint32Array(32))).toEqual([]);
  });
  it('bodyAudioGroup reads the first solid voxel and caches', () => {
    const body: any = { grid: { data: new Uint8Array([0, 0, pal(MAT.steel), pal(MAT.wood)]) } };
    expect(bodyAudioGroup(body)).toBe('metal');
    body.grid.data[2] = 0;
    expect(bodyAudioGroup(body)).toBe('metal'); // cached
  });
  it('indoorScore', () => {
    expect(indoorScore(null, [1, 1, 1, 1, 1, 1])).toBe(0);
    expect(indoorScore(2.5, [2, 3, 4, 2, 3, 5])).toBeGreaterThan(0.8);
    expect(indoorScore(2.5, [null, null, null, null, null, null])).toBeLessThan(0.5);
  });
  it('spatial helpers', () => {
    expect(distanceGain(1, 5)).toBe(1);
    expect(distanceGain(15, 5)).toBeCloseTo(0.333, 2);
    expect(soundDelay(343)).toBe(0.9);
    expect(soundDelay(34.3)).toBeCloseTo(0.1, 3);
    expect(engineParams(100, 1, true).freq).toBeGreaterThan(engineParams(0, 0, true).freq);
    expect(engineParams(100, 1, false).gain).toBe(0);
    expect(fireLoudness(0, 1)).toBe(0);
    expect(fireLoudness(50, 2)).toBeGreaterThan(fireLoudness(50, 40));
  });
});

describe('limiters', () => {
  it('RateLimiter is a token bucket', () => {
    const r = new RateLimiter(10, 3);
    let ok = 0;
    for (let i = 0; i < 20; i++) if (r.allow('a', 0)) ok++;
    expect(ok).toBe(3);
    expect(r.allow('a', 0.15)).toBe(true); // 1.5 tokens refilled
    expect(r.allow('b', 0)).toBe(true); // independent key
  });
  it('KeyedCooldown', () => {
    const c = new KeyedCooldown(0.2);
    expect(c.allow(1, 0)).toBe(true);
    expect(c.allow(1, 0.1)).toBe(false);
    expect(c.allow(2, 0.1)).toBe(true);
    expect(c.allow(1, 0.25)).toBe(true);
  });
  it('VoiceLimiter drops the quietest', () => {
    const v = new VoiceLimiter<string>(3);
    expect(v.admit(0, 0.5, 1, 'a')).not.toBeNull();
    expect(v.admit(0, 0.2, 1, 'b')).not.toBeNull();
    expect(v.admit(0, 0.9, 1, 'c')).not.toBeNull();
    expect(v.wouldAdmit(0.1)).toBe(false);
    expect(v.admit(0, 0.1, 1, 'd')).toBeNull(); // quieter than all
    const r = v.admit(0, 0.6, 1, 'e');
    expect(r?.evicted).toBe('b');
    expect(v.size).toBe(3);
    expect(v.prune(2).sort()).toEqual(['a', 'c', 'e']);
    expect(v.size).toBe(0);
  });
  it('FootstepTracker steps every ~0.75 m while grounded', () => {
    const f = new FootstepTracker(0.75);
    let steps = 0;
    for (let i = 0; i <= 100; i++) steps += f.update(i * 0.1, true);
    expect(steps).toBe(12); // one step per 0.8 m on a 0.1 m grid
    expect(f.update(100.2, false)).toBe(0);
    expect(f.update(100.9, false)).toBe(0); // airborne resets baseline
  });
});

describe('music sequencer', () => {
  it('is deterministic and uses expected voices', () => {
    for (const cue of ['calm', 'heist'] as const) {
      const a = JSON.stringify(Array.from({ length: 64 }, (_, i) => stepCue(cue, i, 0.5)));
      const b = JSON.stringify(Array.from({ length: 64 }, (_, i) => stepCue(cue, i, 0.5)));
      expect(a).toBe(b);
    }
    const calm = Array.from({ length: 16 * 8 }, (_, i) => stepCue('calm', i)).flat();
    expect(calm.some((n) => n.voice === 'pad')).toBe(true);
    expect(calm.some((n) => n.voice === 'kick')).toBe(false);
    expect(calm.filter((n) => n.voice === 'arp').length).toBeLessThan(40); // sparse
    expect(stepSeconds('heist')).toBeLessThan(stepSeconds('calm'));
    expect(CUE_BPM.heist).toBeGreaterThan(CUE_BPM.calm);
  });
  it('heist intensifies with tension', () => {
    const count = (t: number) => Array.from({ length: STEPS_PER_BAR * 4 }, (_, i) => stepCue('heist', i, t)).flat().length;
    expect(count(1)).toBeGreaterThan(count(0));
    const low = Array.from({ length: 64 }, (_, i) => stepCue('heist', i, 0)).flat();
    expect(low.some((n) => n.voice === 'lead')).toBe(false);
    expect(low.filter((n) => n.voice === 'kick').length).toBe(16);
  });
  it('MusicSystem schedules notes against a fake context', () => {
    const ctx = new FakeCtx();
    const m = new MusicSystem(asCtx(ctx), ctx.destination as any);
    m.setCue('calm');
    for (let i = 0; i < 20; i++) { ctx.currentTime += 0.25; m.update(0.25); }
    expect(m.scheduled).toBeGreaterThan(5);
    const before = m.scheduled;
    m.setCue('heist'); m.setTension(0.8);
    for (let i = 0; i < 8; i++) { ctx.currentTime += 0.25; m.update(0.25); }
    expect(m.scheduled).toBeGreaterThan(before + 20);
  });
});

describe('sound bank', () => {
  it('has every material group x event x size', () => {
    for (const g of GROUPS) for (const ev of ['hit', 'break', 'slide'] as const) for (const s of [0, 1, 2]) expect(SOUNDS[matSoundName(g, ev, s)]).toBeTypeOf('function');
    for (const n of ['explosion.0', 'explosion.1', 'explosion.2', 'tool.shot.shotgun', 'tool.shot.pistol', 'tool.shot.rifle', 'tool.shot.rocket', 'tool.empty', 'tool.beep',
      'mission.success', 'mission.fail', 'ui.click', 'vehicle.crash', 'fire.ignite', 'player.hurt', 'struct.creak', 'struct.rumble']) expect(SOUNDS[n], n).toBeTypeOf('function');
    expect(SOUND_NAMES.length).toBeGreaterThan(100);
  });
  it('every one-shot constructs without throwing and returns a sane duration', () => {
    for (const name of SOUND_NAMES) {
      for (let rep = 0; rep < 2; rep++) {
        const ctx = new FakeCtx();
        const d = SOUNDS[name](asCtx(ctx), ctx.destination as any, { gain: 1, amount: 0.7 });
        expect(Number.isFinite(d), name).toBe(true);
        expect(d, name).toBeGreaterThan(0.01);
        expect(d, name).toBeLessThan(6);
      }
    }
  });
  it('every loop builds, updates and stops', () => {
    for (const name of LOOP_NAMES) {
      const ctx = new FakeCtx();
      const h = LOOPS[name](asCtx(ctx), ctx.destination as any);
      h.update({ level: 0.5, freq: 60, cutoff: 800, rate: 12 }, 0);
      h.stop();
    }
  });
  it('master chain builds', () => {
    const ctx = new FakeCtx();
    expect(createMasterChain(asCtx(ctx)).input).toBeTruthy();
  });
});

describe('AudioEngine', () => {
  it('does not throw without a context', () => {
    const e = new AudioEngine();
    expect(() => { e.setVolume('sfx', 0.5); e.play('ui.click'); e.touchLoop('x', 'fire'); e.setListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }); e.update(0.016); }).not.toThrow();
    expect(e.play('ui.click')).toBe(false);
  });
  it('plays, rate limits and limits polyphony', () => {
    const ctx = new FakeCtx();
    const e = new AudioEngine(() => ctx as any);
    expect(e.ensure()).toBe(true);
    expect(e.play('ui.click')).toBe(true);
    expect(e.play('does.not.exist')).toBe(false);
    // 200 explosions in one frame: rate limited
    let n = 0;
    for (let i = 0; i < 200; i++) if (e.play('explosion.1', { pos: { x: 3, y: 0, z: 0 } })) n++;
    expect(n).toBeLessThanOrEqual(3);
    expect(e.stats.rateLimited).toBeGreaterThan(100);
    // inaudible far sounds are dropped
    expect(e.play('mat.wood.hit.0', { pos: { x: 5000, y: 0, z: 0 }, gain: 0.1, category: 'far' })).toBe(false);
    // polyphony cap
    const e2 = new AudioEngine(() => new FakeCtx() as any);
    e2.ensure();
    for (let i = 0; i < 300; i++) e2.play('mat.metal.hit.2', { pos: { x: i % 7, y: 0, z: 0 }, category: 'c' + (i % 100), gain: 0.5 + (i % 10) / 20 });
    expect(e2.voiceCount).toBeLessThanOrEqual(32);
    expect(e2.stats.started).toBeGreaterThan(30);
  });
  it('loops expire via ttl', async () => {
    const e = new AudioEngine(() => new FakeCtx() as any);
    e.ensure();
    expect(e.touchLoop('f', 'fire', { level: 1, ttl: 0.01 })).toBe(true);
    expect(e.hasLoop('f')).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    e.update(0.03);
    expect(e.hasLoop('f')).toBe(false);
  });
  it('survives a throwing context factory', () => {
    const e = new AudioEngine(() => { throw new Error('nope'); });
    expect(e.ensure()).toBe(false);
    expect(e.ensure()).toBe(false);
    expect(e.play('ui.click')).toBe(false);
  });
});

describe('AudioDirector event mapping', () => {
  function setup() {
    const plays: { name: string; o: any }[] = [];
    const loops: Record<string, any> = {};
    const cues: (string | null)[] = [];
    const eng: EngineLike = {
      ready: true,
      play: (name, o) => { plays.push({ name, o }); return true; },
      touchLoop: (k, n, o) => { loops[k] = { n, o }; return true; },
      stopLoop: (k) => { delete loops[k]; },
      stopAllLoops: () => { for (const k of Object.keys(loops)) delete loops[k]; },
      hasLoop: (k) => k in loops,
      setIndoor: () => {},
      distanceTo: () => 5,
      listener: { pos: { x: 0, y: 0, z: 0 } },
      music: { setCue: (c) => { cues.push(c); }, setTension: () => {}, setDuck: () => {}, currentCue: null },
    };
    let t = 0;
    const d = new AudioDirector(eng, () => t);
    return { d, plays, loops, cues, tick: (dt: number) => { t += dt; } };
  }
  const P = { x: 1, y: 1, z: 1 };
  it('carve -> break sounds of the dominant groups, size from count', () => {
    const { d, plays } = setup();
    const byMat = new Uint32Array(32); byMat[MAT.glass] = 500; byMat[MAT.wood] = 5;
    d.onEvents([{ type: 'carve', pos: P, removed: 505, byMat, samples: [], cause: 'sledge' }]);
    expect(plays.map((p) => p.name)).toEqual(['mat.glass.break.2', 'mat.wood.break.0']);
  });
  it('carves are capped per batch', () => {
    const { d, plays } = setup();
    const byMat = new Uint32Array(32); byMat[MAT.dirt] = 20;
    d.onEvents(Array.from({ length: 50 }, () => ({ type: 'carve', pos: P, removed: 20, byMat, samples: [], cause: '' })));
    expect(plays.length).toBeLessThanOrEqual(3);
  });
  it('impact picks the dynamic body material, scales with force, and cools down per body', () => {
    const { d, plays, tick } = setup();
    const body: any = { id: 7, dynamic: true, grid: { data: new Uint8Array([pal(MAT.steel)]) } };
    const ground: any = { id: 1, dynamic: false, grid: { data: new Uint8Array([pal(MAT.dirt)]) } };
    d.onEvents([{ type: 'impact', pos: P, force: 80000, a: ground, b: body }]);
    d.onEvents([{ type: 'impact', pos: P, force: 80000, a: ground, b: body }]);
    expect(plays.map((p) => p.name)).toEqual(['mat.metal.hit.2']);
    tick(0.5);
    d.onEvents([{ type: 'impact', pos: P, force: 5000, a: body, b: ground }]);
    expect(plays[1].name).toBe('mat.metal.hit.0');
    expect(plays[1].o.gain).toBeLessThan(plays[0].o.gain);
  });
  it('explosion sizes, tools and custom events', () => {
    const { d, plays } = setup();
    d.onEvents([
      { type: 'explosion', pos: P, size: 0.5 }, { type: 'explosion', pos: P, size: 1.4 }, { type: 'explosion', pos: P, size: 3 },
      { type: 'custom', name: 'tool:shot', data: { tool: 'shotgun' } }, { type: 'custom', name: 'tool:shot', data: { tool: 'rocket' } },
      { type: 'custom', name: 'tool:swing', data: { hit: true } }, { type: 'custom', name: 'tool:empty', data: {} },
      { type: 'custom', name: 'tool:beep', data: { pos: P } }, { type: 'custom', name: 'player:hurt', data: { amount: 0.2 } },
      { type: 'custom', name: 'vehicle:enter', data: {} }, { type: 'custom', name: 'mission:pickup', data: {} },
    ]);
    const names = plays.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['explosion.0', 'explosion.1', 'explosion.2', 'tool.shot.shotgun', 'tool.shot.rocket', 'tool.swing.hit', 'tool.empty', 'tool.beep', 'player.hurt', 'vehicle.door', 'vehicle.ignition', 'mission.pickup']));
    expect(plays.find((p) => p.name === 'explosion.2')!.o.propagate).toBe(true);
  });
  it('alarm starts the siren loop + heist music, success ends them', () => {
    const { d, loops, cues, plays } = setup();
    d.onEvents([{ type: 'custom', name: 'mission:alarm', data: {} }]);
    expect(loops.alarm).toBeTruthy(); expect(cues.at(-1)).toBe('heist');
    d.onEvents([{ type: 'custom', name: 'mission:second', data: { left: 5 } }]);
    expect(plays.at(-1)!.name).toBe('mission.urgent');
    d.onEvents([{ type: 'custom', name: 'mission:heli', data: { pos: P } }]);
    expect(loops.heli).toBeTruthy();
    d.onEvents([{ type: 'custom', name: 'mission:success', data: {} }]);
    expect(loops.alarm).toBeUndefined(); expect(loops.heli).toBeUndefined();
    expect(cues.at(-1)).toBe('calm'); expect(plays.at(-1)!.name).toBe('mission.success');
  });
  it('frame: footsteps by material, landing, fire and vehicle loops', () => {
    const { d, plays, loops } = setup();
    const player: any = { pos: { x: 0, y: 0, z: 0 }, eye: { x: 0, y: 1.6, z: 0 }, stride: 0, grounded: true, landed: 0, vel: { x: 0, y: 0, z: 0 } };
    const game: any = {
      player, paused: false, ext: { vehicles: { current: { engineOn: true, speedKmh: 50, throttle: 1, health: 1 } } },
      sim: { raycast: (_o: any, dir: any) => (dir.y === -1 ? { palette: pal(MAT.wood), dist: 0.3 } : null) },
      fire: { count: () => 30, positions: () => [{ x: 2, y: 0, z: 0 }] },
    };
    d.frame(game, 0.016);
    for (let i = 1; i <= 20; i++) { player.stride = i * 0.1; d.frame(game, 0.016); }
    expect(plays.filter((p) => p.name === 'step.wood').length).toBe(2);
    expect(loops.fire).toBeTruthy(); expect(loops.engine).toBeTruthy(); expect(loops.ambient).toBeTruthy();
    player.grounded = false; player.vel.y = 5; d.frame(game, 0.016);
    expect(plays.some((p) => p.name === 'player.jump')).toBe(true);
    player.grounded = true; player.landed = 9; d.frame(game, 0.016);
    expect(plays.some((p) => p.name === 'player.land')).toBe(true);
  });
});
