import { describe, expect, it } from 'vitest';
import { Progress, RANKS, SAVE_KEY, type StorageLike } from '../../src/game/progress';
import { ToolBelt, Tool } from '../../src/sim/tools/tool';
import type { MissionResult } from '../../src/sim/mission';
import { housewarming, shedHappens } from '../../src/game/missions';

class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
class FakeTool extends Tool {
  constructor(readonly id: string, readonly name: string, ammo: number) { super(); this.maxAmmo = ammo; this.ammo = ammo; }
  update(): void {}
}
const result = (id: string, score: number, cash = 0, success = true): MissionResult => ({
  missionId: id, success, score, breakdown: [], cash, valuables: [], alarmTriggered: true, timeLeft: 10, time: 50,
});

describe('progress', () => {
  it('tolerates missing, corrupt and unavailable storage', () => {
    const s = new Mem();
    s.setItem(SAVE_KEY, '{not json');
    expect(new Progress(s).totalScore()).toBe(0);
    s.setItem(SAVE_KEY, JSON.stringify({ missions: { a: { best: 'x' }, b: null }, cash: -5, settings: { fov: 500, quality: 'ultra' } }));
    const p = new Progress(s);
    expect(p.totalScore()).toBe(0);
    expect(p.cash).toBe(0);
    expect(p.settings.fov).toBe(120);
    expect(p.settings.quality).toBe('medium');
    const broken: StorageLike = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const q = new Progress(broken);
    q.recordResult(result('x', 100));
    expect(q.totalScore()).toBe(100);
    expect(new Progress(null).totalScore()).toBe(0);
  });

  it('records best scores, ranks, unlocks and persists', () => {
    const s = new Mem();
    const p = new Progress(s);
    expect(p.rank().name).toBe(RANKS[0].name);
    expect(p.isToolUnlocked('sledge')).toBe(true);
    expect(p.isToolUnlocked('blowtorch')).toBe(false);
    expect(p.isToolUnlocked('some-future-tool')).toBe(true);
    const o = p.recordResult(result('housewarming', 320, 400));
    expect(o.newTools).toEqual(['blowtorch', 'leafblower', 'shotgun', 'plank', 'booster']);
    expect(o.rankAfter).toBe(3);
    expect(p.cash).toBe(400);
    // worse replay keeps best; failure pays nothing
    p.recordResult(result('housewarming', 100, 50));
    p.recordResult(result('housewarming', 0, 999, false));
    expect(p.totalScore()).toBe(320);
    expect(p.cash).toBe(450);
    expect(p.record('housewarming')!.plays).toBe(3);
    const p2 = new Progress(s);
    expect(p2.totalScore()).toBe(320);
    expect(p2.isMissionUnlocked(shedHappens)).toBe(true);
    expect(new Progress(new Mem()).isMissionUnlocked(shedHappens)).toBe(false);
    expect(p2.isMissionUnlocked(housewarming)).toBe(true);
  });

  it('upgrades cost cash and raise max ammo on the belt; sandbox unlocks everything', () => {
    const p = new Progress(new Mem());
    p.recordResult(result('m', 400, 1000));
    expect(p.buyUpgrade('bomb')).toBe(false); // bomb not unlocked yet at 400 points
    expect(p.buyUpgrade('shotgun')).toBe(true);
    expect(p.buyUpgrade('shotgun')).toBe(true);
    expect(p.cash).toBe(1000 - 150 - 300);
    expect(p.ammoBonus('shotgun')).toBe(12);
    const belt = new ToolBelt([new FakeTool('sledge', 'Sledge', Infinity), new FakeTool('shotgun', 'Shotgun', 12), new FakeTool('bomb', 'Bomb', 4), new FakeTool('weird', 'Weird', 3)]);
    const base = new Map(belt.tools.map((t) => [t.id, t.maxAmmo]));
    p.applyToBelt(belt, base, { mission: housewarming });
    expect(belt.byId('shotgun')!.maxAmmo).toBe(24);
    expect(belt.byId('shotgun')!.ammo).toBe(24);
    expect(belt.byId('bomb')!.unlocked).toBe(false);
    expect(belt.byId('weird')!.unlocked).toBe(true);
    // applying twice does not compound
    p.applyToBelt(belt, base, { mission: housewarming });
    expect(belt.byId('shotgun')!.maxAmmo).toBe(24);
    p.applyToBelt(belt, base, { mission: { ...housewarming, tools: { allow: ['sledge'], ammo: { shotgun: 2 } } } });
    expect(belt.byId('shotgun')!.unlocked).toBe(false);
    expect(belt.byId('shotgun')!.maxAmmo).toBe(2);
    p.applyToBelt(belt, base, { sandbox: true });
    expect(belt.tools.every((t) => t.unlocked)).toBe(true);
  });

  it('settings: sanitised set + change listeners + persistence', () => {
    const s = new Mem();
    const p = new Progress(s);
    const seen: string[] = [];
    const off = p.settings.onChange((_st, k) => seen.push(String(k)));
    p.settings.set('fov', 30);
    expect(p.settings.fov).toBe(70);
    p.settings.set('masterVolume', 0.25);
    off();
    p.settings.set('headBob', false);
    expect(seen).toEqual(['fov', 'masterVolume']);
    const p2 = new Progress(s);
    expect(p2.settings.masterVolume).toBe(0.25);
    expect(p2.settings.headBob).toBe(false);
  });
});

describe('field of view (horizontal since 2026-11-26)', () => {
  it('defaults to 90° horizontal and migrates old vertical saves once', async () => {
    const { migrateFov, verticalFov, DEFAULT_SETTINGS } = await import('../../src/game/progress');
    expect(DEFAULT_SETTINGS.fov).toBe(90);
    // the untouched old default (80° vertical) becomes the new default; a chosen value keeps its width at 16:9
    const s = new Mem();
    s.setItem(SAVE_KEY, JSON.stringify({ settings: { fov: 80 } }));
    expect(new Progress(s).settings.fov).toBe(90);
    s.setItem(SAVE_KEY, JSON.stringify({ settings: { fov: 60 } }));
    const p = new Progress(s);
    expect(p.settings.fov).toBe(Math.round(migrateFov(60)!));
    expect(p.settings.fov).toBe(91);
    // once saved by this version the value is horizontal and is not converted again
    p.settings.set('fov', 100);
    expect(JSON.parse(s.getItem(SAVE_KEY)!).settings.fovH).toBe(true);
    expect(new Progress(s).settings.fov).toBe(100);
    // conversion to three's vertical FOV
    expect(verticalFov(90, 16 / 9)).toBeCloseTo(58.72, 1);
    expect(verticalFov(90, 1)).toBeCloseTo(90, 5);
    expect(verticalFov(120, 0.5)).toBe(100);
    expect(verticalFov(70, 4)).toBe(40);
  });
});
