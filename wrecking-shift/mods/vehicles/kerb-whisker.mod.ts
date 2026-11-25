import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Street sweeper with twin bristle brushes and a hopper body. */
export default defineMod({
  id: 'kerb-whisker', name: 'Kerb Whisker Sweeper', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A stubby street sweeper with twin yellow brushes under the nose and a hopper full of gutter grit. Crawls along the kerb, flashing its beacons.',
  vehicles: [{
    id: 'kerb-whisker', name: 'Kerb Whisker sweeper', group: 'Heavy',
    blueprint: () => decorate(carBlueprint({
      id: 'kerb-whisker', name: 'Kerb Whisker sweeper', style: 'boxtruck', length: 5.2, width: 2.1, height: 2.7,
      paint: MAT.whitepaint, accent: MAT.paintedmetal, cargo: MAT.paintedmetal, wheelR: 0.42, drive: 'rear',
      mass: 6000, power: 3.2, topSpeed: 14, grip: 1.7, bumper: 'none', lights: true,
    }), (d) => {
      const { g } = d;
      // two brush discs at the front corners (bristles = yellow wire), hub = rubber
      const R = 3, cz = g.sz - 3;
      for (const cx of [3, g.sx - 4]) {
        for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
          const dd = (x - cx) ** 2 + (z - cz) ** 2;
          if (dd <= R * R) d.add(x, 0, z, x + 1, 1, z + 1, pal(dd < 3 ? MAT.rubber : MAT.wire, (x + z) & 1));
        }
      }
      // suction nozzle across the middle and a hopper hatch stripe
      d.add(4, 0, g.sz >> 1, g.sx - 4, 1, (g.sz >> 1) + 2, pal(MAT.rubber, 1));
      d.add(0, 10, 2, g.sx, 11, g.sz - 18, pal(MAT.paintedmetal, 2));
    }),
  }],
});
