import { MAT, carBlueprint, defineMod } from '../../src/mods/kit';

/** Farm tractor with big rear and small front wheels. */
export default defineMod({
  id: 'furrow-king', name: 'Furrow King Tractor', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A red farm tractor with towering rear wheels, small steering wheels up front and a glass cab. Slow on tarmac, unstoppable in mud.',
  vehicles: [{
    id: 'furrow-king', name: 'Furrow King tractor', group: 'Heavy',
    blueprint: () => {
      const bp = carBlueprint({
        id: 'furrow-king', name: 'Furrow King tractor', style: 'tractor', length: 4.3, width: 2.2, height: 2.8,
        paint: MAT.plastic, accent: MAT.gold, wheelR: 0.68, wheelW: 0.42, drive: 'rear',
        mass: 4500, power: 3.6, topSpeed: 12, grip: 1.9, bumper: 'bar',
      });
      // smaller front wheels: shrink the steering axle, dropping its hard point so the body stays level
      for (const w of bp.spec.wheels) if (w.steer > 0) { w.y -= 0.68 - 0.44; w.radius = 0.44; w.width = 0.26; }
      return bp;
    },
  }],
});
