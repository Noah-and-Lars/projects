// ad-hoc probe: LEVEL=works PTS='[[x,z],...]' npx vitest run --config scripts/bench.config.ts scripts/dbg-level.test.ts --disableConsoleIntercept
import { it } from 'vitest';
import { Sim, initPhysics, RAPIER } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { Player } from '../src/sim/player';

it('dbg', async () => {
  await initPhysics();
  const sim = new Sim(1);
  const info = LEVELS[process.env.LEVEL ?? 'works'].build(sim);
  for (const b of sim.bodies.values()) { const t = b.rb.translation(); if (!isFinite(t.x + t.y + t.z) || b.grid.count === 0) console.log('PROBE bad body', b.name, JSON.stringify(t), b.grid.count, b.grid.sx, b.grid.sy, b.grid.sz); }
  for (let i = 0; i < 300; i++) sim.step();
  const p = new Player(sim, info.spawn); p.yaw = info.spawnYaw;
  for (let i = 0; i < 120; i++) { p.input.moveZ = i > 60 ? 1 : 0; p.update(); sim.step(); if (i % 10 === 0) console.log('PROBE player', i, JSON.stringify(p.pos), p.grounded, p.inWater); }
  for (const [x, z] of [[-52, 8], [-20, -10], [0, 30], [-58.5, 2]]) {
    p.teleport({ x, y: 1.7, z });
    for (let i = 0; i < 30; i++) { p.input.moveZ = 0; p.update(); sim.step(); }
    for (let i = 0; i < 30; i++) { p.input.moveZ = 1; p.update(); sim.step(); }
    console.log('PROBE move', x, z, JSON.stringify(p.pos), JSON.stringify(p.vel));
  }
  for (const dx of [0, 0.5, 1, 2]) {
    const pos = { x: info.spawn.x + dx, y: info.spawn.y + 1.0, z: info.spawn.z };
    const names: string[] = [];
    sim.world.intersectionsWithShape(pos, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Cylinder(0.85, 0.3), (c) => { const b = sim.byCollider.get(c.handle); names.push(b ? b.name + '#' + b.id : 'other'); return true; });
    console.log('PROBE overlap', dx, names.join(','));
  }
  for (const [x, z] of JSON.parse(process.env.PTS ?? '[[-58.5,2]]')) {
    const h = sim.raycast({ x, y: 30, z }, { x: 0, y: -1, z: 0 }, 60);
    const yUp = Number(process.env.UPY ?? 0);
    const u = yUp ? sim.raycast({ x, y: yUp, z }, { x: 0, y: 1, z: 0 }, 30) : null;
    console.log('PROBE', x, z, h ? `${h.point.y.toFixed(2)} ${h.body.name}` : 'none', u ? `up ${u.point.y.toFixed(2)} ${u.body.name}` : '');
  }
});
