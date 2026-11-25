import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Single-deck city bus with rear steer. */
export default defineMod({
  id: 'loop-line-bus', name: 'Loop Line Bus', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An eleven-metre single-deck city bus with a glass-sided saloon and a rear engine. It turns tighter than it looks thanks to a steering rear axle.',
  vehicles: [{
    id: 'loop-line-bus', name: 'Loop Line bus', group: 'Trucks & vans',
    blueprint: () => carBlueprint({
      id: 'loop-line-bus', name: 'Loop Line bus', style: 'bus', length: 11, width: 2.5, height: 3.0,
      paint: MAT.plastic, accent: MAT.sheetmetal, wheelR: 0.5, drive: 'rear', rearSteer: true,
      mass: 11000, power: 3.1, topSpeed: 19, grip: 1.6,
    }),
  }],
});
