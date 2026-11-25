import { MAT, box, clear, defineMod, pal, place, planks, vox } from '../../src/mods/kit';

/** Bedroom storage: a double wardrobe stuffed with clothes and a chest of drawers. */
export default defineMod({
  id: 'wardrobes', name: 'Wardrobes & Drawers', category: 'props', author: 'Wrecking Shift',
  description: 'A tall double wardrobe with hanging clothes behind thin doors, and a squat chest of drawers. Pure firewood.',
  props: [
    {
      id: 'double-wardrobe', name: 'Double wardrobe', group: 'Furniture',
      spawn: (sim, pos, yaw) => place(sim, vox(12, 20, 6, (g) => {
        box(g, 0, 0, 0, 12, 20, 6, pal(MAT.wood, 0));
        clear(g, 1, 2, 0, 11, 19, 5);
        // hanging rail + clothes
        box(g, 1, 16, 2, 11, 17, 3, pal(MAT.steel, 2));
        for (let x = 1; x < 11; x++) box(g, x, 7 + (x % 3), 1, x + 1, 16, 5, pal(MAT.fabric, x % 5));
        // two doors with a gap and knobs
        box(g, 1, 2, 0, 6, 19, 1, planks(MAT.wood, 2, 5, 'y'));
        box(g, 6, 2, 0, 11, 19, 1, planks(MAT.wood, 2, 6, 'y'));
        g.set(5, 10, 0, pal(MAT.gold, 2)); g.set(6, 10, 0, pal(MAT.gold, 2));
        box(g, 0, 19, 0, 12, 20, 6, pal(MAT.wood, 1));
      }), pos, yaw, 'wardrobe'),
    },
    {
      id: 'chest-of-drawers', name: 'Chest of drawers', group: 'Furniture',
      spawn: (sim, pos, yaw) => place(sim, vox(10, 9, 5, (g) => {
        box(g, 0, 0, 0, 10, 9, 5, pal(MAT.wood, 0));
        for (const y of [1, 4, 7]) {
          box(g, 1, y, 0, 9, y + 2, 1, pal(MAT.wood, 3));
          g.set(4, y + 1, 0, pal(MAT.steel, 2)); g.set(5, y + 1, 0, pal(MAT.steel, 2));
          clear(g, 2, y, 1, 8, y + 2, 4);
          box(g, 2, y, 1, 8, y + 1, 4, pal(MAT.fabric, y % 5));
        }
      }), pos, yaw, 'chest of drawers'),
    },
  ],
});
