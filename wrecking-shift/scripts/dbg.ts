import { MAT, pal } from '../src/sim/materials';
import { Sim, initPhysics } from '../src/sim/sim';
import { VoxelGrid } from '../src/sim/voxels';
await initPhysics();
const sim = new Sim(5);
const g0 = new VoxelGrid(128, 4, 128); g0.fill(0, 0, 0, 128, 4, 128, pal(MAT.bedrock));
const fl = sim.addBody(g0, { x: -6.4, y: -0.4, z: -6.4 });
const g = new VoxelGrid(20, 4, 20); g.fill(0, 0, 0, 20, 4, 20, pal(MAT.wood));
const b = sim.addBody(g, { x: -1, y: 12, z: -1 }, { dynamic: true, rot: { x: 0.2, y: 0, z: 0.1, w: 0.97 } });
console.log('mass', b.mass, b.rb.mass());
for (let i = 0; i < 140; i++) {
  const v0 = b.rb.linvel().y;
  sim.step();
  const all = sim.drainEvents();
  const v1 = b.rb.linvel().y;
  if (Math.abs(v1 - v0) > 0.5 || all.length) {
    let info = '';
    sim.world.contactPair(fl.col, b.col, (m, flipped) => { if (!m.numContacts()) return; const p1 = m.localContactPoint1(0)!, p2 = m.localContactPoint2(0)!;
      const A = flipped ? b : fl, B = flipped ? fl : b;
      const w1 = A.toWorld({ x: p1.x * 10, y: p1.y * 10, z: p1.z * 10 }), w2 = B.toWorld({ x: p2.x * 10, y: p2.y * 10, z: p2.z * 10 });
      info += ` fl=${flipped} w1=${w1.x.toFixed(2)},${w1.y.toFixed(2)},${w1.z.toFixed(2)} w2=${w2.x.toFixed(2)},${w2.y.toFixed(2)},${w2.z.toFixed(2)}`; });
    console.log(i, 'v', v0.toFixed(2), '->', v1.toFixed(2), all.map((e: any) => e.type + ':' + (e.force ?? '')).join(','), info);
  }
}
