import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Low two-door rear-drive coupe. */
export default defineMod({
  id: 'swiftlet-coupe', name: 'Swiftlet Coupe', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A low red two-door with gold trim and too much engine for its rear tyres. Fast in a straight line, lively in corners.',
  vehicles: [{
    id: 'swiftlet-coupe', name: 'Swiftlet coupe', group: 'Cars',
    blueprint: () => carBlueprint({
      id: 'swiftlet-coupe', name: 'Swiftlet coupe', style: 'coupe', length: 4.3, width: 1.8,
      paint: MAT.plastic, accent: MAT.gold, wheelR: 0.31, wheelW: 0.26, drive: 'rear',
      mass: 1250, power: 6.6, topSpeed: 35, grip: 2.0,
    }),
  }],
});
