import { beforeAll, describe, expect, it } from 'vitest';
import { FireSystem } from '../../src/sim/fire';
import { MAT, matOf, pal } from '../../src/sim/materials';
import { Player } from '../../src/sim/player';
import { Sim, initPhysics } from '../../src/sim/sim';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

function world(seed = 1) {
  const sim = new Sim(seed);
  const fl = new VoxelGrid(128, 2, 128);
  fl.fill(0, 0, 0, 128, 2, 128, pal(MAT.bedrock));
  sim.addBody(fl, { x: -6.4, y: -0.2, z: -6.4 });
  const fire = new FireSystem(sim);
  sim.systems.push(fire);
  return { sim, fire };
}

function wall(sim: Sim, mat: number, w = 30, h = 25, d = 2, at = { x: 0, y: 0, z: 0 }) {
  const g = new VoxelGrid(w, h, d);
  g.fill(0, 0, 0, w, h, d, pal(mat));
  return sim.addBody(g, at);
}

function run(sim: Sim, ticks: number, each?: (t: number) => void) {
  for (let i = 0; i < ticks; i++) { sim.step(); sim.drainEvents(); each?.(i); }
}

describe('fire', () => {
  it('ignition respects flammability', () => {
    const { sim, fire } = world();
    const c = wall(sim, MAT.concrete, 10, 10, 2);
    const w = wall(sim, MAT.wood, 10, 10, 2, { x: 2, y: 0, z: 0 });
    expect(fire.ignite(c, 5, 5, 0)).toBe(false);
    expect(fire.igniteNear({ x: 0.5, y: 0.5, z: 0.1 }, 0.4, 20)).toBe(0);
    expect(fire.count()).toBe(0);
    expect(fire.ignite(w, 5, 5, 0)).toBe(true);
    expect(fire.ignite(w, 5, 5, 0)).toBe(true); // already burning
    expect(fire.count()).toBe(1);
    // concrete never catches even next to a big wood fire
    fire.igniteNear({ x: 2.5, y: 0.5, z: 0.1 }, 0.5, 40);
    run(sim, 600);
    for (const f of fire.list()) expect(f.body).not.toBe(c);
    expect(c.grid.count).toBe(200);
    for (let i = 0; i < c.grid.data.length; i++) expect(matOf(c.grid.data[i])).toBe(MAT.concrete);
  });

  it('heat() ignites wood but not concrete', () => {
    const { sim, fire } = world();
    wall(sim, MAT.concrete, 10, 10, 2);
    const w = wall(sim, MAT.wood, 10, 10, 2, { x: 2, y: 0, z: 0 });
    for (let i = 0; i < 60; i++) { fire.heat({ x: 0.5, y: 0.5, z: -0.02 }, 0.1); sim.step(); }
    expect(fire.count()).toBe(0);
    let t = 0;
    while (fire.count() === 0 && t < 120) { fire.heat({ x: 2.5, y: 0.5, z: -0.02 }, 0.08); sim.step(); t++; }
    expect(fire.count()).toBeGreaterThan(0);
    expect(t).toBeLessThan(60); // blowtorch-like heating lights wood in < 1 s
    expect(fire.list()[0].body).toBe(w);
  });

  it('spreads over a wooden wall (growth, then burn-out)', () => {
    const { sim, fire } = world(3);
    const w = wall(sim, MAT.wood);
    fire.ignite(w, 15, 0, 0);
    const counts: number[] = [];
    run(sim, 60 * 40, (i) => { if (i % 30 === 0) counts.push(fire.count()); });
    // growth phase (first 5 s) is monotonic
    for (let i = 1; i < 10; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    // not instant: after 1 s still small, after ~8 s engulfed
    expect(counts[2]).toBeLessThan(100);
    expect(Math.max(...counts)).toBeGreaterThan(800);
    // burns out completely
    expect(counts[counts.length - 1]).toBe(0);
    expect(fire.stats.burntOut).toBeGreaterThan(1000);
  });

  it('jumps small air gaps and spreads to a separate nearby body', () => {
    const { sim, fire } = world(13);
    // two wooden walls (separate bodies) with a 1.5-voxel gap, plus a wall 1 m away that must not catch
    const a = wall(sim, MAT.wood, 10, 20, 2, { x: 0, y: 0, z: 0 });
    const b = wall(sim, MAT.wood, 10, 20, 2, { x: 0, y: 0, z: 0.35 });
    const far = wall(sim, MAT.wood, 10, 20, 2, { x: 0, y: 0, z: 1.5 });
    for (let x = 0; x < 10; x += 2) fire.ignite(a, x, 0, 1);
    let hitB = -1;
    run(sim, 60 * 25, (t) => { if (hitB < 0 && fire.countOn(b) > 0) hitB = t; });
    expect(hitB).toBeGreaterThan(0);
    expect(far.grid.count).toBe(400);
  });

  it('respects the global cap', () => {
    const { sim, fire } = world(4);
    fire.maxFires = 300;
    const w = wall(sim, MAT.wood, 60, 30, 3);
    fire.igniteNear({ x: 3, y: 1.5, z: 0 }, 1.0, 500);
    let peak = 0;
    run(sim, 600, () => { peak = Math.max(peak, fire.count()); });
    expect(peak).toBe(300);
    expect(w.grid.count).toBeGreaterThan(0);
  });

  it('extinguish removes fires and wets the area', () => {
    const { sim, fire } = world(5);
    wall(sim, MAT.wood, 30, 25, 2);
    fire.igniteNear({ x: 1.5, y: 1, z: 0 }, 0.6, 60);
    run(sim, 120);
    const n0 = fire.count();
    expect(n0).toBeGreaterThan(20);
    const ev: string[] = [];
    const k = fire.extinguish({ x: 1.5, y: 1.25, z: 0.1 }, 3);
    for (const e of sim.drainEvents()) if (e.type === 'custom') ev.push(e.name);
    expect(k).toBe(n0);
    expect(fire.count()).toBe(0);
    expect(ev).toContain('fire:out');
    // wet: cannot re-ignite immediately, can after a few seconds
    expect(fire.igniteNear({ x: 1.5, y: 1, z: 0 }, 0.5, 10)).toBe(0);
    run(sim, 200);
    expect(fire.igniteNear({ x: 1.5, y: 1, z: 0 }, 0.5, 10)).toBeGreaterThan(0);
  });

  it('fires go out under water', () => {
    const { sim, fire } = world(6);
    wall(sim, MAT.wood, 30, 25, 2);
    fire.waterLevel = 1.0;
    expect(fire.igniteNear({ x: 1.5, y: 0.5, z: 0 }, 0.3, 10)).toBe(0);
    fire.igniteNear({ x: 1.5, y: 1.8, z: 0 }, 0.4, 30);
    run(sim, 600);
    for (const p of fire.positions(1000)) expect(p.y).toBeGreaterThanOrEqual(1.0);
  });

  it('fires follow a split (burning plank cut in two)', () => {
    const { sim, fire } = world(7);
    const g = new VoxelGrid(40, 3, 4);
    g.fill(0, 0, 0, 40, 3, 4, pal(MAT.wood));
    const plank = sim.addBody(g, { x: 0, y: 0.3, z: 0 }, { dynamic: true });
    run(sim, 30);
    for (let x = 0; x < 40; x += 2) fire.ignite(plank, x, 2, 1);
    expect(fire.count()).toBe(20);
    for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++) sim.removeVoxel(plank, 20, y, z);
    sim.step();
    const bodies = new Set(fire.list().map((f) => f.body));
    expect(bodies.size).toBe(2);
    for (const b of bodies) expect(b.removed).toBe(false);
    run(sim, 30);
    for (const f of fire.list()) expect(f.body.grid.get(f.x, f.y, f.z)).not.toBe(0);
    // world positions are on solid voxels of the moving pieces
    const ps = fire.positions(100);
    expect(ps.length).toBe(fire.count());
    for (const p of ps) expect(sim.sample(p)).not.toBeNull();
  });

  it('a burning wooden post burns through and the slab on it falls', () => {
    const { sim, fire } = world(8);
    const g = new VoxelGrid(20, 28, 20);
    g.fill(8, 0, 8, 12, 25, 12, pal(MAT.wood));
    g.fill(0, 25, 0, 20, 28, 20, pal(MAT.concrete));
    const body = sim.addBody(g, { x: -1, y: 0, z: -1 });
    fire.igniteNear({ x: 0, y: 1.0, z: 0 }, 0.35, 40);
    expect(fire.count()).toBeGreaterThan(10);
    let fell = -1;
    for (let t = 0; t < 60 * 60 && fell < 0; t++) {
      sim.step(); sim.drainEvents();
      if (t % 30 === 0) {
        for (const b of sim.bodies.values()) {
          if (b.dynamic && b.grid.count >= 20 * 20 * 3 && b.rb.translation().y < 2.0) fell = t;
        }
      }
    }
    expect(fell).toBeGreaterThan(0);
    expect(fell / 60).toBeLessThan(60);
    expect(body.grid.count).toBeLessThan(4 * 4 * 25);
  });

  it('explosions ignite flammable material around them', () => {
    const { sim, fire } = world(9);
    wall(sim, MAT.wood, 30, 25, 3);
    sim.explode({ x: 1.5, y: 1.2, z: -0.3 }, 1);
    expect(fire.count()).toBeGreaterThan(0);
  });

  it('standing in fire hurts the player', () => {
    const { sim, fire } = world(10);
    const g = new VoxelGrid(20, 1, 20);
    g.fill(0, 0, 0, 20, 1, 20, pal(MAT.wood));
    sim.addBody(g, { x: -1, y: 0, z: -1 });
    const pl = new Player(sim, { x: 0, y: 0.1, z: 0 });
    run(sim, 10);
    expect(pl.health).toBe(1);
    fire.igniteNear({ x: 0, y: 0.05, z: 0 }, 0.5, 30);
    run(sim, 60);
    expect(pl.health).toBeLessThan(1);
    expect(pl.lastHurt).toBe('fire');
  });

  it('is deterministic', () => {
    const go = () => {
      const { sim, fire } = world(11);
      const w = wall(sim, MAT.wood, 40, 25, 2);
      wall(sim, MAT.crate, 10, 10, 10, { x: 0.5, y: 0, z: 0.3 });
      fire.ignite(w, 5, 0, 0);
      const c: number[] = [];
      run(sim, 1200, (i) => { if (i % 20 === 0) c.push(fire.count()); });
      return c.join(',');
    };
    expect(go()).toBe(go());
  });

  it('performance: 1200 fires cost < 1 ms per tick', () => {
    const { sim, fire } = world(12);
    // a wooden "barn": 4 walls + floor, plenty of fuel
    const g = new VoxelGrid(100, 40, 60);
    g.fill(0, 0, 0, 100, 2, 60, pal(MAT.wood));
    g.fill(0, 2, 0, 100, 40, 2, pal(MAT.wood));
    g.fill(0, 2, 58, 100, 40, 60, pal(MAT.wood));
    g.fill(0, 2, 0, 2, 40, 60, pal(MAT.wood));
    g.fill(98, 2, 0, 100, 40, 60, pal(MAT.wood));
    const b = sim.addBody(g, { x: -5, y: 0, z: -3 });
    for (let x = 2; x < 100; x += 5) for (let z = 2; z < 58; z += 5) fire.ignite(b, x, 1, z);
    const upd = fire.update.bind(fire);
    let ms = 0, ticks = 0, sum = 0;
    fire.update = (s) => {
      const t0 = performance.now();
      upd(s);
      if (fire.count() >= 1000) { ms += performance.now() - t0; ticks++; sum += fire.count(); }
    };
    run(sim, 900);
    const avg = ms / ticks;
    console.log(`fire perf: ${ticks} ticks with avg ${(sum / ticks).toFixed(0)} fires, ${avg.toFixed(3)} ms/tick`);
    expect(ticks).toBeGreaterThan(300);
    expect(avg).toBeLessThan(1);
  });
});
