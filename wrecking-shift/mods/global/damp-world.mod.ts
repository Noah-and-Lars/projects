import { defineMod } from '../../src/mods/kit';
import type { FireSystem } from '../../src/sim/fire';

let saved: number | null = null;

/** Nothing catches fire: the fire system's cap is zero and burning voxels are put out. */
export default defineMod({
  id: 'damp-world', name: 'Damp World', category: 'global', author: 'Wrecking Shift', conflicts: 'fire',
  description: 'Everything is soaked through: nothing catches fire, and anything already burning goes out. Explosions still explode.',
  global: {
    apply: ({ fire }) => {
      const f = fire as FireSystem | undefined;
      if (!f || typeof f.maxFires !== 'number') return;
      if (saved == null) saved = f.maxFires;
      f.maxFires = 0;
      f.clear();
    },
    tick: ({ fire }) => { const f = fire as FireSystem | undefined; if (f && f.count() > 0) f.clear(); },
    revert: ({ fire }) => {
      const f = fire as FireSystem | undefined;
      if (f && saved != null) f.maxFires = saved;
      saved = null;
    },
  },
});
