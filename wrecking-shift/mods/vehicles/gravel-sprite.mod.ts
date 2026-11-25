import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** All-wheel-drive rally hatch with a roof scoop and a rear wing. */
export default defineMod({
  id: 'gravel-sprite', name: 'Gravel Sprite', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A blue-and-gold rally hatch with four driven wheels, a roof scoop and a rear wing. Grips like a limpet on dirt and loves a handbrake turn.',
  vehicles: [{
    id: 'gravel-sprite', name: 'Gravel Sprite rally hatch', group: 'Cars',
    blueprint: () => decorate(carBlueprint({
      id: 'gravel-sprite', name: 'Gravel Sprite rally hatch', style: 'hatch', length: 3.9, width: 1.75,
      paint: MAT.fabric, accent: MAT.gold, wheelR: 0.32, wheelW: 0.25, drive: 'all',
      mass: 1150, power: 6.8, topSpeed: 31, grip: 2.25,
    }), (d) => {
      const { g } = d;
      const top = g.sy - 2; // roof row is sy - 3
      const mid = g.sx >> 1;
      d.add(mid - 2, top, 18, mid + 2, top + 1, 22, pal(MAT.gold, 1)); // roof scoop
      // rear wing on two struts above the tailgate
      d.add(3, top - 1, 1, 5, top + 1, 3, pal(MAT.rubber, 1)); d.add(g.sx - 5, top - 1, 1, g.sx - 3, top + 1, 3, pal(MAT.rubber, 1));
      d.add(1, top + 1, 0, g.sx - 1, top + 2, 4, pal(MAT.gold, 2));
      // lamp pod on the bonnet
      d.add(mid - 4, 7, g.sz - 4, mid + 4, 8, g.sz - 2, pal(MAT.lamp, 0));
    }),
  }],
});
