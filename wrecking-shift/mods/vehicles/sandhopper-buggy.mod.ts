import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Open roll-cage dune buggy. */
export default defineMod({
  id: 'sandhopper-buggy', name: 'Sandhopper Dune Buggy', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An open roll-cage dune buggy on fat tyres with four-wheel drive. Light enough to leap off every bump on the map.',
  vehicles: [{
    id: 'sandhopper-buggy', name: 'Sandhopper dune buggy', group: 'Odd',
    blueprint: () => carBlueprint({
      id: 'sandhopper-buggy', name: 'Sandhopper dune buggy', style: 'buggy', length: 3.4, width: 1.8,
      paint: MAT.paintedmetal, wheelR: 0.36, wheelW: 0.3, drive: 'all',
      mass: 700, power: 7.0, topSpeed: 27, grip: 2.3,
    }),
  }],
});
