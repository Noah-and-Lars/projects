// quads per 32^3 chunk of one body: LEVEL=works BODY=silos npx vitest run --config scripts/bench.config.ts scripts/dbg-quads.test.ts --disableConsoleIntercept
import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { chunkDims, meshChunk } from '../src/sim/mesher';

it('quads by chunk', async () => {
  await initPhysics();
  const sim = new Sim(1);
  LEVELS[process.env.LEVEL ?? 'works'].build(sim);
  const b = [...sim.bodies.values()].find((x) => x.name === (process.env.BODY ?? 'silos'))!;
  const [nx, ny, nz] = chunkDims(b.grid);
  for (let y = 0; y < ny; y++) {
    const row: number[] = [];
    for (let x = 0; x < nx; x++) { let q = 0; for (let z = 0; z < nz; z++) { const m = meshChunk(b.grid, x, y, z); if (m) q += m.quads; } row.push(q); }
    console.log('Q y', y, row.join(' '));
  }
});
