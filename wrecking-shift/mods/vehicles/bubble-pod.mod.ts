import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Tiny bubble car: rounded-off glass canopy on a stubby body. */
export default defineMod({
  id: 'bubble-pod', name: 'Bubble Pod', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A two-and-a-half-metre egg of a car with a glass bubble for a roof. Barely faster than a bicycle, but it fits anywhere.',
  vehicles: [{
    id: 'bubble-pod', name: 'Bubble Pod', group: 'Odd',
    blueprint: () => decorate(carBlueprint({
      id: 'bubble-pod', name: 'Bubble Pod', style: 'hatch', length: 2.5, width: 1.4, height: 1.5,
      paint: MAT.whitepaint, accent: MAT.plastic, wheelR: 0.22, wheelW: 0.16, drive: 'rear',
      mass: 520, power: 5.0, topSpeed: 19, grip: 1.9,
    }), (d) => {
      const { g } = d;
      const top = g.sy - 3; // roof row
      // round the canopy: knock out the outer corners of the upper body and roof, glaze what remains up there
      for (let y = 8; y <= top; y++) {
        const inset = Math.max(0, y - top + 3);
        for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++) {
          const i = g.idx(x, y, z);
          if (!g.data[i]) continue;
          const edgeX = Math.min(x, g.sx - 1 - x), edgeZ = Math.min(z, g.sz - 1 - z);
          if (edgeX < inset || edgeZ < inset + 1) { d.set(x, y, z, x + 1, y + 1, z + 1, 0); continue; }
          if (y === top || edgeX === inset || edgeZ === inset + 1) d.set(x, y, z, x + 1, y + 1, z + 1, pal(MAT.glass, 2));
        }
      }
      // a red belt line all round
      for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++) { const i = g.idx(x, 5, z); if (g.data[i] >> 3 === MAT.whitepaint) d.set(x, 5, z, x + 1, 6, z + 1, pal(MAT.plastic, 1)); }
    }),
  }],
});
