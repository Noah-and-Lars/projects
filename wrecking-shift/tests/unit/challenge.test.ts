import { beforeAll, describe, expect, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { Sim, initPhysics, type SimEvent } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';
import { Player } from '../../src/sim/player';
import { Challenge, RUBBLE, SNATCH, pickCrateSpots, starsFor, starThresholds } from '../../src/sim/challenge';
import type { LevelInfo } from '../../src/sim/levels/types';
import type { V3 } from '../../src/sim/vec';
import { testYard } from '../../src/sim/levels/testyard';
import { harbor } from '../../src/sim/levels/harbor';
import { Progress, type StorageLike } from '../../src/game/progress';

beforeAll(async () => { await initPhysics(); });

function level(extra: Partial<LevelInfo> = {}): LevelInfo {
  return {
    name: 'unit', spawn: { x: 0, y: 0, z: 0 }, spawnYaw: 0,
    bounds: { min: { x: -24, y: -2, z: -24 }, max: { x: 24, y: 20, z: 24 } },
    waterLevel: null, sunDir: { x: 0, y: -1, z: 0 },
    markers: { escape: { x: 0, y: 0, z: 2 }, heli_start: { x: 90, y: 30, z: 90 }, a: { x: -12, y: 0, z: -12 }, b: { x: 12, y: 0, z: -12 }, c: { x: 12, y: 0, z: 12 } },
    ...extra,
  };
}
function world() {
  const sim = new Sim(5);
  const g = new VoxelGrid(480, 4, 480);
  g.fill(0, 0, 0, 480, 4, 480, pal(MAT.bedrock));
  sim.addBody(g, { x: -24, y: -0.4, z: -24 }, { name: 'ground' });
  const wg = new VoxelGrid(30, 20, 30); wg.fill(0, 0, 0, 30, 20, 30, pal(MAT.brick));
  const wall = sim.addBody(wg, { x: -4, y: 0, z: -8 }, { name: 'block' });
  const lv = level();
  const player = new Player(sim, lv.spawn);
  return { sim, lv, player, wall };
}
function lookAt(p: Player, t: V3) {
  const e = p.eye;
  const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
function tick(c: Challenge, n: number, interact = false, events?: SimEvent[]) {
  for (let i = 0; i < n; i++) {
    c.update({ interact: interact && i === 0 });
    (c.player as Player).update();
    c.sim.step();
    const ev = c.sim.drainEvents();
    if (events) events.push(...ev);
  }
}
const named = (ev: SimEvent[], name: string) => ev.filter((e) => e.type === 'custom' && e.name === name).map((e) => (e as any).data);
const ctx = (w: ReturnType<typeof world>) => ({ sim: w.sim, level: w.lv, levelId: 'unit', player: w.player });

describe('challenge: Rubble Rush', () => {
  it('counts world voxels, starts the clock after the warm-up, ends on time with a score', () => {
    const w = world();
    const ev: SimEvent[] = [];
    const c = new Challenge('rubble', ctx(w));
    tick(c, 5, false, ev);
    expect(c.phase).toBe('ready');
    expect(c.timeLeft).toBe(RUBBLE.seconds);
    expect(named(ev, 'challenge:ready')).toHaveLength(1);
    // break 400 voxels: still warming up, clock frozen
    let n = 0;
    for (let x = 0; x < 30 && n < 400; x++) for (let z = 0; z < 30 && n < 400; z++) { w.sim.removeVoxel(w.wall, x, 19, z); n++; }
    tick(c, 10, false, ev);
    expect(c.voxels).toBe(400);
    expect(c.phase).toBe('ready');
    expect(c.warmupLeft).toBe(RUBBLE.startAfter - 400);
    expect(c.timeLeft).toBe(RUBBLE.seconds);
    for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) if (w.wall.grid.get(x, 18, z)) w.sim.removeVoxel(w.wall, x, 18, z);
    tick(c, 1, false, ev);
    expect(c.phase).toBe('running');
    expect(named(ev, 'challenge:start')).toEqual([{ mode: 'rubble', level: 'unit', seconds: RUBBLE.seconds }]);
    tick(c, 59, false, ev); // the start tick already counted
    expect(c.timeLeft).toBeCloseTo(RUBBLE.seconds - 1, 5);
    expect(named(ev, 'challenge:tick').map((d) => d.left)).toEqual([RUBBLE.seconds - 1]);
    expect(named(ev, 'challenge:score').length).toBeGreaterThan(0);
    tick(c, RUBBLE.seconds * 60, false, ev);
    expect(c.ended).toBe(true);
    const r = c.result!;
    expect(r.outcome).toBe('time');
    expect(r.success).toBe(true);
    expect(r.score).toBe(1300);
    expect(r.timeLeft).toBe(0);
    expect(named(ev, 'challenge:end')).toHaveLength(1);
    // removals after the end do not count; the hook is gone
    w.sim.removeVoxel(w.wall, 0, 0, 0);
    expect(c.voxels).toBe(1300);
    expect(w.sim.onRemoved).toHaveLength(0);
  });

  it('debris re-breaking does not count', () => {
    const w = world();
    const c = new Challenge('rubble', ctx(w));
    const dg = new VoxelGrid(5, 5, 5); dg.fill(0, 0, 0, 5, 5, 5, pal(MAT.brick));
    const deb = w.sim.addBody(dg, { x: 5, y: 1, z: 5 }, { dynamic: true, kind: 'debris' });
    for (let x = 0; x < 5; x++) w.sim.removeVoxel(deb, x, 4, 0);
    w.sim.removeVoxel(w.wall, 0, 19, 0);
    expect(c.voxels).toBe(1);
  });

  it('dying ends the run but keeps the score', () => {
    const w = world();
    const c = new Challenge('rubble', ctx(w));
    for (let x = 0; x < 10; x++) w.sim.removeVoxel(w.wall, x, 19, 0);
    w.player.dead = true;
    tick(c, 1);
    expect(c.result?.outcome).toBe('dead');
    expect(c.result?.score).toBe(10);
    expect(c.result?.success).toBe(false);
  });

  it('star thresholds are ordered and per level', () => {
    for (const lv of ['harbor', 'testyard', 'works']) {
      const t = starThresholds('rubble', lv);
      expect(t[0]).toBeLessThan(t[1]); expect(t[1]).toBeLessThan(t[2]);
      expect(starsFor('rubble', lv, t[0] - 1)).toBe(0);
      expect(starsFor('rubble', lv, t[1])).toBe(2);
      expect(starsFor('rubble', lv, t[2] + 1)).toBe(3);
    }
  });
});

describe('challenge: Snatch Sprint', () => {
  function grab(c: Challenge, p: Player, crate: { pos: V3 }, ev?: SimEvent[]) {
    p.teleport({ x: crate.pos.x, y: crate.pos.y + 0.05, z: crate.pos.z + 1.2 });
    tick(c, 2, false, ev);
    lookAt(p, c.crates.find((r) => r.pos === crate.pos)!.body!.center());
    tick(c, 1, true, ev);
  }

  it('scatters crates deterministically, ≥ 8 m apart, away from the escape', () => {
    const a = world(), b = world();
    const ca = new Challenge('snatch', ctx(a)), cb = new Challenge('snatch', ctx(b));
    expect(ca.cratesTotal).toBe(SNATCH.crates);
    expect(ca.crates.map((c) => c.pos)).toEqual(cb.crates.map((c) => c.pos));
    const ps = ca.crates.map((c) => c.pos);
    for (let i = 0; i < ps.length; i++) {
      expect(Math.hypot(ps[i].x - 0, ps[i].z - 2)).toBeGreaterThanOrEqual(SNATCH.escapeSpacing);
      for (let j = i + 1; j < ps.length; j++) expect(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z)).toBeGreaterThanOrEqual(SNATCH.minSpacing - 1e-6);
    }
    // all on the floor, none inside the block
    for (const p of ps) { expect(p.y).toBeCloseTo(0, 3); expect(p.x > -4 && p.x < -1 && p.z > -8 && p.z < -5).toBe(false); }
  });

  it('first pick-up starts the clock; escaping in time scores crates + time bonus', () => {
    const w = world();
    const ev: SimEvent[] = [];
    const c = new Challenge('snatch', ctx(w));
    tick(c, 30, false, ev);
    expect(c.phase).toBe('ready');
    const [k0, k1] = c.crates;
    grab(c, w.player, k0, ev);
    expect(c.cratesTaken).toBe(1);
    expect(c.phase).toBe('running');
    expect(named(ev, 'challenge:pickup')[0]).toMatchObject({ count: 1, total: SNATCH.crates });
    grab(c, w.player, k1, ev);
    expect(c.cratesTaken).toBe(2);
    expect(c.score).toBe(200);
    // at the escape: E clocks out
    w.player.teleport({ x: 0, y: 0.05, z: 2 });
    tick(c, 3, false, ev);
    expect(c.focus?.kind).toBe('escape');
    const left = Math.floor(c.timeLeft);
    tick(c, 1, true, ev);
    expect(c.ended).toBe(true);
    const r = c.result!;
    expect(r.outcome).toBe('escaped');
    expect(r.success).toBe(true);
    expect(r.score).toBe(200 + left * SNATCH.perSecond);
    expect(r.crates).toBe(2);
    expect(named(ev, 'challenge:end')[0].result.score).toBe(r.score);
  });

  it('no escape before the first crate; late = half the crate points', () => {
    const w = world();
    const c = new Challenge('snatch', ctx(w));
    w.player.teleport({ x: 0, y: 0.05, z: 2 });
    tick(c, 3, true);
    expect(c.ended).toBe(false);
    expect(c.focus).toBe(null);
    grab(c, w.player, c.crates[0]);
    grab(c, w.player, c.crates[1]);
    grab(c, w.player, c.crates[2]);
    expect(c.cratesTaken).toBe(3);
    tick(c, SNATCH.seconds * 60);
    expect(c.result?.outcome).toBe('late');
    expect(c.result?.score).toBe(150);
    expect(c.result?.success).toBe(false);
  });

  it('dying keeps nothing', () => {
    const w = world();
    const c = new Challenge('snatch', ctx(w));
    grab(c, w.player, c.crates[0]);
    w.player.dead = true;
    tick(c, 1);
    expect(c.result?.outcome).toBe('dead');
    expect(c.result?.score).toBe(0);
  });

  it('testyard (no usable markers) falls back to ground spots', async () => {
    const sim = new Sim(1);
    const info = testYard.build(sim);
    const spots = pickCrateSpots(sim, info, { seed: 3 });
    expect(spots.length).toBeGreaterThanOrEqual(8);
    for (const p of spots) expect(Math.abs(p.y - info.spawn.y)).toBeLessThan(1.2);
  });

  it('harbor: 12 spots from markers, inside bounds, above water, ≥ 8 m apart', () => {
    const sim = new Sim(1);
    const info = harbor.build(sim);
    const spots = pickCrateSpots(sim, info, { seed: 11 });
    expect(spots).toHaveLength(SNATCH.crates);
    const again = pickCrateSpots(sim, info, { seed: 11 });
    expect(again).toEqual(spots);
    let close = 0;
    for (let i = 0; i < spots.length; i++) {
      const p = spots[i];
      expect(p.x).toBeGreaterThan(info.bounds.min.x); expect(p.x).toBeLessThan(info.bounds.max.x);
      expect(p.y).toBeGreaterThan(info.waterLevel! + 0.1);
      for (let j = i + 1; j < spots.length; j++) if (Math.hypot(p.x - spots[j].x, p.z - spots[j].z) < 8) close++;
    }
    expect(close).toBe(0);
  }, 60000);
});

describe('challenge best scores in the save', () => {
  const mem = (init: Record<string, string> = {}): StorageLike & { m: Record<string, string> } => ({ m: { ...init }, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } });

  it('old saves without challenge records still load; records round-trip', () => {
    const old = mem({ 'wrecking-shift-save-v1': JSON.stringify({ v: 1, missions: { housewarming: { best: 200, completed: true, plays: 1 } }, cash: 50, upgrades: {}, settings: {} }) });
    const p = new Progress(old);
    expect(p.totalScore()).toBe(200);
    expect(p.challengeRecord('rubble@harbor')).toBeUndefined();
    const o1 = p.recordChallenge('rubble@harbor', 5000, 1);
    expect(o1).toMatchObject({ newBest: true, previousBest: 0 });
    const o2 = p.recordChallenge('rubble@harbor', 3000, 0);
    expect(o2.newBest).toBe(false);
    const q = new Progress(old);
    expect(q.challengeRecord('rubble@harbor')).toMatchObject({ best: 5000, stars: 1, plays: 2 });
    // career score is missions only
    expect(q.totalScore()).toBe(200);
    // garbage is sanitised
    const bad = mem({ 'wrecking-shift-save-v1': JSON.stringify({ v: 1, challenges: { x: 'nope', 'snatch@ridge': { best: -5, stars: 9, plays: 'a' } } }) });
    const r = new Progress(bad);
    expect(r.challengeRecord('x')).toBeUndefined();
    expect(r.challengeRecord('snatch@ridge')).toMatchObject({ best: 0, stars: 3, plays: 0 });
  });
});
