import type { VoxelBody } from '../../src/sim/body';
import { MAT, box, defineMod, pal, vox } from '../../src/mods/kit';
import { placeLocal } from './_util';

const tile = () => vox(6, 12, 2, (g) => {
  box(g, 0, 0, 0, 6, 12, 2, pal(MAT.marble, 2));
  box(g, 0, 6, 0, 6, 7, 2, pal(MAT.rubber, 1));
  // pips on both faces
  for (const [x, y] of [[1, 2], [4, 4], [2, 9], [4, 10], [1, 10]]) { g.set(x, y, 0, pal(MAT.rubber, 0)); g.set(x, y, 1, pal(MAT.rubber, 0)); }
});

/** Waist-high dominoes stood in a line (each its own body) that run away from the player. */
export default defineMod({
  id: 'giant-dominoes', name: 'Giant Dominoes', category: 'props', author: 'Wrecking Shift',
  description: 'A run of waist-high dominoes, each one a separate tile. Tip the first and watch the chain go; a curved run is included.',
  props: [
    {
      id: 'domino-run', name: 'Domino run (14)', group: 'Toys',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        for (let i = 0; i < 14; i++) out.push(placeLocal(sim, tile(), pos, yaw, 0, 0, -i * 0.7, 'domino'));
        return out;
      },
    },
    {
      id: 'domino-curve', name: 'Domino curve (16)', group: 'Toys',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        // a quarter-circle of radius 3 m, each tile turned to face along the arc
        for (let i = 0; i < 16; i++) {
          const a = (i / 15) * (Math.PI / 2);
          out.push(placeLocal(sim, tile(), pos, yaw, 3 - Math.cos(a) * 3, 0, -Math.sin(a) * 3, 'domino', { spin: -a }));
        }
        return out;
      },
    },
  ],
});
