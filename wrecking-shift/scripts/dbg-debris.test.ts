// probe: does debris settle? npx vitest run --config scripts/bench.config.ts scripts/dbg-debris.test.ts --disableConsoleIntercept
import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
it('debris', async () => {
  await initPhysics();
  const sim = new Sim(1);
  LEVELS.testyard.build(sim);
  for (let i = 0; i < 60; i++) sim.step();
  sim.explode({ x: 0, y: 1.2, z: -14 }, 1.6);
  sim.explode({ x: 2, y: 1.0, z: -14 }, 1.6);
  for (let i = 0; i < 40; i++) sim.carve({ x: -2 + i * 0.12, y: 1.5, z: -14.1 }, 0.55, 0, 0, { cause: 'sledge', rough: 0.6, debris: 9, pushDir: { x: 0, y: 0, z: 1 }, debrisSpeed: 5 });
  for (let t = 0; t <= 1800; t++) {
    sim.step(); sim.out.length = 0;
    if (t % 150 === 0) {
      let dyn = 0, awake = 0, sumV = 0, maxV = 0, sizes: number[] = [];
      for (const b of sim.bodies.values()) {
        if (!b.dynamic || b.kind !== 'debris') continue;
        dyn++; sizes.push(b.grid.count);
        if (!b.rb.isSleeping()) { awake++; const v = b.rb.linvel(), w = b.rb.angvel(); const s = Math.hypot(v.x, v.y, v.z) + 0.1 * Math.hypot(w.x, w.y, w.z); sumV += s; maxV = Math.max(maxV, s); }
      }
      sizes.sort((a, b) => a - b);
      console.log('PROBE t', t, 'debris', dyn, 'awake', awake, 'meanV', (sumV / Math.max(1, awake)).toFixed(3), 'maxV', maxV.toFixed(3), 'sizes p10/50/90', sizes[Math.floor(sizes.length * 0.1)], sizes[Math.floor(sizes.length * 0.5)], sizes[Math.floor(sizes.length * 0.9)]);
    }
  }
});
