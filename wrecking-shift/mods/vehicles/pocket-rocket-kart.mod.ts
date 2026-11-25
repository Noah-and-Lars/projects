import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Go-kart in two colours. */
export default defineMod({
  id: 'pocket-rocket-kart', name: 'Pocket Rocket Karts', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A pair of low go-karts with a lawnmower-sized engine and no suspension worth mentioning. Knee-high, zippy and hilarious into a wall.',
  vehicles: [
    {
      id: 'pocket-rocket-kart', name: 'Pocket Rocket kart', group: 'Odd',
      blueprint: () => carBlueprint({
        id: 'pocket-rocket-kart', name: 'Pocket Rocket kart', style: 'kart', length: 2.0, width: 1.3,
        paint: MAT.plastic, wheelR: 0.21, wheelW: 0.2, drive: 'rear',
        mass: 220, power: 6.5, topSpeed: 20, grip: 2.2,
      }),
    },
    {
      id: 'pocket-rocket-kart-gold', name: 'Pocket Rocket kart (gold)', group: 'Odd',
      blueprint: () => carBlueprint({
        id: 'pocket-rocket-kart-gold', name: 'Pocket Rocket kart (gold)', style: 'kart', length: 2.1, width: 1.3,
        paint: MAT.gold, wheelR: 0.21, wheelW: 0.22, drive: 'rear',
        mass: 230, power: 7.2, topSpeed: 22, grip: 2.2,
      }),
    },
  ],
});
