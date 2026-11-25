import { MAT, box, defineMod, pal, place, planks, vox, type VoxelGrid } from '../../src/mods/kit';
import { beam } from './_util';

/** a steel-tube scaffold bay W x D (voxels), `lifts` platforms 2 m apart, with planks, toe boards and braces */
function scaffold(w: number, d: number, lifts: number): VoxelGrid {
  const h = lifts * 20 + 10;
  return vox(w, h, d, (g) => {
    const tube = pal(MAT.steel, 2);
    for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) box(g, x, 0, z, x + 1, h, z + 1, tube);
    // base plates
    for (const [x, z] of [[0, 0], [w - 2, 0], [0, d - 2], [w - 2, d - 2]]) box(g, x, 0, z, x + 2, 1, z + 2, pal(MAT.steel, 0));
    for (let l = 1; l <= lifts; l++) {
      const y = l * 20;
      // ledgers + transoms
      box(g, 0, y, 0, w, y + 1, 1, tube); box(g, 0, y, d - 1, w, y + 1, d, tube);
      box(g, 0, y, 0, 1, y + 1, d, tube); box(g, w - 1, y, 0, w, y + 1, d, tube);
      // boards and guard rail
      box(g, 1, y + 1, 1, w - 1, y + 2, d - 1, planks(MAT.wood, 2, l, 'z'));
      box(g, 0, y + 9, 0, w, y + 10, 1, tube); box(g, 0, y + 9, d - 1, w, y + 10, d, tube);
      box(g, 1, y + 1, 1, w - 1, y + 3, 2, pal(MAT.wood, 0));
      // diagonal face brace on the back
      beam(g, 0, y - 20, d - 1, w - 1, y, d - 1, tube);
    }
    // ladder up one side
    for (let y = 2; y < h - 2; y += 3) box(g, 1, y, 0, 2, y + 1, d, pal(MAT.sheetmetal, 1));
  });
}

/** Builder's scaffolding: a mobile tower that topples nicely, and a tall bay bolted to the ground. */
export default defineMod({
  id: 'scaffold-towers', name: 'Scaffold Towers', category: 'props', author: 'Wrecking Shift',
  description: 'A free-standing two-lift scaffold tower that tips over, and a four-lift bay anchored to the ground for climbing and cutting down.',
  props: [
    { id: 'scaffold-tower', name: 'Scaffold tower (loose)', group: 'Structures', spawn: (sim, pos, yaw) => place(sim, scaffold(14, 10, 2), pos, yaw, 'scaffold tower') },
    { id: 'scaffold-bay', name: 'Scaffold bay (anchored)', group: 'Structures', spawn: (sim, pos, yaw) => place(sim, scaffold(25, 12, 4), pos, yaw, 'scaffold bay', { static: true }) },
  ],
});
