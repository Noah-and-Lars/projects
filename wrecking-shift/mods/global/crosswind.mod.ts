import { defineMod } from '../../src/mods/kit';

/** A steady gale that slowly veers: light debris and props drift downwind. Deterministic (driven by the tick). */
export default defineMod({
  id: 'crosswind', name: 'Crosswind', category: 'global', author: 'Wrecking Shift', conflicts: 'wind',
  description: 'A gusting gale that slowly veers around the compass: flying rubble, tumbling props and blast debris get carried downwind.',
  global: {
    tick: ({ sim, tick }) => {
      if (tick % 3 !== 0) return;
      const a = tick * 0.0009; // full turn in about 2 minutes
      const gust = 0.75 + 0.25 * Math.sin(tick * 0.021) + 0.15 * Math.sin(tick * 0.057);
      const wx = Math.cos(a) * gust, wz = Math.sin(a) * gust;
      for (const b of sim.bodies.values()) {
        if (!b.dynamic || b.removed || (b.kind !== 'debris' && b.kind !== 'prop')) continue;
        const m = b.mass;
        if (m > 400 || b.rb.isSleeping()) continue;
        // about 3 m/s^2 for light pieces, less for heavier ones (3 ticks per push)
        const k = 3 * 3 / 60 * Math.min(1, 60 / Math.max(m, 1)) * m;
        b.rb.applyImpulse({ x: wx * k, y: 0.08 * k, z: wz * k }, true);
      }
    },
    // nothing to undo: the wind only acts while ticking
    revert: () => {},
  },
});
