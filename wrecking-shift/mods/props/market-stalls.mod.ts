import { MAT, box, defineMod, pal, place, planks, sphere, vox } from '../../src/mods/kit';

/** Weekend market: a striped-awning produce stall and a fish counter on ice. */
export default defineMod({
  id: 'market-stalls', name: 'Market Stalls', category: 'props', author: 'Wrecking Shift',
  description: 'A timber produce stall under a striped canvas awning with crates of fruit and veg, and a sheet-metal fish counter packed with ice.',
  props: [
    {
      id: 'produce-stall', name: 'Produce stall', group: 'Market',
      spawn: (sim, pos, yaw) => place(sim, vox(24, 25, 12, (g) => {
        // corner posts
        for (const [x, z] of [[0, 0], [23, 0], [0, 11], [23, 11]]) box(g, x, 0, z, x + 1, 22, z + 1, pal(MAT.wood, 0));
        // sloped trestle table with crates of produce on it
        box(g, 1, 8, 1, 23, 9, 8, planks(MAT.wood, 3, 2));
        box(g, 1, 0, 6, 23, 8, 7, pal(MAT.wood, 1));
        for (let c = 0; c < 4; c++) {
          const x0 = 2 + c * 5;
          box(g, x0, 9, 2, x0 + 4, 11, 7, pal(MAT.crate, c));
          const fruit = [pal(MAT.plastic, 2), pal(MAT.leaves, 1), pal(MAT.paintedmetal, 3), pal(MAT.tile, 2)][c];
          for (let x = x0; x < x0 + 4; x++) for (let z = 2; z < 7; z++) if ((x + z) % 2 === 0) g.set(x, 11, z, fruit);
          sphere(g, x0 + 2, 11.5, 4.5, 1.2, fruit);
        }
        // striped awning sloping down to the front
        for (let z = 0; z < 12; z++) {
          const y = 20 + Math.round(z / 3);
          for (let x = 0; x < 24; x++) g.set(x, y, z, (x >> 2) % 2 ? pal(MAT.fabric, 4) : pal(MAT.plaster, 4));
        }
        for (let x = 0; x < 24; x++) if ((x >> 2) % 2) g.set(x, 19, 0, pal(MAT.fabric, 3));
        // price board
        box(g, 9, 14, 11, 15, 18, 12, pal(MAT.char, 1));
        for (const x of [10, 13]) box(g, x, 18, 11, x + 1, 24, 12, pal(MAT.wire, 0));
      }), pos, yaw, 'market stall'),
    },
    {
      id: 'fish-counter', name: 'Fish counter', group: 'Market',
      spawn: (sim, pos, yaw) => place(sim, vox(18, 10, 8, (g) => {
        box(g, 0, 0, 0, 18, 7, 8, pal(MAT.sheetmetal, 2));
        box(g, 1, 7, 1, 17, 9, 7, pal(MAT.ice, 2));
        box(g, 0, 7, 0, 18, 10, 1, pal(MAT.glass, 2));
        for (let x = 2; x < 16; x += 3) box(g, x, 9, 2 + (x % 2), x + 2, 10, 4 + (x % 2), pal(MAT.sheetmetal, 4));
        box(g, 0, 7, 7, 18, 9, 8, pal(MAT.sheetmetal, 1));
      }), pos, yaw, 'fish counter'),
    },
  ],
});
