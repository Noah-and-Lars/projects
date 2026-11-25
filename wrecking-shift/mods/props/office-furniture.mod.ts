import { MAT, box, clear, cylinderY, defineMod, pal, place, vox } from '../../src/mods/kit';

/** Open-plan clutter: a workstation desk with a monitor, a four-drawer filing cabinet and a water cooler. */
export default defineMod({
  id: 'office-furniture', name: 'Office Furniture', category: 'props', author: 'Wrecking Shift',
  description: 'A desk with a monitor, keyboard and paper stacks, a steel filing cabinet and a water cooler with a glass bottle. Take out a bad Monday on them.',
  props: [
    {
      id: 'workstation-desk', name: 'Workstation desk', group: 'Office',
      spawn: (sim, pos, yaw) => place(sim, vox(16, 13, 8, (g) => {
        box(g, 0, 7, 0, 16, 8, 8, pal(MAT.wood, 3));
        box(g, 0, 0, 0, 1, 7, 8, pal(MAT.sheetmetal, 2)); box(g, 15, 0, 0, 16, 7, 8, pal(MAT.sheetmetal, 2));
        box(g, 10, 0, 1, 15, 7, 8, pal(MAT.sheetmetal, 1));
        for (const y of [2, 5]) box(g, 11, y, 0, 14, y + 1, 1, pal(MAT.steel, 3));
        box(g, 1, 3, 7, 15, 7, 8, pal(MAT.wood, 2));
        // monitor on a stand, keyboard, paper stacks, mug
        box(g, 6, 8, 6, 8, 9, 7, pal(MAT.steel, 1));
        box(g, 3, 10, 6, 11, 13, 7, pal(MAT.electronics, 1)); box(g, 4, 10, 5, 10, 13, 6, pal(MAT.glass, 0));
        box(g, 4, 8, 2, 10, 9, 4, pal(MAT.plastic, 4));
        box(g, 12, 8, 2, 15, 11, 5, pal(MAT.plaster, 4));
        g.set(2, 8, 2, pal(MAT.marble, 3)); g.set(2, 9, 2, pal(MAT.marble, 3));
      }), pos, yaw, 'desk'),
    },
    {
      id: 'filing-cabinet', name: 'Filing cabinet', group: 'Office',
      spawn: (sim, pos, yaw) => place(sim, vox(5, 14, 6, (g) => {
        box(g, 0, 0, 0, 5, 14, 6, pal(MAT.sheetmetal, 2));
        for (let d = 0; d < 4; d++) {
          const y = 1 + d * 3;
          for (let x = 0; x < 5; x++) g.set(x, y + 2, 0, pal(MAT.sheetmetal, 0));
          g.set(2, y + 1, 0, pal(MAT.steel, 4));
          clear(g, 1, y, 1, 4, y + 2, 5);
          box(g, 1, y, 2, 4, y + 2, 5, pal(MAT.plaster, 3 + (d % 2)));
        }
      }), pos, yaw, 'filing cabinet'),
    },
    {
      id: 'water-cooler', name: 'Water cooler', group: 'Office',
      spawn: (sim, pos, yaw) => place(sim, vox(4, 15, 4, (g) => {
        box(g, 0, 0, 0, 4, 9, 4, pal(MAT.sheetmetal, 3));
        box(g, 1, 6, 0, 3, 7, 1, pal(MAT.plastic, 1));
        cylinderY(g, 2, 2, 1.9, 9, 14, pal(MAT.glass, 1), 1);
        cylinderY(g, 2, 2, 1.0, 9, 13, pal(MAT.ice, 3));
        cylinderY(g, 2, 2, 0.8, 14, 15, pal(MAT.glass, 3));
      }), pos, yaw, 'water cooler'),
    },
  ],
});
