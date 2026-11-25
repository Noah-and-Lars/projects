import { defineMod } from '../../src/mods/kit';

/** Moon-ish gravity for everything: debris floats, jumps go high. */
export default defineMod({
  id: 'feather-gravity', name: 'Feather Gravity', category: 'global', author: 'Wrecking Shift', conflicts: 'gravity',
  description: 'Gravity at a quarter: debris drifts, jumps clear rooftops, vehicles float over bumps.',
  global: {
    apply: ({ sim, player }) => { sim.world.gravity = { x: 0, y: -9.81 * 0.25, z: 0 }; player.gravityScale = 0.3; },
    revert: ({ sim, player }) => { sim.world.gravity = { x: 0, y: -9.81, z: 0 }; player.gravityScale = 1; },
  },
});
