import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Three-axle flatbed lorry. */
export default defineMod({
  id: 'long-deck', name: 'Long Deck Flatbed', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An amber three-axle flatbed with a plank deck and a headboard. Haul props on the back, or just reverse it into things.',
  vehicles: [{
    id: 'long-deck', name: 'Long Deck flatbed', group: 'Trucks & vans',
    blueprint: () => carBlueprint({
      id: 'long-deck', name: 'Long Deck flatbed', style: 'flatbed', length: 8.0, width: 2.4,
      paint: MAT.paintedmetal, accent: MAT.steel, cargo: MAT.wood, wheelR: 0.48, axles: 3, drive: 'rear', rearSteer: true,
      mass: 6500, power: 3.4, topSpeed: 21, grip: 1.6,
    }),
  }],
});
