import { Sim, initPhysics } from '../src/sim/sim';
import { harbor } from '../src/sim/levels/harbor';
await initPhysics();
const sim = new Sim(1);
const t = performance.now();
const info = harbor.build(sim);
console.log('build ms', (performance.now() - t).toFixed(0), 'bodies', sim.bodies.size, 'rss', (process.memoryUsage().rss / 1e6).toFixed(0));
let vox = 0, dyn = 0; for (const b of sim.bodies.values()) { vox += b.grid.count; if (b.dynamic) dyn++; }
console.log('voxels', vox, 'dynamic', dyn, 'spawn', info.spawn);
let mx = 0, tot = 0;
for (let i = 0; i < 300; i++) { const s = performance.now(); sim.step(); const d = performance.now() - s; mx = Math.max(mx, d); tot += d; }
console.log('300 steps avg', (tot / 300).toFixed(2), 'max', mx.toFixed(1));
let awake = 0, split = 0; for (const b of sim.bodies.values()) { if (b.dynamic && !b.rb.isSleeping()) awake++; if (b.kind === 'debris') split++; }
console.log('awake', awake, 'debris bodies (should be 0)', split);
for (const b of sim.bodies.values()) if (b.kind === 'debris') console.log('  debris from', b.user.fromBody, [...sim.bodies.values()].find((x) => x.id === b.user.fromBody)?.name, b.grid.count);
