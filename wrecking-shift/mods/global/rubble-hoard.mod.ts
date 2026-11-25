import { defineMod } from '../../src/mods/kit';

let saved: { maxDebris: number; minBody: number; splits: number } | null = null;

/** Keep far more debris around: bigger rubble piles, finer chunks, more pieces per blast. */
export default defineMod({
  id: 'rubble-hoard', name: 'Rubble Hoard', category: 'global', author: 'Wrecking Shift', conflicts: 'debris',
  description: 'Triples the debris budget so rubble stays where it falls and blasts break into more, smaller chunks. Heavier on slower machines.',
  global: {
    apply: ({ sim }) => {
      if (!saved) saved = { maxDebris: sim.maxDebris, minBody: sim.minBodyVoxels, splits: sim.maxSplitsPerTick };
      sim.maxDebris = saved.maxDebris * 3;
      sim.minBodyVoxels = Math.max(2, saved.minBody - 1);
      sim.maxSplitsPerTick = Math.round(saved.splits * 1.5);
    },
    revert: ({ sim }) => {
      if (!saved) return;
      sim.maxDebris = saved.maxDebris; sim.minBodyVoxels = saved.minBody; sim.maxSplitsPerTick = saved.splits;
      saved = null;
    },
  },
});
