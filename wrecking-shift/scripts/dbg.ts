import { allComponents } from '../src/sim/connectivity';
import { MAT } from '../src/sim/materials';
import { makeBuilding } from '../src/sim/levels/kit';
const specs: any[] = [
  { w: 80, d: 60, floors: 2, wall: MAT.brick, lining: MAT.plaster, roof: 'gable', partitions: true, lamps: true },
  { w: 120, d: 90, floors: 3, wall: MAT.concrete, slab: MAT.concrete, roof: 'flat', frame: MAT.concrete, doors: 'ns', doorW: 28, doorH: 26 },
  { w: 60, d: 50, floors: 1, wall: MAT.wood, roof: 'gable', roofMat: MAT.wood, wallT: 1, doors: 'e' },
];
for (const s of specs) { const g = makeBuilding(s); const c = allComponents(g).sort((a, b) => b.indices.length - a.indices.length); console.log(g.sx, g.sy, g.sz, g.count, c.slice(0, 6).map((k) => `${k.indices.length}@[${k.min}]-[${k.max}]pal${g.data[k.indices[0]] >> 3}`).join('  ')); }
