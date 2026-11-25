import type { VoxelBody } from '../../src/sim/body';
import { MAT, cylinderY, defineMod, pal, vox, type VoxelGrid } from '../../src/mods/kit';
import { placeLocal } from './_util';

/** a 200-litre drum: ribbed shell, lid with a bung; `fuel` drums are explosive */
function drum(fuel: boolean): VoxelGrid {
  const m = fuel ? MAT.explosive : MAT.paintedmetal;
  return vox(6, 9, 6, (g) => {
    cylinderY(g, 3, 3, 3, 0, 9, pal(m, 2));
    for (const y of [0, 3, 6, 8]) cylinderY(g, 3, 3, 3, y, y + 1, pal(fuel ? MAT.explosive : MAT.steel, 0));
    g.set(4, 8, 2, pal(MAT.steel, 4));
  });
}

/** Yard drums: a line where one in three is full of fuel, and a stacked pyramid of empties. */
export default defineMod({
  id: 'oil-drums', name: 'Oil Drums', category: 'props', author: 'Wrecking Shift',
  description: 'A row of six steel drums with two full fuel drums hidden among them, and a pyramid of six empties to bowl over.',
  props: [
    {
      id: 'drum-row', name: 'Drum row (6, mixed)', group: 'Explosive',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        for (let i = 0; i < 6; i++) {
          const fuel = i % 3 === 1;
          out.push(placeLocal(sim, drum(fuel), pos, yaw, (i - 2.5) * 0.65, 0, 0, fuel ? 'fuel drum' : 'oil drum', { tags: fuel ? ['explosive'] : [] }));
        }
        return out;
      },
    },
    {
      id: 'drum-pyramid', name: 'Drum pyramid (6)', group: 'Industrial',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++)
          out.push(placeLocal(sim, drum(false), pos, yaw, (i - (2 - row) / 2) * 0.62, row * 0.905, 0, 'oil drum'));
        return out;
      },
    },
  ],
});
