/**
 * Power upgrades, the booster can tool and gamepad mapping.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { GamepadInput, PAD, mapPad, padDown, type InputSink, type PadLike } from '../../src/game/gamepad';
import { Progress, RANKS, SAVE_KEY, type StorageLike } from '../../src/game/progress';
import { FireSystem } from '../../src/sim/fire';
import { MAT, pal } from '../../src/sim/materials';
import { Player } from '../../src/sim/player';
import { spawnVehicle } from '../../src/sim/prefabs/vehicles';
import { Sim, initPhysics } from '../../src/sim/sim';
import { snapshotSim, restoreSim } from '../../src/sim/snapshot';
import { Booster, createBelt, createTools } from '../../src/sim/tools';
import { POWER_UPGRADES, carryPower } from '../../src/sim/tools/power';
import { emptyToolInput, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import type { V3 } from '../../src/sim/vec';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
const baseAmmo = () => { const m = new Map<string, number>(); for (const t of createTools()) m.set(t.id, t.maxAmmo); return m; };

describe('power upgrades', () => {
  it('table stock values match the tools, levels and costs line up', () => {
    const tools = createTools();
    expect(POWER_UPGRADES.length).toBeGreaterThanOrEqual(6);
    for (const d of POWER_UPGRADES) {
      const t = tools.find((x) => x.id === d.tool);
      expect(t, d.id).toBeTruthy();
      expect(d.id).toContain('.');
      expect(d.steps.length).toBe(d.costs.length + 1);
      for (const [prop, vals] of Object.entries(d.stats)) {
        expect(typeof (t as any)[prop], `${d.id} ${prop}`).toBe('number');
        expect(vals[0], `${d.id} ${prop} stock`).toBe((t as any)[prop]);
        expect(vals.length).toBe(d.costs.length + 1);
      }
      // every upgradeable tool is unlockable by some rank
      expect(RANKS.some((r) => r.tools.includes(d.tool)), d.tool).toBe(true);
    }
  });

  it('buying applies to mission and sandbox belts; level 0 resets to stock', () => {
    const s = new Mem();
    const p = new Progress(s);
    p.data.cash = 5000;
    // locked tool (bomb needs a rank) cannot be bought; sledge can
    expect(p.canBuyPower('bomb.blast')).toBe(false);
    expect(p.buyPower('sledge.head')).toBe(true);
    expect(p.buyPower('sledge.head')).toBe(true);
    expect(p.buyPower('sledge.head')).toBe(false); // maxed
    expect(p.powerLevel('sledge.head')).toBe(2);
    expect(p.cash).toBe(5000 - 180 - 380);
    p.data.missions.x = { best: 5000, completed: true, plays: 1 }; // max rank
    expect(p.buyPower('bomb.blast')).toBe(true);
    const belt = createBelt();
    p.applyToBelt(belt, baseAmmo(), { mission: null });
    expect((belt.byId('sledge') as any).bite).toBeCloseTo(0.82);
    expect((belt.byId('sledge') as any).reach).toBeCloseTo(3.2);
    expect((belt.byId('bomb') as any).size).toBeCloseTo(1.85);
    expect((belt.byId('shotgun') as any).pellets).toBe(8);
    const sbx = createBelt();
    p.applyToBelt(sbx, baseAmmo(), { sandbox: true });
    expect((sbx.byId('bomb') as any).size).toBeCloseTo(1.85);
    // a fresh career on the same belt puts the stock values back
    const q = new Progress(null);
    q.applyToBelt(sbx, baseAmmo(), { sandbox: true });
    expect((sbx.byId('bomb') as any).size).toBeCloseTo(1.6);
    expect((sbx.byId('sledge') as any).bite).toBeCloseTo(0.55);
    // persisted next to the ammo upgrades
    const again = new Progress(s);
    expect(again.powerLevel('sledge.head')).toBe(2);
    expect(again.powerLevel('bomb.blast')).toBe(1);
  });

  it('old saves (ammo upgrades only) still load, and unknown or huge levels are clamped', () => {
    const s = new Mem();
    s.setItem(SAVE_KEY, JSON.stringify({ v: 1, missions: { housewarming: { best: 120, completed: true, plays: 2 } }, cash: 300, upgrades: { shotgun: 2, blowtorch: 1 }, settings: { fov: 90 } }));
    const p = new Progress(s);
    expect(p.cash).toBe(300);
    expect(p.upgradeLevel('shotgun')).toBe(2);
    expect(p.ammoBonus('shotgun')).toBe(12);
    for (const d of POWER_UPGRADES) expect(p.powerLevel(d.id)).toBe(0);
    s.setItem(SAVE_KEY, JSON.stringify({ v: 1, missions: {}, cash: 0, upgrades: { 'rifle.core': 99, 'nope.thing': 3 }, settings: {} }));
    const q = new Progress(s);
    expect(q.powerLevel('rifle.core')).toBe(2);
    expect(q.powerLevel('nope.thing')).toBe(0);
    const belt = createBelt();
    q.applyToBelt(belt, baseAmmo(), { sandbox: true });
    expect((belt.byId('rifle') as any).penetrate).toBe(9);
    // the ammo of a stock belt is unchanged by power levels
    expect(belt.byId('rifle')!.maxAmmo).toBe(6);
  });

  it('carryPower moves upgraded stats onto a new belt (level reload / quickload)', () => {
    const a = createBelt(), b = createBelt();
    (a.byId('plank') as any).maxLen = 7;
    for (const t of b.tools) { const o = a.byId(t.id); if (o) carryPower(o, t); }
    expect((b.byId('plank') as any).maxLen).toBe(7);
    expect((b.byId('cable') as any).maxLen).toBe(12);
  });

  it('a bigger bomb blast removes more', () => {
    const removed = (size: number) => {
      const sim = new Sim(9);
      const g = new VoxelGrid(40, 30, 6);
      g.fill(0, 0, 0, 40, 30, 6, pal(MAT.brick, 2));
      const wall = sim.addBody(g, { x: -2, y: 0, z: 0 }, { name: 'wall' });
      const n0 = wall.grid.count;
      sim.explode({ x: 0, y: 1.5, z: 0.65 }, size);
      return n0 - wall.grid.count;
    };
    expect(removed(1.85)).toBeGreaterThan(removed(1.6) * 1.15);
  });
});

// ------------------------------------------------------------------------------------------ booster

function world() {
  const sim = new Sim(5);
  const g = new VoxelGrid(200, 4, 200);
  g.fill(0, 0, 0, 200, 4, 200, pal(MAT.asphalt));
  sim.addBody(g, { x: -10, y: -0.4, z: -10 }, { name: 'ground' });
  const player = new Player(sim, { x: 0, y: 0.02, z: 0 });
  const ctx: ToolContext = { sim, player, infiniteAmmo: false, fire: new FireSystem(sim) };
  return { sim, player, ctx };
}
function aimAt(player: Player, target: V3): void {
  const e = player.eye;
  const dx = target.x - e.x, dy = target.y - e.y, dz = target.z - e.z;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
}
function run(w: ReturnType<typeof world>, tool: Booster, n: number, inp: Partial<ToolInput> = {}) {
  for (let i = 0; i < n; i++) {
    const ti = { ...emptyToolInput(), ...inp };
    if (i > 0) ti.primaryPressed = false;
    w.player.update();
    if (tool.cooldown > 0) tool.cooldown--;
    tool.tick(w.ctx);
    tool.update(w.ctx, ti);
    w.sim.step();
  }
}

describe('booster can', () => {
  it('sticks to a crate, lights after the fuse and shoves it away from the stuck face', () => {
    const w = world();
    const g = new VoxelGrid(8, 8, 8);
    g.fill(0, 0, 0, 8, 8, 8, pal(MAT.crate, 1));
    // crate 2 m in front (-Z) of the player
    const crate = w.sim.addBody(g, { x: -0.4, y: 0, z: -2.8 }, { dynamic: true, kind: 'prop', name: 'crate' });
    run(w, new Booster(), 20);
    const b = new Booster();
    aimAt(w.player, { x: 0, y: 0.4, z: -2 });
    const z0 = crate.center().z;
    run(w, b, 1, { primary: true, primaryPressed: true });
    expect(b.live.length).toBe(1);
    expect(b.ammo).toBe(3);
    // fuse: nothing moves yet
    run(w, b, 50);
    expect(Math.abs(crate.center().z - z0)).toBeLessThan(0.05);
    const events: string[] = [];
    for (let i = 0; i < 150; i++) { run(w, b, 1); for (const e of w.sim.drainEvents()) if (e.type === 'custom') events.push(e.name); }
    // stuck on the face toward the player (+Z normal): pushed toward -Z
    expect(crate.center().z - z0).toBeLessThan(-1.5);
    expect(events).toContain('tool:boost');
    run(w, b, 200);
    expect(b.live.length).toBe(0); // burnt out and gone
  });

  it('drives a car forward from its tail and refuses static walls', () => {
    const w = world();
    // facing -Z, tail 2.2 m in front of the player; someone at the wheel in neutral (handbrake off)
    const car = spawnVehicle(w.sim, 'hatchback', 0, 0, -4.2, 0);
    car.startEngine(); car.seated = true;
    run(w, new Booster(), 60);
    const b = new Booster();
    b.fuse = 1;
    aimAt(w.player, { x: car.com.x, y: 0.6, z: car.com.z });
    const z0 = car.com.z;
    run(w, b, 1, { primary: true, primaryPressed: true });
    expect(b.live.length).toBe(1);
    run(w, b, 120);
    expect(z0 - car.com.z).toBeGreaterThan(2);
    expect(car.speed).toBeGreaterThan(2);
    // a wall: no can, no ammo used
    const wg = new VoxelGrid(20, 20, 2);
    wg.fill(0, 0, 0, 20, 20, 2, pal(MAT.concrete, 1));
    w.sim.addBody(wg, { x: -1, y: 0, z: 1.2 }, { name: 'wall' });
    w.player.yaw = Math.PI; w.player.pitch = 0; // look +Z
    const left = b.ammo;
    run(w, b, 40);
    run(w, b, 1, { primary: true, primaryPressed: true });
    expect(b.ammo).toBe(left);
  });

  it('quicksave keeps a lit can burning on its crate', () => {
    const w = world();
    const g = new VoxelGrid(8, 8, 8);
    g.fill(0, 0, 0, 8, 8, 8, pal(MAT.crate, 1));
    w.sim.addBody(g, { x: -0.4, y: 0, z: -2.8 }, { dynamic: true, kind: 'prop', name: 'crate' });
    const b = new Booster();
    aimAt(w.player, { x: 0, y: 0.4, z: -2 });
    run(w, b, 1, { primary: true, primaryPressed: true });
    run(w, b, 70);
    const state = JSON.parse(JSON.stringify(b.save()));
    const snap = JSON.parse(JSON.stringify(snapshotSim(w.sim)));
    const sim2 = new Sim(5);
    restoreSim(snap, sim2);
    const b2 = new Booster();
    const ctx2: ToolContext = { sim: sim2, player: new Player(sim2, { x: 0, y: 0.02, z: 0 }), infiniteAmmo: false };
    b2.load(ctx2, state);
    expect(b2.live.length).toBe(1);
    expect(b2.live[0].lit).toBe(true);
    expect(b2.live[0].stick.joint).not.toBeNull();
    const crate2 = [...sim2.bodies.values()].find((x) => x.name === 'crate')!;
    const z0 = crate2.center().z;
    for (let i = 0; i < 60; i++) { b2.tick(ctx2); sim2.step(); }
    expect(crate2.center().z - z0).toBeLessThan(-0.3);
  });
});

// ------------------------------------------------------------------------------------------ gamepad

function fakePad(o: { axes?: number[]; down?: number[]; values?: Record<number, number> } = {}): PadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const v = o.values?.[i] ?? (o.down?.includes(i) ? 1 : 0);
    return { pressed: v > 0.5, value: v };
  });
  return { axes: o.axes ?? [0, 0, 0, 0], buttons, connected: true };
}

describe('gamepad mapping', () => {
  it('on foot: sticks move + look, triggers are the mouse buttons, face buttons are keys', () => {
    const f = mapPad(fakePad({ axes: [0.9, -0.8, 0.5, 0.1], down: [PAD.A, PAD.X], values: { [PAD.RT]: 0.9, [PAD.LT]: 0.2 } }), 'foot');
    expect([...f.keys].sort()).toEqual(['KeyD', 'KeyE', 'KeyW', 'Space']);
    expect(f.buttons).toBe(1);
    expect(f.lookX).toBeGreaterThan(0.05);
    expect(f.lookY).toBe(0); // inside the dead zone
    expect(mapPad(fakePad({ down: [PAD.B, PAD.Y, PAD.LS, PAD.START, PAD.BACK], values: { [PAD.LT]: 1 } }), 'foot')).toMatchObject({ buttons: 4 });
    expect([...mapPad(fakePad({ down: [PAD.B, PAD.Y, PAD.LS, PAD.START, PAD.BACK] }), 'foot').keys].sort()).toEqual(['Escape', 'KeyC', 'KeyF', 'ShiftLeft', 'Tab']);
  });

  it('bumpers cycle tools once per press', () => {
    const p1 = fakePad({ down: [PAD.RB] });
    const first = mapPad(p1, 'foot', []);
    expect(first.wheel).toBe(1);
    expect(mapPad(p1, 'foot', padDown(p1)).wheel).toBe(0); // still held
    expect(mapPad(fakePad({ down: [PAD.LB] }), 'foot', padDown(fakePad())).wheel).toBe(-1);
  });

  it('driving: triggers throttle / brake, stick steers, bumpers move the bucket', () => {
    const f = mapPad(fakePad({ axes: [-0.7, 0.9, 0, 0], down: [PAD.RB, PAD.A], values: { [PAD.RT]: 0.8 } }), 'drive');
    expect([...f.keys].sort()).toEqual(['KeyA', 'KeyR', 'KeyW', 'Space']);
    expect(f.buttons).toBe(0);
    expect([...mapPad(fakePad({ down: [PAD.X, PAD.Y, PAD.LB], values: { [PAD.LT]: 1 } }), 'drive').keys].sort()).toEqual(['KeyE', 'KeyF', 'KeyS', 'KeyV']);
  });

  it('menus: d-pad / stick moves focus on edges, A activates, B backs out', () => {
    const prev = padDown(fakePad());
    const f = mapPad(fakePad({ down: [PAD.DOWN, PAD.A] }), 'menu', prev);
    expect(f.nav).toEqual(['down']);
    expect(f.activate).toBe(true);
    expect(mapPad(fakePad({ axes: [0, -0.9, 0, 0] }), 'menu', prev).nav).toEqual(['up']);
    expect([...mapPad(fakePad({ down: [PAD.B] }), 'menu', prev).keys]).toEqual(['Escape']);
  });

  it('GamepadInput presses / releases keys, owns only its mouse bits, scales look by dt', () => {
    const sink: InputSink = { keys: new Set(), mouseDX: 0, mouseDY: 0, buttons: 2, buttonsPressed: 0, wheel: 0, invertY: true };
    const log: string[] = [];
    let pad: PadLike | null = fakePad({ axes: [0, -1, 1, 1], values: { [PAD.RT]: 1 } });
    const gi = new GamepadInput(sink, () => [null, pad], (code, down) => { log.push((down ? '+' : '-') + code); if (down) sink.keys.add(code); else sink.keys.delete(code); });
    gi.poll(1 / 60, 'foot');
    expect(gi.active).toBe(1);
    expect(log).toEqual(['+KeyW']);
    expect(sink.buttons).toBe(3); // middle mouse (2) untouched, LMB from RT
    expect(sink.buttonsPressed).toBe(1);
    expect(sink.mouseDX).toBeGreaterThan(10);
    expect(sink.mouseDY).toBeLessThan(-5); // inverted
    gi.poll(1 / 60, 'foot');
    expect(log).toEqual(['+KeyW']); // held, not re-pressed
    pad = fakePad();
    gi.poll(1 / 60, 'foot');
    expect(log).toEqual(['+KeyW', '-KeyW']);
    expect(sink.buttons).toBe(2);
    pad = fakePad({ down: [PAD.START] });
    gi.poll(1 / 60, 'foot');
    pad = null; // unplugged: everything let go
    gi.poll(1 / 60, 'foot');
    expect(log.slice(-2)).toEqual(['+Escape', '-Escape']);
    expect(gi.active).toBe(-1);
  });
});
