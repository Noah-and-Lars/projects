import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Open two-seater: a coupe with the roof and side glass taken off. */
export default defineMod({
  id: 'breezeway-roadster', name: 'Breezeway Roadster', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A cream open-top two-seater with a low windscreen and nothing between you and the weather. Light, rear-driven and happiest on sunny back roads.',
  vehicles: [{
    id: 'breezeway-roadster', name: 'Breezeway roadster', group: 'Cars',
    blueprint: () => decorate(carBlueprint({
      id: 'breezeway-roadster', name: 'Breezeway roadster', style: 'coupe', length: 4.0, width: 1.7, height: 1.2,
      paint: MAT.marble, accent: MAT.plastic, wheelR: 0.3, wheelW: 0.24, drive: 'rear',
      mass: 1000, power: 6.2, topSpeed: 33, grip: 2.0,
    }), (d) => {
      const { g } = d;
      const L = g.sz, front = Math.round(L * 0.27), rear = Math.round(L * 0.2);
      const z1 = L - front + 1; // windscreen row is z1 - 1
      const belt = 6;
      d.set(0, g.sy - 3, rear, g.sx, g.sy, z1 - 1, 0); // roof
      d.set(0, belt, rear, 1, g.sy, z1 - 1, 0); d.set(g.sx - 1, belt, rear, g.sx, g.sy, z1 - 1, 0); // side glass + pillars
      d.set(1, belt, rear, g.sx - 1, g.sy, rear + 1, 0); // rear window
      d.set(0, g.sy - 4, z1 - 1, g.sx, g.sy, z1, 0); // trim the windscreen lower
      d.add(0, belt, rear, g.sx, belt + 1, rear + 1, pal(MAT.marble, 2)); // rear deck lip
      d.add(2, belt + 1, rear + 3, g.sx - 2, belt + 2, rear + 5, pal(MAT.rubber, 1)); // folded hood
    }),
  }],
});
