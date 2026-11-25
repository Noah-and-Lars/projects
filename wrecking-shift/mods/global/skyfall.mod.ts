import { defineMod } from '../../src/mods/kit';
import { TPS, telegraphBlast } from '../maps/_util';

/** Meteor shower: every few seconds a rock strikes somewhere nearby, marked a moment before by a glowing post. */
export default defineMod({
  id: 'skyfall', name: 'Skyfall', category: 'global', author: 'Wrecking Shift', conflicts: 'sky',
  description: 'A meteor shower over every map: every nine seconds or so something hits the ground 10 to 25 m from you. A glowing post marks the spot just before.',
  global: {
    tick: ({ sim, player, tick }) => {
      if (tick < TPS * 4 || tick % Math.round(TPS * 9) !== 0 || player.dead) return;
      telegraphBlast(sim, player.pos, 10, 25, 1.3 + sim.rng.next() * 0.9, Math.round(TPS * 1.2));
    },
    // nothing to undo: it only acts while ticking (blasts already marked still land)
    revert: () => {},
  },
});
