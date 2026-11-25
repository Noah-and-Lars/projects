// which side of each lamp post is the road? npx vitest run --config scripts/bench.config.ts scripts/dbg-lamps.test.ts --disableConsoleIntercept
import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { MATERIALS } from '../src/sim/materials';
it('lamps', async () => {
  await initPhysics();
  for (const id of ['harbor', 'ridge', 'works']) {
    const sim = new Sim(1); LEVELS[id].build(sim);
    for (const b of sim.bodies.values()) {
      if (b.name !== 'lamppost') continue;
      const g = b.grid, t = b.rb.translation();
      const alongZ = g.sz > g.sx;
      const px = t.x + (alongZ ? 0.3 : 0.9), pz = t.z + (alongZ ? 0.9 : 0.3); // pole centre (streetLamp) // pole centre
      const mat = (dx: number, dz: number) => { const h = sim.raycast({ x: px + dx, y: t.y + 3, z: pz + dz }, { x: 0, y: -1, z: 0 }, 10, b); return h ? MATERIALS[h.palette >> 3].name : 'none'; };
      const d = 1.2;
      const arm = alongZ ? mat(0, -d) : mat(-d, 0), back = alongZ ? mat(0, d) : mat(d, 0);
      const arm2 = alongZ ? mat(0, -2.5) : mat(-2.5, 0), back2 = alongZ ? mat(0, 2.5) : mat(2.5, 0);
      console.log('PROBE', id, px.toFixed(1), pz.toFixed(1), alongZ ? 'arm-z' : 'arm-x', 'arm side:', arm, arm2, '| back side:', back, back2);
    }
  }
});
