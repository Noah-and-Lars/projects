import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Six-wheel-drive tipper lorry. */
export default defineMod({
  id: 'rubble-tipper', name: 'Rubble Tipper', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An all-wheel-drive tipper with a steel bed for carting away what you just knocked down. Chunky tyres, low gearing, no manners.',
  vehicles: [{
    id: 'rubble-tipper', name: 'Rubble tipper', group: 'Trucks & vans',
    blueprint: () => carBlueprint({
      id: 'rubble-tipper', name: 'Rubble tipper', style: 'dump', length: 7.0, width: 2.5,
      paint: MAT.paintedmetal, accent: MAT.steel, wheelR: 0.52, wheelW: 0.4, axles: 3, drive: 'all', rearSteer: true,
      mass: 8500, power: 3.4, topSpeed: 18, grip: 1.7,
    }),
  }],
});
