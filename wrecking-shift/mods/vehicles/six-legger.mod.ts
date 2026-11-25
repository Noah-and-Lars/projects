import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Six-wheel-drive buggy. */
export default defineMod({
  id: 'six-legger', name: 'Six-Legger Buggy', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A long roll-cage buggy with six driven wheels, so at least one of them is always touching the ground. Climbs kerbs and rubble without a fuss.',
  vehicles: [{
    id: 'six-legger', name: 'Six-Legger buggy', group: 'Odd',
    blueprint: () => carBlueprint({
      id: 'six-legger', name: 'Six-Legger buggy', style: 'buggy', length: 4.4, width: 1.9,
      paint: MAT.electronics, wheelR: 0.34, wheelW: 0.28, axles: 3, drive: 'all',
      mass: 950, power: 6.8, topSpeed: 25, grip: 2.2,
    }),
  }],
});
