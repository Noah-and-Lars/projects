import { MAT, box, defineMod, pal, place, planks, vox } from '../../src/mods/kit';

/** Dormitory furniture: a timber bunk bed with a ladder and a steel-framed camp bed. */
export default defineMod({
  id: 'bunk-beds', name: 'Bunk Beds', category: 'props', author: 'Wrecking Shift',
  description: 'A two-storey timber bunk bed with mattresses, pillows and a ladder, and a fold-out camp cot. Tall, narrow and easy to tip.',
  props: [
    {
      id: 'timber-bunk-bed', name: 'Bunk bed', group: 'Furniture',
      spawn: (sim, pos, yaw) => place(sim, vox(21, 17, 10, (g) => {
        for (const [x, z] of [[0, 0], [20, 0], [0, 9], [20, 9]]) box(g, x, 0, z, x + 1, 17, z + 1, pal(MAT.wood, 0));
        for (const y of [2, 10]) {
          box(g, 0, y, 0, 21, y + 1, 10, planks(MAT.wood, 2, y, 'x'));
          box(g, 1, y + 1, 1, 20, y + 3, 9, pal(MAT.fabric, y === 2 ? 2 : 4));
          box(g, 16, y + 3, 2, 19, y + 4, 8, pal(MAT.plaster, 4));
        }
        // top guard rail, head + foot boards
        box(g, 0, 14, 9, 21, 15, 10, pal(MAT.wood, 1)); box(g, 0, 14, 0, 14, 15, 1, pal(MAT.wood, 1));
        box(g, 0, 0, 1, 1, 17, 9, planks(MAT.wood, 2, 4, 'y')); box(g, 20, 0, 1, 21, 17, 9, planks(MAT.wood, 2, 5, 'y'));
        // ladder on the open side
        for (const x of [15, 18]) box(g, x, 3, 0, x + 1, 15, 1, pal(MAT.wood, 3));
        for (let y = 5; y < 14; y += 3) box(g, 15, y, 0, 19, y + 1, 1, pal(MAT.wood, 3));
      }), pos, yaw, 'bunk bed'),
    },
    {
      id: 'camp-cot', name: 'Camp cot', group: 'Furniture',
      spawn: (sim, pos, yaw) => place(sim, vox(19, 5, 7, (g) => {
        for (const x of [1, 9, 17]) { box(g, x, 0, 0, x + 1, 4, 1, pal(MAT.steel, 2)); box(g, x, 0, 6, x + 1, 4, 7, pal(MAT.steel, 2)); }
        box(g, 0, 4, 0, 19, 5, 1, pal(MAT.steel, 1)); box(g, 0, 4, 6, 19, 5, 7, pal(MAT.steel, 1));
        box(g, 0, 4, 1, 19, 5, 6, pal(MAT.fabric, 3));
      }), pos, yaw, 'camp cot'),
    },
  ],
});
