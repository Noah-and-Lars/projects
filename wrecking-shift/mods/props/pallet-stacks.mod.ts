import type { VoxelBody } from '../../src/sim/body';
import { MAT, box, defineMod, pal, planks, vox, type VoxelGrid } from '../../src/mods/kit';
import { placeLocal } from './_util';

/** a 1.2 x 0.8 m shipping pallet: three runners, top boards with gaps */
function pallet(seed: number): VoxelGrid {
  return vox(12, 2, 8, (g) => {
    for (const z of [0, 3, 7]) box(g, 0, 0, z, 12, 1, z + 1, pal(MAT.wood, 0));
    for (let x = 0; x < 12; x += 2) box(g, x, 1, 0, x + 1 + (x === 10 ? 1 : 0), 2, 8, planks(MAT.wood, 1, seed + x, 'x'));
  });
}

/** Loading-bay pallets: a loose stack of eight and a pallet of tied cement sacks. */
export default defineMod({
  id: 'pallet-stacks', name: 'Pallet Stacks', category: 'props', author: 'Wrecking Shift',
  description: 'A wobbly stack of eight loose shipping pallets, and a loaded pallet of cement sacks wrapped in plastic. Splinters everywhere.',
  props: [
    {
      id: 'pallet-stack', name: 'Pallet stack (8)', group: 'Industrial',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        for (let i = 0; i < 8; i++) out.push(placeLocal(sim, pallet(i * 7), pos, yaw, ((i * 37) % 5 - 2) * 0.01, i * 0.205, 0, 'pallet'));
        return out;
      },
    },
    {
      id: 'sack-pallet', name: 'Pallet of sacks', group: 'Industrial',
      spawn: (sim, pos, yaw) => placeLocal(sim, vox(12, 10, 8, (g) => {
        const base = pallet(3);
        for (let z = 0; z < 8; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 12; x++) { const v = base.get(x, y, z); if (v) g.set(x, y, z, v); }
        // three layers of sacks (sand inside a fabric skin), crossed courses
        for (let l = 0; l < 3; l++) {
          const y = 2 + l * 2;
          for (let s = 0; s < (l % 2 ? 3 : 2); s++) {
            if (l % 2) box(g, s * 4, y, 0, s * 4 + 4, y + 2, 8, pal(MAT.sand, 1 + s));
            else box(g, 0, y, s * 4, 12, y + 2, s * 4 + 4, pal(MAT.sand, 2 + s));
          }
        }
        // shrink-wrap band
        for (let x = 0; x < 12; x++) { g.set(x, 5, 0, pal(MAT.plastic, 4)); g.set(x, 5, 7, pal(MAT.plastic, 4)); }
        box(g, 0, 8, 0, 12, 9, 8, pal(MAT.fabric, 2));
      }), pos, yaw, 0, 0, 0, 'sack pallet'),
    },
  ],
});
