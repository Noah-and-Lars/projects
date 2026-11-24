import { Sim, initPhysics } from '../src/sim/sim';
import { harbor } from '../src/sim/levels/harbor';
import { chunkDims, meshChunk } from '../src/sim/mesher';
await initPhysics();
const sim = new Sim(1);
harbor.build(sim);
const t = performance.now();
let quads = 0, chunks = 0;
for (const b of sim.bodies.values()) { const [nx, ny, nz] = chunkDims(b.grid); for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const m = meshChunk(b.grid, x, y, z); chunks++; if (m) quads += m.quads; } }
console.log('mesh all ms', (performance.now() - t).toFixed(0), 'chunks', chunks, 'quads', quads);
