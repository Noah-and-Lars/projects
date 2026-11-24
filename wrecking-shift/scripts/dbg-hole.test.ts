import { it } from 'vitest';
import { Sim, initPhysics } from '../src/sim/sim';
import { LEVELS } from '../src/game/levels';
import { meshChunk } from '../src/sim/mesher';
import { CHUNK } from '../src/sim/body';
it('hole', async () => {
  await initPhysics();
  const sim = new Sim(1);
  LEVELS.harbor.build(sim);
  const P = { x: -5.95, y: 2.45, z: -43.89 };
  const s = sim.sample({ x: -6.05, y: 2.45, z: -43.89 })!;
  const b = s.body; const l = b.toLocal(P);
  const X = Math.floor(l.x), Y = Math.floor(l.y), Z = Math.floor(l.z);
  console.log('PROBE body', b.name, b.id, 'local', X, Y, Z, 'grid', b.grid.sx, b.grid.sy, b.grid.sz);
  for (let y = Y + 2; y >= Y - 3; y--) {
    let rows = [];
    for (let z = Z - 3; z <= Z + 3; z++) { let r = ''; for (let x = X - 4; x <= X + 3; x++) r += b.grid.get(x, y, z) ? ((b.grid.get(x, y, z) >> 3).toString(36)) : '.'; rows.push(r); }
    console.log('PROBE y', y, rows.join(' | '));
  }
  // mesh the chunk and list quads touching the point
  const cx = Math.floor(X / CHUNK), cy = Math.floor(Y / CHUNK), cz = Math.floor(Z / CHUNK);
  const m: any = (meshChunk as any)(b.grid, cx, cy, cz, { bakeAO: false, inflate: 0 });
  const lp = { x: l.x * 0.1, y: l.y * 0.1, z: l.z * 0.1 };
  let n = 0;
  for (let q = 0; q < m.quads; q++) {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let c = 0; c < 4; c++) for (let k = 0; k < 3; k++) { const v = m.positions[q * 12 + c * 3 + k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }
    if (lp.x > mn[0] - 0.25 && lp.x < mx[0] + 0.25 && lp.y > mn[1] - 0.15 && lp.y < mx[1] + 0.15 && lp.z > mn[2] - 0.25 && lp.z < mx[2] + 0.25 && n++ < 40)
      console.log('PROBE quad', q, mn.map((v) => (v * 10).toFixed(2)).join(','), '->', mx.map((v) => (v * 10).toFixed(2)).join(','), 'n', m.normals[q * 12], m.normals[q * 12 + 1], m.normals[q * 12 + 2], 'aux', [0, 1, 2, 3].map((c) => m.aux[q * 12 + c * 3 + 2]).join('/'));
  }
});
