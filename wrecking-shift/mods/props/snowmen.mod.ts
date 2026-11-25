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
        // recolour the front-most snow voxel of a column (buttons, eyes), or stick something just in front of it
        const front = (x: number, y: number) => { for (let z = 0; z < 10; z++) if (g.get(x, y, z)) return z; return 5; };
        for (const y of [7, 9, 11]) g.set(5, y, front(5, y), pal(MAT.rock, 0));
        for (const x of [4, 6]) g.set(x, 16, front(x, 16), pal(MAT.rock, 0));
        const nz = front(5, 15);
        box(g, 5, 15, nz - 2, 6, 16, nz, pal(MAT.tile, 3));
        for (let y = 9; y < 13; y++) g.set(3, y, front(3, y), pal(MAT.fabric, 1));
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
