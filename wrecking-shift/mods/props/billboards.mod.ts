import { MAT, box, defineMod, pal, place, vox } from '../../src/mods/kit';

/** Roadside advertising: a big two-post billboard with floodlights and a small A-frame sandwich board. */
export default defineMod({
  id: 'billboards', name: 'Billboards', category: 'props', author: 'Wrecking Shift',
  description: 'A six-metre roadside billboard on steel posts with a catwalk and floodlights (anchored), and a wooden A-frame pavement sign.',
  props: [
    {
      id: 'roadside-billboard', name: 'Roadside billboard', group: 'Structures',
      spawn: (sim, pos, yaw) => place(sim, vox(60, 62, 8, (g) => {
        const steel = pal(MAT.steel, 2);
        for (const x of [14, 44]) { box(g, x, 0, 4, x + 2, 32, 6, steel); box(g, x - 2, 0, 2, x + 4, 2, 8, pal(MAT.concrete, 2)); }
        // frame + plywood backing + paper face (a sun over hills in fabric/plastic blocks)
        box(g, 0, 32, 4, 60, 62, 5, pal(MAT.wood, 0));
        box(g, 0, 32, 3, 60, 62, 4, pal(MAT.plaster, 4));
        for (let x = 0; x < 60; x++) {
          const hill = 36 + Math.round(5 + 4 * Math.sin(x / 7));
          for (let y = 32; y < hill; y++) g.set(x, y, 3, pal(MAT.leaves, 2 + (x >> 4) % 2));
        }
        for (let x = 36; x < 48; x++) for (let y = 46; y < 58; y++) if (Math.hypot(x - 42, y - 52) < 5.5) g.set(x, y, 3, pal(MAT.paintedmetal, 2));
        box(g, 4, 50, 3, 30, 54, 4, pal(MAT.fabric, 0));
        box(g, 0, 32, 3, 60, 33, 5, steel); box(g, 0, 61, 3, 60, 62, 5, steel);
        // catwalk with rail and three floodlights on arms
        box(g, 0, 31, 0, 60, 32, 4, pal(MAT.sheetmetal, 1));
        box(g, 0, 36, 0, 60, 37, 1, steel);
        for (let x = 0; x < 60; x += 10) box(g, x, 32, 0, x + 1, 36, 1, steel);
        for (const x of [10, 30, 50]) { box(g, x, 37, 0, x + 1, 40, 1, steel); box(g, x - 1, 40, 0, x + 2, 41, 2, pal(MAT.lamp, 0)); }
      }), pos, yaw, 'billboard', { static: true }),
    },
    {
      id: 'sandwich-board', name: 'A-frame sign', group: 'Structures',
      spawn: (sim, pos, yaw) => place(sim, vox(6, 9, 6, (g) => {
        for (let y = 0; y < 9; y++) {
          const z = Math.round(y / 3);
          box(g, 0, y, z, 6, y + 1, z + 1, y > 2 && y < 8 ? pal(MAT.char, 1) : pal(MAT.wood, 1));
          box(g, 0, y, 5 - z, 6, y + 1, 6 - z, y > 2 && y < 8 ? pal(MAT.char, 1) : pal(MAT.wood, 1));
        }
        box(g, 1, 5, 0, 5, 6, 1, pal(MAT.plaster, 3));
      }), pos, yaw, 'a-frame sign'),
    },
  ],
});
