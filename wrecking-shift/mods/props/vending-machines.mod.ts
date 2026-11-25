import { MAT, box, clear, defineMod, pal, place, shell, vox } from '../../src/mods/kit';

/** Corner-shop machines: a snack dispenser with a glass front and a humming drinks cooler. */
export default defineMod({
  id: 'vending-machines', name: 'Vending Machines', category: 'props', author: 'Wrecking Shift',
  description: 'A snack dispenser with spiral shelves behind glass and a glass-door drinks cooler. Heavy, top-heavy and full of loot.',
  props: [
    {
      id: 'snack-dispenser', name: 'Snack dispenser', group: 'Shop',
      spawn: (sim, pos, yaw) => place(sim, vox(9, 18, 8, (g) => {
        box(g, 0, 0, 0, 9, 18, 8, pal(MAT.paintedmetal, 2));
        clear(g, 1, 3, 0, 6, 16, 7);
        // shelves of snacks (plastic packets in alternating shades)
        for (const y of [3, 6, 9, 12]) {
          box(g, 1, y, 2, 6, y + 1, 7, pal(MAT.sheetmetal, 1));
          for (let x = 1; x < 6; x++) box(g, x, y + 1, 3, x + 1, y + 3, 6, pal(MAT.plastic, (x + y) % 5));
        }
        box(g, 1, 3, 0, 6, 16, 1, pal(MAT.glass, 2));
        // keypad column + coin slot + pickup flap
        box(g, 6, 8, 0, 8, 13, 1, pal(MAT.electronics, 2));
        box(g, 6, 13, 0, 8, 14, 1, pal(MAT.lamp, 0));
        box(g, 1, 1, 0, 6, 2, 1, pal(MAT.rubber, 1));
        box(g, 0, 17, 0, 9, 18, 8, pal(MAT.lamp, 0));
      }), pos, yaw, 'snack dispenser'),
    },
    {
      id: 'drinks-cooler', name: 'Drinks cooler', group: 'Shop',
      spawn: (sim, pos, yaw) => place(sim, vox(8, 19, 7, (g) => {
        shell(g, 0, 0, 0, 8, 19, 7, 1, pal(MAT.whitepaint, 2));
        box(g, 0, 0, 0, 8, 2, 7, pal(MAT.sheetmetal, 0));
        box(g, 0, 18, 0, 8, 19, 7, pal(MAT.paintedmetal, 1));
        box(g, 1, 17, 1, 7, 18, 6, pal(MAT.lamp, 0));
        // bottles on wire shelves
        for (const y of [2, 6, 10, 14]) {
          box(g, 1, y, 1, 7, y + 1, 6, pal(MAT.wire, 1));
          for (let x = 1; x < 7; x += 1) for (let z = 2; z < 6; z += 2) box(g, x, y + 1, z, x + 1, y + 3, z + 1, (x + z) % 3 ? pal(MAT.glass, 3) : pal(MAT.plastic, 2));
        }
        // glass door with a handle
        box(g, 1, 2, 0, 7, 17, 1, pal(MAT.glass, 1));
        box(g, 6, 7, 0, 7, 12, 1, pal(MAT.steel, 2));
      }), pos, yaw, 'drinks cooler'),
    },
  ],
});
