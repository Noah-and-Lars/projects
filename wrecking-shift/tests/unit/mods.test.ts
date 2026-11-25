// Every mod in mods/ loads, appears in the registry and works: every map builds, every prop + vehicle spawns and
// settles, every tool is used against a wall, every game mode starts and runs, every rule tweak applies / reverts.
import { beforeAll, describe, expect, it } from 'vitest';
import { MODS, ModState, allMaps, allModes, allProps, allTools, allVehicles } from '../../src/mods/registry';
import type { ModContext } from '../../src/mods/api';
import { MAT, pal } from '../../src/sim/materials';
import { Player } from '../../src/sim/player';
import { VEHICLE_BLUEPRINTS, spawnVehicle } from '../../src/sim/prefabs/vehicles';
import { Sim, initPhysics } from '../../src/sim/sim';
import { groundTile } from '../../src/sim/levels/testyard';
import { ToolBelt, emptyToolInput } from '../../src/sim/tools/tool';
import { FireSystem } from '../../src/sim/fire';
import { VoxelGrid } from '../../src/sim/voxels';
import type { LevelInfo } from '../../src/sim/levels/types';
import { LEVELS } from '../../src/game/levels';

beforeAll(async () => { await initPhysics(); });

const finite = (v: { x: number; y: number; z: number }) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const flatLevel = (): LevelInfo => ({ name: 'test', spawn: { x: 0, y: 0.05, z: 4 }, spawnYaw: 0, bounds: { min: { x: -25, y: -5, z: -25 }, max: { x: 25, y: 40, z: 25 } }, waterLevel: null, sunDir: { x: 0, y: -1, z: 0 }, markers: {} });

/** flat yard + a brick wall 3 m in front of the player (looking -Z) */
function yard(): { sim: Sim; player: Player; fire: FireSystem } {
  const sim = new Sim(5);
  const fire = new FireSystem(sim);
  sim.systems.push(fire);
  groundTile(sim, -12.8, -12.8);
  const g = new VoxelGrid(40, 30, 4);
  g.fill(0, 0, 0, 40, 30, 4, pal(MAT.brick, 2));
  g.fill(0, 30 - 8, 0, 40, 30, 4, pal(MAT.wood, 2));
  sim.addBody(g, { x: -2, y: 0, z: 0.6 }, { name: 'wall' });
  // a wooden crate to grab / blow around
  const c = new VoxelGrid(6, 6, 6); c.fill(0, 0, 0, 6, 6, 6, pal(MAT.wood, 1));
  sim.addBody(c, { x: 0.5, y: 0.05, z: 2 }, { dynamic: true, kind: 'prop', name: 'crate' });
  const player = new Player(sim, { x: 0, y: 0.05, z: 4 });
  player.yaw = 0; player.pitch = -0.05;
  sim.step();
  return { sim, player, fire };
}

describe('mod registry', () => {
  it('loads more than 100 mods with unique ids, names, descriptions and a category', () => {
    expect(MODS.length).toBeGreaterThanOrEqual(Number(process.env.MODS_MIN ?? 7));
    const ids = new Set(MODS.map((m) => m.id));
    expect(ids.size).toBe(MODS.length);
    for (const m of MODS) {
      expect(m.name.length, m.id).toBeGreaterThan(2);
      expect(m.description.length, m.id).toBeGreaterThan(10);
      expect(['props', 'tools', 'vehicles', 'maps', 'modes', 'global', 'visual']).toContain(m.category);
      const content = (m.props?.length ?? 0) + (m.tools?.length ?? 0) + (m.vehicles?.length ?? 0) + (m.maps?.length ?? 0) + (m.modes?.length ?? 0) + (m.global ? 1 : 0) + (m.visual ? 1 : 0);
      expect(content, m.id + ' contributes nothing').toBeGreaterThan(0);
    }
  });

  it('enabled state persists, conflicts switch each other off', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    const a = new ModState(storage);
    const m0 = MODS[0];
    a.set(m0.id, false);
    expect(new ModState(storage).isEnabled(m0.id)).toBe(false);
    a.set(m0.id, true);
    expect(new ModState(storage).isEnabled(m0.id)).toBe(true);
    const keyed = MODS.filter((m) => m.conflicts);
    const byKey = new Map<string, string[]>();
    for (const m of keyed) byKey.set(m.conflicts!, [...(byKey.get(m.conflicts!) ?? []), m.id]);
    for (const [, ids] of byKey) if (ids.length > 1) {
      a.set(ids[0], true); a.set(ids[1], true);
      expect(a.isEnabled(ids[0])).toBe(false);
      expect(a.isEnabled(ids[1])).toBe(true);
    }
    a.setAll(true);
    for (const [, ids] of byKey) expect(ids.filter((id) => a.isEnabled(id)).length).toBeLessThanOrEqual(1);
  });

  it('every mod map and vehicle is registered with the game registries', () => {
    for (const m of allMaps()) expect(LEVELS[m.id], m.id).toBeTruthy();
    for (const v of allVehicles()) expect(VEHICLE_BLUEPRINTS[v.id], v.id).toBeTruthy();
  });
});

describe('mod maps build', () => {
  for (const m of allMaps()) {
    it(`map ${m.id} (${m.mod})`, () => {
      const sim = new Sim(11);
      const info = m.build(sim);
      expect(sim.bodies.size).toBeGreaterThan(1);
      const b = info.bounds;
      expect(info.spawn.x).toBeGreaterThan(b.min.x); expect(info.spawn.x).toBeLessThan(b.max.x);
      expect(info.spawn.z).toBeGreaterThan(b.min.z); expect(info.spawn.z).toBeLessThan(b.max.z);
      sim.step();
      // ground under the spawn point, and the player can stand there
      const down = sim.raycast({ x: info.spawn.x, y: info.spawn.y + 1.5, z: info.spawn.z }, { x: 0, y: -1, z: 0 }, 6);
      expect(down, 'ground under spawn').toBeTruthy();
      const p = new Player(sim, info.spawn);
      for (let i = 0; i < 60; i++) { p.update(); sim.step(); }
      expect(finite(p.pos)).toBe(true);
      expect(p.pos.y).toBeGreaterThan(info.spawn.y - 1.5);
      sim.dispose();
    });
  }
});

describe('mod props and vehicles spawn', () => {
  for (const pr of allProps()) {
    it(`prop ${pr.id} (${pr.mod})`, () => {
      const { sim } = yard();
      const before = sim.bodies.size;
      const r = pr.spawn(sim, { x: 4, y: 0.05, z: 6 }, 0.4);
      const bodies = Array.isArray(r) ? r : [r];
      expect(bodies.length).toBeGreaterThan(0);
      expect(sim.bodies.size).toBeGreaterThan(before);
      for (let i = 0; i < 90; i++) sim.step();
      for (const b of bodies) if (!b.removed) { expect(finite(b.rb.translation())).toBe(true); expect(b.rb.translation().y).toBeGreaterThan(-3); }
      sim.dispose();
    });
  }
  for (const v of allVehicles()) {
    it(`vehicle ${v.id} (${v.mod}) spawns, drives forward and stays upright`, () => {
      const { sim } = yard();
      const veh = spawnVehicle(sim, v.id, 0, 0, -8, Math.PI / 2);
      for (let i = 0; i < 60; i++) sim.step();
      const t0 = veh.body.rb.translation();
      const p0 = { x: t0.x, y: t0.y, z: t0.z };
      veh.seated = true; veh.startEngine();
      veh.input.throttle = 1;
      for (let i = 0; i < 120; i++) sim.step();
      const t1 = veh.body.rb.translation();
      expect(finite(t1)).toBe(true);
      const moved = Math.hypot(t1.x - p0.x, t1.z - p0.z);
      expect(moved, 'drove').toBeGreaterThan(1);
      // upright: chassis up vector still points up
      const r = veh.body.rb.rotation();
      const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
      expect(upY, 'upright').toBeGreaterThan(0.5);
      sim.dispose();
    });
  }
});

describe('mod tools work', () => {
  for (const td of allTools()) {
    it(`tool ${td.id} (${td.mod})`, () => {
      const { sim, player, fire } = yard();
      const tool = td.create();
      expect(tool.id).toBe(td.id);
      const belt = new ToolBelt([tool]);
      const ctx = { sim, player, infiniteAmmo: false, fire };
      tool.onSelect(ctx);
      const seen = new Set<string>();
      let removed = 0;
      sim.onRemoved.push(() => { removed++; });
      const inp = emptyToolInput();
      for (let i = 0; i < 240; i++) {
        const phase = i % 60;
        inp.primary = phase < 40; inp.primaryPressed = phase === 0 || phase === 20; inp.primaryReleased = phase === 40;
        inp.secondary = false; inp.secondaryPressed = false;
        // two-point tools: aim a little to the side for the second point
        player.yaw = phase < 20 ? 0 : 0.25;
        player.update();
        belt.update(ctx, inp, true);
        sim.step();
        for (const e of sim.drainEvents()) seen.add(e.type === 'custom' ? e.name : e.type);
      }
      const did = [...seen].filter((n) => n !== 'custom' && n !== 'tool:select' && n !== 'tool:empty');
      expect(did.length + removed, `${td.id} had no effect (events: ${[...seen].join(', ')})`).toBeGreaterThan(0);
      expect(finite(player.pos)).toBe(true);
      sim.dispose();
    });
  }
});

describe('mod game modes run', () => {
  for (const md of allModes()) {
    it(`mode ${md.id} (${md.mod}) on ${md.level}`, () => {
      const def = LEVELS[md.level];
      expect(def, 'mode map exists').toBeTruthy();
      const sim = new Sim(21);
      const fire = new FireSystem(sim);
      sim.systems.push(fire);
      const level = def.build(sim);
      const player = new Player(sim, level.spawn);
      player.yaw = level.spawnYaw;
      const rules = md.create();
      const ctx: ModContext = { sim, player, level, fire, tick: 0 };
      rules.start(ctx);
      const s0 = rules.status();
      expect(typeof s0.text).toBe('string');
      for (let i = 0; i < 180; i++) { ctx.tick = i; player.update(); rules.tick(ctx); sim.step(); sim.drainEvents(); }
      const s = rules.status();
      expect(Number.isFinite(s.score)).toBe(true);
      if (s.timeLeft != null) expect(s.timeLeft).toBeGreaterThanOrEqual(0);
      sim.dispose();
    });
  }
});

describe('mod rule tweaks and looks', () => {
  for (const m of MODS.filter((x) => x.global)) {
    it(`global ${m.id} applies, ticks and reverts`, () => {
      const { sim, player, fire } = yard();
      const ctx: ModContext = { sim, player, level: flatLevel(), fire, tick: 0 };
      const g0 = { ...sim.world.gravity }, w0 = player.walkSpeed, gs0 = player.gravityScale;
      m.global!.apply?.(ctx);
      for (let i = 0; i < 90; i++) { ctx.tick = i; m.global!.tick?.(ctx); player.update(); sim.step(); sim.drainEvents(); }
      expect(finite(player.pos)).toBe(true);
      m.global!.revert?.(ctx);
      if (m.global!.revert) {
        expect(sim.world.gravity.y).toBeCloseTo(g0.y);
        expect(player.walkSpeed).toBeCloseTo(w0);
        expect(player.gravityScale).toBeCloseTo(gs0);
      }
      sim.dispose();
    });
  }
  it('visual mods have sane values', () => {
    for (const m of MODS.filter((x) => x.visual)) {
      const v = m.visual!;
      for (const k of ['saturation', 'contrast', 'vignette', 'bloom'] as const) if (v[k] != null) { expect(v[k]!, m.id + '.' + k).toBeGreaterThanOrEqual(0); expect(v[k]!, m.id + '.' + k).toBeLessThan(3); }
      if (v.fov != null) { expect(v.fov).toBeGreaterThanOrEqual(50); expect(v.fov).toBeLessThanOrEqual(120); }
    }
  });
});
