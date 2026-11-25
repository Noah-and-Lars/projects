import type { VoxelBody } from '../../src/sim/body';
import { MAT, box, defineMod, pal, place, vox } from '../../src/mods/kit';
import { lathe, placeLocal } from './_util';

const cone = () => vox(5, 8, 5, (g) => {
  box(g, 0, 0, 0, 5, 1, 5, pal(MAT.rubber, 1));
  lathe(g, 2.5, 2.5, 1, 8, (y) => 2.2 - (y - 1) * 0.27, (_x, y) => (y === 4 || y === 5 ? pal(MAT.plaster, 4) : pal(MAT.plastic, 3)));
});

/** Street works kit: a row of plastic traffic cones, a striped barrier and a flashing lamp post. */
export default defineMod({
  id: 'roadworks', name: 'Roadworks', category: 'props', author: 'Wrecking Shift',
  description: 'A line of eight light plastic traffic cones and a striped road barrier with blinker lamps. Perfect for driving through.',
  props: [
    {
      id: 'traffic-cone-row', name: 'Traffic cones (8)', group: 'Roadworks',
      spawn: (sim, pos, yaw) => {
        const out: VoxelBody[] = [];
        for (let i = 0; i < 8; i++) out.push(placeLocal(sim, cone(), pos, yaw, (i - 3.5) * 1.0, 0, 0, 'traffic cone'));
        return out;
      },
    },
    {
      id: 'road-barrier', name: 'Road barrier', group: 'Roadworks',
      spawn: (sim, pos, yaw) => place(sim, vox(20, 11, 5, (g) => {
        // weighted rubber feet + plastic posts + striped plank + two lamps
        for (const x of [1, 16]) { box(g, x, 0, 0, x + 3, 1, 5, pal(MAT.rubber, 2)); box(g, x + 1, 1, 2, x + 2, 9, 3, pal(MAT.plastic, 1)); }
        for (let x = 0; x < 20; x++) box(g, x, 6, 2, x + 1, 8, 3, ((x >> 1) % 2) ? pal(MAT.plastic, 3) : pal(MAT.plaster, 4));
        for (const x of [2, 17]) box(g, x, 9, 2, x + 1, 11, 3, pal(MAT.alarmbox, 1));
      }), pos, yaw, 'road barrier'),
    },
  ],
});
