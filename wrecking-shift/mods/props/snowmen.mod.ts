import { MAT, box, defineMod, pal, place, shaded, sphere, vox } from '../../src/mods/kit';

/** Winter yard props: a three-ball snowman with a scarf and a packed-snow fort wall. */
export default defineMod({
  id: 'snowmen', name: 'Snowmen', category: 'props', author: 'Wrecking Shift',
  description: 'A proper three-ball snowman with a fabric scarf, pebble buttons and a bucket hat, and a crenellated snow-fort wall to hide behind.',
  props: [
    {
      id: 'snowman', name: 'Snowman', group: 'Seasonal',
      spawn: (sim, pos, yaw) => place(sim, vox(10, 21, 10, (g) => {
        const snow = shaded(MAT.snow, 2, 1);
        sphere(g, 5, 4.5, 5, 4.6, snow);
        sphere(g, 5, 10.5, 5, 3.4, snow);
        sphere(g, 5, 15.5, 5, 2.5, snow);
        // flatten the bottom so it stands
        box(g, 2, 0, 2, 8, 1, 8, pal(MAT.snow, 2));
        // scarf, buttons, eyes, nose, bucket
        for (let x = 2; x < 8; x++) for (let z = 2; z < 8; z++) if (g.get(x, 13, z)) g.set(x, 13, z, pal(MAT.fabric, 1));
        box(g, 3, 9, 1, 4, 13, 2, pal(MAT.fabric, 1));
        for (const y of [8, 10, 12]) g.set(5, y, 1, pal(MAT.rock, 0));
        g.set(4, 16, 2, pal(MAT.rock, 0)); g.set(6, 16, 2, pal(MAT.rock, 0));
        box(g, 5, 15, 0, 6, 16, 3, pal(MAT.tile, 3));
        box(g, 3, 18, 3, 8, 21, 8, pal(MAT.sheetmetal, 2));
        box(g, 2, 18, 2, 9, 19, 9, pal(MAT.sheetmetal, 1));
      }), pos, yaw, 'snowman'),
    },
    {
      id: 'snow-fort-wall', name: 'Snow fort wall', group: 'Seasonal',
      spawn: (sim, pos, yaw) => place(sim, vox(26, 13, 5, (g) => {
        box(g, 0, 0, 0, 26, 10, 5, shaded(MAT.snow, 3, 7));
        for (let x = 0; x < 26; x += 6) box(g, x, 10, 0, x + 3, 13, 5, shaded(MAT.snow, 3, 8));
        // ice blocks mixed in
        box(g, 6, 3, 0, 9, 6, 5, pal(MAT.ice, 2)); box(g, 17, 6, 0, 20, 9, 5, pal(MAT.ice, 1));
      }), pos, yaw, 'snow wall'),
    },
  ],
});
