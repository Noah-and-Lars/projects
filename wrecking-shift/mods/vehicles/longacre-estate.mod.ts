import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** A long-roof family estate. */
export default defineMod({
  id: 'longacre-estate', name: 'Longacre Estate', category: 'vehicles', author: 'Wrecking Shift',
  description: 'Bottle-green family estate with a boot big enough for a fridge and two dogs. Steady, roomy and unflappable.',
  vehicles: [{
    id: 'longacre-estate', name: 'Longacre estate', group: 'Cars',
    blueprint: () => carBlueprint({
      id: 'longacre-estate', name: 'Longacre estate', style: 'wagon', length: 4.8, width: 1.8,
      paint: MAT.electronics, accent: MAT.sheetmetal, wheelR: 0.32, drive: 'front',
      mass: 1450, power: 5.0, topSpeed: 28, grip: 1.85,
    }),
  }],
});
