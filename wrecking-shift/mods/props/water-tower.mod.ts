import { MAT, box, cylinderY, defineMod, pal, place, planks, vox } from '../../src/mods/kit';
import { lathe } from './_util';

/** A farm water tower: four braced steel legs carrying a stave-wood tank with a conical roof. */
export default defineMod({
  id: 'water-tower', name: 'Water Tower', category: 'props', author: 'Wrecking Shift',
  description: 'A rural water tower: braced steel legs, a wooden stave tank with iron hoops and a pointed roof. Cut the legs and watch it come down.',
  props: [
    {
      id: 'stave-water-tower', name: 'Stave water tower', group: 'Structures',
      spawn: (sim, pos, yaw) => place(sim, vox(34, 110, 34, (g) => {
        const c = 17;
        const steel = pal(MAT.steel, 2);
        const legs: [number, number][] = [[3, 3], [30, 3], [3, 30], [30, 30]];
        // legs lean inwards slightly
        for (const [lx, lz] of legs) for (let y = 0; y < 60; y++) {
          const t = y / 60;
          const x = Math.round(lx + (c - lx) * t * 0.25), z = Math.round(lz + (c - lz) * t * 0.25);
          box(g, x - 1, y, z - 1, x + 1, y + 1, z + 1, steel);
        }
        // footings
        for (const [lx, lz] of legs) box(g, lx - 2, 0, lz - 2, lx + 2, 2, lz + 2, pal(MAT.concrete, 2));
        // ring braces at two heights, with X braces between neighbouring legs
        for (const y of [20, 40]) {
          const t = y / 60;
          const p = legs.map(([lx, lz]) => [Math.round(lx + (c - lx) * t * 0.25), Math.round(lz + (c - lz) * t * 0.25)]);
          for (let i = 0; i < 4; i++) {
            const [ax, az] = p[[0, 1, 3, 2][i]], [bx, bz] = p[[1, 3, 2, 0][i]];
            for (let s = 0; s <= 30; s++) g.set(Math.round(ax + (bx - ax) * (s / 30)), y, Math.round(az + (bz - az) * (s / 30)), steel);
            for (let s = 0; s <= 20; s++) {
              g.set(Math.round(ax + (bx - ax) * (s / 20)), y - 20 + s, Math.round(az + (bz - az) * (s / 20)), pal(MAT.steel, 1));
            }
          }
        }
        // tank platform + walkway rail
        cylinderY(g, c, c, 16, 60, 62, pal(MAT.steel, 1));
        cylinderY(g, c, c, 16, 62, 67, pal(MAT.steel, 3), 1);
        // wooden stave tank with iron hoops
        cylinderY(g, c, c, 13, 62, 64, planks(MAT.wood, 2, 4, 'z'));
        cylinderY(g, c, c, 13, 64, 92, planks(MAT.wood, 2, 9), 2);
        for (const y of [68, 76, 84, 90]) cylinderY(g, c, c, 13.6, y, y + 1, pal(MAT.steel, 0), 1);
        // conical roof + finial
        lathe(g, c, c, 92, 106, (y) => 14 - (y - 92), planks(MAT.wood, 2, 2));
        box(g, c - 1, 106, c - 1, c + 1, 110, c + 1, pal(MAT.steel, 2));
        // ladder up one leg face
        for (let y = 2; y < 92; y += 3) box(g, c - 2, y, 1, c + 2, y + 1, 2, pal(MAT.steel, 4));
        box(g, c - 2, 0, 1, c - 1, 92, 2, steel); box(g, c + 1, 0, 1, c + 2, 92, 2, steel);
        // spout
        box(g, c - 1, 64, 2, c + 1, 66, 5, pal(MAT.steel, 1));
      }), pos, yaw, 'water tower', { static: true }),
    },
  ],
});
