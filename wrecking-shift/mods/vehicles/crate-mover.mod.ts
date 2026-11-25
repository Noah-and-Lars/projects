import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Box truck in two liveries: dry goods and a chilled body. */
export default defineMod({
  id: 'crate-mover', name: 'Crate Mover Box Trucks', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A seven-metre box truck with a timber-lined body, plus a chilled variant with a pale insulated box. Slow off the line, but it keeps going through walls.',
  vehicles: [
    {
      id: 'crate-mover', name: 'Crate Mover box truck', group: 'Trucks & vans',
      blueprint: () => carBlueprint({
        id: 'crate-mover', name: 'Crate Mover box truck', style: 'boxtruck', length: 7.2, width: 2.3,
        paint: MAT.fabric, accent: MAT.paintedmetal, cargo: MAT.crate, wheelR: 0.48, drive: 'rear',
        mass: 5500, power: 3.4, topSpeed: 21, grip: 1.6,
      }),
    },
    {
      id: 'crate-mover-chiller', name: 'Crate Mover chiller', group: 'Trucks & vans',
      blueprint: () => carBlueprint({
        id: 'crate-mover-chiller', name: 'Crate Mover chiller', style: 'boxtruck', length: 7.6, width: 2.4, height: 3.2,
        paint: MAT.sheetmetal, accent: MAT.fabric, cargo: MAT.plaster, wheelR: 0.48, axles: 3, drive: 'rear', rearSteer: true,
        mass: 6400, power: 3.3, topSpeed: 20, grip: 1.6,
      }),
    },
  ],
});
