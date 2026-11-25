import type { VoxelBody } from '../../src/sim/body';
import { MAT, box, cylinderY, defineMod, pal, place, vox } from '../../src/mods/kit';
import { placeLocal } from './_util';

/** a wrapped present: box + crossing ribbon (+ a bow on top when nothing is stacked on it) */
function present(w: number, h: number, d: number, shade: number, bow: boolean) {
  return vox(w, h + (bow ? 1 : 0), d, (g) => {
    box(g, 0, 0, 0, w, h, d, pal(MAT.fabric, shade));
    const rx = w >> 1, rz = d >> 1;
    box(g, rx, 0, 0, rx + 1, h, d, pal(MAT.gold, 2)); box(g, 0, 0, rz, w, h, rz + 1, pal(MAT.gold, 2));
    if (bow) g.set(rx, h, rz, pal(MAT.gold, 3));
  });
}

/** Celebration leftovers: a tiered cake on a trestle, a pile of presents and a crate of fireworks. */
export default defineMod({
  id: 'party-props', name: 'Party Props', category: 'props', author: 'Wrecking Shift',
  description: 'A three-tier cake on a party table, a heap of wrapped presents, and a crate of fireworks that pops off when it is hit hard.',
  props: [
    {
      id: 'cake-table', name: 'Party table with cake', group: 'Party',
      spawn: (sim, pos, yaw) => place(sim, vox(18, 16, 8, (g) => {
        box(g, 0, 7, 0, 18, 8, 8, pal(MAT.fabric, 4));
        box(g, 0, 5, 0, 18, 7, 1, pal(MAT.fabric, 4));
        for (const x of [1, 16]) for (const z of [1, 6]) box(g, x, 0, z, x + 1, 7, z + 1, pal(MAT.steel, 2));
        // three tiers, icing layers in plaster, candles in lamp
        cylinderY(g, 9, 4, 3.6, 8, 11, pal(MAT.plaster, 4));
        cylinderY(g, 9, 4, 2.6, 11, 13, pal(MAT.plaster, 3));
        cylinderY(g, 9, 4, 1.6, 13, 15, pal(MAT.plaster, 4));
        cylinderY(g, 9, 4, 3.6, 10, 11, pal(MAT.plastic, 3), 1);
        g.set(9, 15, 4, pal(MAT.lamp, 0)); g.set(8, 15, 3, pal(MAT.lamp, 0));
        // paper plates + cups
        for (const x of [2, 4, 13, 15]) { g.set(x, 8, 2, pal(MAT.plaster, 2)); g.set(x, 8, 5, pal(MAT.plastic, 1)); }
      }), pos, yaw, 'party table'),
    },
    {
      id: 'present-pile', name: 'Present pile (6)', group: 'Party',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        const sizes: [number, number, number, number, number, number][] = [
          // w, h, d, lx, ly, lz
          [6, 5, 6, -0.4, 0, 0], [5, 4, 5, 0.3, 0, 0.05], [4, 4, 4, 0.85, 0, -0.1],
          [4, 3, 4, -0.4, 0.505, 0], [3, 3, 3, 0.3, 0.405, 0], [3, 2, 3, -0.4, 0.81, 0],
        ];
        sizes.forEach(([w, h, d, lx, ly, lz], i) => out.push(placeLocal(sim, present(w, h, d, i % 5, i === 2 || i >= 4), pos, yaw, lx, ly, lz, 'present')));
        return out;
      },
    },
    {
      id: 'firework-crate', name: 'Firework crate', group: 'Explosive',
      spawn: (sim, pos, yaw) => place(sim, vox(8, 7, 6, (g) => {
        box(g, 0, 0, 0, 8, 4, 6, pal(MAT.crate, 2));
        box(g, 1, 1, 1, 7, 4, 5, pal(MAT.explosive, 2));
        // rocket tubes and sticks poking out
        for (let x = 1; x < 7; x += 2) for (let z = 1; z < 5; z += 2) { box(g, x, 4, z, x + 1, 6, z + 1, pal(MAT.explosive, (x + z) % 4)); g.set(x, 6, z, pal(MAT.wood, 4)); }
        box(g, 2, 2, 0, 6, 3, 1, pal(MAT.paintedmetal, 3));
      }), pos, yaw, 'firework crate', { tags: ['explosive'] }),
    },
  ],
});
