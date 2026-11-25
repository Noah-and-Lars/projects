import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Stretched saloon with rear-axle counter-steer. */
export default defineMod({
  id: 'promenade-limo', name: 'Promenade Limousine', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A gunmetal stretch saloon with room for six and a rear axle that steers to help it round corners. Heavy, smooth and very hard to stop once moving.',
  vehicles: [{
    id: 'promenade-limo', name: 'Promenade limousine', group: 'Cars',
    blueprint: () => carBlueprint({
      id: 'promenade-limo', name: 'Promenade limousine', style: 'limo', length: 6.6, width: 1.9,
      paint: MAT.steel, accent: MAT.gold, wheelR: 0.34, drive: 'rear', rearSteer: true,
      mass: 2400, power: 4.8, topSpeed: 28, grip: 1.8,
    }),
  }],
});
