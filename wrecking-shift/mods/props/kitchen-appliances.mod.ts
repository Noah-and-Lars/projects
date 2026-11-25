import { MAT, box, clear, defineMod, pal, place, vox } from '../../src/mods/kit';
import { cylZ } from './_util';

/** White goods: a tall fridge-freezer, a front-loading washer and a four-ring cooker with a gas bottle. */
export default defineMod({
  id: 'kitchen-appliances', name: 'Kitchen Appliances', category: 'props', author: 'Wrecking Shift',
  description: 'A fridge-freezer full of jars, a front-loader with a glass porthole and a gas cooker that does not like being shot.',
  props: [
    {
      id: 'fridge-freezer', name: 'Fridge-freezer', group: 'Kitchen',
      spawn: (sim, pos, yaw) => place(sim, vox(7, 18, 7, (g) => {
        box(g, 0, 0, 0, 7, 18, 7, pal(MAT.sheetmetal, 3));
        clear(g, 1, 1, 1, 6, 17, 6);
        box(g, 1, 6, 1, 6, 7, 6, pal(MAT.sheetmetal, 2));
        for (const y of [9, 13]) box(g, 1, y, 2, 6, y + 1, 6, pal(MAT.glass, 2));
        // food: jars, a milk carton, frozen blocks
        for (let x = 1; x < 6; x += 2) { box(g, x, 10, 3, x + 1, 12, 4, pal(MAT.glass, 4)); g.set(x, 14, 4, pal(MAT.plastic, x)); }
        box(g, 2, 1, 2, 5, 5, 5, pal(MAT.ice, 2));
        box(g, 1, 7, 1, 3, 9, 2, pal(MAT.plaster, 4));
        // door seam + handles
        for (let x = 0; x < 7; x++) g.set(x, 6, 0, pal(MAT.rubber, 1));
        box(g, 5, 2, 0, 6, 5, 1, pal(MAT.steel, 3)); box(g, 5, 8, 0, 6, 14, 1, pal(MAT.steel, 3));
      }), pos, yaw, 'fridge'),
    },
    {
      id: 'front-loader', name: 'Washing machine', group: 'Kitchen',
      spawn: (sim, pos, yaw) => place(sim, vox(6, 9, 6, (g) => {
        box(g, 0, 0, 0, 6, 9, 6, pal(MAT.sheetmetal, 3));
        // drum (hollow steel) behind a glass porthole
        cylZ(g, 3, 4, 2.2, 1, 5, pal(MAT.steel, 2), 1);
        cylZ(g, 3, 4, 1.2, 1, 5, 0);
        cylZ(g, 3, 4, 2.2, 0, 1, pal(MAT.glass, 2));
        cylZ(g, 3, 4, 2.6, 0, 1, pal(MAT.steel, 4), 0.5);
        box(g, 1, 3, 2, 4, 4, 4, pal(MAT.fabric, 1));
        box(g, 0, 8, 0, 6, 9, 1, pal(MAT.electronics, 2));
        g.set(5, 8, 0, pal(MAT.lamp, 0));
      }), pos, yaw, 'washing machine'),
    },
    {
      id: 'gas-cooker', name: 'Gas cooker', group: 'Kitchen',
      spawn: (sim, pos, yaw) => place(sim, vox(6, 12, 6, (g) => {
        box(g, 0, 0, 0, 6, 9, 6, pal(MAT.sheetmetal, 2));
        // oven window + rings + splash back
        box(g, 1, 2, 0, 5, 6, 1, pal(MAT.glass, 1));
        for (const [x, z] of [[1, 1], [4, 1], [1, 4], [4, 4]]) g.set(x, 9, z, pal(MAT.steel, 0));
        box(g, 0, 9, 5, 6, 12, 6, pal(MAT.tile, 3));
        for (let x = 1; x < 5; x++) g.set(x, 8, 0, pal(MAT.rubber, 0));
        // gas bottle in the side cupboard
        box(g, 2, 1, 2, 4, 6, 4, pal(MAT.explosive, 2));
      }), pos, yaw, 'gas cooker'),
    },
  ],
});
