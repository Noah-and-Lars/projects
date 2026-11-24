// total quads per level (volume mode): LEVELS=harbor,works npx vitest run --config scripts/bench.config.ts scripts/dbg-quads2.test.ts --disableConsoleIntercept
import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { meshChunk, chunkDims } from '../src/sim/mesher';
it('quads', async () => {
  await initPhysics();
  for (const id of (process.env.LEVELS ?? 'harbor').split(',')) {
    const sim = new Sim(1); LEVELS[id].build(sim);
    let q = 0;
    for (const b of sim.bodies.values()) { const [cx, cy, cz] = chunkDims(b.grid); for (let z = 0; z < cz; z++) for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) { const m = meshChunk(b.grid, x, y, z, { bakeAO: b.dynamic }); if (m) q += m.quads; } }
    console.log('PROBE', id, 'quads', q);
  }
});
