import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** A tiny front-drive city car. */
export default defineMod({
  id: 'pip-city', name: 'Pip City Car', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A pocket-sized red runabout built for parking in gaps nobody else can use. Light, nippy and made of very little.',
  vehicles: [{
    id: 'pip-city', name: 'Pip city car', group: 'Cars',
    blueprint: () => carBlueprint({
      id: 'pip-city', name: 'Pip city car', style: 'hatch', length: 3.2, width: 1.5, height: 1.45,
      paint: MAT.plastic, accent: MAT.sheetmetal, wheelR: 0.27, drive: 'front',
      mass: 820, power: 5.8, topSpeed: 25, grip: 1.85,
    }),
  }],
});
