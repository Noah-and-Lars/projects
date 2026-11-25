// UX features: key bindings, assist / comfort settings, assist rules in missions, look-at text, highlight strength.
import { beforeAll, describe, expect, it } from 'vitest';
import { assistTags, missionAssist, scaleAmmo } from '../../src/game/assists';
import { ACTIONS, KeyMap, keyLabel, keyOf, sanitizeKeys } from '../../src/game/keymap';
import { lookInfo } from '../../src/game/lookNames';
import { housewarming, shedHappens } from '../../src/game/missions';
import { DEFAULT_SETTINGS, Progress, SAVE_KEY, type StorageLike } from '../../src/game/progress';
import { HIGHLIGHT_RANGE, highlightStrength, lookLine } from '../../src/game/uxModule';
import type { LevelInfo } from '../../src/sim/levels/types';
import { MAT, pal } from '../../src/sim/materials';
import { Mission, type MissionDef } from '../../src/sim/mission';
import { alarmBox, goldIdol, serverBox, valuable } from '../../src/sim/missionProps';
import { Player } from '../../src/sim/player';
import { Sim, initPhysics } from '../../src/sim/sim';
import { createBelt, createTools } from '../../src/sim/tools';
import type { V3 } from '../../src/sim/vec';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('key map', () => {
  it('defaults pass through; every action has a unique canonical code', () => {
    const k = new KeyMap();
    for (const a of ACTIONS) expect(k.canon(a.defaults[0])).toBe(a.defaults[0]);
    expect(k.canon('KeyC')).toBe('ControlLeft'); // second crouch key reads as crouch
    expect(k.canon('ArrowUp')).toBe('ArrowUp'); // not an action key
    expect(new Set(ACTIONS.map((a) => a.defaults[0])).size).toBe(ACTIONS.length);
    expect(k.label('interact')).toBe('E');
    expect(k.label('crouch')).toBe('L-Ctrl / C');
  });

  it('rebinding routes the new key to the action and swallows the old one', () => {
    const k = new KeyMap();
    expect(k.bind('forward', 'ArrowUp')).toEqual({ forward: 'ArrowUp' });
    expect(k.canon('ArrowUp')).toBe('KeyW');
    expect(k.canon('KeyW')).toBe('Unbound:KeyW');
    expect(k.label('forward')).toBe('↑');
    // binding back to the default removes the override
    expect(k.bind('forward', 'KeyW')).toEqual({});
    expect(k.canon('KeyW')).toBe('KeyW');
  });

  it('a key that already has a job swaps with the action being bound', () => {
    const k = new KeyMap();
    const o = k.bind('jump', 'KeyE')!;
    expect(o).toEqual({ jump: 'KeyE', interact: 'Space' });
    expect(k.canon('KeyE')).toBe('Space'); // E now jumps
    expect(k.canon('Space')).toBe('KeyE'); // space now interacts
    expect(k.label('interact')).toBe('Space');
  });

  it('refuses reserved keys and digits; sanitises stored overrides', () => {
    const k = new KeyMap();
    expect(k.bind('jump', 'Escape')).toBeNull();
    expect(k.bind('jump', 'Digit3')).toBeNull();
    expect(k.bind('nope' as any, 'KeyK')).toBeNull();
    expect(sanitizeKeys({ forward: 'ArrowUp', bogus: 'KeyK', jump: 42, map: 'F3', back: 'KeyS' })).toEqual({ forward: 'ArrowUp' });
    expect(keyLabel('ShiftLeft')).toBe('L-Shift');
    expect(keyOf(null, 'quicksave')).toBe('F5');
    expect(keyOf({ ext: { keys: new KeyMap({ quicksave: 'KeyK' }) } }, 'quicksave')).toBe('K');
  });
});

describe('assist + comfort settings', () => {
  it('defaults are "no assists"; values are sanitised, persisted and old saves migrate', () => {
    const s = new Mem();
    const p = new Progress(s);
    expect(p.settings.assistAlarm).toBe('normal');
    expect(assistTags(p.settings)).toEqual([]);
    p.settings.set('assistAlarm', '+30');
    p.settings.set('assistAmmo', '1.5' as any); // menu buttons send strings
    p.settings.set('assistToughness', 0.5);
    p.settings.set('assistJobs', true);
    p.settings.set('brightness', 9);
    p.settings.set('headBobAmount', 0.4);
    p.settings.set('keys', { interact: 'KeyG' });
    const q = new Progress(s);
    expect(q.settings.toJSON()).toMatchObject({ assistAlarm: '+30', assistAmmo: 1.5, assistToughness: 0.5, assistJobs: true, brightness: 1.6, headBobAmount: 0.4, headBob: true, keys: { interact: 'KeyG' } });
    expect(assistTags(q.settings)).toEqual(['alarm +30 s', 'ammo ×1.5', 'damage ×0.5']);
    q.settings.set('assistAmmo', 3); // not an option
    expect(q.settings.assistAmmo).toBe(1);
    q.settings.set('assistAlarm', 'sometimes' as any);
    expect(q.settings.assistAlarm).toBe('normal');
    // the head-bob switch and slider stay in step
    q.settings.set('headBob', false);
    expect([q.settings.headBob, q.settings.headBobAmount]).toEqual([false, 0]);
    q.settings.set('headBob', true);
    expect([q.settings.headBob, q.settings.headBobAmount]).toEqual([true, 1]);
    q.settings.set('headBobAmount', 0);
    expect(q.settings.headBob).toBe(false);
    // an old save with headBob off and no amount
    const old = new Mem();
    old.setItem(SAVE_KEY, JSON.stringify({ v: 1, missions: {}, cash: 0, upgrades: {}, settings: { headBob: false } }));
    const r = new Progress(old);
    expect([r.settings.headBob, r.settings.headBobAmount, r.settings.brightness, r.settings.assistAlarm]).toEqual([false, 0, 1, 'normal']);
    q.settings.reset();
    expect(q.settings.toJSON()).toEqual({ ...DEFAULT_SETTINGS, keys: {} });
  });

  it('unlock-all-jobs opens the board but the job still counts as unlocked early', () => {
    const p = new Progress(new Mem());
    expect(p.isMissionUnlocked(shedHappens)).toBe(false);
    p.settings.set('assistJobs', true);
    expect(p.isMissionUnlocked(shedHappens)).toBe(true);
    expect(p.isMissionEarned(shedHappens)).toBe(false);
    expect(missionAssist(p.settings, !p.isMissionEarned(shedHappens)).tags).toEqual(['job unlocked early']);
    expect(missionAssist(p.settings, !p.isMissionEarned(housewarming)).tags).toEqual([]);
  });

  it('ammo multiplier scales finite mission ammo only', () => {
    const base = new Map(createTools().map((t) => [t.id, t.maxAmmo] as [string, number]));
    const p = new Progress(new Mem());
    const belt = createBelt();
    p.applyToBelt(belt, base, { mission: housewarming });
    const before = new Map(belt.tools.map((t) => [t.id, t.maxAmmo] as [string, number]));
    p.settings.set('assistAmmo', 2);
    p.applyToBelt(belt, base, { mission: housewarming });
    for (const t of belt.tools) expect(t.maxAmmo).toBe(scaleAmmo(before.get(t.id)!, 2));
    expect(belt.tools.some((t) => isFinite(t.maxAmmo) && t.maxAmmo > 0 && t.maxAmmo === Math.ceil(before.get(t.id)! * 2))).toBe(true);
    expect(scaleAmmo(Infinity, 2)).toBe(Infinity);
    expect(scaleAmmo(5, 1.5)).toBe(8);
  });

  it('assisted results are tagged on the saved record; one-time hints fire once', () => {
    const p = new Progress(new Mem());
    const res = (score: number, assists?: string[]) => ({ missionId: 'housewarming', success: true, score, breakdown: [], cash: 0, valuables: [], alarmTriggered: false, timeLeft: null, time: 10, ...(assists ? { assists } : {}) });
    p.recordResult(res(200, ['ammo ×2']));
    expect(p.record('housewarming')!.assisted).toBe(true);
    p.recordResult(res(150)); // not a new best: keeps the flag
    expect(p.record('housewarming')!.assisted).toBe(true);
    p.recordResult(res(300)); // unassisted best
    expect(p.record('housewarming')!.assisted).toBeUndefined();
    expect(p.takeHint('quicksave')).toBe(true);
    expect(p.takeHint('quicksave')).toBe(false);
  });

  it('toughness scales player damage', () => {
    const sim = new Sim(1);
    const pl = new Player(sim, { x: 0, y: 5, z: 0 });
    pl.damageScale = 0.5;
    pl.damage(0.4);
    expect(pl.health).toBeCloseTo(0.8);
    pl.damageScale = 1.5;
    pl.damage(0.4);
    expect(pl.health).toBeCloseTo(0.2);
  });
});

// ------------------------------------------------------------------------------------------ missions

function world() {
  const sim = new Sim(5);
  const g = new VoxelGrid(240, 4, 240);
  g.fill(0, 0, 0, 240, 4, 240, pal(MAT.bedrock));
  sim.addBody(g, { x: -12, y: -0.4, z: -12 }, { name: 'ground' });
  const a = goldIdol(sim, { x: 0, y: 0, z: -3 }, 'a');
  alarmBox(sim, { x: 3, y: 0, z: -3 }, 'a');
  const b = serverBox(sim, { x: -3, y: 0, z: -3 }, 'b');
  const v = valuable(sim, { x: 3, y: 0, z: 3 }, 'trophy', 75, 'Trophy');
  const cg = new VoxelGrid(6, 6, 6); cg.fill(0, 0, 0, 6, 6, 6, pal(MAT.wood));
  const crate = sim.addBody(cg, { x: -3, y: 0, z: 3 }, { dynamic: true, kind: 'prop', name: 'crate' });
  const lv: LevelInfo = {
    name: 'unit', spawn: { x: 0, y: 0, z: 0 }, spawnYaw: 0,
    bounds: { min: { x: -12, y: -2, z: -12 }, max: { x: 12, y: 20, z: 12 } },
    waterLevel: null, sunDir: { x: 0, y: -1, z: 0 }, markers: { escape: { x: 0, y: 0, z: 6 } },
  };
  return { sim, lv, player: new Player(sim, lv.spawn), a, b, v, crate };
}
const def = (over: Partial<MissionDef> = {}): MissionDef => ({
  id: 'unit', levelId: 'none', title: 'Unit', client: 'Test', brief: '',
  objectives: [{ kind: 'collect', id: 'a', title: 'A' }, { kind: 'collect', id: 'b', title: 'B', required: false }],
  alarmSeconds: 20, ...over,
});
function tick(m: Mission, n: number, interact = false) {
  for (let i = 0; i < n; i++) { m.update({ interact: interact && i === 0 }); m.sim.step(); m.sim.drainEvents(); }
}
function take(m: Mission, p: Player, body: { center(): V3 }) {
  const c = body.center();
  p.teleport({ x: c.x, y: 0, z: c.z + 1.3 });
  const e = p.eye, dx = c.x - e.x, dy = c.y - e.y, dz = c.z - e.z;
  p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  tick(m, 1, true);
}

describe('assists in the mission rules', () => {
  it('extra alarm time lengthens the clock; the time bonus stays capped at the normal clock', () => {
    const w = world();
    const m = new Mission(def(), { sim: w.sim, level: w.lv, player: w.player, assist: { alarmDelta: 30, tags: ['alarm +30 s'] } });
    expect(m.alarmSecondsTotal).toBe(50);
    take(m, w.player, w.a);
    expect(m.phase).toBe('alarm');
    tick(m, 30 * 60); // longer than the normal 20 s
    expect(m.phase).toBe('alarm');
    w.player.teleport({ x: 0, y: 0, z: 6 });
    tick(m, 1, true);
    expect(m.phase).toBe('success');
    const tb = m.result!.breakdown.find((b) => /Time left/.test(b.label))!;
    expect(m.result!.timeLeft!).toBeGreaterThan(19);
    expect(tb.points).toBe(Math.min(20, Math.floor(m.result!.timeLeft!)) * 2);
    expect(m.result!.assists).toEqual(['alarm +30 s']);
  });

  it('-10 s shortens it; "no limit" never runs out; no assist = no tag', () => {
    const w = world();
    const m = new Mission(def(), { sim: w.sim, level: w.lv, player: w.player, assist: { alarmDelta: -10 } });
    expect(m.alarmSecondsTotal).toBe(10);
    take(m, w.player, w.a);
    tick(m, 10 * 60 + 2);
    expect(m.phase).toBe('failed');
    expect(m.result!.assists).toBeUndefined();

    const w2 = world();
    const m2 = new Mission(def(), { sim: w2.sim, level: w2.lv, player: w2.player, assist: { alarmUnlimited: true, tags: ['no alarm time limit'] } });
    expect(m2.alarmUnlimited).toBe(true);
    take(m2, w2.player, w2.a);
    expect(m2.phase).toBe('alarm');
    tick(m2, 90 * 60);
    expect(m2.phase).toBe('alarm');
    w2.player.teleport({ x: 0, y: 0, z: 6 });
    tick(m2, 1, true);
    expect(m2.phase).toBe('success');
    expect(m2.result!.assists).toEqual(['no alarm time limit']);
    expect(m2.result!.breakdown.find((b) => /Time left/.test(b.label))!.points).toBe(40); // capped at the normal 20 s

    // quickload keeps the assist (ctx) and the JSON shape
    const w3 = world();
    const m3 = new Mission(def(), { sim: w3.sim, level: w3.lv, player: w3.player });
    expect(m3.alarmSecondsTotal).toBe(20);
    const m4 = Mission.fromJSON(def(), m3.toJSON(), { sim: w3.sim, level: w3.lv, player: w3.player, assist: { alarmDelta: 15 } });
    expect(m4.alarmSecondsTotal).toBe(35);
  });

  it('items(): required / bonus targets and valuables, gone once taken', () => {
    const w = world();
    const m = new Mission(def(), { sim: w.sim, level: w.lv, player: w.player });
    const kinds = () => m.items().map((i) => `${i.kind}:${i.name}`).sort();
    expect(kinds()).toEqual(['bonus:Server Box', 'required:Gold Idol', 'valuable:Trophy']);
    expect(m.itemFor(w.v)).toMatchObject({ kind: 'valuable', amount: 75 });
    expect(m.itemFor(w.crate)).toBeNull();
    take(m, w.player, w.v);
    expect(kinds()).toEqual(['bonus:Server Box', 'required:Gold Idol']);
  });
});

describe('look-at text + highlight strength', () => {
  it('names props, tags mission items, ignores ground and debris', () => {
    const w = world();
    const m = new Mission(def(), { sim: w.sim, level: w.lv, player: w.player });
    expect(lookLine(w.a, m)!.text).toBe('Gold Idol · Required target');
    expect(lookLine(w.b, m)!.text).toBe('Server Box · Bonus');
    expect(lookLine(w.v, m)!.text).toBe('Trophy · $75');
    expect(lookLine(w.crate, m)!.text).toMatch(/^Wooden crate · /);
    expect(lookLine(w.crate, null)!.html).toContain('<b>Wooden crate</b>');
    const ground = [...w.sim.bodies.values()].find((b) => b.name === 'ground')!;
    expect(lookLine(ground, m)).toBeNull();
    expect(lookInfo('Mystery Thing')).toEqual({ name: 'Mystery Thing' });
    expect(lookInfo('sofa')!.name).toBe('Sofa');
  });

  it('strength: 0 beyond range, fades with distance, full when aimed', () => {
    expect(highlightStrength(HIGHLIGHT_RANGE + 0.1, true)).toBe(0);
    expect(highlightStrength(1, false)).toBeGreaterThan(highlightStrength(6, false));
    expect(highlightStrength(6, false)).toBeGreaterThan(0);
    expect(highlightStrength(6, true)).toBe(1);
  });
});
