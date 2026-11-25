import type { VoxelBody } from '../../src/sim/body';
import { MAT, defineMod, pal, place, sphere, vox } from '../../src/mods/kit';
import { lathe, placeLocal } from './_util';

/** a skittle profile, scaled up 2x so it reads at voxel scale (0.8 m tall) */
const pin = () => vox(4, 8, 4, (g) => {
  const r = [1.4, 1.8, 2, 2, 1.6, 1.0, 1.3, 1.1];
  lathe(g, 2, 2, 0, 8, (y) => r[y], (_x, y) => (y === 5 ? pal(MAT.plastic, 2) : pal(MAT.marble, 3)));
});

const ball = (r: number) => vox(r * 2, r * 2, r * 2, (g) => {
  sphere(g, r, r, r, r, pal(MAT.rubber, 2));
  g.set(r - 1, r + 1, 0, 0); g.set(r + 1, r + 1, 0, 0); g.set(r, r - 1, 0, 0);
});

/** Oversized bowling: a triangle rack of ten loose pins and a heavy rubber ball to roll at them. */
export default defineMod({
  id: 'bowling-set', name: 'Yard Bowling', category: 'props', author: 'Wrecking Shift',
  description: 'Ten oversized pins racked in a triangle, plus a heavy ball. Roll it, kick it, or bring a vehicle.',
  props: [
    {
      id: 'bowling-pins', name: 'Pin rack (10)', group: 'Sports',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        // head pin nearest the player, rows going away (-Z)
        for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++)
          out.push(placeLocal(sim, pin(), pos, yaw, (i - row / 2) * 0.6, 0, -row * 0.52, 'bowling pin'));
        return out;
      },
    },
    { id: 'bowling-ball', name: 'Bowling ball', group: 'Sports', spawn: (sim, pos, yaw) => place(sim, ball(3), pos, yaw, 'bowling ball') },
  ],
});
