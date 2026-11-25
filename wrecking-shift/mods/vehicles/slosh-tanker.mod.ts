import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Rigid tanker with a round barrel. */
export default defineMod({
  id: 'slosh-tanker', name: 'Slosh Tanker', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A three-axle tanker with a polished barrel that is (thankfully) only full of water. Long, heavy and steady as a train.',
  vehicles: [{
    id: 'slosh-tanker', name: 'Slosh tanker', group: 'Trucks & vans',
    blueprint: () => carBlueprint({
      id: 'slosh-tanker', name: 'Slosh tanker', style: 'tanker', length: 8.4, width: 2.4,
      paint: MAT.sheetmetal, accent: MAT.steel, wheelR: 0.48, axles: 3, drive: 'rear', rearSteer: true,
      mass: 8000, power: 3.3, topSpeed: 20, grip: 1.6,
    }),
  }],
});
