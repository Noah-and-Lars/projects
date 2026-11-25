import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Armoured ram truck: steel body, slatted windows, ram plate. */
export default defineMod({
  id: 'bastion-ram', name: 'Bastion Ram Truck', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A steel-plated box truck with slatted window armour and a ram plate the size of a door. Only explosives really dent it.',
  vehicles: [{
    id: 'bastion-ram', name: 'Bastion ram truck', group: 'Heavy',
    blueprint: () => decorate(carBlueprint({
      id: 'bastion-ram', name: 'Bastion ram truck', style: 'boxtruck', length: 6.6, width: 2.5, height: 2.9,
      paint: MAT.steel, accent: MAT.steel, cargo: MAT.steel, wheelR: 0.55, wheelW: 0.42, drive: 'all',
      mass: 12000, power: 3.3, topSpeed: 20, grip: 1.8, bumper: 'ram', ram: 6,
    }), (d) => {
      const { g } = d;
      // armour slats over every other row of glass
      for (let i = 0; i < g.data.length; i++) {
        if (g.data[i] >> 3 !== MAT.glass) continue;
        const y = Math.floor(i / g.sx) % g.sy;
        if (y % 2 === 0) g.data[i] = pal(MAT.steel, 0);
      }
      // wedge on the ram plate
      d.set(2, 0, g.sz - 1, g.sx - 2, 8, g.sz, pal(MAT.steel, 1));
    }),
  }],
});
