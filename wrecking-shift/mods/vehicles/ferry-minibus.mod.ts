import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Twelve-seat minibus. */
export default defineMod({
  id: 'ferry-minibus', name: 'Ferry Minibus', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A long amber minibus with a row of windows and twelve seats that smell of crisps. Soft-sprung and a little roly-poly in the bends.',
  vehicles: [{
    id: 'ferry-minibus', name: 'Ferry minibus', group: 'Trucks & vans',
    blueprint: () => carBlueprint({
      id: 'ferry-minibus', name: 'Ferry minibus', style: 'van', length: 6.0, width: 2.0, height: 2.45,
      paint: MAT.paintedmetal, accent: MAT.rubber, wheelR: 0.36, drive: 'rear',
      mass: 2900, power: 4.2, topSpeed: 24, grip: 1.75,
    }),
  }],
});
