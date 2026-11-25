import { defineMod } from '../../src/mods/kit';
import type { VoxelBody } from '../../src/sim/body';

/** bodies already set off (by id), so one hard knock makes one bang */
const armed = new Set<number>();
let simRef: unknown = null;

/** Explosive props go off on any hard knock, not only when they are broken or burnt. */
export default defineMod({
  id: 'short-fuses', name: 'Short Fuses', category: 'global', author: 'Wrecking Shift', conflicts: 'explosives',
  description: 'Fuel drums and other explosive props are dangerously unstable: drop one, ram it or hit it with debris and it goes off half a second later.',
  global: {
    apply: ({ sim }) => { if (simRef !== sim) { armed.clear(); simRef = sim; } },
    tick: ({ sim }) => {
      if (simRef !== sim) { armed.clear(); simRef = sim; }
      for (const im of sim.lastImpacts) {
        if (im.force < 9000) continue;
        for (const b of [im.a, im.b] as (VoxelBody | null)[]) {
          if (!b || b.removed || !b.dynamic || !b.tags.has('explosive') || armed.has(b.id)) continue;
          armed.add(b.id);
          sim.out.push({ type: 'custom', name: 'mods:fuse', data: { pos: b.center() } });
          sim.explodeLater(b.center(), 1.3, 30);
        }
      }
    },
    revert: () => { armed.clear(); simRef = null; },
  },
});
