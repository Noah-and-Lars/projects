import { MAT, box, cylinderY, defineMod, pal, place, shaded, sphere, vox } from '../../src/mods/kit';
import { lathe } from './_util';

/** Town-square monuments: a marble figure on a stepped plinth and a granite obelisk with a gilded tip. */
export default defineMod({
  id: 'plinth-statues', name: 'Plinth Statues', category: 'props', author: 'Wrecking Shift',
  description: 'A stern marble figure on a stepped stone plinth and a tall obelisk with a gold cap. Both are top-heavy and full of rubble.',
  props: [
    {
      id: 'marble-figure', name: 'Marble figure on plinth', group: 'Art',
      spawn: (sim, pos, yaw) => place(sim, vox(12, 36, 12, (g) => {
        // plinth: two steps and a block with a gold plaque
        box(g, 0, 0, 0, 12, 2, 12, pal(MAT.concrete, 2));
        box(g, 1, 2, 1, 11, 4, 11, pal(MAT.concrete, 3));
        box(g, 2, 4, 2, 10, 14, 10, shaded(MAT.rock, 2, 3));
        box(g, 4, 8, 1, 8, 10, 2, pal(MAT.gold, 2));
        box(g, 1, 14, 1, 11, 15, 11, pal(MAT.concrete, 3));
        const m = shaded(MAT.marble, 1, 5);
        // figure: legs, robe, torso, arms, head, raised arm with torch
        box(g, 4, 15, 5, 6, 21, 7, m); box(g, 6, 15, 5, 8, 21, 7, m);
        box(g, 3, 21, 4, 9, 29, 8, m);
        box(g, 2, 22, 5, 3, 28, 7, m);
        box(g, 9, 26, 5, 10, 33, 7, m);
        cylinderY(g, 9.5, 6, 1.2, 33, 35, pal(MAT.gold, 3));
        box(g, 5, 29, 5, 7, 30, 7, m);
        sphere(g, 6, 32, 6, 2.2, m);
      }), pos, yaw, 'statue'),
    },
    {
      id: 'obelisk', name: 'Gilded obelisk', group: 'Art',
      spawn: (sim, pos, yaw) => place(sim, vox(10, 44, 10, (g) => {
        box(g, 0, 0, 0, 10, 2, 10, pal(MAT.concrete, 2));
        box(g, 1, 2, 1, 9, 6, 9, shaded(MAT.rock, 2, 9));
        // tapering shaft
        for (let y = 6; y < 40; y++) {
          const h = 3 - ((y - 6) / 34) * 1.4;
          box(g, Math.round(5 - h), y, Math.round(5 - h), Math.round(5 + h), y + 1, Math.round(5 + h), shaded(MAT.rock, 3, 10));
        }
        lathe(g, 5, 5, 40, 44, (y) => 2 - (y - 40) * 0.5, pal(MAT.gold, 2));
      }), pos, yaw, 'obelisk'),
    },
  ],
});
