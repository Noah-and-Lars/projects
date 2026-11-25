import { MAT, box, cylinderY, defineMod, pal, place, vox, type VoxelGrid } from '../../src/mods/kit';

function cylinder(g: VoxelGrid, cx: number, cz: number, y0: number): void {
  // explosive core in a painted shell, a domed shoulder and a brass valve
  cylinderY(g, cx, cz, 2, y0, y0 + 12, pal(MAT.explosive, 2));
  cylinderY(g, cx, cz, 2, y0 + 3, y0 + 4, pal(MAT.paintedmetal, 1));
  cylinderY(g, cx, cz, 1.4, y0 + 12, y0 + 13, pal(MAT.explosive, 1));
  g.set(Math.floor(cx), y0 + 13, Math.floor(cz), pal(MAT.gold, 2));
}

/** Pressurised gas bottles: one on its own or six chained in a steel cage. Both go off when punctured. */
export default defineMod({
  id: 'gas-cylinders', name: 'Gas Cylinders', category: 'props', author: 'Wrecking Shift',
  description: 'Tall pressurised gas bottles, alone or six in a steel cage. Puncture one and the rest follow.',
  props: [
    {
      id: 'gas-cylinder', name: 'Gas cylinder', group: 'Explosive',
      spawn: (sim, pos, yaw) => place(sim, vox(4, 14, 4, (g) => cylinder(g, 2, 2, 0)), pos, yaw, 'gas cylinder', { tags: ['explosive'] }),
    },
    {
      id: 'gas-cylinder-cage', name: 'Gas cylinder cage', group: 'Explosive',
      spawn: (sim, pos, yaw) => place(sim, vox(14, 16, 10, (g) => {
        box(g, 0, 0, 0, 14, 1, 10, pal(MAT.steel, 1));
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) cylinder(g, 2.5 + i * 4.5, 2.7 + j * 4.6, 1);
        // cage posts and rails
        for (const [x, z] of [[0, 0], [13, 0], [0, 9], [13, 9]]) box(g, x, 1, z, x + 1, 16, z + 1, pal(MAT.steel, 2));
        for (const y of [5, 10, 15]) {
          box(g, 0, y, 0, 14, y + 1, 1, pal(MAT.steel, 2)); box(g, 0, y, 9, 14, y + 1, 10, pal(MAT.steel, 2));
          box(g, 0, y, 0, 1, y + 1, 10, pal(MAT.steel, 2)); box(g, 13, y, 0, 14, y + 1, 10, pal(MAT.steel, 2));
        }
        // warning plate
        box(g, 5, 9, 0, 9, 11, 1, pal(MAT.paintedmetal, 3));
      }), pos, yaw, 'gas cage', { tags: ['explosive'] }),
    },
  ],
});
