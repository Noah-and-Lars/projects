import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Fast patrol-style saloon with a push bar and a red / blue lamp bar (no insignia). */
export default defineMod({
  id: 'nightjar-interceptor', name: 'Nightjar Interceptor', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An unmarked dark pursuit saloon with a steel push bar and a red-and-blue roof bar. Rear-drive, big engine, sticky tyres.',
  vehicles: [{
    id: 'nightjar-interceptor', name: 'Nightjar interceptor', group: 'Cars',
    blueprint: () => decorate(carBlueprint({
      id: 'nightjar-interceptor', name: 'Nightjar interceptor', style: 'sedan', length: 4.9, width: 1.85,
      paint: MAT.steel, accent: MAT.whitepaint, wheelR: 0.33, wheelW: 0.26, drive: 'rear',
      mass: 1700, power: 7.0, topSpeed: 38, grip: 2.1, bumper: 'bar', lights: true,
    }), (d) => {
      const { g } = d;
      // repaint the lamp bar: red half / lamp / blue half, one row up
      const y = g.sy - 1;
      for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++) {
        if (g.data[g.idx(x, y, z)] >> 3 !== MAT.lamp) continue;
        const c = x < (g.sx >> 1) - 1 ? MAT.plastic : x > (g.sx >> 1) ? MAT.fabric : MAT.lamp;
        d.set(x, y, z, x + 1, y + 1, z + 1, pal(c, c === MAT.lamp ? 0 : 1));
      }
      // white doors
      for (const x of [0, g.sx - 1]) for (let z = 16; z < 30; z++) for (let y = 2; y < 6; y++) if (g.data[g.idx(x, y, z)]) d.set(x, y, z, x + 1, y + 1, z + 1, pal(MAT.whitepaint, 1));
    }),
  }],
});
