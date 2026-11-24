import { beforeAll, describe, expect, it } from 'vitest';
import type { VoxelBody } from '../../src/sim/body';
import type { FireApi } from '../../src/sim/fire';
import { FireSystem } from '../../src/sim/fire';
import { MAT, SHADE_PAINT, pal } from '../../src/sim/materials';
import { Player } from '../../src/sim/player';
import { Sim, initPhysics, type SimEvent } from '../../src/sim/sim';
import { Blowtorch, Bomb, Cable, Extinguisher, LeafBlower, Nitro, PipeBomb, Pistol, Plank, Rifle, RocketLauncher, Shotgun, Sledge, Spray, createBelt } from '../../src/sim/tools';
import { emptyToolInput, type Tool, type ToolBelt, type ToolContext, type ToolInput } from '../../src/sim/tools/tool';
import type { V3 } from '../../src/sim/vec';
import { VoxelGrid } from '../../src/sim/voxels';

beforeAll(async () => { await initPhysics(); });

interface World { sim: Sim; player: Player; ctx: ToolContext; belt: ToolBelt; events: SimEvent[] }

function world(fire?: FireApi): World {
  const sim = new Sim(5);
  const g = new VoxelGrid(200, 4, 200);
  g.fill(0, 0, 0, 200, 4, 200, pal(MAT.bedrock));
  sim.addBody(g, { x: -10, y: -0.4, z: -10 }, { name: 'ground' });
  const player = new Player(sim, { x: 0, y: 0.02, z: 0 });
  const ctx: ToolContext = { sim, player, infiniteAmmo: false, fire: fire ?? new FireSystem(sim) };
  return { sim, player, ctx, belt: createBelt(), events: [] };
}

/** wall of one material: x in [x0, x0+w), z in [z, z+t), height h (metres via voxels) */
function wall(sim: Sim, mat: number, x0: number, z: number, w = 30, h = 30, t = 4): VoxelBody {
  const g = new VoxelGrid(w, h, t);
  g.fill(0, 0, 0, w, h, t, pal(mat, 2));
  return sim.addBody(g, { x: x0, y: 0, z }, { name: 'wall' });
}

function crateBody(sim: Sim, p: V3, n = 6, mat: number = MAT.crate): VoxelBody {
  const g = new VoxelGrid(n, n, n);
  g.fill(0, 0, 0, n, n, n, pal(mat, 1));
  return sim.addBody(g, p, { dynamic: true, kind: 'prop', name: 'crate' });
}

function aimAt(w: World, target: V3): void {
  const e = w.player.eye;
  const dx = target.x - e.x, dy = target.y - e.y, dz = target.z - e.z;
  w.player.yaw = Math.atan2(-dx, -dz);
  w.player.pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
}

/** run ticks with a fixed input (edge flags only on the first tick) */
function run(w: World, n: number, inp: Partial<ToolInput> = {}, tool?: Tool): void {
  for (let i = 0; i < n; i++) {
    const ti = { ...emptyToolInput(), ...inp };
    if (i > 0) { ti.primaryPressed = false; ti.secondaryPressed = false; ti.primaryReleased = false; ti.scroll = 0; }
    w.player.update();
    if (tool) {
      for (const t of [tool]) { if (t.cooldown > 0) t.cooldown--; if (t.anim > 0) t.anim = Math.max(0, t.anim - 1 / 18); t.tick(w.ctx); }
      tool.update(w.ctx, ti);
    } else w.belt.update(w.ctx, ti);
    w.sim.step();
    w.events.push(...w.sim.drainEvents());
  }
}
const click = (w: World, tool?: Tool) => { run(w, 1, { primary: true, primaryPressed: true }, tool); run(w, tool instanceof Sledge ? 22 : 1, {}, tool); };
const custom = (w: World, name: string) => w.events.filter((e) => e.type === 'custom' && e.name === name);
const solid = (b: VoxelBody) => b.grid.count;

function settle(w: World) { run(w, 10); }

describe('tool hardness rules', () => {
  const cases: [string, () => Tool, number, boolean][] = [
    ['sledge breaks wood', () => new Sledge(), MAT.wood, true],
    ['sledge cannot break brick', () => new Sledge(), MAT.brick, false],
    ['sledge cannot break sheet metal', () => new Sledge(), MAT.sheetmetal, false],
    ['pistol breaks brick', () => new Pistol(), MAT.brick, true],
    ['pistol cannot break concrete (hard)', () => new Pistol(), MAT.concrete, false],
    ['shotgun breaks brick', () => new Shotgun(), MAT.brick, true],
    ['shotgun cannot break steel (hard)', () => new Shotgun(), MAT.steel, false],
    ['pistol cannot break bedrock', () => new Pistol(), MAT.bedrock, false],
    ['rifle breaks brick', () => new Rifle(), MAT.brick, true],
    ['rifle cannot break concrete', () => new Rifle(), MAT.concrete, false],
  ];
  for (const [name, make, mat, breaks] of cases) {
    it(name, () => {
      const w = world();
      const wl = wall(w.sim, mat, -1.5, -2.4);
      settle(w);
      aimAt(w, { x: 0, y: 1.4, z: -2.4 });
      const before = solid(wl);
      const t = make();
      click(w, t);
      if (breaks) expect(solid(wl)).toBeLessThan(before);
      else expect(solid(wl)).toBe(before);
    });
  }

  it('sledge clangs on brick', () => {
    const w = world();
    wall(w.sim, MAT.brick, -1.5, -2);
    settle(w);
    aimAt(w, { x: 0, y: 1.4, z: -2 });
    click(w, new Sledge());
    expect(custom(w, 'tool:clang').length).toBe(1);
    expect(custom(w, 'tool:swing').length).toBe(1);
  });

  it('explosives break hard materials, not bedrock', () => {
    const w = world();
    const c = wall(w.sim, MAT.concrete, -1.5, -2.4);
    const before = solid(c);
    w.sim.explode({ x: 0, y: 1.4, z: -2.4 }, 1.0);
    expect(solid(c)).toBeLessThan(before - 50);
  });
});

describe('ammo', () => {
  it('pistol consumes rounds and reports empty', () => {
    const w = world();
    const p = new Pistol();
    expect(p.ammo).toBe(18);
    expect(p.maxAmmo).toBe(18);
    for (let i = 0; i < 20; i++) { click(w, p); run(w, 16, {}, p); }
    expect(p.ammo).toBe(0);
    expect(custom(w, 'tool:shot').length).toBe(18);
    expect(custom(w, 'tool:empty').length).toBeGreaterThan(0);
    p.maxAmmo = 30; p.refill();
    expect(p.ammo).toBe(30);
  });
  it('infinite ammo never consumes', () => {
    const w = world();
    w.ctx.infiniteAmmo = true;
    const s = new Shotgun();
    click(w, s);
    expect(s.ammo).toBe(12);
  });
  it('shotgun fires 8 pellets per shell', () => {
    const w = world();
    wall(w.sim, MAT.wood, -2, -3, 40, 30, 12);
    settle(w);
    aimAt(w, { x: 0, y: 1.4, z: -3 });
    const s = new Shotgun();
    click(w, s);
    expect(s.ammo).toBe(11);
    const shot = custom(w, 'tool:shot')[0] as any;
    expect(shot.data.hits.length).toBe(8);
    expect(w.events.filter((e) => e.type === 'carve').length).toBeGreaterThanOrEqual(4);
  });
  it('blowtorch fuel is in ticks (20 s) and burns while held', () => {
    const w = world();
    const b = new Blowtorch();
    expect(b.ammo).toBe(1200);
    expect(b.ammoLabel).toBe('20.0s');
    run(w, 60, { primary: true }, b);
    expect(b.ammo).toBe(1140);
  });
});

describe('utility tools', () => {
  it('spray paints surface voxels without removing any', () => {
    const w = world();
    const wl = wall(w.sim, MAT.brick, -1.5, -1.6);
    settle(w);
    aimAt(w, { x: 0, y: 1.4, z: -1.6 });
    const before = solid(wl);
    run(w, 10, { primary: true }, new Spray());
    let painted = 0;
    for (const v of wl.grid.data) if (v && (v & 7) === SHADE_PAINT) painted++;
    expect(painted).toBeGreaterThan(8);
    expect(solid(wl)).toBe(before);
    expect(custom(w, 'tool:spray').length).toBeGreaterThan(0);
  });

  it('extinguisher calls fire.extinguish and emits foam', () => {
    const calls: V3[] = [];
    const fire: FireApi = {
      ignite: () => false, igniteNear: () => 0, heat: () => {}, count: () => 0, positions: () => [],
      extinguish: (p) => { calls.push(p); return 1; },
    };
    const w = world(fire);
    wall(w.sim, MAT.wood, -1.5, -2);
    settle(w);
    aimAt(w, { x: 0, y: 1.2, z: -2 });
    const e = new Extinguisher();
    run(w, 30, { primary: true }, e);
    expect(calls.length).toBeGreaterThan(20);
    expect(e.putOut).toBe(calls.length);
    expect(custom(w, 'tool:foam').length).toBe(10);
  });

  it('blowtorch melts sheet metal and wood but not brick or plaster', () => {
    for (const [mat, melts] of [[MAT.sheetmetal, true], [MAT.wood, true], [MAT.brick, false], [MAT.plaster, false]] as [number, boolean][]) {
      const heats: number[] = [];
      const fire: FireApi = {
        ignite: () => false, igniteNear: () => 0, heat: (_p, a) => { heats.push(a); }, count: () => 0, positions: () => [], extinguish: () => 0,
      };
      const w = world(fire);
      const wl = wall(w.sim, mat, -1.5, -1.2, 30, 30, 1);
      settle(w);
      aimAt(w, { x: 0, y: 1.4, z: -1.2 });
      const before = solid(wl);
      const b = new Blowtorch();
      run(w, 90, { primary: true }, b);
      if (melts) {
        expect(solid(wl)).toBeLessThan(before - 4);
        // a small hole, not a crater
        expect(before - solid(wl)).toBeLessThan(30);
        // the torch reaches through: the centre voxel is gone
        expect(w.sim.raycast(w.player.eye, w.player.forward, 1.5)?.body ?? null).not.toBe(wl);
      } else expect(solid(wl)).toBe(before);
      expect(heats.length).toBeGreaterThan(10);
      const torch = custom(w, 'tool:torch');
      expect((torch[0] as any).data.on).toBe(true);
      run(w, 2, {}, b);
      expect((custom(w, 'tool:torch').at(-1) as any).data.on).toBe(false);
    }
  });
});

describe('optional tools', () => {
  it('rifle punches through two thin walls', () => {
    const w = world();
    const a = wall(w.sim, MAT.wood, -1.5, -2, 30, 30, 2);
    const b = wall(w.sim, MAT.brick, -1.5, -4, 30, 30, 2);
    settle(w);
    aimAt(w, { x: 0, y: 1.4, z: -2 });
    const ca = solid(a), cb = solid(b);
    click(w, new Rifle());
    expect(solid(a)).toBeLessThan(ca);
    expect(solid(b)).toBeLessThan(cb);
  });
  it('leaf blower pushes light debris but not heavy blocks', () => {
    const w = world();
    const light = crateBody(w.sim, { x: -0.15, y: 0.01, z: -2.0 }, 3, MAT.wood);
    const heavy = crateBody(w.sim, { x: 1.0, y: 0.01, z: -2.0 }, 8, MAT.concrete);
    settle(w);
    run(w, 30);
    const l0 = light.rb.worldCom(), h0 = heavy.rb.worldCom();
    aimAt(w, l0);
    run(w, 30, { primary: true }, new LeafBlower());
    const l1 = light.rb.worldCom(), h1 = heavy.rb.worldCom();
    expect(Math.hypot(l1.x - l0.x, l1.z - l0.z)).toBeGreaterThan(0.3);
    expect(Math.hypot(h1.x - h0.x, h1.z - h0.z)).toBeLessThan(0.05);
  });
});

describe('explosives', () => {
  it('pipe bomb: thrown body, 2.5 s fuse, explosion, body removed', () => {
    const w = world();
    const pb = new PipeBomb();
    settle(w);
    w.player.pitch = 0.2;
    click(w, pb);
    expect(pb.ammo).toBe(5);
    expect(pb.live.length).toBe(1);
    const body = pb.live[0].body;
    expect(body.dynamic).toBe(true);
    const v = body.rb.linvel();
    expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(10);
    let booms: V3[] = [];
    w.sim.onExplosion.push((p) => booms.push(p));
    run(w, 140, {}, pb);
    expect(booms.length).toBe(0);
    run(w, 15, {}, pb);
    expect(booms.length).toBe(1);
    expect(body.removed).toBe(true);
    expect(pb.live.length).toBe(0);
    expect(w.events.some((e) => e.type === 'explosion' && Math.abs(e.size - 1.0) < 1e-6)).toBe(true);
    // landed away from the player
    expect(Math.hypot(booms[0].x, booms[0].z)).toBeGreaterThan(4);
  });

  it('bomb sticks to a concrete wall, beeps, explodes after 3 s and breaks hard material', () => {
    const w = world();
    const wl = wall(w.sim, MAT.concrete, -1.5, -2.2, 30, 30, 6);
    settle(w);
    w.player.godMode = true;
    aimAt(w, { x: 0, y: 1.3, z: -2.2 });
    const b = new Bomb();
    click(w, b);
    expect(b.ammo).toBe(5);
    expect(b.live.length).toBe(1);
    const body = b.live[0].body;
    const p0 = body.center();
    const before = solid(wl);
    run(w, 120, {}, b);
    // still stuck where it was placed
    const p1 = body.center();
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z)).toBeLessThan(0.05);
    expect(custom(w, 'tool:beep').length).toBeGreaterThanOrEqual(3);
    run(w, 70, {}, b);
    expect(body.removed).toBe(true);
    expect(solid(wl)).toBeLessThan(before - 200);
  });

  it('rocket flies, hits a wall and leaves a hole', () => {
    const w = world();
    const wl = wall(w.sim, MAT.brick, -1.5, -10, 30, 30, 4);
    settle(w);
    w.player.godMode = true;
    aimAt(w, { x: 0, y: 1.5, z: -10 });
    const r = new RocketLauncher();
    const before = solid(wl);
    click(w, r);
    expect(r.ammo).toBe(5);
    expect(r.projectiles.length).toBe(1);
    run(w, 5, {}, r);
    const p = r.projectiles[0].pos;
    expect(p.z).toBeLessThan(-2);
    run(w, 30, {}, r);
    expect(r.projectiles.length).toBe(0);
    expect(w.events.some((e) => e.type === 'explosion')).toBe(true);
    expect(solid(wl)).toBeLessThan(before - 300);
    // the hole is where we aimed (no tunnelling through the wall)
    const ex = w.events.find((e) => e.type === 'explosion') as any;
    expect(ex.pos.z).toBeGreaterThan(-10.2);
  });

  it('rocket never tunnels through a 1-voxel sheet', () => {
    const w = world();
    const wl = wall(w.sim, MAT.sheetmetal, -1.5, -20, 30, 30, 1);
    settle(w);
    w.player.godMode = true;
    aimAt(w, { x: 0, y: 1.5, z: -20 });
    const r = new RocketLauncher();
    click(w, r);
    run(w, 60, {}, r);
    const ex = w.events.find((e) => e.type === 'explosion') as any;
    expect(ex).toBeTruthy();
    expect(Math.abs(ex.pos.z + 20)).toBeLessThan(0.2);
    expect(solid(wl)).toBeLessThan(900);
  });

  it('nitro sticks and goes off when shot', () => {
    const w = world();
    wall(w.sim, MAT.concrete, -1.5, -2.2, 30, 30, 4);
    settle(w);
    w.player.godMode = true;
    aimAt(w, { x: 0.4, y: 1.0, z: -2.2 });
    const n = new Nitro();
    click(w, n);
    expect(n.ammo).toBe(3);
    const body = n.placed[0].body;
    expect(body.tags.has('explosive')).toBe(true);
    run(w, 60, {}, n);
    expect(body.removed).toBe(false);
    // step back and shoot it
    w.player.teleport({ x: 0, y: 0.02, z: 4 });
    settle(w);
    aimAt(w, body.center());
    let booms = 0;
    w.sim.onExplosion.push(() => booms++);
    click(w, new Pistol());
    run(w, 20, {}, n);
    expect(body.removed).toBe(true);
    expect(booms).toBeGreaterThanOrEqual(1);
  });
});

describe('construction', () => {
  /** two concrete pillars 2 m apart, tops at y = 1.0 */
  function pillars(w: World) {
    const a = wall(w.sim, MAT.concrete, -2.0, -4, 6, 10, 10);
    const b = wall(w.sim, MAT.concrete, 1.4, -4, 6, 10, 10);
    return { a, b };
  }
  function placePlank(w: World, plank: Plank) {
    w.player.teleport({ x: -0.2, y: 0.02, z: -1.2 });
    settle(w);
    aimAt(w, { x: -1.6, y: 1.0, z: -3.5 });
    click(w, plank);
    expect(plank.first).not.toBeNull();
    expect(plank.preview).not.toBeNull();
    aimAt(w, { x: 1.8, y: 1.0, z: -3.5 });
    run(w, 1, {}, plank);
    expect(plank.preview!.valid).toBe(true);
    expect(plank.preview!.len).toBeGreaterThan(3);
    click(w, plank);
    expect(plank.ammo).toBe(7);
    expect(plank.planks.length).toBe(1);
    expect(plank.links.length).toBe(2);
    return plank.planks[0];
  }

  it('plank bridge between two static pillars holds a dropped crate', () => {
    const w = world();
    pillars(w);
    const plank = new Plank();
    const body = placePlank(w, plank);
    const y0 = body.center().y;
    expect(y0).toBeGreaterThan(0.95);
    expect(y0).toBeLessThan(1.15);
    // ~65 kg crate dropped onto the middle
    const crate = crateBody(w.sim, { x: -0.1, y: 1.6, z: -3.8 }, 6, MAT.wood);
    expect(crate.mass).toBeGreaterThan(100);
    run(w, 240, {}, plank);
    expect(plank.links.length).toBe(2);
    expect(Math.abs(body.center().y - y0)).toBeLessThan(0.08);
    expect(crate.rb.worldCom().y).toBeGreaterThan(1.1);
  });

  it('plank bridge holds the player walking on it', () => {
    const w = world();
    pillars(w);
    const plank = new Plank();
    const body = placePlank(w, plank);
    const y0 = body.center().y;
    w.player.teleport({ x: 0.1, y: 1.2, z: -3.5 });
    run(w, 180, {}, plank);
    expect(w.player.pos.y).toBeGreaterThan(0.95);
    expect(Math.abs(body.center().y - y0)).toBeLessThan(0.1);
    expect(plank.links.length).toBe(2);
  });

  it('plank falls when the voxels it is glued to are destroyed', () => {
    const w = world();
    const { a, b } = pillars(w);
    const plank = new Plank();
    const body = placePlank(w, plank);
    const ends = plank.links.map((l) => l.partner);
    for (const e of ends) w.sim.removeVoxel(e.body, e.vx, e.vy, e.vz);
    run(w, 20, {}, plank);
    expect(plank.links.length).toBe(0);
    expect(a.removed || b.removed).toBe(false);
    void body;
  });

  it('cable keeps a crate within rope length of a static wall', () => {
    const w = world();
    const wl = wall(w.sim, MAT.concrete, -1.0, -3.0, 20, 20, 4);
    const crate = crateBody(w.sim, { x: -0.3, y: 0.01, z: -1.6 }, 6);
    w.player.teleport({ x: 1.2, y: 0.02, z: 0.5 });
    settle(w);
    const c = new Cable();
    aimAt(w, { x: 0, y: 1.2, z: -3.0 });
    click(w, c);
    expect(c.first?.body).toBe(wl);
    aimAt(w, crate.center());
    click(w, c);
    expect(c.ropes.length).toBe(1);
    expect(c.ammo).toBe(5);
    const len = c.ropes[0].length;
    // yank the crate away hard
    crate.rb.setLinvel({ x: 0, y: 3, z: 12 }, true);
    let maxD = 0;
    for (let i = 0; i < 120; i++) {
      run(w, 1, {}, c);
      const e = c.ends()[0];
      maxD = Math.max(maxD, Math.hypot(e.a.x - e.b.x, e.a.y - e.b.y, e.a.z - e.b.z));
    }
    expect(maxD).toBeLessThan(len + 0.15);
    expect(crate.rb.translation().z).toBeLessThan(-3 + len + 0.5);
    // shooting across the rope cuts it
    const e = c.ends()[0];
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2, z: (e.a.z + e.b.z) / 2 };
    w.player.teleport({ x: 3, y: 0.02, z: mid.z });
    settle(w);
    aimAt(w, mid);
    click(w, new Pistol());
    expect(c.ropes.length).toBe(0);
  });

  it('cable rejects two points on static bodies', () => {
    const w = world();
    wall(w.sim, MAT.concrete, -1.0, -3.0, 20, 20, 4);
    settle(w);
    const c = new Cable();
    aimAt(w, { x: 0, y: 1.2, z: -3.0 });
    click(w, c);
    aimAt(w, { x: 0, y: 0, z: -1 });
    click(w, c);
    expect(c.ropes.length).toBe(0);
    expect(c.ammo).toBe(6);
  });
});

describe('grab', () => {
  it('holds a crate in front of the camera, then throws it without firing the tool', () => {
    const w = world();
    const crate = crateBody(w.sim, { x: -0.3, y: 0.01, z: -1.9 }, 6);
    settle(w);
    aimAt(w, crate.center());
    w.belt.select(w.ctx, w.belt.tools.findIndex((t) => t.id === 'pistol'));
    const startY = crate.rb.worldCom().y;
    run(w, 1, { secondary: true, secondaryPressed: true });
    expect(w.belt.grab.holding).toBe(true);
    w.player.pitch = 0.1;
    run(w, 60, { secondary: true });
    const com = crate.rb.worldCom();
    const eye = w.player.eye, f = w.player.forward, d = w.belt.grab.dist;
    const target = { x: eye.x + f.x * d, y: eye.y + f.y * d, z: eye.z + f.z * d };
    expect(Math.hypot(com.x - target.x, com.y - target.y, com.z - target.z)).toBeLessThan(0.25);
    expect(com.y).toBeGreaterThan(startY + 0.8);
    // wheel pulls it closer
    const d0 = w.belt.grab.dist;
    run(w, 1, { secondary: true, scroll: 1 });
    expect(w.belt.grab.dist).toBeLessThan(d0);
    // throw
    const pistol = w.belt.current;
    run(w, 1, { secondary: true, primary: true, primaryPressed: true });
    expect(w.belt.grab.holding).toBe(false);
    const v = crate.rb.linvel();
    expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(3);
    run(w, 5, { secondary: true, primary: true });
    expect(pistol.ammo).toBe(18);
    expect(custom(w, 'tool:throw').length).toBe(1);
  });

  it('heavy objects are only dragged weakly', () => {
    const w = world();
    const heavy = crateBody(w.sim, { x: -0.4, y: 0.01, z: -2.0 }, 8, MAT.concrete);
    expect(heavy.mass).toBeGreaterThan(250);
    settle(w);
    aimAt(w, heavy.center());
    const y0 = heavy.rb.worldCom().y;
    run(w, 1, { secondary: true, secondaryPressed: true });
    expect(w.belt.grab.heavy).toBe(true);
    run(w, 60, { secondary: true });
    expect(heavy.rb.worldCom().y).toBeLessThan(y0 + 0.2);
  });
});

describe('belt', () => {
  it('selecting emits tool:select and every tool has id / name / hint', () => {
    const w = world();
    const ids = w.belt.tools.map((t) => t.id);
    expect(ids).toEqual(['sledge', 'spray', 'extinguisher', 'blowtorch', 'pistol', 'shotgun', 'plank', 'cable', 'pipebomb', 'bomb', 'rocket', 'nitro', 'rifle', 'leafblower']);
    for (const t of w.belt.tools) { expect(t.name.length).toBeGreaterThan(2); expect(t.hint.length).toBeGreaterThan(2); }
    w.belt.select(w.ctx, 4);
    expect((custom({ ...w, events: w.sim.drainEvents() }, 'tool:select')[0] as any).data.tool).toBe('pistol');
  });
  it('deterministic: same inputs -> same world', () => {
    const go = () => {
      const w = world();
      wall(w.sim, MAT.brick, -1.5, -3);
      settle(w);
      aimAt(w, { x: 0, y: 1.2, z: -3 });
      w.belt.select(w.ctx, 5);
      run(w, 2, { primary: true, primaryPressed: true });
      run(w, 60);
      let s = 0;
      for (const b of w.sim.bodies.values()) { const p = b.rb.translation(); s += p.x + p.y * 3 + p.z * 7 + b.grid.count; }
      return s;
    };
    expect(go()).toBe(go());
  });
});
