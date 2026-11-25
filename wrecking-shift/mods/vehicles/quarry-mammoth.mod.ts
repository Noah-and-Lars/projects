import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Huge-wheeled quarry dumper. */
export default defineMod({
  id: 'quarry-mammoth', name: 'Quarry Mammoth', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A twenty-six-tonne quarry dumper on wheels taller than you are. Rolls over rubble, rolls over cars, rolls over most things.',
  vehicles: [{
    id: 'quarry-mammoth', name: 'Quarry Mammoth dumper', group: 'Heavy',
    blueprint: () => carBlueprint({
      id: 'quarry-mammoth', name: 'Quarry Mammoth dumper', style: 'dump', length: 8.6, width: 3.4, height: 3.8,
      paint: MAT.paintedmetal, accent: MAT.steel, wheelR: 0.95, wheelW: 0.45, drive: 'all', rearSteer: true,
      mass: 26000, power: 2.8, topSpeed: 13, grip: 1.8, bumper: 'bar', ram: 4,
    }),
  }],
});
