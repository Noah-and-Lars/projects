import { Sim, initPhysics } from '../src/sim/sim';
import { brickHouse, groundTile, shed } from '../src/sim/levels/testyard';

await initPhysics();
const sim = new Sim(1);
groundTile(sim, -12.8, -12.8);
const h = brickHouse(sim, -4, -3);
console.log('house voxels', h.grid.count);
sim.step();
// cut the walls all around at 0.6 m height with explosions
let t = performance.now();
for (let x = -4; x <= 4; x += 1) { sim.explode({ x, y: 0.7, z: -3 + 0.15 }, 0.9); sim.explode({ x, y: 0.7, z: 3 - 0.15 }, 0.9); }
for (let z = -3; z <= 3; z += 1) { sim.explode({ x: -4 + 0.15, y: 0.7, z }, 0.9); sim.explode({ x: 4 - 0.15, y: 0.7, z }, 0.9); }
console.log('explosions ms', (performance.now() - t).toFixed(1), 'bodies', sim.bodies.size);
let mx = 0, tot = 0;
for (let i = 0; i < 600; i++) {
  const s = performance.now(); sim.step(); const d = performance.now() - s; mx = Math.max(mx, d); tot += d;
  if (i % 100 === 99) {
    let awake = 0, big = 0; for (const b of sim.bodies.values()) { if (b.dynamic && !b.rb.isSleeping()) awake++; if (b.dynamic && b.grid.count > 5000) big++; }
    console.log(`t=${i + 1} avg ${(tot / 100).toFixed(2)} ms max ${mx.toFixed(1)} bodies ${sim.bodies.size} awake ${awake} big ${big}`); tot = 0; mx = 0;
  }
}
for (const b of sim.bodies.values()) if (b.dynamic && b.grid.count > 5000) console.log('big body', b.grid.count, b.rb.translation(), 'mass', b.rb.mass().toFixed(0));
