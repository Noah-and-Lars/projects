import type { VoxelBody } from '../../src/sim/body';
import { MAT, box, clear, defineMod, pal, vox } from '../../src/mods/kit';
import { placeLocal } from './_util';

/** a hollow slatted crate n voxels on a side, with a darker frame and a diagonal brace on each face */
function slatCrate(n: number, seed: number) {
  return vox(n, n, n, (g) => {
    box(g, 0, 0, 0, n, n, n, (x, y, z) => pal(MAT.crate, ((x + y * 3 + z * 5 + seed) >> 1) % 5));
    clear(g, 1, 1, 1, n - 1, n - 1, n - 1);
    const fr = pal(MAT.wood, 0);
    for (let i = 0; i < n; i++) {
      for (const [a, b] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) { g.set(i, a, b, fr); g.set(a, i, b, fr); g.set(a, b, i, fr); }
      g.set(i, i, 0, fr); g.set(i, i, n - 1, fr); g.set(0, i, i, fr); g.set(n - 1, i, i, fr);
    }
  });
}

/** Warehouse crates: a carnival-style pyramid of ten and a wall of nine big ones. */
export default defineMod({
  id: 'crate-pyramid', name: 'Crate Pyramid', category: 'props', author: 'Wrecking Shift',
  description: 'Ten loose slatted crates stacked 4-3-2-1 for a satisfying knock-down, and a three-by-three wall of big shipping crates.',
  props: [
    {
      id: 'crate-pyramid-10', name: 'Crate pyramid (10)', group: 'Industrial',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        const s = 0.8;
        for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++)
          out.push(placeLocal(sim, slatCrate(8, row * 4 + i), pos, yaw, (i - (3 - row) / 2) * (s + 0.02), row * (s + 0.005), 0, 'crate'));
        return out;
      },
    },
    {
      id: 'crate-wall-9', name: 'Crate wall (9)', group: 'Industrial',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++)
          out.push(placeLocal(sim, slatCrate(10, row * 3 + i + 20), pos, yaw, (i - 1) * 1.02 + (row % 2 ? 0.05 : 0), row * 1.005, 0, 'crate'));
        return out;
      },
    },
  ],
});
