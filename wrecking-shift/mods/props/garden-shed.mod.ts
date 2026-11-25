import { MAT, box, clear, defineMod, gableRoofX, pal, place, planks, shell, vox, windowZ } from '../../src/mods/kit';

/** Allotment buildings: a felt-roofed timber shed full of tools and a slatted compost bin. */
export default defineMod({
  id: 'garden-shed', name: 'Garden Shed', category: 'props', author: 'Wrecking Shift',
  description: 'A clapboard garden shed with a window, a pitched roof and junk inside, plus a slatted compost bin. Dry wood: it goes up fast.',
  props: [
    {
      id: 'timber-shed', name: 'Timber shed', group: 'Garden',
      spawn: (sim, pos, yaw) => place(sim, vox(24, 28, 18, (g) => {
        box(g, 0, 0, 0, 24, 1, 18, planks(MAT.wood, 2, 1, 'z'));
        shell(g, 0, 1, 0, 24, 20, 18, 1, planks(MAT.wood, 1, 7, 'y'));
        // gable ends + felt roof
        for (let i = 0; i < 9; i++) { box(g, 0, 20 + i, i, 1, 21 + i, 18 - i, pal(MAT.wood, 2)); box(g, 23, 20 + i, i, 24, 21 + i, 18 - i, pal(MAT.wood, 2)); }
        gableRoofX(g, 0, 24, 19, 0, 18, pal(MAT.rubber, 2), 1);
        // door in the front (-Z) wall and a window in the side
        clear(g, 3, 1, 0, 10, 18, 1);
        box(g, 3, 1, 0, 10, 18, 1, planks(MAT.wood, 2, 3, 'y'));
        g.set(9, 9, 0, pal(MAT.steel, 1));
        windowZ(g, 6, 12, 9, 16, 23, 24);
        box(g, 13, 10, 0, 21, 15, 1, pal(MAT.glass, 2)); box(g, 17, 10, 0, 18, 15, 1, pal(MAT.wood, 0));
        // inside: workbench, paint tins, a mower-ish block, rake handles
        box(g, 13, 1, 13, 23, 8, 17, pal(MAT.wood, 3));
        for (let x = 14; x < 22; x += 2) box(g, x, 8, 14, x + 1, 10, 15, pal(MAT.paintedmetal, x % 5));
        box(g, 2, 1, 12, 7, 5, 16, pal(MAT.plastic, 2));
        for (const x of [12, 14]) box(g, x, 1, 16, x + 1, 17, 17, pal(MAT.wood, 4));
      }), pos, yaw, 'garden shed'),
    },
    {
      id: 'compost-bin', name: 'Compost bin', group: 'Garden',
      spawn: (sim, pos, yaw) => place(sim, vox(10, 9, 10, (g) => {
        for (let y = 0; y < 9; y += 2) shell(g, 0, y, 0, 10, y + 1, 10, 1, planks(MAT.wood, 3, y));
        for (const [x, z] of [[0, 0], [9, 0], [0, 9], [9, 9]]) box(g, x, 0, z, x + 1, 9, z + 1, pal(MAT.wood, 0));
        box(g, 1, 0, 1, 9, 6, 9, pal(MAT.dirt, 2));
        box(g, 2, 6, 2, 8, 7, 8, pal(MAT.leaves, 3));
      }), pos, yaw, 'compost bin'),
    },
  ],
});
