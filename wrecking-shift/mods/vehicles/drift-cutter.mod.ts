import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Snow plough: grit-spreader body and a wide angled blade. */
export default defineMod({
  id: 'drift-cutter', name: 'Drift Cutter Plough', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An amber gritting lorry with a wide angled plough blade and a hopper of sand. All-wheel drive and beacons, for clearing roads or clearing anything.',
  vehicles: [{
    id: 'drift-cutter', name: 'Drift Cutter plough', group: 'Heavy',
    blueprint: () => decorate(carBlueprint({
      id: 'drift-cutter', name: 'Drift Cutter plough', style: 'plow', length: 7.0, width: 2.5,
      paint: MAT.paintedmetal, accent: MAT.rubber, cargo: MAT.sheetmetal, wheelR: 0.5, wheelW: 0.36, drive: 'all',
      mass: 9000, power: 3.3, topSpeed: 17, grip: 1.8, bumper: 'blade', ram: 4, lights: true,
    }), (d) => {
      const { g } = d;
      // marker posts on the blade ends
      d.add(0, 9, g.sz - 1, 1, 15, g.sz, pal(MAT.wire, 1)); d.add(g.sx - 1, 9, g.sz - 1, g.sx, 15, g.sz, pal(MAT.wire, 1));
      // sand in the hopper
      d.add(1, 5, 2, g.sx - 1, 8, Math.round(g.sz * 0.68) - 2, pal(MAT.sand, 2));
    }),
  }],
});
