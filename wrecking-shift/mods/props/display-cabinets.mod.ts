import { MAT, box, defineMod, pal, place, shell, sphere, vox } from '../../src/mods/kit';

/** Museum-shop glass: a tall curio cabinet with gold trinkets and a low jeweller's counter. */
export default defineMod({
  id: 'display-cabinets', name: 'Display Cabinets', category: 'props', author: 'Wrecking Shift',
  description: 'A tall glass curio cabinet full of gold trinkets and a glass-topped jeweller\'s counter. Every pane shatters.',
  props: [
    {
      id: 'curio-cabinet', name: 'Glass curio cabinet', group: 'Shop',
      spawn: (sim, pos, yaw) => place(sim, vox(10, 19, 6, (g) => {
        box(g, 0, 0, 0, 10, 2, 6, pal(MAT.wood, 0));
        box(g, 0, 18, 0, 10, 19, 6, pal(MAT.wood, 0));
        shell(g, 0, 2, 0, 10, 18, 6, 1, pal(MAT.glass, 2));
        for (const [x, z] of [[0, 0], [9, 0], [0, 5], [9, 5]]) box(g, x, 2, z, x + 1, 18, z + 1, pal(MAT.wood, 1));
        for (const y of [7, 12]) box(g, 1, y, 1, 9, y + 1, 5, pal(MAT.glass, 3));
        // trinkets: cups, a little bust and some bars
        box(g, 2, 2, 2, 4, 4, 4, pal(MAT.gold, 2)); sphere(g, 6.5, 3.5, 3, 1.4, pal(MAT.marble, 3));
        box(g, 2, 8, 2, 3, 11, 3, pal(MAT.gold, 1)); box(g, 5, 8, 2, 8, 9, 4, pal(MAT.gold, 3));
        sphere(g, 4, 14.5, 3, 1.5, pal(MAT.gold, 0)); box(g, 6, 13, 2, 8, 16, 3, pal(MAT.glass, 4));
        box(g, 4, 17, 2, 6, 18, 4, pal(MAT.lamp, 0));
      }), pos, yaw, 'curio cabinet'),
    },
    {
      id: 'jeweller-counter', name: 'Jeweller\'s counter', group: 'Shop',
      spawn: (sim, pos, yaw) => place(sim, vox(16, 10, 6, (g) => {
        box(g, 0, 0, 0, 16, 6, 6, pal(MAT.wood, 0));
        shell(g, 0, 6, 0, 16, 10, 6, 1, pal(MAT.glass, 2));
        box(g, 0, 9, 0, 16, 10, 6, pal(MAT.glass, 1));
        box(g, 1, 6, 1, 15, 7, 5, pal(MAT.fabric, 0));
        for (let x = 2; x < 14; x += 3) { g.set(x, 7, 2, pal(MAT.gold, 3)); g.set(x + 1, 7, 3, pal(MAT.gold, 1)); g.set(x, 7, 4, pal(MAT.glass, 4)); }
        box(g, 7, 0, 0, 9, 6, 1, pal(MAT.marble, 2));
      }), pos, yaw, 'jeweller counter'),
    },
  ],
});
