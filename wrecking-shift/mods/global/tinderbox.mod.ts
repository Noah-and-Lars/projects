import { defineMod } from '../../src/mods/kit';
import type { FireSystem } from '../../src/sim/fire';

let saved: { spread: number; perTick: number; jump: number; probes: number } | null = null;

/** Bone-dry world: fires spread several times faster and leap gaps more often. */
export default defineMod({
  id: 'tinderbox', name: 'Tinderbox', category: 'global', author: 'Wrecking Shift', conflicts: 'fire',
  description: 'A dry spell: fire spreads about three times faster and jumps gaps between buildings far more often. Timber towns will not last.',
  global: {
    apply: ({ fire }) => {
      const f = fire as FireSystem | undefined;
      if (!f || typeof f.spreadPerFire !== 'number') return;
      if (!saved) saved = { spread: f.spreadPerFire, perTick: f.maxNewPerTick, jump: f.jumpChance, probes: f.maxProbesPerTick };
      f.spreadPerFire = saved.spread * 3;
      f.maxNewPerTick = saved.perTick * 3;
      f.jumpChance = Math.min(1, saved.jump * 2.5);
      f.maxProbesPerTick = saved.probes * 2;
    },
    revert: ({ fire }) => {
      const f = fire as FireSystem | undefined;
      if (f && saved) { f.spreadPerFire = saved.spread; f.maxNewPerTick = saved.perTick; f.jumpChance = saved.jump; f.maxProbesPerTick = saved.probes; }
      saved = null;
    },
  },
});
