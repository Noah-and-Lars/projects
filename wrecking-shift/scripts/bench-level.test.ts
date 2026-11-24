// Level budget report (not part of the unit suite):
//   LEVEL=ridge,works npx vitest run --config scripts/bench.config.ts
import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { chunkDims, meshChunk } from '../src/sim/mesher';

it('bench level', async () => {
  await initPhysics();
  for (const id of (process.env.LEVEL ?? 'harbor').split(',')) {
    const sim = new Sim(1);
    const t0 = performance.now();
    LEVELS[id].build(sim);
    const buildMs = performance.now() - t0;
    let vox = 0, stat = 0, dyn = 0, cells = 0, quads = 0;
    const by = new Map<string, { q: number; n: number; v: number }>();
    for (const b of sim.bodies.values()) {
      vox += b.grid.count; cells += b.grid.sx * b.grid.sy * b.grid.sz;
      if (b.dynamic) dyn++; else stat++;
      const [nx, ny, nz] = chunkDims(b.grid); let q = 0;
      for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const m = meshChunk(b.grid, x, y, z); if (m) q += m.quads; }
      quads += q;
      const e = by.get(b.name) ?? { q: 0, n: 0, v: 0 }; e.q += q; e.n++; e.v += b.grid.count; by.set(b.name, e);
    }
    for (let i = 0; i < 60; i++) sim.step();
    const t1 = performance.now();
    for (let i = 0; i < 240; i++) sim.step();
    const stepMs = (performance.now() - t1) / 240;
    let debris = 0; for (const b of sim.bodies.values()) if (b.kind === 'debris') debris++;
    console.log(`${id}: build ${buildMs.toFixed(0)} ms, bodies ${sim.bodies.size} (static ${stat}, dynamic ${dyn}), voxels ${(vox / 1e6).toFixed(2)} M, grid cells ${(cells / 1e6).toFixed(1)} M, quads ${quads}, idle step ${stepMs.toFixed(2)} ms, debris ${debris}`);
    for (const [k, v] of [...by].sort((a, b) => b[1].q - a[1].q).slice(0, 30)) console.log('  ', k.padEnd(18), 'n', String(v.n).padStart(3), 'quads', String(v.q).padStart(7), 'vox', v.v);
  }
}, 600000);
