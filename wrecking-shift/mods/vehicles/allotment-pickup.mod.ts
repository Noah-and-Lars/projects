import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** A small rust-red pickup with a plank bed. */
export default defineMod({
  id: 'allotment-pickup', name: 'Allotment Pickup', category: 'vehicles', author: 'Wrecking Shift',
  description: 'Small two-seat pickup with an open timber bed. Rear-wheel drive, light and twitchy.',
  vehicles: [{
    id: 'allotment-pickup', name: 'Allotment pickup', group: 'Cars',
    blueprint: () => carBlueprint({ id: 'allotment-pickup', name: 'Allotment pickup', style: 'pickup', length: 4.4, width: 1.7, paint: MAT.tile, cargo: MAT.wood, drive: 'rear', topSpeed: 26 }),
  }],
});
