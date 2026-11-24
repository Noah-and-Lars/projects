import { Sim, initPhysics } from '../src/sim/sim';
import { harbor } from '../src/sim/levels/harbor';
import { chunkDims, meshChunk } from '../src/sim/mesher';
await initPhysics();
const sim = new Sim(1);
harbor.build(sim);
const by = new Map<string, { q: number; ms: number; c: number; n: number }>();
const t = performance.now();
for (const b of sim.bodies.values()) {
  const [nx, ny, nz] = chunkDims(b.grid); const t0 = performance.now(); let q = 0, c = 0;
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const m = meshChunk(b.grid, x, y, z); c++; if (m) q += m.quads; }
  const e = by.get(b.name) ?? { q: 0, ms: 0, c: 0, n: 0 }; e.q += q; e.ms += performance.now() - t0; e.c += c; e.n++; by.set(b.name, e);
}
console.log('mesh all ms', (performance.now() - t).toFixed(0));
for (const [k, v] of [...by].sort((a, b) => b[1].q - a[1].q)) console.log(k.padEnd(14), 'bodies', v.n, 'chunks', v.c, 'quads', v.q, 'ms', v.ms.toFixed(0));
