import { beforeAll, describe, expect, it } from 'vitest';
import { MAT, pal } from '../../src/sim/materials';
import { Sim, initPhysics, type SimEvent } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';
import { Player } from '../../src/sim/player';
import { Mission, highestVoxelY, maxScore, type MissionDef } from '../../src/sim/mission';
import { alarmBox, goldIdol, paintCan, serverBox, valuable } from '../../src/sim/missionProps';
import type { LevelInfo } from '../../src/sim/levels/types';
import type { V3 } from '../../src/sim/vec';
import { testYard } from '../../src/sim/levels/testyard';
import { MISSIONS, housewarming, shedHappens } from '../../src/game/missions';

beforeAll(async () => { await initPhysics(); });

function level(extra: Partial<LevelInfo> = {}): LevelInfo {
  return {
    name: 'unit', spawn: { x: 0, y: 0, z: 0 }, spawnYaw: 0,
    bounds: { min: { x: -12, y: -2, z: -12 }, max: { x: 12, y: 20, z: 12 } },
    waterLevel: null, sunDir: { x: 0, y: -1, z: 0 },
    markers: { escape: { x: 0, y: 0, z: 6 }, dock: { x: -6, y: 0.4, z: 6 } },
    ...extra,
  };
}

/** small world: ground, targets a (alarmed), b, c (optional), a valuable, a wall and a tower */
function world(extraLevel: Partial<LevelInfo> = {}) {
  const sim = new Sim(5);
  const g = new VoxelGrid(240, 4, 240);
  g.fill(0, 0, 0, 240, 4, 240, pal(MAT.bedrock));
  sim.addBody(g, { x: -12, y: -0.4, z: -12 }, { name: 'ground' });
  const a = goldIdol(sim, { x: 0, y: 0, z: -3 }, 'a');
  const box = alarmBox(sim, { x: 3, y: 0, z: -3 }, 'a');
  // a post that carries the alarm box of target b2 (to test "comes loose")
  const pg = new VoxelGrid(2, 10, 2); pg.fill(0, 0, 0, 2, 10, 2, pal(MAT.wood));
  const post = sim.addBody(pg, { x: -6, y: 0, z: -3 }, { name: 'post' });
  const b = serverBox(sim, { x: -3, y: 0, z: -3 }, 'b');
  const c = paintCan(sim, { x: 0, y: 0, z: 3 }, 'c');
  const v = valuable(sim, { x: 3, y: 0, z: 3 }, 'trophy', 75, 'Trophy');
  const wg = new VoxelGrid(20, 20, 4); wg.fill(0, 0, 0, 20, 20, 4, pal(MAT.brick));
  const wall = sim.addBody(wg, { x: 5, y: 0, z: 5 }, { name: 'wall', tags: ['destroy:wall'] });
  const tg = new VoxelGrid(4, 30, 4); tg.fill(0, 0, 0, 4, 30, 4, pal(MAT.wood));
  const tower = sim.addBody(tg, { x: -9, y: 0, z: 8 }, { name: 'tower', tags: ['destroy:tower'] });
  const lv = level(extraLevel);
  const player = new Player(sim, lv.spawn);
  return { sim, lv, player, a, box, post, b, c, v, wall, tower };
}

const baseDef = (over: Partial<MissionDef> = {}): MissionDef => ({
  id: 'unit', levelId: 'none', title: 'Unit', client: 'Test', brief: '',
  objectives: [
    { kind: 'collect', id: 'a', title: 'A' },
    { kind: 'collect', id: 'b', title: 'B' },
    { kind: 'collect', id: 'c', title: 'C', required: false },
  ],
  alarmSeconds: 60,
  reward: { cash: 100 },
  ...over,
});

function lookAt(p: Player, target: V3) {
  const e = p.eye;
  const dx = target.x - e.x, dy = target.y - e.y, dz = target.z - e.z;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
/** stand 1.3 m from a body (on +z side), look at it and press E */
function take(m: Mission, p: Player, body: { center(): V3 }, events?: SimEvent[]) {
  const c = body.center();
  p.teleport({ x: c.x, y: 0, z: c.z + 1.3 });
  lookAt(p, c);
  tick(m, 1, true, events);
}
function tick(m: Mission, n: number, interact = false, events?: SimEvent[]) {
  for (let i = 0; i < n; i++) {
    m.update({ interact: interact && i === 0 });
    m.sim.step();
    const ev = m.sim.drainEvents();
    if (events) events.push(...ev);
  }
}
const named = (ev: SimEvent[], name: string) => ev.filter((e) => e.type === 'custom' && e.name === name).map((e) => (e as any).data);

describe('mission state machine', () => {
  it('binds targets, alarm boxes and valuables; starts in planning', () => {
    const w = world();
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 30);
    expect(m.phase).toBe('planning');
    expect(m.hasAlarm).toBe(true);
    expect(m.canQuicksave()).toBe(true);
    expect(m.objectives().map((o) => o.need)).toEqual([1, 1, 1]);
    expect(m.markers().filter((k) => k.kind === 'alarm').length).toBe(1);
    expect(m.wires().length).toBe(1);
  });

  it('looking at a target shows focus; collecting a wired target starts the alarm', () => {
    const w = world();
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 10);
    const c = w.a.center();
    w.player.teleport({ x: c.x, y: 0, z: c.z + 1.3 });
    lookAt(w.player, c);
    tick(m, 1);
    expect(m.focus?.kind).toBe('target');
    expect(m.focus?.name).toBe('Gold Idol');
    const ev: SimEvent[] = [];
    tick(m, 1, true, ev);
    expect(w.a.removed).toBe(true);
    expect(m.phase).toBe('alarm');
    expect(m.canQuicksave()).toBe(false);
    expect(named(ev, 'mission:target')[0]).toEqual({ id: 'a', title: 'Gold Idol', required: true });
    expect(named(ev, 'mission:alarm')[0].seconds).toBe(60);
    expect(named(ev, 'mission:objective').map((d) => d.id)).toEqual(['a']);
  });

  it('collecting an unwired target does not start the alarm', () => {
    const w = world();
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 10);
    take(m, w.player, w.b);
    expect(w.b.removed).toBe(true);
    expect(m.phase).toBe('planning');
    expect(m.objectives()[1].done).toBe(true);
  });

  it('moving an alarmed target more than 0.5 m starts the alarm', () => {
    const w = world();
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 10);
    const t = w.a.rb.translation();
    w.a.rb.setTranslation({ x: t.x + 0.3, y: t.y, z: t.z }, true);
    tick(m, 2);
    expect(m.phase).toBe('planning');
    w.a.rb.setTranslation({ x: t.x + 0.8, y: t.y, z: t.z }, true);
    tick(m, 2);
    expect(m.phase).toBe('alarm');
    expect(m.alarmCause).toBe('target');
  });

  it('breaking the alarm box starts the alarm', () => {
    const w = world();
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 10);
    const c = w.box.center();
    w.sim.carve(c, 0.12, 0.12, 0, { rough: 0 });
    tick(m, 1);
    expect(m.phase).toBe('alarm');
    expect(m.alarmCause).toBe('alarmbox');
  });

  it('an alarm box that comes loose (its mount destroyed) starts the alarm', () => {
    const w = world();
    // box hanging on the side of the post (touches its +x face), wired to b
    alarmBox(w.sim, { x: -5.8, y: 0.5, z: -2.95 }, 'b', 'x');
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 20);
    expect(m.phase).toBe('planning');
    w.sim.removeBody(w.post);
    tick(m, 12);
    expect(m.phase).toBe('alarm');
    expect(m.alarmCause).toBe('alarmbox');
  });

  it('timer counts down, emits whole seconds, helicopter approaches, fails at 0', () => {
    const w = world();
    const m = new Mission(baseDef({ alarmSeconds: 20 }), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 5);
    m.triggerAlarm('test');
    const ev: SimEvent[] = [];
    tick(m, 60 * 4, false, ev);
    expect(m.heli).toBeNull();
    tick(m, 60 * 2, false, ev);
    expect(m.heli).not.toBeNull();
    const d0 = Math.hypot(m.heli!.pos.x - 0, m.heli!.pos.z - 6);
    tick(m, 60 * 10, false, ev);
    const d1 = Math.hypot(m.heli!.pos.x - 0, m.heli!.pos.z - 6);
    expect(d1).toBeLessThan(d0);
    expect(m.phase).toBe('alarm');
    tick(m, 60 * 4 - 1, false, ev);
    expect(m.phase).toBe('alarm');
    expect(m.timeLeft).toBeGreaterThan(0);
    tick(m, 2, false, ev);
    expect(m.phase).toBe('failed');
    expect(named(ev, 'mission:fail')[0].reason).toMatch(/Security/);
    expect(named(ev, 'mission:second').map((d) => d.left)).toEqual([19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(named(ev, 'mission:heli').length).toBe(1);
    expect(m.result?.success).toBe(false);
    expect(m.result?.score).toBe(0);
  });

  it('all required + escape -> success with correct score; optional adds bonus', () => {
    const run = (withOptional: boolean) => {
      const w = world();
      const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
      tick(m, 10);
      const ev: SimEvent[] = [];
      take(m, w.player, w.v, ev);
      expect(named(ev, 'mission:pickup')[0]).toEqual({ amount: 75, name: 'Trophy' });
      take(m, w.player, w.a, ev);
      expect(m.phase).toBe('alarm');
      take(m, w.player, w.b, ev);
      if (withOptional) take(m, w.player, w.c, ev);
      expect(m.escapeOpen).toBe(true);
      expect(named(ev, 'mission:escapeOpen').length).toBe(1);
      tick(m, 60 * 10); // dawdle 10 s
      // pressing E far from the escape does nothing
      w.player.teleport({ x: 8, y: 0, z: -8 });
      tick(m, 1, true);
      expect(m.phase).toBe('alarm');
      w.player.teleport({ x: 0.5, y: 0, z: 6.5 });
      w.player.pitch = 0.6; // look at the sky: no other focus
      tick(m, 1);
      expect(m.focus?.kind).toBe('escape');
      const left = m.timeLeft;
      tick(m, 1, true, ev);
      expect(m.phase).toBe('success');
      const r = named(ev, 'mission:success')[0].result;
      expect(r).toEqual(m.result);
      expect(r.cash).toBe(75 + 100);
      expect(r.alarmTriggered).toBe(true);
      const timeBonus = Math.floor(left - 1 / 60) * 2;
      expect(r.score).toBe(200 + (withOptional ? 50 : 0) + timeBonus);
      expect(r.breakdown.reduce((s: number, b: any) => s + b.points, 0)).toBe(r.score);
      return r.score as number;
    };
    const plain = run(false), bonus = run(true);
    expect(bonus - plain).toBe(50);
  });

  it('never tripping the alarm gives the full clock as bonus', () => {
    const w = world();
    const m = new Mission(baseDef({ objectives: [{ kind: 'collect', id: 'b', title: 'B' }] }), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 5);
    take(m, w.player, w.b);
    w.player.teleport({ x: 0, y: 0, z: 6 }); w.player.pitch = 0.8;
    tick(m, 1, true);
    expect(m.phase).toBe('success');
    expect(m.result!.score).toBe(100 + 60 * 2);
    expect(m.result!.alarmTriggered).toBe(false);
    expect(maxScore(baseDef())).toBe(250 + 120);
  });

  it('missions without alarm sources have no timer and no time bonus', () => {
    const w = world();
    const def = baseDef({ objectives: [{ kind: 'reach', id: 'r', title: 'Reach the dock', zone: { marker: 'dock', radius: 1.5 } }] });
    const sim = w.sim;
    sim.removeBody(w.box); // no alarm box left
    const m = new Mission(def, { sim, level: w.lv, player: w.player });
    expect(m.hasAlarm).toBe(false);
    tick(m, 5);
    w.player.teleport({ x: -6, y: 0, z: 6 });
    tick(m, 2);
    expect(m.objectives()[0].done).toBe(true);
    expect(m.escapeOpen).toBe(true);
    w.player.teleport({ x: 0, y: 0, z: 6 }); w.player.pitch = 0.8;
    tick(m, 1, true);
    expect(m.phase).toBe('success');
    expect(m.result!.score).toBe(100);
  });

  it('destroy-% objective completes when enough voxels are carved', () => {
    const w = world();
    const def = baseDef({ objectives: [{ kind: 'destroy', id: 'wall', title: 'Wreck the wall', percent: 30 }] });
    const m = new Mission(def, { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 2);
    expect(m.objectives()[0].done).toBe(false);
    // cut the lower-left part: removes voxels and splits debris off (separated voxels count as destroyed)
    for (let x = 0; x < 20; x++) for (let z = 0; z < 4; z++) w.sim.removeVoxel(w.wall, x, 6, z);
    tick(m, 2);
    const o = m.objectives()[0];
    expect(o.progress).toBeGreaterThan(0.6); // the whole top 14 rows fell off as debris
    expect(o.done).toBe(true);
  });

  it('demolish objective: nothing of the tower above 1 m', () => {
    const w = world();
    const def = baseDef({ objectives: [{ kind: 'demolish', id: 'tower', title: 'Topple the tower', height: 1.0 }] });
    const m = new Mission(def, { sim: w.sim, level: w.lv, player: w.player });
    expect(highestVoxelY(w.tower)).toBeCloseTo(3.0, 5);
    tick(m, 25);
    expect(m.objectives()[0].done).toBe(false);
    for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) w.sim.removeVoxel(w.tower, x, 8, z);
    tick(m, 25);
    expect(highestVoxelY(w.tower)).toBeCloseTo(0.8, 5);
    expect(m.objectives()[0].done).toBe(true);
  });

  it('deliver objective: target must stay in the zone; water zones use the water level', () => {
    const w = world({ waterLevel: 0.3 });
    const def = baseDef({ objectives: [
      { kind: 'deliver', id: 'c', title: 'Bring the can to the dock', zone: { marker: 'dock', radius: 1.5 } },
      { kind: 'deliver', id: 'b', title: 'Sink the server', zone: { water: true } },
    ] });
    const m = new Mission(def, { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 5);
    expect(m.objectives()[1].done).toBe(false); // server centre is above 0.3 m
    w.c.rb.setTranslation({ x: -6.2, y: 0.05, z: 5.8 }, true);
    tick(m, 10);
    expect(m.objectives()[0].done).toBe(false);
    tick(m, 30);
    expect(m.objectives()[0].done).toBe(true);
    w.b.rb.setTranslation({ x: -3, y: -0.35, z: -3 }, true); // pushed into the ground: centre below water
    w.b.rb.setBodyType(2 as any, true); // freeze (kinematic) so it stays there
    tick(m, 40);
    expect(m.objectives()[1].done).toBe(true);
  });

  it('fire alarm threshold', () => {
    const w = world();
    let fires = 0;
    const m = new Mission(baseDef({ fireAlarm: 100 }), { sim: w.sim, level: w.lv, player: w.player, fireCount: () => fires });
    fires = 99;
    tick(m, 40);
    expect(m.phase).toBe('planning');
    fires = 100;
    tick(m, 16);
    expect(m.phase).toBe('alarm');
    expect(m.alarmCause).toBe('fire');
  });

  it('demolition sensor', () => {
    const w = world();
    const m = new Mission(baseDef({ demolitionSensor: 50 }), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 2);
    for (let x = 0; x < 10; x++) for (let z = 0; z < 4; z++) w.sim.removeVoxel(w.wall, x, 19, z);
    tick(m, 2);
    expect(m.phase).toBe('planning');
    for (let x = 10; x < 20; x++) for (let z = 0; z < 4; z++) w.sim.removeVoxel(w.wall, x, 19, z);
    tick(m, 2);
    expect(m.phase).toBe('alarm');
    expect(m.alarmCause).toBe('demolition');
  });

  it('player death fails the mission', () => {
    const w = world();
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 2);
    w.player.damage(2, 'explosion');
    const ev: SimEvent[] = [];
    tick(m, 1, false, ev);
    expect(m.phase).toBe('failed');
    expect(named(ev, 'mission:fail')[0].reason).toMatch(/blast/);
  });

  it('JSON round-trip keeps progress and the mission can be finished afterwards', () => {
    const w = world();
    const m = new Mission(baseDef(), { sim: w.sim, level: w.lv, player: w.player });
    tick(m, 5);
    take(m, w.player, w.b);
    take(m, w.player, w.v);
    expect(m.canQuicksave()).toBe(true);
    const json = JSON.parse(JSON.stringify(m.toJSON()));
    m.dispose();
    const m2 = Mission.fromJSON(baseDef(), json, { sim: w.sim, level: w.lv, player: w.player });
    expect(m2.toJSON()).toEqual(json);
    expect(m2.objectives()).toEqual(m.objectives());
    expect(m2.cash).toBe(75);
    take(m2, w.player, w.a);
    expect(m2.phase).toBe('alarm');
    w.player.teleport({ x: 0, y: 0, z: 6 }); w.player.pitch = 0.8;
    tick(m2, 1, true);
    expect(m2.phase).toBe('success');
    expect(m2.result!.cash).toBe(175);
    expect(() => Mission.fromJSON(shedHappens, json, { sim: w.sim, level: w.lv, player: w.player })).toThrow();
  });
});

describe('mission registry + demo heist on the test yard', () => {
  it('every mission references known objectives and unique ids', () => {
    const ids = new Set<string>();
    for (const d of MISSIONS) {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      expect(d.objectives.some((o) => o.required !== false)).toBe(true);
    }
  });

  it('housewarming binds its props, stays quiet while planning and can be completed', () => {
    const sim = new Sim(housewarming.seed ?? 1234);
    const lv = testYard.build(sim);
    const player = new Player(sim, lv.spawn);
    housewarming.setup!(sim, lv);
    const m = new Mission(housewarming, { sim, level: lv, player });
    tick(m, 240);
    expect(m.phase).toBe('planning');
    const os = m.objectives();
    expect(os.map((o) => [o.id, o.required, o.need])).toEqual([['idol', true, 1], ['server', true, 1], ['paint', false, 1]]);
    expect(m.markers().filter((k) => k.kind === 'alarm').length).toBe(2);
    const idol = [...sim.bodies.values()].find((b) => b.tags.has('target:idol'))!;
    take(m, player, idol);
    expect(m.phase).toBe('alarm');
    const server = [...sim.bodies.values()].find((b) => b.tags.has('target:server'))!;
    take(m, player, server);
    expect(m.escapeOpen).toBe(true);
    player.teleport(lv.markers.escape); player.pitch = 0.8;
    tick(m, 1, true);
    expect(m.phase).toBe('success');
    expect(m.result!.score).toBeGreaterThan(200);
  });

  it('shed-happens tags the shed and the pear tree', () => {
    const sim = new Sim(1234);
    const lv = testYard.build(sim);
    const player = new Player(sim, lv.spawn);
    shedHappens.setup!(sim, lv);
    const m = new Mission(shedHappens, { sim, level: lv, player, fireCount: () => 0 });
    tick(m, 21);
    const os = m.objectives();
    expect(os[0].progress).toBe(0);
    expect(os[1].detail).toMatch(/m/);
    expect(m.hasAlarm).toBe(true);
    expect(m.phase).toBe('planning');
  });
});
