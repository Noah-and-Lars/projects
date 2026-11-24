import { MAT, pal } from '../src/sim/materials';
import { Sim, initPhysics } from '../src/sim/sim';
import { VoxelGrid } from '../src/sim/voxels';
await initPhysics();
const sim = new Sim(1);
const mem = () => (process.memoryUsage().rss / 1e6).toFixed(0) + ' MB';
console.log('start', mem());
const N = Number(process.argv[2] ?? 4), H = Number(process.argv[3] ?? 16), shellOnly = process.argv[4] === 'shell';
let t = performance.now();
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const g = new VoxelGrid(256, H, 256);
  g.fill(0, 0, 0, 256, H, 256, (x, y, z) => {
    const h = H - 6 + Math.floor(3 + 3 * Math.sin((x + i * 256) * 0.05) * Math.cos((z + j * 256) * 0.04));
    if (y >= h) return 0;
    if (shellOnly && y < h - 3 && y > 0) return 0;
    return pal(MAT.dirt);
  });
  g.recount();
  sim.addBody(g, { x: i * 25.6, y: 0, z: j * 25.6 });
}
console.log(`${N * N} tiles H=${H} build ms`, (performance.now() - t).toFixed(0), mem());
let vox = 0; for (const b of sim.bodies.values()) vox += b.grid.count;
console.log('voxels', vox);
t = performance.now(); for (let i = 0; i < 60; i++) sim.step(); console.log('60 steps ms', (performance.now() - t).toFixed(1));
// drop 50 crates
for (let k = 0; k < 50; k++) { const g = new VoxelGrid(6, 6, 6); g.fill(0, 0, 0, 6, 6, 6, pal(MAT.wood)); sim.addBody(g, { x: 5 + (k % 10) * 2, y: H * 0.1 + 2, z: 5 + Math.floor(k / 10) * 2 }, { dynamic: true }); }
t = performance.now(); for (let i = 0; i < 120; i++) sim.step(); console.log('120 steps w/ 50 crates ms', (performance.now() - t).toFixed(1));
t = performance.now(); const h = sim.raycast({ x: 1, y: 30, z: 1 }, { x: 0.6, y: -0.3, z: 0.74 }, 300); console.log('raycast ms', (performance.now() - t).toFixed(2), h?.dist);
