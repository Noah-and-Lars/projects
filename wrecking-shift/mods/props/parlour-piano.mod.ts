import { MAT, box, clear, defineMod, pal, place, vox } from '../../src/mods/kit';
import { lathe } from './_util';

/** An upright parlour piano with a marble-and-rubber keyboard, plus its round stool. */
export default defineMod({
  id: 'parlour-piano', name: 'Parlour Piano', category: 'props', author: 'Wrecking Shift',
  description: 'A heavy upright piano with a steel frame inside a wooden case, and a spinning stool. Push it down some stairs.',
  props: [
    {
      id: 'upright-piano', name: 'Upright piano', group: 'Furniture',
      spawn: (sim, pos, yaw) => place(sim, vox(15, 13, 7, (g) => {
        // case: back body + lower front + keyboard shelf
        box(g, 0, 0, 3, 15, 13, 7, pal(MAT.wood, 0));
        box(g, 0, 0, 1, 15, 6, 3, pal(MAT.wood, 0));
        clear(g, 2, 0, 1, 13, 2, 3);
        // cast steel harp frame visible through the top lid
        box(g, 1, 3, 4, 14, 12, 6, pal(MAT.steel, 1));
        for (let x = 2; x < 13; x += 2) box(g, x, 4, 4, x + 1, 12, 5, pal(MAT.wire, 3));
        // side cheeks reaching the keys
        box(g, 0, 6, 0, 1, 8, 3, pal(MAT.wood, 1)); box(g, 14, 6, 0, 15, 8, 3, pal(MAT.wood, 1));
        // keys: white marble, black rubber in the 2-3 pattern
        box(g, 1, 6, 0, 14, 7, 3, pal(MAT.marble, 3));
        for (let x = 1; x < 14; x++) if ([1, 2, 4, 5, 6].includes((x - 1) % 7)) g.set(x, 7, 2, pal(MAT.rubber, 1));
        // music desk
        box(g, 2, 9, 2, 13, 11, 3, pal(MAT.wood, 2));
        box(g, 4, 9, 1, 11, 10, 2, pal(MAT.plaster, 4));
        // brass pedals
        for (const x of [6, 8]) g.set(x, 0, 0, pal(MAT.gold, 1));
      }), pos, yaw, 'piano'),
    },
    {
      id: 'piano-stool', name: 'Piano stool', group: 'Furniture',
      spawn: (sim, pos, yaw) => place(sim, vox(5, 6, 5, (g) => {
        lathe(g, 2.5, 2.5, 0, 1, () => 2.4, pal(MAT.steel, 1));
        lathe(g, 2.5, 2.5, 1, 4, () => 0.8, pal(MAT.steel, 2));
        lathe(g, 2.5, 2.5, 4, 5, () => 2.5, pal(MAT.wood, 1));
        lathe(g, 2.5, 2.5, 5, 6, () => 2.3, pal(MAT.fabric, 0));
      }), pos, yaw, 'piano stool'),
    },
  ],
});
