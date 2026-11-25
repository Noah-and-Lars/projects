import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Wheeled bulldozer: tall steel blade + ram, all-wheel drive, crawling pace. */
export default defineMod({
  id: 'muckshifter-dozer', name: 'Muckshifter Dozer', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A wheeled bulldozer with a tall steel blade and a ram plate behind it. Crawls along at walking pace and shoves walls over like they owe it money.',
  vehicles: [{
    id: 'muckshifter-dozer', name: 'Muckshifter dozer', group: 'Heavy',
    blueprint: () => decorate(carBlueprint({
      id: 'muckshifter-dozer', name: 'Muckshifter dozer', style: 'tractor', length: 5.4, width: 2.6, height: 2.7,
      paint: MAT.paintedmetal, accent: MAT.steel, wheelR: 0.58, wheelW: 0.45, drive: 'all',
      mass: 12000, power: 2.9, topSpeed: 9, grip: 1.9, bumper: 'blade', ram: 5,
    }), (d) => {
      const { g } = d;
      const st = (x: number, y: number, z: number) => pal(MAT.steel, (x + y * 2 + z) % 3);
      // raise the blade to 1.5 m with a curved top lip, and brace it back to the hood
      d.set(0, 0, g.sz - 1, g.sx, 15, g.sz, st);
      d.add(0, 13, g.sz - 2, g.sx, 16, g.sz - 1, st);
      for (const x of [4, g.sx - 6]) d.add(x, 3, g.sz - 8, x + 2, 6, g.sz - 1, st);
      // exhaust stack
      d.add(g.sx - 5, 10, g.sz - 14, g.sx - 4, 22, g.sz - 13, pal(MAT.steel, 0));
    }),
  }],
});
