import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { Player } from '../src/sim/player';
it('stand2', async () => {
  await initPhysics();
  const sim = new Sim(1);
  const info = LEVELS.ridge.build(sim);
  const p = new Player(sim, info.spawn);
  for (const [x, z] of [[42, 8], [51, 8]]) {
    const h = sim.raycast({ x, y: 60, z }, { x: 0, y: -1, z: 0 }, 120)!;
    console.log('PROBE hit', h.body.name, h.point.y.toFixed(3));
    p.teleport({ x, y: h.point.y + 0.1, z });
    for (let i = 0; i < 600; i++) { p.update(); sim.step(); if (i % 40 === 0) console.log('PROBE', x, i, JSON.stringify(p.eye), p.grounded, p.vel.y.toFixed(3)); }
  }
});
