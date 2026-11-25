import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Amber saloon cab with a chequered waistband and a roof sign. */
export default defineMod({
  id: 'chequer-cab', name: 'Chequer Cab', category: 'vehicles', author: 'Wrecking Shift',
  description: 'An amber hire saloon with a black-and-white chequered waistband and a glowing roof sign. Tight turning circle, built to idle forever.',
  vehicles: [{
    id: 'chequer-cab', name: 'Chequer cab', group: 'Cars',
    blueprint: () => decorate(carBlueprint({
      id: 'chequer-cab', name: 'Chequer cab', style: 'sedan', length: 4.6, width: 1.8,
      paint: MAT.paintedmetal, accent: MAT.rubber, wheelR: 0.32, drive: 'front',
      mass: 1350, power: 5.2, topSpeed: 28, grip: 1.9, lights: true,
    }), (d) => {
      const { g } = d;
      // two-row chequer band along both flanks (y 4..6), skipping the wheel arches (left empty there)
      const chk = (_x: number, y: number, z: number) => pal((z >> 1) % 2 === y % 2 ? MAT.rubber : MAT.whitepaint, 1);
      for (const x of [0, g.sx - 1]) for (let z = 0; z < g.sz; z++) for (let y = 4; y < 6; y++) if (g.data[g.idx(x, y, z)]) d.set(x, y, z, x + 1, y + 1, z + 1, chk);
    }),
  }],
});
