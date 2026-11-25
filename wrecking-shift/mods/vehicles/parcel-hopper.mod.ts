import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Short-nosed delivery van. */
export default defineMod({
  id: 'parcel-hopper', name: 'Parcel Hopper', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A tall red-trimmed delivery van that stops every forty metres for a living. Rear-drive, easy to place and surprisingly brisk empty.',
  vehicles: [{
    id: 'parcel-hopper', name: 'Parcel Hopper van', group: 'Trucks & vans',
    blueprint: () => carBlueprint({
      id: 'parcel-hopper', name: 'Parcel Hopper van', style: 'van', length: 5.2, width: 1.95, height: 2.2,
      paint: MAT.sheetmetal, accent: MAT.plastic, wheelR: 0.35, drive: 'rear',
      mass: 2100, power: 4.4, topSpeed: 24, grip: 1.75,
    }),
  }],
});
