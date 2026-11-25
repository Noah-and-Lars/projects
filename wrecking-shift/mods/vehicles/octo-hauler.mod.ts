import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Four-axle heavy box hauler. */
export default defineMod({
  id: 'octo-hauler', name: 'Octo Hauler', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An eight-wheeled, ten-metre rigid hauler with a crate-built body. Two steering axles up front and a counter-steering rear keep it from needing a field to turn in.',
  vehicles: [{
    id: 'octo-hauler', name: 'Octo hauler', group: 'Heavy',
    blueprint: () => carBlueprint({
      id: 'octo-hauler', name: 'Octo hauler', style: 'boxtruck', length: 10.4, width: 2.5, height: 3.4,
      paint: MAT.electronics, accent: MAT.gold, cargo: MAT.crate, wheelR: 0.5, axles: 4, drive: 'rear', rearSteer: true,
      mass: 14000, power: 3.1, topSpeed: 19, grip: 1.6,
    }),
  }],
});
