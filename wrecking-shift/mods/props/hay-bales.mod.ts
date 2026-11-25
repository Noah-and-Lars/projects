import { MAT, defineMod, pal, place, vox } from '../../src/mods/kit';

/** Round and square hay bales: light, flammable, good for building ramps and bonfires. */
export default defineMod({
  id: 'hay-bales', name: 'Hay Bales', category: 'props', author: 'Wrecking Shift',
  description: 'Square and round straw bales. Light, they burn fast and stack into ramps.',
  props: [
    {
      id: 'hay-bale-square', name: 'Square hay bale', group: 'Farm',
      spawn: (sim, pos, yaw) => place(sim, vox(10, 6, 6, (g) => {
        for (let x = 0; x < 10; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 6; z++) g.set(x, y, z, pal(MAT.leaves, (x * 3 + y + z * 7) % 2 ? 3 : 4));
        for (const x of [2, 7]) for (let y = 0; y < 6; y++) { g.set(x, y, 0, pal(MAT.wire, 1)); g.set(x, y, 5, pal(MAT.wire, 1)); }
      }), pos, yaw, 'hay bale'),
    },
    {
      id: 'hay-bale-round', name: 'Round hay bale', group: 'Farm',
      spawn: (sim, pos, yaw) => place(sim, vox(12, 12, 10, (g) => {
        for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) {
          const dx = x - 5.5, dy = y - 5.5, r = Math.hypot(dx, dy);
          if (r <= 6) for (let z = 0; z < 10; z++) g.set(x, y, z, pal(MAT.leaves, r > 5 ? 2 : (Math.round(r) % 2) + 3));
        }
      }), pos, yaw, 'round bale'),
    },
  ],
});
