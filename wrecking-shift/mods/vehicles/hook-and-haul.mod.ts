import { MAT, carBlueprint, defineMod, pal } from '../../src/mods/kit';
import { decorate } from './_util';

/** Heavy-duty recovery pickup with a tow boom in the bed. */
export default defineMod({
  id: 'hook-and-haul', name: 'Hook & Haul Recovery Pickup', category: 'vehicles', author: 'Wrecking Shift',
  description: 'A four-wheel-drive recovery pickup with a steel tow boom, a hook and amber beacons. Built to drag other people\'s mistakes home.',
  vehicles: [{
    id: 'hook-and-haul', name: 'Hook & Haul recovery pickup', group: 'Trucks & vans',
    blueprint: () => decorate(carBlueprint({
      id: 'hook-and-haul', name: 'Hook & Haul recovery pickup', style: 'pickup', length: 5.2, width: 1.95, height: 1.85,
      paint: MAT.paintedmetal, accent: MAT.steel, cargo: MAT.steel, wheelR: 0.37, wheelW: 0.28, drive: 'all',
      mass: 2500, power: 5.0, topSpeed: 26, grip: 1.9, bumper: 'bar', lights: true,
    }), (d) => {
      const { g } = d;
      const st = (x: number, y: number, z: number) => pal(MAT.steel, (x + y + z) % 3);
      const mid = g.sx >> 1;
      // boom post at the front of the bed, arm reaching back over the tailgate, dangling hook
      const post = Math.round(g.sz * 0.5) - 4; // just behind the cab
      d.add(mid - 1, 3, post, mid + 1, g.sy - 3, post + 2, st);
      d.add(mid - 1, g.sy - 5, 0, mid + 1, g.sy - 4, post, st);
      d.add(mid - 2, 3, post - 1, mid + 2, 5, post + 3, st); // winch drum
      d.add(mid, 7, 0, mid + 1, g.sy - 5, 1, pal(MAT.wire, 0));
      d.add(mid - 1, 6, 0, mid + 2, 7, 1, pal(MAT.steel, 0));
      // repaint the light bar amber
      const y = g.sy - 1;
      for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++) if (g.data[g.idx(x, y, z)] >> 3 === MAT.lamp && (x & 2)) d.set(x, y, z, x + 1, y + 1, z + 1, pal(MAT.wire, 1));
    }),
  }],
});
